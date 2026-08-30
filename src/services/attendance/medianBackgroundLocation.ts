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
 * Stubbed out to avoid paid native plugin requirements while maintaining compilation compatibility.
 */
export const startMedianBackgroundLocation = async (
  getEmployeeInfo: () => { id: string; name: string; townCity?: string } | null
): Promise<boolean> => {
  console.log('[MedianBridge] Paid Background Location plugin is disabled in this APK. Standard PWA tracking active.');
  return false;
};

/**
 * Stops Median Background Location
 * Stubbed out to avoid paid native plugin requirements while maintaining compilation compatibility.
 */
export const stopMedianBackgroundLocation = (): void => {
  // No-op stub
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
 * Stubbed out to avoid paid native plugin requirements while maintaining compilation compatibility.
 */
export const initializeMedianBackgroundLocation = (
  getEmployeeInfo: () => { id: string; name: string; townCity?: string } | null
): (() => void) => {
  return () => {
    // No-op cleanup
  };
};
