import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { AutomaticAttendanceEngine } from './automaticAttendanceEngine';
import { OFFICE_LOCATION, getDistanceFromLatLonInM, runAutoCheckoutFinalizer, getFormattedDateStr } from './smartAttendanceEngine';
import { getTodayAttendanceRecord } from './attendanceStorage';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';
import { logStartupTag } from '../startup/startupPerformanceLogger';
import {
  trackResourceCreated,
  trackResourceCleaned,
} from '../monitoring/performanceDiagnostics';
import { registerNativeOfficeGeofence, initNativeGeofenceListener, reconcileNativeGeofenceEvents } from './nativeGeofenceBridge';
import { isMedianApp, initializeMedianBackgroundLocation, startMedianBackgroundLocation } from './medianBackgroundLocation';
import { isAdminContextActive } from '../../utils/attendanceUtils';
import { reconcileAttendanceOnResume } from './resumeReconciliation';

const GEOFENCE_REGISTERED_KEY = 'exfin_office_geofence_25m';

export interface BackgroundGeofenceConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
  registeredAt: string;
}

export const getRegisteredGeofence = (): BackgroundGeofenceConfig | null => {
  try {
    const raw = localStorage.getItem(GEOFENCE_REGISTERED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

export const ensureOfficeGeofenceRegistered = (): BackgroundGeofenceConfig => {
  const existing = getRegisteredGeofence();
  if (existing) {
    // Already registered, verify configuration matching
    if (
      existing.latitude === OFFICE_LOCATION.latitude &&
      existing.longitude === OFFICE_LOCATION.longitude &&
      existing.radius === OFFICE_LOCATION.radius
    ) {
      logStartupTag('GEOFENCE_READY', `Office 25m Geofence Active at (${OFFICE_LOCATION.latitude}, ${OFFICE_LOCATION.longitude})`);
      return existing;
    }
  }

  // Register single authoritative geofence
  const config: BackgroundGeofenceConfig = {
    id: GEOFENCE_REGISTERED_KEY,
    name: OFFICE_LOCATION.name,
    latitude: OFFICE_LOCATION.latitude,
    longitude: OFFICE_LOCATION.longitude,
    radius: OFFICE_LOCATION.radius,
    registeredAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(GEOFENCE_REGISTERED_KEY, JSON.stringify(config));
    logAttendanceEvent('GEOFENCE_ENTER', 'SYSTEM', `Authoritative Office Geofence registered (${OFFICE_LOCATION.radius}m radius).`);
  } catch (err) {
    console.warn('Failed to save geofence registration:', err);
  }

  logStartupTag('GEOFENCE_READY', `Office 25m Geofence Registered at (${OFFICE_LOCATION.latitude}, ${OFFICE_LOCATION.longitude})`);
  return config;
};

let activeReconciliationPromise: Promise<void> | null = null;

export const safeReconcileNativeGeofenceEvents = (
  employeeId: string,
  employeeName: string,
  townCity: string
): Promise<void> => {
  if (activeReconciliationPromise) {
    return activeReconciliationPromise;
  }
  const promise = reconcileNativeGeofenceEvents(employeeId, employeeName, townCity);
  activeReconciliationPromise = promise.finally(() => {
    if (activeReconciliationPromise === promise) {
      activeReconciliationPromise = null;
    }
  });
  return activeReconciliationPromise;
};

/**
 * Evaluates position against registered geofence and triggers automatic check-in/exit/return
 */
export const handleLocationUpdateForAttendance = (
  latitude: number,
  longitude: number,
  employeeId: string,
  employeeName: string,
  townCity: string,
  accuracy?: number
): void => {
  if (!employeeId || isAdminContextActive()) return;

  ensureOfficeGeofenceRegistered();

  const dispatchUpdate = () => {
    AutomaticAttendanceEngine.processLocationUpdate(
      latitude,
      longitude,
      employeeId,
      employeeName,
      townCity,
      new Date(),
      accuracy
    );
  };

  // Ensure native background event reconciliation completes before processing foreground position updates
  if (activeReconciliationPromise) {
    activeReconciliationPromise.then(dispatchUpdate).catch(dispatchUpdate);
  } else {
    dispatchUpdate();
  }
};

/**
 * Checks and Requests Background Location Permission ("Always Allow") separately from foreground location
 */
export const checkBackgroundPermissionStatus = async (): Promise<{
  location: string;
  coarseLocation?: string;
  isBackgroundGranted: boolean;
}> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await Geolocation.checkPermissions() as any;
      const foregroundGranted = status.location === 'granted' || status.coarseLocation === 'granted';
      const backgroundGranted = status.backgroundLocation === 'granted' || (!status.backgroundLocation && foregroundGranted && Capacitor.getPlatform() !== 'android');
      return {
        location: status.location || 'prompt',
        coarseLocation: status.coarseLocation,
        isBackgroundGranted: backgroundGranted
      };
    } else if (navigator.permissions && navigator.permissions.query) {
      const perm = await navigator.permissions.query({ name: 'geolocation' as any });
      return {
        location: perm.state,
        isBackgroundGranted: perm.state === 'granted'
      };
    }
  } catch (err) {
    console.warn('Error checking location permissions:', err);
  }
  return { location: 'prompt', isBackgroundGranted: false };
};

export const requestBackgroundLocationPermission = async (): Promise<boolean> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const perm = await Geolocation.requestPermissions({ permissions: ['location', 'backgroundLocation'] as any });
      const fgGranted = perm.location === 'granted' || perm.coarseLocation === 'granted';
      const bgGranted = (perm as any).backgroundLocation === 'granted' || (fgGranted && Capacitor.getPlatform() !== 'android');
      return bgGranted;
    }
  } catch (err) {
    console.warn('Background permission request error:', err);
  }
  return false;
};

/**
 * Initializes global background lifecycle listeners
 */
export const initializeBackgroundAttendanceManager = (getEmployeeInfo: () => { id: string; name: string; townCity?: string } | null): (() => void) => {
  logStartupTag('ATTENDANCE_INIT_START', 'Initializing background attendance manager');
  ensureOfficeGeofenceRegistered();

  // Verify background permission separately before registering native geofence
  checkBackgroundPermissionStatus().then((status) => {
    if (status.isBackgroundGranted) {
      registerNativeOfficeGeofence();
    } else {
      console.log('[BackgroundAttendanceManager] Background location permission ("Allow all the time") not yet granted. Native geofence registration deferred.');
    }
  }).catch(() => {
    registerNativeOfficeGeofence();
  });

  // If running inside Median native app, start Median Background Location
  let cleanupMedian: (() => void) | null = null;
  if (isMedianApp()) {
    logStartupTag('MEDIAN_INIT', 'Initializing Median native background location');
    cleanupMedian = initializeMedianBackgroundLocation(getEmployeeInfo);
  }

  // Run initial end-of-day finalizer check
  runAutoCheckoutFinalizer();

  // Initialize native geofence event listener & reconcile any unconsumed events
  let cleanupNativeListener: (() => void) | null = null;
  initNativeGeofenceListener(getEmployeeInfo).then((cleanup) => {
    cleanupNativeListener = cleanup;
  });

  const timerKey = `bg_att_timer_${Date.now()}`;
  trackResourceCreated('SYNC_TIMER', timerKey, 'bg_attendance_manager');

  const infoOnBoot = getEmployeeInfo();
  if (infoOnBoot?.id) {
    safeReconcileNativeGeofenceEvents(infoOnBoot.id, infoOnBoot.name, infoOnBoot.townCity || 'Raniganj HQ');
    reconcileAttendanceOnResume(infoOnBoot.id, infoOnBoot.name, infoOnBoot.townCity || 'Raniganj HQ').catch((e) => {
      console.warn('[BackgroundAttendanceManager] Boot resume reconciliation error:', e);
    });
  }

  const intervalId = setInterval(() => {
    const info = getEmployeeInfo();
    if (info?.id) {
      safeReconcileNativeGeofenceEvents(info.id, info.name, info.townCity || 'Raniganj HQ');
    }
    runAutoCheckoutFinalizer();
    if (navigator.onLine) {
      syncPendingAttendanceRecords().catch(() => {});
    }
  }, 30000); // Check every 30 seconds

  const triggerResumeReconciliation = () => {
    logAttendanceEvent('GEOFENCE_ENTER', 'SYSTEM', 'App resumed/focused. Triggering PWA attendance reconciliation.');
    const info = getEmployeeInfo();
    if (info?.id) {
      safeReconcileNativeGeofenceEvents(info.id, info.name, info.townCity || 'Raniganj HQ').then(() => {
        if (isMedianApp()) {
          startMedianBackgroundLocation(getEmployeeInfo);
        }
        reconcileAttendanceOnResume(info.id, info.name, info.townCity || 'Raniganj HQ').catch((err) => {
          console.warn('[BackgroundAttendanceManager] Resume reconciliation error:', err);
        });
      }).catch((err) => {
        console.warn('Resume native reconciliation error:', err);
      });
    }

    runAutoCheckoutFinalizer();

    if (navigator.onLine) {
      syncPendingAttendanceRecords().catch(() => {});
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      triggerResumeReconciliation();
    } else {
      logAttendanceEvent('GEOFENCE_EXIT', 'SYSTEM', 'App minimized/backgrounded. Background geofence monitoring active.');
    }
  };

  const handleFocus = () => {
    triggerResumeReconciliation();
  };

  const handlePageShow = () => {
    triggerResumeReconciliation();
  };

  const handleOnline = () => {
    triggerResumeReconciliation();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('online', handleOnline);

  logStartupTag('AUTO_ATTENDANCE_READY', 'Background attendance monitoring and automatic check-in listener ready');

  return () => {
    trackResourceCleaned('SYNC_TIMER', timerKey);
    clearInterval(intervalId);
    if (cleanupNativeListener) cleanupNativeListener();
    if (cleanupMedian) cleanupMedian();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleFocus);
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('online', handleOnline);
  };
};
