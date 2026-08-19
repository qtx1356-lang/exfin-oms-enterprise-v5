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
import { startNativeBackgroundLocation, stopNativeBackgroundLocation } from './nativeBackgroundLocationBridge';
import { isMedianApp, initializeMedianBackgroundLocation, startMedianBackgroundLocation } from './medianBackgroundLocation';

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
  if (!employeeId) return;

  ensureOfficeGeofenceRegistered();

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

/**
 * Checks and Requests Background Location Permission ("Always Allow")
 */
export const checkBackgroundPermissionStatus = async (): Promise<{
  location: string;
  coarseLocation?: string;
  isBackgroundGranted: boolean;
}> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const status = await Geolocation.checkPermissions();
      return {
        location: status.location,
        coarseLocation: status.coarseLocation,
        isBackgroundGranted: status.location === 'granted'
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
      const perm = await Geolocation.requestPermissions();
      return perm.location === 'granted';
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
  registerNativeOfficeGeofence();

  // If running inside Median native app, start Median Background Location
  let cleanupMedian: (() => void) | null = null;
  if (isMedianApp()) {
    logStartupTag('MEDIAN_INIT', 'Initializing Median native background location');
    cleanupMedian = initializeMedianBackgroundLocation(getEmployeeInfo);
  }

  // Run initial end-of-day finalizer check
  runAutoCheckoutFinalizer();

  // Sync native background location tracking based on active check-in status
  try {
    const info = getEmployeeInfo();
    if (info?.id) {
      const todayStr = getFormattedDateStr();
      const todayRec = getTodayAttendanceRecord(info.id, todayStr);
      if (todayRec && todayRec.checkInTime && !todayRec.checkOutTime) {
        startNativeBackgroundLocation(info.id, info.name).catch(() => {});
      } else if (todayRec && todayRec.checkOutTime) {
        stopNativeBackgroundLocation().catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Error checking initial background location status:', err);
  }

  // Initialize native geofence event listener & reconcile any unconsumed events
  let cleanupNativeListener: (() => void) | null = null;
  initNativeGeofenceListener(getEmployeeInfo).then((cleanup) => {
    cleanupNativeListener = cleanup;
  });

  const timerKey = `bg_att_timer_${Date.now()}`;
  trackResourceCreated('SYNC_TIMER', timerKey, 'bg_attendance_manager');

  const intervalId = setInterval(() => {
    runAutoCheckoutFinalizer();
    if (navigator.onLine) {
      syncPendingAttendanceRecords().catch(() => {});
    }
  }, 60000); // Check every minute

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      logAttendanceEvent('GEOFENCE_ENTER', 'SYSTEM', 'App brought to foreground. Refreshing attendance state.');
      
      const info = getEmployeeInfo();
      if (info?.id) {
        // Sync native background location tracking state
        const todayStr = getFormattedDateStr();
        const todayRec = getTodayAttendanceRecord(info.id, todayStr);
        if (todayRec && todayRec.checkInTime && !todayRec.checkOutTime) {
          startNativeBackgroundLocation(info.id, info.name).catch(() => {});
        } else if (todayRec && todayRec.checkOutTime) {
          stopNativeBackgroundLocation().catch(() => {});
        }

        reconcileNativeGeofenceEvents(info.id, info.name, info.townCity || 'Location name unavailable');
        if (isMedianApp()) {
          startMedianBackgroundLocation(getEmployeeInfo);
        }

        // Trigger immediate high-accuracy location check on app resume
        try {
          if (Capacitor.isNativePlatform()) {
            Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 }).then((pos) => {
              if (pos?.coords) {
                handleLocationUpdateForAttendance(
                  pos.coords.latitude,
                  pos.coords.longitude,
                  info.id,
                  info.name,
                  info.townCity || 'Location name unavailable'
                );
              }
            }).catch((e) => console.warn('Resume GPS fetch error:', e));
          } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                handleLocationUpdateForAttendance(
                  pos.coords.latitude,
                  pos.coords.longitude,
                  info.id,
                  info.name,
                  info.townCity || 'Location name unavailable'
                );
              },
              (err) => console.warn('Resume Web GPS error:', err),
              { enableHighAccuracy: true, timeout: 5000 }
            );
          }
        } catch (err) {
          console.warn('App resume location update error:', err);
        }
      }

      runAutoCheckoutFinalizer();

      if (navigator.onLine) {
        syncPendingAttendanceRecords().catch(() => {});
      }
    } else {
      logAttendanceEvent('GEOFENCE_EXIT', 'SYSTEM', 'App minimized/backgrounded. Background geofence monitoring active.');
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('online', syncPendingAttendanceRecords);

  logStartupTag('AUTO_ATTENDANCE_READY', 'Background attendance monitoring and automatic check-in listener ready');

  return () => {
    trackResourceCleaned('SYNC_TIMER', timerKey);
    clearInterval(intervalId);
    if (cleanupNativeListener) cleanupNativeListener();
    if (cleanupMedian) cleanupMedian();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', syncPendingAttendanceRecords);
  };
};
