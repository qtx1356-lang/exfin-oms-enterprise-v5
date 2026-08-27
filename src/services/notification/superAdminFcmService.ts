import { auth } from '../firebase/config';
import { PushNotifications } from '@capacitor/push-notifications';

export interface SuperAdminAlertClientConfig {
  enabled: boolean;
  recipientUid: string;
  recipientName: string;
  recipientEmail: string;
  recipientFcmToken: string;
  deviceModel?: string;
  devicePlatform?: string;
  notifyCheckIn: boolean;
  notifyCheckOut: boolean;
  notifyOfficeExit?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AttendanceAlertDispatchPayload {
  eventId?: string;
  eventType: 'CHECK_IN' | 'AUTO_CHECK_IN' | 'MANUAL_CHECK_IN' | 'CHECK_OUT' | 'WFH' | 'CLIENT_VISIT' | 'OUTDOOR_WORK' | 'OUTSIDE_OFFICE' | 'GEOFENCE_EXIT';
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  attendanceType?: string;
  checkInTime?: string;
  checkOutTime?: string;
  recordedExitTime?: string;
  workingHours?: string;
  distance?: number | string | null;
  townCity?: string;
  eventTime?: string;
}

/**
 * Gets currently logged in user's Firebase Auth ID token
 */
async function getIdToken(): Promise<string | null> {
  try {
    if (auth && auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('[SuperAdminFcmClient] Failed to obtain Firebase ID token:', err);
  }
  return null;
}

/**
 * Fetch Super-Admin alert configuration
 */
export async function getSuperAdminAlertConfig(): Promise<SuperAdminAlertClientConfig> {
  const token = await getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/admin/attendance-alerts/config', {
    method: 'GET',
    headers,
  });

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await res.text();
    console.error('[SuperAdminFcmClient] Non-JSON response received:', text.substring(0, 200));
    throw new Error(`Attendance alert API returned non-JSON response (${res.status}). Ensure the backend is running.`);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  const data = await res.json();
  return data.config || { enabled: false, notifyCheckIn: false, notifyCheckOut: false, notifyOfficeExit: false, recipientRegistered: false };
}

/**
 * Save Super-Admin alert configuration
 */
export async function saveSuperAdminAlertConfig(
  update: Partial<SuperAdminAlertClientConfig>
): Promise<SuperAdminAlertClientConfig> {
  const token = await getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/admin/attendance-alerts/config', {
    method: 'POST',
    headers,
    body: JSON.stringify(update),
  });

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await res.text();
    console.error('[SuperAdminFcmClient] Non-JSON response received on save:', text.substring(0, 200));
    throw new Error(`Attendance alert API returned non-JSON response (${res.status}). Ensure the backend is running.`);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  const data = await res.json();
  return data.config;
}

/**
 * Registers the current device (Capacitor Android or Browser) as the designated Super-Admin alert recipient
 */
export async function registerThisDeviceAsAlertRecipient(): Promise<{
  success: boolean;
  token: string;
  config?: SuperAdminAlertClientConfig;
  message?: string;
}> {
  const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();
  let fcmToken = '';
  let deviceModel = 'Web Browser (' + (typeof navigator !== 'undefined' ? navigator.userAgent.split(' ')[0] : 'Unknown') + ')';
  let devicePlatform = 'web';

  if (isCapacitor) {
    devicePlatform = (window as any).Capacitor?.getPlatform() || 'android';
    deviceModel = `Android Device (${devicePlatform.toUpperCase()})`;

    try {
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        throw new Error('Push notification permission was denied on this Android device. Please enable notifications in device settings.');
      }

      await PushNotifications.register();

      // Wait for registration token or retrieve from native cache
      fcmToken = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('Capacitor push registration timed out'));
        }, 8000);

        PushNotifications.addListener('registration', (tokenObj) => {
          clearTimeout(timer);
          localStorage.setItem('super_admin_fcm_token', tokenObj.value);
          resolve(tokenObj.value);
        });

        PushNotifications.addListener('registrationError', (err) => {
          clearTimeout(timer);
          reject(new Error('Capacitor push registration failed: ' + (err.error || JSON.stringify(err))));
        });
      });
    } catch (capErr: any) {
      console.warn('[SuperAdmin FCM] Capacitor registration error:', capErr);
      throw capErr;
    }
  } else {
    // Web environment: do NOT generate a fake token
    throw new Error('Device registration requires the EXFIN Android app. You cannot register a web browser to receive push alerts.');
  }

  const token = await getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/admin/attendance-alerts/register-device', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fcmToken,
      deviceModel,
      devicePlatform,
    }),
  });

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await res.text();
    console.error('[SuperAdminFcmClient] Non-JSON response received on register:', text.substring(0, 200));
    throw new Error(`Attendance alert API returned non-JSON response (${res.status}). Ensure the backend is running.`);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  const data = await res.json();
  return {
    success: true,
    token: fcmToken,
    config: data.config,
    message: data.message,
  };
}

/**
 * Sends a live test push alert to the configured recipient device
 */
export async function sendSuperAdminTestAlert(
  tokenOverride?: string,
  title?: string,
  body?: string
): Promise<{ success: boolean; messageId?: string; message?: string }> {
  const token = await getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch('/api/admin/attendance-alerts/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      token: tokenOverride,
      title,
      body,
    }),
  });

  const contentType = res.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    const text = await res.text();
    console.error('[SuperAdminFcmClient] Non-JSON response received on test:', text.substring(0, 200));
    throw new Error(`Attendance alert API returned non-JSON response (${res.status}). Ensure the backend is running.`);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  return await res.json();
}
