/**
 * Median.co Native Background Location Bridge for EXFIN OMS
 * 
 * Provides native background geofencing & location processing for Android WebView (Median.co APK)
 * while maintaining 100% standard web/PWA compatibility in browsers.
 */

import median from 'median-js-bridge';
import { AutomaticAttendanceEngine, OFFICE_LOCATION, getDistanceFromLatLonInM, getFormattedDateStr, getFormattedTimeStr } from './automaticAttendanceEngine';
import { getTodayAttendanceRecord, saveAttendanceRecord } from './attendanceStorage';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';

export interface MedianLocationEvent {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  horizontalAccuracy?: number;
  speed?: number;
  bearing?: any;
  timestamp?: number | string;
  source?: string;
}

let isMedianServiceRunning = false;
let lastProcessedTime = 0;
let lastProcessedLat = 0;
let lastProcessedLng = 0;

/**
 * Safely detects if the application is running inside a Median.co native Android/iOS shell
 */
export const isMedianApp = (): boolean => {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Check window.median or window.gonative injection
    const win = window as any;
    if (win.median && typeof win.median === 'object') return true;
    if (win.gonative && typeof win.gonative === 'object') return true;

    // 2. Check median-js-bridge isNativeApp()
    if (typeof median?.isNativeApp === 'function' && median.isNativeApp()) {
      return true;
    }

    // 3. Check User Agent markers injected by Median
    const ua = navigator.userAgent || '';
    if (/median|gonative/i.test(ua)) {
      return true;
    }
  } catch (e) {
    console.warn('[MedianBridge] Error detecting native app environment:', e);
  }

  return false;
};

/**
 * Handles incoming location updates from Median Native Background Location
 * (both from JS foreground callback and postUrl / app resume reconciliation)
 */
export const processMedianLocationEvent = (
  location: MedianLocationEvent,
  getEmployeeInfo: () => { id: string; name: string; townCity?: string } | null
): void => {
  if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
    return;
  }

  const employee = getEmployeeInfo();
  if (!employee || !employee.id) {
    return;
  }

  const now = Date.now();
  // Debounce rapid duplicate events within 5 seconds with negligible movement (< 3m)
  const distFromLast = getDistanceFromLatLonInM(
    location.latitude,
    location.longitude,
    lastProcessedLat,
    lastProcessedLng
  );
  if (now - lastProcessedTime < 5000 && distFromLast < 3) {
    return;
  }

  lastProcessedTime = now;
  lastProcessedLat = location.latitude;
  lastProcessedLng = location.longitude;

  const eventTimestamp = location.timestamp ? new Date(location.timestamp) : new Date();
  const distance = getDistanceFromLatLonInM(
    location.latitude,
    location.longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  logAttendanceEvent(
    distance <= 25 ? 'GEOFENCE_ENTER' : 'GEOFENCE_EXIT',
    employee.id,
    `[Median Background Location] (${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}) - Distance from office: ${Math.round(distance)}m (Acc: ${Math.round(location.accuracy || location.horizontalAccuracy || 0)}m)`
  );

  // Process event through authoritative AutomaticAttendanceEngine
  AutomaticAttendanceEngine.processLocationUpdate(
    location.latitude,
    location.longitude,
    employee.id,
    employee.name,
    employee.townCity || 'Raniganj HQ',
    eventTimestamp
  );

  // Trigger sync if online
  if (navigator.onLine) {
    syncPendingAttendanceRecords().catch(() => {});
  }
};

/**
 * Starts Median Background Location with high-accuracy settings for 25m office geofence monitoring
 */
export const startMedianBackgroundLocation = async (
  getEmployeeInfo: () => { id: string; name: string; townCity?: string } | null
): Promise<boolean> => {
  if (!isMedianApp()) {
    console.log('[MedianBridge] Running in standard browser/PWA. Median native background location skipped.');
    return false;
  }

  const employee = getEmployeeInfo();
  const empId = employee?.id || 'ANONYMOUS';

  // Construct secure background postUrl targeting the server API
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://exfin-oms-enterprise-v5.pages.dev';
  const postUrl = `${origin}/api/median-background-location?emp=${encodeURIComponent(empId)}&source=MEDIAN_BACKGROUND_LOCATION`;

  const config = {
    // Background server POST endpoint
    postUrl,
    // Android Configuration for 25m boundary detection
    androidInterval: 20000, // 20s interval
    androidFastestInterval: 10000, // 10s fastest
    androidPriority: 'highAccuracy' as const, // High Accuracy GPS
    androidSmallestDisplacement: 15, // 15 meters filter
    androidNotificationTitle: 'EXFIN OMS Attendance Active',
    androidNotificationText: 'Monitoring 25m office boundary for automatic attendance',
    // iOS Configuration if applicable
    iosBackgroundIndicator: true,
    iosDistanceFilter: 15,
    iosDesiredAccuracy: 'best' as const,
    // JS Callback for foreground updates and app resume reconciliation
    callback: (data: any) => {
      console.log('[MedianBridge] Foreground/Resume location received:', data);
      processMedianLocationEvent(data, getEmployeeInfo);
    }
  };

  try {
    const win = window as any;

    // Attach global callback for Median Android WebView bridge
    win.median_background_location_callback = (data: any) => {
      processMedianLocationEvent(data, getEmployeeInfo);
    };
    win.gonative_background_location_callback = win.median_background_location_callback;

    // Trigger start via median-js-bridge or window.median / window.gonative
    if (win.median?.backgroundLocation?.start) {
      win.median.backgroundLocation.start(config);
    } else if (win.gonative?.backgroundLocation?.start) {
      win.gonative.backgroundLocation.start(config);
    } else if (median?.backgroundLocation?.start) {
      median.backgroundLocation.start(config);
    } else {
      // Fallback bridge URL scheme for Median container
      const jsonParam = encodeURIComponent(JSON.stringify(config));
      window.location.href = `median://backgroundLocation/start?data=${jsonParam}`;
    }

    isMedianServiceRunning = true;
    logAttendanceEvent('GEOFENCE_ENTER', empId, 'Median Native Background Location service started successfully.');
    return true;
  } catch (err: any) {
    console.warn('[MedianBridge] Failed to start Median Background Location:', err);
    return false;
  }
};

/**
 * Stops Median Background Location
 */
export const stopMedianBackgroundLocation = (): void => {
  if (!isMedianApp()) return;

  try {
    const win = window as any;
    if (win.median?.backgroundLocation?.stop) {
      win.median.backgroundLocation.stop();
    } else if (win.gonative?.backgroundLocation?.stop) {
      win.gonative.backgroundLocation.stop();
    } else if (median?.backgroundLocation?.stop) {
      median.backgroundLocation.stop();
    } else {
      window.location.href = 'median://backgroundLocation/stop';
    }
    isMedianServiceRunning = false;
    logAttendanceEvent('GEOFENCE_EXIT', 'SYSTEM', 'Median Native Background Location stopped.');
  } catch (err) {
    console.warn('[MedianBridge] Failed to stop Median Background Location:', err);
  }
};

/**
 * Prompts native location permission dialog on Median Android
 */
export const requestMedianLocationPermission = async (): Promise<void> => {
  if (!isMedianApp()) return;

  try {
    const win = window as any;
    if (win.median?.android?.geoLocation?.promptLocationServices) {
      win.median.android.geoLocation.promptLocationServices();
    } else if (win.gonative?.android?.geoLocation?.promptLocationServices) {
      win.gonative.android.geoLocation.promptLocationServices();
    }
  } catch (e) {
    console.warn('[MedianBridge] Error prompting native location services:', e);
  }
};

/**
 * Initializes Median Background Location lifecycle and registers event listeners
 */
export const initializeMedianBackgroundLocation = (
  getEmployeeInfo: () => { id: string; name: string; townCity?: string } | null
): (() => void) => {
  if (!isMedianApp()) {
    return () => {};
  }

  // Start background location tracking on Median
  startMedianBackgroundLocation(getEmployeeInfo);

  // Handle app resumed event from Median bridge
  const handleAppResumed = () => {
    logAttendanceEvent('GEOFENCE_ENTER', 'SYSTEM', '[MedianBridge] App resumed. Re-verifying background location status.');
    const emp = getEmployeeInfo();
    if (emp?.id) {
      startMedianBackgroundLocation(getEmployeeInfo);
    }
  };

  const win = window as any;
  if (win.median?.appResumed) {
    win.median.appResumed(handleAppResumed);
  }

  return () => {
    // Clean up if needed
  };
};
