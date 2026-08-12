import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { OFFICE_LOCATION, getDistanceFromLatLonInM, processAttendanceStateTransition, runAutoCheckoutFinalizer, getFormattedDateStr } from './smartAttendanceEngine';
import { getTodayAttendanceRecord } from './attendanceStorage';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';
import { logStartupTag } from '../startup/startupPerformanceLogger';

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
  townCity: string
): void => {
  if (!employeeId) return;

  ensureOfficeGeofenceRegistered();

  const distance = getDistanceFromLatLonInM(
    latitude,
    longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  const isInside = distance <= OFFICE_LOCATION.radius;

  const todayStr = getFormattedDateStr(new Date());
  const record = getTodayAttendanceRecord(employeeId, todayStr);

  // 1. AUTO CHECK-IN: Inside 25m geofence and no valid check-in today
  if (isInside && (!record || !record.checkInTime)) {
    logAttendanceEvent('GEOFENCE_ENTER', employeeId, `Entered 25m office geofence (distance: ${Math.round(distance)}m). Immediately triggering auto check-in.`);
    processAttendanceStateTransition(
      employeeId,
      employeeName || 'Employee',
      { latitude, longitude },
      townCity || 'Raniganj HQ',
      'CHECK_IN',
      'AUTO_GEOFENCE',
      new Date(),
      'OFFICE'
    );
    return;
  }

  // 2. ACTIVE SESSION LOGIC
  if (record && record.checkInTime && !record.checkOutTime && (record.attendanceType === 'OFFICE' || !record.attendanceType)) {
    // Exited geofence (> 25m)
    if (!isInside && record.currentState !== 'PENDING_FINAL_EXIT') {
      logAttendanceEvent('GEOFENCE_EXIT', employeeId, `Exited 25m office geofence (distance: ${Math.round(distance)}m). Recording exit event.`);
      processAttendanceStateTransition(
        employeeId,
        employeeName || record.employeeName,
        { latitude, longitude },
        townCity || record.townCity,
        'GEOFENCE_EXIT',
        'AUTO_GEOFENCE',
        new Date(),
        'OFFICE'
      );
    }
    // Returned to geofence (<= 25m)
    else if (isInside && (record.currentState === 'PENDING_FINAL_EXIT' || record.lastExitTime || record.exitTime)) {
      logAttendanceEvent('RETURN_DETECTED', employeeId, `Returned inside 25m office geofence (distance: ${Math.round(distance)}m). Cancelling pending exit.`);
      processAttendanceStateTransition(
        employeeId,
        employeeName || record.employeeName,
        { latitude, longitude },
        townCity || record.townCity,
        'GEOFENCE_RETURN',
        'AUTO_GEOFENCE',
        new Date(),
        'OFFICE'
      );
    }
  }
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
export const initializeBackgroundAttendanceManager = (getEmployeeInfo: () => { id: string; name: string } | null): (() => void) => {
  logStartupTag('ATTENDANCE_INIT_START', 'Initializing background attendance manager');
  ensureOfficeGeofenceRegistered();

  // Run initial end-of-day finalizer check
  runAutoCheckoutFinalizer();

  const intervalId = setInterval(() => {
    runAutoCheckoutFinalizer();
    if (navigator.onLine) {
      syncPendingAttendanceRecords().catch(() => {});
    }
  }, 60000); // Check every minute

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      logAttendanceEvent('GEOFENCE_ENTER', 'SYSTEM', 'App brought to foreground. Refreshing attendance state.');
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
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', syncPendingAttendanceRecords);
  };
};
