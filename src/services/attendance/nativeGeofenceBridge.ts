import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';
import { AutomaticAttendanceEngine } from './automaticAttendanceEngine';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';

export interface NativeGeofencePluginInterface {
  registerOfficeGeofence(): Promise<{ success: boolean; geofenceId: string; radius: number; latitude: number; longitude: number }>;
  getGeofenceStatus(): Promise<{ isRegistered: boolean; geofenceId: string; radius: number; latitude: number; longitude: number }>;
  getUnconsumedNativeEvents(): Promise<{ events: Array<{ transition: 'EXIT' | 'ENTER'; time: string; date: string; latitude: number; longitude: number; timestamp: number }> }>;
  removeOfficeGeofence(): Promise<{ success: boolean }>;
  setEmployeeIdentity(identity: { id: string; name: string; townCity: string; serverUrl: string }): Promise<void>;
  addListener(eventName: 'geofenceTransition', listenerFunc: (data: { transition: 'EXIT' | 'ENTER'; time: string; date: string; latitude: number; longitude: number; timestamp: number }) => void): Promise<PluginListenerHandle>;
}

export const NativeGeofencePlugin = registerPlugin<NativeGeofencePluginInterface>('ExfinGeofence');

let activeListenerHandle: PluginListenerHandle | null = null;

/**
 * Registers the native Android geofence (25-meter office radius)
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

    // Sort chronologically so earliest exit/entry transitions execute in true chronological order
    events.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const evt of events) {
      const eventDate = new Date(evt.timestamp || Date.now());
      if (evt.transition === 'EXIT') {
        console.log('[NATIVE_GEOFENCE_EXIT_RECONCILED]', {
          employeeId,
          date: eventDate.toISOString().split('T')[0],
          distance: Math.round(AutomaticAttendanceEngine ? 25 : 0),
          timestamp: eventDate.toISOString(),
          source: 'NATIVE_GEOFENCE'
        });
        logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[NATIVE_GEOFENCE_EXIT_RECONCILED] Reconciled native exit event at ${eventDate.toISOString()}`);
        AutomaticAttendanceEngine.processGeofenceExit(
          employeeId,
          employeeName,
          { latitude: evt.latitude || 23.616227, longitude: evt.longitude || 87.117063 },
          townCity || 'Raniganj HQ',
          eventDate,
          true
        );
      } else if (evt.transition === 'ENTER') {
        console.log('[NATIVE_GEOFENCE_ENTER_RECONCILED]', {
          employeeId,
          date: eventDate.toISOString().split('T')[0],
          distance: 25,
          timestamp: eventDate.toISOString(),
          source: 'NATIVE_GEOFENCE'
        });
        logAttendanceEvent('GEOFENCE_ENTER', employeeId, `[NATIVE_GEOFENCE_ENTER_RECONCILED] Reconciled native enter event at ${eventDate.toISOString()}`);
        AutomaticAttendanceEngine.processGeofenceEntry(
          employeeId,
          employeeName,
          { latitude: evt.latitude || 23.616227, longitude: evt.longitude || 87.117063 },
          townCity || 'Raniganj HQ',
          eventDate
        );
      }
    }

    // Trigger sync if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncPendingAttendanceRecords().catch(() => {});
    }
  } catch (err: any) {
    console.warn('[NativeGeofenceBridge] Error reconciling native events:', err);
  }
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
        const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://exfin-oms-enterprise-v5.pages.dev';
        await NativeGeofencePlugin.setEmployeeIdentity({
          id: info.id,
          name: info.name,
          townCity: info.townCity || 'Raniganj HQ',
          serverUrl: originUrl
        });
        console.log('[NativeGeofenceBridge] Configured native employee identity on init.');
      } catch (err) {
        console.warn('[NativeGeofenceBridge] Failed to set native employee identity:', err);
      }
      await reconcileNativeGeofenceEvents(info.id, info.name, info.townCity || 'Raniganj HQ');
    }

    if (activeListenerHandle) {
      activeListenerHandle.remove();
      activeListenerHandle = null;
    }

    activeListenerHandle = await NativeGeofencePlugin.addListener('geofenceTransition', (data) => {
      const currentEmp = getEmployeeInfo();
      if (!currentEmp?.id) return;

      logAttendanceEvent(
        data.transition === 'EXIT' ? 'GEOFENCE_EXIT' : 'GEOFENCE_ENTER',
        currentEmp.id,
        `Native geofence transition received: ${data.transition} at ${data.time}`
      );

      const eventDate = new Date(data.timestamp || Date.now());

      if (data.transition === 'EXIT') {
        AutomaticAttendanceEngine.processGeofenceExit(
          currentEmp.id,
          currentEmp.name,
          { latitude: data.latitude, longitude: data.longitude },
          currentEmp.townCity || 'Raniganj HQ',
          eventDate,
          true
        );
      } else if (data.transition === 'ENTER') {
        AutomaticAttendanceEngine.processGeofenceEntry(
          currentEmp.id,
          currentEmp.name,
          { latitude: data.latitude, longitude: data.longitude },
          currentEmp.townCity || 'Raniganj HQ',
          eventDate
        );
      }
    });

    return () => {
      if (activeListenerHandle) {
        activeListenerHandle.remove();
        activeListenerHandle = null;
      }
    };
  } catch (err) {
    console.warn('[NativeGeofenceBridge] Failed to initialize native geofence listener:', err);
    return () => {};
  }
};
