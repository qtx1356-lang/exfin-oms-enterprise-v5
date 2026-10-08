import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';
import { AutomaticAttendanceEngine, getFormattedTimeStr, getDistanceFromLatLonInM, OFFICE_LOCATION } from './automaticAttendanceEngine';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';
import { getApiBaseUrl } from '../../utils/apiConfig';
import { getTodayAttendanceRecord, saveAttendanceRecord } from './attendanceStorage';

export interface NativeAttendanceEvent {
  eventId: string;
  employeeId: string;
  employeeName?: string;
  townCity?: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'ENTER' | 'EXIT' | 'GEOFENCE_RETURN';
  transition?: 'ENTER' | 'EXIT';
  time: string;
  date: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
  eventTimestamp?: number;
  exitTimestamp?: number;
  distanceFromOffice?: number;
  distance?: number;
  source?: string;
  schemaVersion?: number;
  deviceId?: string;
}

export interface NativeLocationReadiness {
  locationEnabled: boolean;
  fineLocationGranted: boolean;
  coarseLocationGranted: boolean;
  backgroundLocationGranted: boolean;
  locationReady: boolean;
  geofenceRegistered: boolean;
  foregroundServiceRunning: boolean;
}

export interface NativeGeofencePluginInterface {
  registerOfficeGeofence(): Promise<{ success: boolean; geofenceId: string; authoritativeRadius: number; wakeupTriggerRadius: number; assistRadius?: number; latitude: number; longitude: number }>;
  getLocationReadiness(): Promise<{
    locationEnabled: boolean;
    fineLocationGranted: boolean;
    coarseLocationGranted: boolean;
    backgroundLocationGranted: boolean;
    locationReady: boolean;
    geofenceRegistered: boolean;
    foregroundServiceRunning: boolean;
  }>;
  openLocationSettings(): Promise<void>;
  repairLocationMonitoring(): Promise<{
    success: boolean;
    locationEnabled: boolean;
    fineLocationGranted: boolean;
    geofenceRegistered?: boolean;
    foregroundServiceRunning?: boolean;
  }>;
  getGeofenceStatus(): Promise<{ isRegistered: boolean; geofenceId: string; authoritativeRadius: number; wakeupTriggerRadius: number; assistRadius?: number; latitude: number; longitude: number }>;
  getUnconsumedNativeEvents(): Promise<{ events: NativeAttendanceEvent[] }>;
  removeOfficeGeofence(): Promise<{ success: boolean }>;
  setEmployeeIdentity(identity: { id: string; name: string; townCity: string; serverUrl: string }): Promise<void>;
  startActiveSession(session: { employeeId: string; employeeName: string; townCity: string; date: string; checkInTime: string }): Promise<{ success: boolean }>;
  clearActiveSession(): Promise<{ success: boolean }>;
  cancelPendingExit(): Promise<{ success: boolean }>;
  forceSyncPendingEvents(): Promise<{ success: boolean }>;
  getLocationReadiness(): Promise<NativeLocationReadiness>;
  openLocationSettings(): Promise<void>;
  openAppLocationSettings(): Promise<void>;
  repairLocationMonitoring(): Promise<{ success: boolean; geofenceRegistered: boolean; foregroundServiceRunning: boolean }>;
  getActiveAttendanceState(): Promise<{
    hasActiveSession: boolean;
    attendanceId?: string;
    employeeId?: string;
    employeeName?: string;
    townCity?: string;
    date?: string;
    checkInTime?: string;
    sessionState?: string;
    checkoutStatus?: string;
    recordedExitTime?: string | null;
    exitDetectedAt?: string | null;
    exitSource?: string;
    pendingCheckoutConfirmation?: boolean;
    pendingCheckoutEventId?: string | null;
    currentState?: string;
    isGeofenceRegistered: boolean;
    isLocationServiceRunning: boolean;
  }>;
  getDiagnosticInfo(): Promise<{
    nativeGeofenceRegistered: boolean;
    locationPermission: 'GRANTED' | 'DENIED';
    backgroundLocationPermission: 'GRANTED' | 'DENIED';
    foregroundService: 'RUNNING' | 'STOPPED';
    lastKnownState: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
    authoritativeRadiusMeters: number;
    wakeupTriggerRadiusMeters: number;
    assistRadiusMeters?: number;
    batteryOptimizationState: string;
    activeSession: any;
    lastVerifiedLocation?: {
      latitude: number;
      longitude: number;
      accuracy: number;
      timestamp: number;
      distance: number;
    };
    lastVerifiedDistance?: number;
    pendingEventCount: number;
    lastNativeTrigger: number;
    lastCheckInTimestamp: number;
    lastCheckOutTimestamp: number;
    lastSyncTime: number;
    lastNativeError: string;
    lastExitTime?: string | null;
    lastReturnTime?: string | null;
  }>;
  addListener(eventName: 'attendanceNativeCheckIn', listenerFunc: (event: NativeAttendanceEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'attendanceNativeCheckOut', listenerFunc: (event: NativeAttendanceEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'attendanceNativeReturn', listenerFunc: (event: NativeAttendanceEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'attendanceNativeSync', listenerFunc: (data: { eventId: string; success: boolean; timestamp: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'attendanceNativeError', listenerFunc: (data: { error: string; timestamp: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'geofenceTransition', listenerFunc: (data: { transition: 'EXIT' | 'ENTER'; time: string; date: string; latitude: number; longitude: number; timestamp: number }) => void): Promise<PluginListenerHandle>;
}

export const NativeGeofencePlugin = registerPlugin<NativeGeofencePluginInterface>('ExfinGeofence');

let activeListenerHandles: PluginListenerHandle[] = [];

/**
 * Registers the native Android geofence (authoritative 25m boundary with 120m wake-up)
 */
export const registerNativeOfficeGeofence = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }
  try {
    const result = await NativeGeofencePlugin.registerOfficeGeofence();
    logAttendanceEvent('GEOFENCE_ENTER', 'SYSTEM', `Native Android 25m office geofence registered (${result.geofenceId}).`);
    return result.success;
  } catch (err: any) {
    console.warn('[NativeGeofenceBridge] Failed to register native geofence:', err);
    return false;
  }
};

/**
 * Checks if the native geofence is currently registered on the device
 */
export const getNativeLocationReadiness = async () => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await NativeGeofencePlugin.getLocationReadiness();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to get native location readiness:', err);
    return null;
  }
};

export const openNativeLocationSettings = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await NativeGeofencePlugin.openLocationSettings();
    return true;
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to open Android Location Settings:', err);
    return false;
  }
};

export const repairNativeLocationMonitoring = async () => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await NativeGeofencePlugin.repairLocationMonitoring();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to repair native location monitoring:', err);
    return null;
  }
};

export const checkNativeGeofenceStatus = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }
  try {
    const status = await NativeGeofencePlugin.getGeofenceStatus();
    return !!status.isRegistered;
  } catch (err) {
    return false;
  }
};

/**
 * Safely fetches active native attendance state from NativeGeofencePlugin
 */
export const getNativeAttendanceState = async () => {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }
  try {
    return await NativeGeofencePlugin.getActiveAttendanceState();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Error fetching active attendance state:', err);
    return null;
  }
};

let activeReconcilePromise: Promise<void> | null = null;

/**
 * Reconciles any unconsumed background geofence events that occurred while the app
 * was closed, removed from Recent Apps, or backgrounded.
 */
export const reconcileNativeGeofenceEvents = async (
  employeeId: string,
  employeeName: string,
  townCity: string
): Promise<void> => {
  if (!employeeId || !Capacitor.isNativePlatform()) {
    return;
  }
  if (activeReconcilePromise) {
    return activeReconcilePromise;
  }

  activeReconcilePromise = (async () => {
    try {
      const res = await NativeGeofencePlugin.getUnconsumedNativeEvents();
      const events = res?.events || [];
      if (events.length === 0) {
        return;
      }

      logAttendanceEvent(
        'GEOFENCE_EXIT',
        employeeId,
        `Reconciling ${events.length} unconsumed native background geofence events from native storage.`
      );

      // Sort chronologically
      events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      for (const evt of events) {
        const eventDate = (typeof evt.timestamp === 'number' && evt.timestamp > 0)
          ? new Date(evt.timestamp)
          : (typeof evt.eventTimestamp === 'number' && evt.eventTimestamp > 0)
            ? new Date(evt.eventTimestamp)
            : new Date(evt.timestamp || Date.now());
        const timeKolkata = getFormattedTimeStr(eventDate);
        const eventType = evt.eventType || (evt.transition === 'EXIT' ? 'CHECK_OUT' : 'CHECK_IN');

        if (eventType === 'GEOFENCE_RETURN') {
          console.log('[NATIVE_GEOFENCE_RETURN_RECONCILED]', {
            employeeId,
            date: eventDate.toISOString().split('T')[0],
            distance: evt.distance ?? evt.distanceFromOffice ?? 25,
            timestamp: eventDate.toISOString(),
            localTime: timeKolkata,
            source: 'NATIVE_GEOFENCE'
          });
          logAttendanceEvent('GEOFENCE_ENTER', employeeId, `[NATIVE_GEOFENCE_RETURN_RECONCILED] Reconciled native return event at ${timeKolkata} (${eventDate.toISOString()})`);
          AutomaticAttendanceEngine.processGeofenceReturn(
            employeeId,
            employeeName,
            { latitude: evt.latitude || 23.616227, longitude: evt.longitude || 87.117063 },
            townCity || 'Raniganj HQ',
            eventDate
          );
        } else if (eventType === 'CHECK_OUT' || evt.transition === 'EXIT' || (evt as any).isExitCandidate) {
          console.log('[AUTO_EXIT_DETECTED]', {
            employeeId,
            timestamp: eventDate.toISOString(),
            localTime: timeKolkata,
            source: 'NATIVE_GEOFENCE',
            distance: evt.distance ?? evt.distanceFromOffice ?? 25
          });
          console.log('[NATIVE_GEOFENCE_EXIT_RECONCILED]', {
            employeeId,
            date: eventDate.toISOString().split('T')[0],
            distance: evt.distance ?? evt.distanceFromOffice ?? 25,
            timestamp: eventDate.toISOString(),
            localTime: timeKolkata,
            source: 'NATIVE_GEOFENCE'
          });
          logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[NATIVE_GEOFENCE_EXIT_RECONCILED] Reconciled native exit event at ${timeKolkata} (${eventDate.toISOString()})`);
          
          const validCoords = (typeof evt.latitude === 'number' && typeof evt.longitude === 'number' && !isNaN(evt.latitude) && !isNaN(evt.longitude))
            ? { latitude: evt.latitude, longitude: evt.longitude }
            : {};

          AutomaticAttendanceEngine.processGeofenceExit(
            employeeId,
            employeeName,
            validCoords,
            townCity || 'Raniganj HQ',
            eventDate,
            true
          );
        } else if (eventType === 'CHECK_IN' || evt.transition === 'ENTER') {
          // STRICT RULE: Reject synthetic hardware fallbacks - raw geofence events only wake/prime
          if (evt.source === 'HARDWARE_FALLBACK' || (evt as any).locationProvider === 'HARDWARE_FALLBACK') {
            console.warn('[AUTO_CHECKIN_RECONCILE_REJECTED] Synthetic hardware fallback cannot create check-in:', evt.eventId);
            continue;
          }

          // Calculate verified distance against authoritative 25m boundary
          const dist = (typeof evt.distance === 'number') ? evt.distance :
                       (typeof evt.distanceFromOffice === 'number') ? evt.distanceFromOffice :
                       (evt.latitude && evt.longitude)
                         ? getDistanceFromLatLonInM(evt.latitude, evt.longitude, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude)
                         : 999;

          if (dist > 25.0) {
            console.warn(`[AUTO_CHECKIN_RECONCILE_REJECTED] Verified distance ${dist.toFixed(1)}m > 25m authoritative boundary:`, evt.eventId);
            continue;
          }

          // Ensure event has a valid timestamp and is not fabricated
          if (!evt.timestamp && !evt.eventTimestamp) {
            console.warn('[AUTO_CHECKIN_RECONCILE_REJECTED] Missing valid native timestamp:', evt.eventId);
            continue;
          }

          console.log('[NATIVE_GEOFENCE_ENTER_RECONCILED]', {
            employeeId,
            date: eventDate.toISOString().split('T')[0],
            distance: dist,
            timestamp: eventDate.toISOString(),
            localTime: timeKolkata,
            source: 'NATIVE_GEOFENCE'
          });
          logAttendanceEvent('GEOFENCE_ENTER', employeeId, `[NATIVE_GEOFENCE_ENTER_RECONCILED] Reconciled native enter event at ${timeKolkata} (${eventDate.toISOString()})`);

          const verificationMeta = {
            verificationStatus: (evt as any).verificationStatus || 'VERIFIED',
            verificationMethod: (evt as any).verificationMethod || 'FRESH_FUSED_LOCATION',
            verifiedAt: (evt as any).verifiedAt || new Date().toISOString(),
            locationAgeMs: typeof (evt as any).locationAgeMs === 'number' ? (evt as any).locationAgeMs : null,
            provider: (evt as any).locationProvider || (evt as any).source || null,
            eventTimestamp: eventDate.toISOString()
          };

          AutomaticAttendanceEngine.processGeofenceEntry(
            employeeId,
            employeeName,
            { latitude: evt.latitude || OFFICE_LOCATION.latitude, longitude: evt.longitude || OFFICE_LOCATION.longitude },
            townCity || 'Raniganj HQ',
            eventDate,
            verificationMeta
          );
        }
      }

      // Also inspect persistent active session from native SharedPreferences
      try {
        const activeState = await NativeGeofencePlugin.getActiveAttendanceState();
        if (activeState?.hasActiveSession && activeState.date) {
          const todayDateStr = activeState.date;
          const hasNativeExit = !!(activeState.recordedExitTime && activeState.recordedExitTime !== 'null' && activeState.recordedExitTime.trim() !== '');
          const isPendingExit = (activeState.pendingCheckoutConfirmation ||
            activeState.sessionState === 'PENDING_EXIT_CONFIRMATION' ||
            activeState.currentState === 'PENDING_AUTO_CHECKOUT') && hasNativeExit;

          const todayRec = getTodayAttendanceRecord(employeeId, todayDateStr);
          const isTodayCheckedIn = todayRec?.currentState === 'CHECKED_IN';
          const isNativeInside = activeState.sessionState === 'ACTIVE' || activeState.currentState === 'CHECKED_IN';

          if (isTodayCheckedIn || isNativeInside) {
            // Employee is inside! Ensure pendingCheckoutConfirmation is false
            if (todayRec && todayRec.pendingCheckoutConfirmation) {
              todayRec.pendingCheckoutConfirmation = false;
              todayRec.currentState = 'CHECKED_IN';
              saveAttendanceRecord(todayRec);
            }
          } else if (hasNativeExit && isPendingExit && !isTodayCheckedIn) {
            // Ensure native exit belongs to todayDateStr
            const exitDate = activeState.exitDetectedAt && activeState.exitDetectedAt.includes('-')
              ? activeState.exitDetectedAt.substring(0, 10)
              : todayDateStr;

            if (exitDate === todayDateStr && todayRec && !todayRec.checkOutTime && !todayRec.checkoutFinalized) {
              let changed = false;
              if (activeState.recordedExitTime && !todayRec.recordedExitTime) {
                todayRec.recordedExitTime = activeState.recordedExitTime;
                todayRec.geofenceExitTime = todayRec.geofenceExitTime || activeState.recordedExitTime;
                todayRec.exitDetectedAt = activeState.exitDetectedAt || todayRec.exitDetectedAt;
                todayRec.exitDetectionSource = activeState.exitSource || 'NATIVE_GEOFENCE';
                changed = true;
              }
              if (!todayRec.pendingCheckoutConfirmation && isPendingExit) {
                todayRec.pendingCheckoutConfirmation = true;
                todayRec.pendingCheckoutEventId = activeState.pendingCheckoutEventId || todayRec.pendingCheckoutEventId || `evt_native_${employeeId}_${todayDateStr}_${activeState.recordedExitTime || 'exit'}`;
                todayRec.currentState = (activeState.currentState as any) || 'PENDING_AUTO_CHECKOUT';
                todayRec.checkoutStatus = 'PENDING_AUTO_CHECKOUT';
                changed = true;
              }
              if (changed) {
                saveAttendanceRecord(todayRec);
              }
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record: todayRec } }));
                window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
              }
            }
          } else if (!hasNativeExit) {
            if (todayRec && todayRec.pendingCheckoutConfirmation && !todayRec.lastExitTime && !todayRec.geofenceExitTime && !todayRec.recordedExitTime) {
              todayRec.pendingCheckoutConfirmation = false;
              todayRec.currentState = 'CHECKED_IN';
              saveAttendanceRecord(todayRec);
            }
          }
        }
      } catch (stateErr) {
        console.warn('[NativeGeofenceBridge] Error checking active native session during reconciliation:', stateErr);
      }

      // Trigger client-side sync if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        syncPendingAttendanceRecords().catch(() => {});
      }
    } catch (err: any) {
      console.warn('[NativeGeofenceBridge] Error reconciling native events:', err);
    } finally {
      activeReconcilePromise = null;
    }
  })();

  return activeReconcilePromise;
};

/**
 * Starts listening for real-time native geofence events dispatched from NativeGeofencePlugin
 */
export const initNativeGeofenceListener = async (
  getEmployeeInfo: () => { id: string; name: string; townCity?: string } | null
): Promise<() => void> => {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  try {
    // Ensure native geofence is active
    await registerNativeOfficeGeofence();

    // Reconcile any past unconsumed events right away
    const info = getEmployeeInfo();
    if (info?.id) {
      try {
        const apiBase = getApiBaseUrl();
        const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('file://'))
          ? window.location.origin
          : (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.APP_URL) ? (import.meta as any).env.APP_URL : '';
        const authoritativeServerUrl = apiBase || origin;
        await NativeGeofencePlugin.setEmployeeIdentity({
          id: info.id,
          name: info.name,
          townCity: info.townCity || 'Raniganj HQ',
          serverUrl: authoritativeServerUrl
        });
        console.log('[NativeGeofenceBridge] Configured native employee identity on init.');
      } catch (err) {
        console.warn('[NativeGeofenceBridge] Failed to set native employee identity:', err);
      }
      await reconcileNativeGeofenceEvents(info.id, info.name, info.townCity || 'Raniganj HQ');
    }

    // Clean previous listener handles
    for (const h of activeListenerHandles) {
      h.remove();
    }
    activeListenerHandles = [];

    // 1. Native Check-In listener
    const checkInHandle = await NativeGeofencePlugin.addListener('attendanceNativeCheckIn', (evt) => {
      const currentEmp = getEmployeeInfo();
      if (!currentEmp?.id) return;

      if (evt.employeeId && evt.employeeId !== currentEmp.id) {
        console.warn(`[NativeGeofenceBridge] Ignored native checkin event for mismatched employee ID: ${evt.employeeId} vs ${currentEmp.id}`);
        return;
      }

      if (evt.source === 'HARDWARE_FALLBACK' || (evt as any).locationProvider === 'HARDWARE_FALLBACK') {
        console.warn(`[NativeGeofenceBridge] Ignored synthetic hardware checkin event: ${evt.eventId}`);
        return;
      }

      // Verify distance <= 25m
      const dist = (typeof evt.distance === 'number') ? evt.distance :
                   (typeof evt.distanceFromOffice === 'number') ? evt.distanceFromOffice :
                   (evt.latitude && evt.longitude)
                     ? getDistanceFromLatLonInM(evt.latitude, evt.longitude, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude)
                     : 999;
      if (dist > 25.0) {
        console.warn(`[NativeGeofenceBridge] Ignored checkin event with distance ${dist.toFixed(1)}m > 25m boundary: ${evt.eventId}`);
        return;
      }

      const eventDate = (typeof evt.timestamp === 'number' && evt.timestamp > 0)
        ? new Date(evt.timestamp)
        : (typeof evt.eventTimestamp === 'number' && evt.eventTimestamp > 0)
          ? new Date(evt.eventTimestamp)
          : null;
      if (!eventDate || isNaN(eventDate.getTime())) {
        console.warn(`[NativeGeofenceBridge] Ignored checkin event with invalid timestamp: ${evt.eventId}`);
        return;
      }

      logAttendanceEvent('GEOFENCE_ENTER', currentEmp.id, `Native authoritative check-in event received: ${evt.eventId} at ${evt.time}`);

      const verificationMeta = {
        verificationStatus: (evt as any).verificationStatus || 'VERIFIED',
        verificationMethod: (evt as any).verificationMethod || 'FRESH_FUSED_LOCATION',
        verifiedAt: (evt as any).verifiedAt || new Date().toISOString(),
        locationAgeMs: typeof (evt as any).locationAgeMs === 'number' ? (evt as any).locationAgeMs : null,
        provider: (evt as any).locationProvider || (evt as any).source || null,
        eventTimestamp: eventDate.toISOString()
      };

      AutomaticAttendanceEngine.processGeofenceEntry(
        currentEmp.id,
        currentEmp.name,
        { latitude: evt.latitude, longitude: evt.longitude },
        currentEmp.townCity || 'Raniganj HQ',
        eventDate,
        verificationMeta
      );
    });
    activeListenerHandles.push(checkInHandle);

    // 2. Native Check-Out listener
    const checkOutHandle = await NativeGeofencePlugin.addListener('attendanceNativeCheckOut', (evt) => {
      const currentEmp = getEmployeeInfo();
      if (!currentEmp?.id) return;

      if (evt.employeeId && evt.employeeId !== currentEmp.id) {
        console.warn(`[NativeGeofenceBridge] Ignored native checkout event for mismatched employee ID: ${evt.employeeId} vs ${currentEmp.id}`);
        return;
      }

      const eventDate = (typeof evt.timestamp === 'number' && evt.timestamp > 0)
        ? new Date(evt.timestamp)
        : (typeof evt.eventTimestamp === 'number' && evt.eventTimestamp > 0)
          ? new Date(evt.eventTimestamp)
          : new Date();
      logAttendanceEvent('GEOFENCE_EXIT', currentEmp.id, `Native authoritative check-out event received: ${evt.eventId} at ${evt.time}`);
      const validCoords = (typeof evt.latitude === 'number' && typeof evt.longitude === 'number' && !isNaN(evt.latitude) && !isNaN(evt.longitude))
        ? { latitude: evt.latitude, longitude: evt.longitude }
        : {};

      AutomaticAttendanceEngine.processGeofenceExit(
        currentEmp.id,
        currentEmp.name,
        validCoords,
        currentEmp.townCity || 'Raniganj HQ',
        eventDate,
        true
      );
    });
    activeListenerHandles.push(checkOutHandle);

    // 3. Native Return listener
    const returnHandle = await NativeGeofencePlugin.addListener('attendanceNativeReturn', (evt) => {
      const currentEmp = getEmployeeInfo();
      if (!currentEmp?.id) return;

      if (evt.employeeId && evt.employeeId !== currentEmp.id) {
        console.warn(`[NativeGeofenceBridge] Ignored native return event for mismatched employee ID: ${evt.employeeId} vs ${currentEmp.id}`);
        return;
      }

      const eventDate = (typeof evt.timestamp === 'number' && evt.timestamp > 0)
        ? new Date(evt.timestamp)
        : (typeof evt.eventTimestamp === 'number' && evt.eventTimestamp > 0)
          ? new Date(evt.eventTimestamp)
          : new Date();
      logAttendanceEvent('GEOFENCE_ENTER', currentEmp.id, `Native authoritative return event received: ${evt.eventId} at ${evt.time}`);
      AutomaticAttendanceEngine.processGeofenceReturn(
        currentEmp.id,
        currentEmp.name,
        { latitude: evt.latitude, longitude: evt.longitude },
        currentEmp.townCity || 'Raniganj HQ',
        eventDate
      );
    });
    activeListenerHandles.push(returnHandle);

    // 4. Raw Geofence Transition listener (backward compatibility)
    const transitionHandle = await NativeGeofencePlugin.addListener('geofenceTransition', (data) => {
      const currentEmp = getEmployeeInfo();
      if (!currentEmp?.id) return;

      logAttendanceEvent(
        data.transition === 'EXIT' ? 'GEOFENCE_EXIT' : 'GEOFENCE_ENTER',
        currentEmp.id,
        `Native geofence transition received: ${data.transition} at ${data.time}`
      );
    });
    activeListenerHandles.push(transitionHandle);

    // 4. Native Sync Status listener
    const syncHandle = await NativeGeofencePlugin.addListener('attendanceNativeSync', (data) => {
      console.log(`[NativeGeofenceBridge] Native background sync event completed: ${data.eventId}, success: ${data.success}`);
    });
    activeListenerHandles.push(syncHandle);

    // 5. Native Error listener
    const errorHandle = await NativeGeofencePlugin.addListener('attendanceNativeError', (data) => {
      console.warn(`[NativeGeofenceBridge] Native geofence engine error: ${data.error}`);
    });
    activeListenerHandles.push(errorHandle);

    return () => {
      for (const h of activeListenerHandles) {
        h.remove();
      }
      activeListenerHandles = [];
    };
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to initialize native geofence listener:', err);
    return () => {};
  }
};

export const startNativeActiveSession = async (session: {
  employeeId: string;
  employeeName: string;
  townCity: string;
  date: string;
  checkInTime: string;
}): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await NativeGeofencePlugin.startActiveSession(session);
    return !!res.success;
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to start native active session:', err);
    return false;
  }
};

export const clearNativeActiveSession = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await NativeGeofencePlugin.clearActiveSession();
    return !!res.success;
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to clear native active session:', err);
    return false;
  }
};

export const cancelPendingNativeExit = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await NativeGeofencePlugin.cancelPendingExit();
    return !!res?.success;
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to cancel native pending exit:', err);
    return false;
  }
};

/**
 * Synchronizes the employee identity to native Android SharedPreferences
 * so background geofence events immediately know the employee identity even
 * if the app process has been killed or backgrounded.
 */
export const syncEmployeeIdentityToNative = async (identity: {
  id: string;
  name: string;
  townCity?: string;
  serverUrl?: string;
}): Promise<void> => {
  if (!Capacitor.isNativePlatform() || !identity.id) return;
  try {
    const apiBase = getApiBaseUrl();
    const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('file://'))
      ? window.location.origin
      : (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.APP_URL) ? (import.meta as any).env.APP_URL : '';
    const authoritativeServerUrl = identity.serverUrl || apiBase || origin;
    await NativeGeofencePlugin.setEmployeeIdentity({
      id: identity.id,
      name: identity.name || 'Employee',
      townCity: identity.townCity || 'Raniganj HQ',
      serverUrl: authoritativeServerUrl
    });
    console.log(`[NativeGeofenceBridge] Configured native employee identity: ${identity.id} (${identity.name}) - Server: ${authoritativeServerUrl}`);
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to set native employee identity:', err);
  }
};

export const getNativeActiveAttendanceState = async () => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await NativeGeofencePlugin.getActiveAttendanceState();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to get native active attendance state:', err);
    return null;
  }
};

export const getNativeDiagnosticInfo = async () => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await NativeGeofencePlugin.getDiagnosticInfo();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to get native diagnostic info:', err);
    return null;
  }
};

export const getNativeLocationReadiness = async (): Promise<NativeLocationReadiness | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await NativeGeofencePlugin.getLocationReadiness();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to get native location readiness:', err);
    return null;
  }
};

export const openNativeLocationSettings = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeGeofencePlugin.openLocationSettings();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to open native location settings:', err);
  }
};

export const openNativeAppLocationSettings = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NativeGeofencePlugin.openAppLocationSettings();
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to open native app location settings:', err);
  }
};

export const repairNativeLocationMonitoring = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const res = await NativeGeofencePlugin.repairLocationMonitoring();
    return !!res?.success;
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to repair native location monitoring:', err);
    return false;
  }
};
