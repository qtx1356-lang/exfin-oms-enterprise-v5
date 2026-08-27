import { API_BASE_URL } from '@/src/utils/apiConfig';
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
  webPushSubscription?: any;
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
 * Internal helper to perform fetch with strict JSON response verification and clear diagnostics
 */
async function fetchJson(url: string, options: RequestInit = {}): Promise<any> {
  const method = options.method || 'GET';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'server';

  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err: any) {
    console.error('[EXFIN API] FETCH FAILED:', {
      method,
      fullUrl: url,
      origin,
      error: err?.message || String(err),
    });
    throw err;
  }

  const contentType = res.headers.get('content-type') || 'unknown';

  console.log('[EXFIN API]', {
    method,
    fullUrl: url,
    origin,
    status: res.status,
    contentType,
  });

  if (!contentType.includes('application/json')) {
    const preview = await res.text().catch(() => '');
    console.error(`[SuperAdminFcmClient] Non-JSON response (${res.status}, ${contentType}) from ${url}:`, preview.substring(0, 150));
    throw new Error(
      `EXFIN API returned HTML instead of JSON (Status ${res.status}, Content-Type: ${contentType}). The request URL (${url}) may be reaching the frontend SPA instead of the backend.`
    );
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  return await res.json();
}

/**
 * Fetch Super-Admin alert configuration
 */
export async function getSuperAdminAlertConfig(): Promise<SuperAdminAlertClientConfig> {
  const token = await getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const data = await fetchJson(API_BASE_URL + '/api/admin/attendance-alerts/config', {
    method: 'GET',
    headers,
  });

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

  const data = await fetchJson(API_BASE_URL + '/api/admin/attendance-alerts/config', {
    method: 'POST',
    headers,
    body: JSON.stringify(update),
  });

  return data.config;
}

/**
 * Remove recipient device registration
 */
export async function removeRecipientDevice(): Promise<{
  success: boolean;
  config?: SuperAdminAlertClientConfig;
  message?: string;
}> {
  const token = await getIdToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const data = await fetchJson(API_BASE_URL + '/api/admin/attendance-alerts/remove-device', {
    method: 'POST',
    headers,
  });

  return {
    success: true,
    config: data.config,
    message: 'Recipient device removed successfully.',
  };
}

/**
 * Registers the current device (Capacitor Android or Web Browser) as designated Super-Admin alert recipient
 */
export async function registerThisDeviceAsAlertRecipient(): Promise<{
  success: boolean;
  token: string;
  config?: SuperAdminAlertClientConfig;
  message?: string;
}> {
  const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

  if (isCapacitor) {
    let fcmToken = '';
    const devicePlatform = (window as any).Capacitor?.getPlatform() || 'android';
    const deviceModel = `Android Device (${devicePlatform.toUpperCase()})`;

    try {
      const permResult = await PushNotifications.requestPermissions();
      if (permResult.receive !== 'granted') {
        throw new Error('Push notification permission was denied on this Android device. Please enable notifications in device settings.');
      }

      await PushNotifications.register();

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

    const token = await getIdToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const data = await fetchJson(API_BASE_URL + '/api/admin/attendance-alerts/register-device', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fcmToken,
        deviceModel,
        devicePlatform,
      }),
    });

    return {
      success: true,
      token: fcmToken,
      config: data.config,
      message: data.message,
    };
  } else {
    // Web Browser standard Web Push registration
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('This browser does not support Web Push notifications.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Browser notification permission was denied. Please enable notifications for EXFIN in your browser settings.');
    }

    const token = await getIdToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const vapidData = await fetchJson(API_BASE_URL + '/api/admin/attendance-alerts/web-push-public-key', {
      method: 'GET',
      headers,
    });

    const publicKey = vapidData.publicKey;
    if (!publicKey) {
      throw new Error('VAPID public key not found on server.');
    }

    const registration = await navigator.serviceWorker.ready;

    const padding = '='.repeat((4 - publicKey.length % 4) % 4);
    const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const applicationServerKey = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      applicationServerKey[i] = rawData.charCodeAt(i);
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys) {
      throw new Error('Failed to generate a valid Web Push subscription.');
    }

    const data = await fetchJson(API_BASE_URL + '/api/admin/attendance-alerts/register-web-device', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      }),
    });

    return {
      success: true,
      token: subJson.endpoint || '',
      config: data.config,
      message: 'Browser successfully registered for attendance push alerts!',
    };
  }
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

  return await fetchJson(API_BASE_URL + '/api/admin/attendance-alerts/test', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      token: tokenOverride,
      title,
      body,
    }),
  });
}
