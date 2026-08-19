import { registerPlugin, Capacitor } from '@capacitor/core';

export interface BackgroundLocationPluginInterface {
  startTracking(options: { employeeId: string; employeeName: string }): Promise<{ success: boolean; tracking: boolean; employeeId: string }>;
  stopTracking(): Promise<{ success: boolean; tracking: boolean }>;
  isTrackingActive(): Promise<{ isTracking: boolean; employeeId?: string | null }>;
}

export const BackgroundLocationPlugin = registerPlugin<BackgroundLocationPluginInterface>('BackgroundLocation');

/**
 * Starts native Android background location tracking (Foreground Service with 30s updates).
 * Used when an employee has an active checked-in attendance session.
 */
export const startNativeBackgroundLocation = async (
  employeeId: string,
  employeeName: string
): Promise<boolean> => {
  if (!employeeId || !employeeId.trim()) {
    return false;
  }
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  try {
    const result = await BackgroundLocationPlugin.startTracking({
      employeeId: employeeId.trim(),
      employeeName: employeeName ? employeeName.trim() : 'Employee',
    });
    console.log('[NativeBgLocationBridge] Started native background location service for:', employeeId);
    return !!result.success;
  } catch (err) {
    console.warn('[NativeBgLocationBridge] Failed to start native background tracking:', err);
    return false;
  }
};

/**
 * Stops native Android background location tracking when attendance session is finalized or checked out.
 */
export const stopNativeBackgroundLocation = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return true;
  }

  try {
    const result = await BackgroundLocationPlugin.stopTracking();
    console.log('[NativeBgLocationBridge] Stopped native background location service.');
    return !!result.success;
  } catch (err) {
    console.warn('[NativeBgLocationBridge] Failed to stop native background tracking:', err);
    return false;
  }
};

/**
 * Checks if native background location tracking is actively running.
 */
export const isNativeBackgroundLocationRunning = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) {
    return false;
  }

  try {
    const result = await BackgroundLocationPlugin.isTrackingActive();
    return !!result.isTracking;
  } catch (err) {
    return false;
  }
};
