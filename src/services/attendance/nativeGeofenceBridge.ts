import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';
import { AutomaticAttendanceEngine, getFormattedTimeStr } from './automaticAttendanceEngine';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';

export interface NativeAttendanceEvent {
  eventId: string;
  employeeId: string;
  employeeName?: string;
  townCity?: string;
  eventType: 'CHECK_IN' | 'CHECK_OUT' | 'ENTER' | 'EXIT';
  transition?: 'ENTER' | 'EXIT';
  time: string;
  date: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
  exitTimestamp?: number;
  distanceFromOffice?: number;
  distance?: number;
  source?: string;
  schemaVersion?: number;
  deviceId?: string;
}

export interface NativeGeofencePluginInterface {
  registerOfficeGeofence(): Promise<{ success: boolean; geofenceId: string; authoritativeRadius: number; wakeupTriggerRadius: number; assistRadius?: number; latitude: number; longitude: number }>;
  getGeofenceStatus(): Promise<{ isRegistered: boolean; geofenceId: string; authoritativeRadius: number; wakeupTriggerRadius: number; assistRadius?: number; latitude: number; longitude: number }>;
  getUnconsumedNativeEvents(): Promise<{ events: NativeAttendanceEvent[] }>;
  removeOfficeGeofence(): Promise<{ success: boolean }>;
  setEmployeeIdentity(identity: { id: string; name: string; townCity: string; serverUrl: string }): Promise<void>;
  startActiveSession(session: { employeeId: string; employeeName: string; townCity: string; date: string; checkInTime: string }): Promise<{ success: boolean }>;
  clearActiveSession(): Promise<{ success: boolean }>;
  cancelPendingExit(): Promise<{ success: boolean }>;
  forceSyncPendingEvents(): Promise<{ success: boolean }>;
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
  }>;
  addListener(eventName: 'attendanceNativeCheckIn', listenerFunc: (event: NativeAttendanceEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'attendanceNativeCheckOut', listenerFunc: (event: NativeAttendanceEvent) => void): Promise<PluginListenerHandle>;
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
        const eventDate = new Date(evt.timestamp || Date.now());
        const timeKolkata = getFormattedTimeStr(eventDate);
        const eventType = evt.eventType || (evt.transition === 'EXIT' ? 'CHECK_OUT' : 'CHECK_IN');

        if (eventType === 'CHECK_OUT' || evt.transition === 'EXIT') {
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
          AutomaticAttendanceEngine.processGeofenceExit(
            employeeId,
            employeeName,
            { latitude: evt.latitude || 23.616227, longitude: evt.longitude || 87.117063 },
            townCity || 'Raniganj HQ',
            eventDate,
            true
          );
        } else if (eventType === 'CHECK_IN' || evt.transition === 'ENTER') {
          console.log('[NATIVE_GEOFENCE_ENTER_RECONCILED]', {
            employeeId,
            date: eventDate.toISOString().split('T')[0],
            distance: evt.distance ?? evt.distanceFromOffice ?? 25,
            timestamp: eventDate.toISOString(),
            localTime: timeKolkata,
            source: 'NATIVE_GEOFENCE'
          });
          logAttendanceEvent('GEOFENCE_ENTER', employeeId, `[NATIVE_GEOFENCE_ENTER_RECONCILED] Reconciled native enter event at ${timeKolkata} (${eventDate.toISOString()})`);
          AutomaticAttendanceEngine.processGeofenceEntry(
            employeeId,
            employeeName,
            { latitude: evt.latitude || 23.616227, longitude: evt.longitude || 87.117063 },
            townCity || 'Raniganj HQ',
            eventDate
          );
        }
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
        const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('file://'))
          ? window.location.origin
          : (typeof import.meta !== 'undefined' && import.meta?.env?.APP_URL) ? import.meta.env.APP_URL : '';
        await NativeGeofencePlugin.setEmployeeIdentity({
          id: info.id,
          name: info.name,
          townCity: info.townCity || 'Raniganj HQ',
          serverUrl: origin
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

      const eventDate = new Date(evt.timestamp || Date.now());
      logAttendanceEvent('GEOFENCE_ENTER', currentEmp.id, `Native authoritative check-in event received: ${evt.eventId} at ${evt.time}`);
      AutomaticAttendanceEngine.processGeofenceEntry(
        currentEmp.id,
        currentEmp.name,
        { latitude: evt.latitude, longitude: evt.longitude },
        currentEmp.townCity || 'Raniganj HQ',
        eventDate
      );
    });
    activeListenerHandles.push(checkInHandle);

    // 2. Native Check-Out listener
    const checkOutHandle = await NativeGeofencePlugin.addListener('attendanceNativeCheckOut', (evt) => {
      const currentEmp = getEmployeeInfo();
      if (!currentEmp?.id) return;

      const eventDate = new Date(evt.timestamp || Date.now());
      logAttendanceEvent('GEOFENCE_EXIT', currentEmp.id, `Native authoritative check-out event received: ${evt.eventId} at ${evt.time}`);
      AutomaticAttendanceEngine.processGeofenceExit(
        currentEmp.id,
        currentEmp.name,
        { latitude: evt.latitude, longitude: evt.longitude },
        currentEmp.townCity || 'Raniganj HQ',
        eventDate,
        true
      );
    });
    activeListenerHandles.push(checkOutHandle);

    // 3. Raw Geofence Transition listener (backward compatibility)
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
    const origin = (typeof window !== 'undefined' && window.location.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('file://'))
      ? window.location.origin
      : (typeof import.meta !== 'undefined' && import.meta?.env?.APP_URL) ? import.meta.env.APP_URL : '';
    const authoritativeServerUrl = identity.serverUrl || origin;
    await NativeGeofencePlugin.setEmployeeIdentity({
      id: identity.id,
      name: identity.name || 'Employee',
      townCity: identity.townCity || 'Raniganj HQ',
      serverUrl: authoritativeServerUrl
    });
    console.log(`[NativeGeofenceBridge] Configured native employee identity: ${identity.id} (${identity.name})`);
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
