import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { API_BASE_URL } from '@/src/utils/apiConfig';
import { auth } from '../firebase/config';

const DEVICE_TOKEN_KEY = 'exfin_device_fcm_token';

/**
 * Initializes Native Android Push Notifications with permission requests and token registration.
 */
export async function initNativePushNotifications(userContext: {
  userId?: string;
  id?: string;
  uid?: string;
  employeeCode?: string;
  role?: string;
} | null) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    console.log('[NativePush] Not on native Android. Skipping native push setup.');
    return;
  }

  if (!userContext) {
    console.log('[NativePush] No user context available. Skipping registration.');
    return;
  }

  const userId = userContext.userId || userContext.id || userContext.uid || '';
  const employeeCode = userContext.employeeCode || '';
  const role = userContext.role || 'EMPLOYEE';

  if (!userId) {
    console.log('[NativePush] No valid userId or employeeCode found. Skipping registration.');
    return;
  }

  try {
    // 1. Request OS Permission (Android 13+ requires POST_NOTIFICATIONS)
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      console.warn('[NativePush] OS push notifications permission denied:', permission.receive);
      return;
    }

    // 2. Register with Firebase Cloud Messaging
    await PushNotifications.register();

    // 3. Setup listeners
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[NativePush] Device successfully registered with FCM. Token:', token.value);
      const storedToken = localStorage.getItem(DEVICE_TOKEN_KEY);

      // Save token locally
      localStorage.setItem(DEVICE_TOKEN_KEY, token.value);

      // Register/update the token with the backend
      try {
        await registerTokenWithBackend(token.value, userId, employeeCode, role);
      } catch (err) {
        console.error('[NativePush] Failed to register token with backend:', err);
      }
    });

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[NativePush] Push registration failed:', error.error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[NativePush] Native push received in foreground:', notification);
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[NativePush] Push action performed by user:', action);
      const data = action.notification?.data;
      const route = data?.route || '/notifications';
      if (route && typeof window !== 'undefined') {
        window.location.hash = route;
      }
    });

  } catch (err) {
    console.error('[NativePush] Exception initializing PushNotifications:', err);
  }
}

/**
 * Registers device push token with Express backend securely.
 */
async function registerTokenWithBackend(
  token: string,
  userId: string,
  employeeCode: string,
  role: string
) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    console.warn('[NativePush] Cannot register token with backend: Firebase user is not authenticated.');
    return;
  }

  // Retrieve fresh auth token to verify identity securely
  const idToken = await currentUser.getIdToken(true);

  const response = await fetch(`${API_BASE_URL}/api/notifications/register-device`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      token,
      userId,
      employeeCode,
      role,
      platform: 'android',
      appId: 'com.exfin.oms'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Server returned ${response.status}: ${errorText}`);
  }

  console.log('[NativePush] Device token successfully registered/updated on backend.');
}

/**
 * Removes device push token from backend on logout.
 */
export async function unregisterTokenFromBackend() {
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) return;

  const currentUser = auth.currentUser;
  if (!currentUser) return;

  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(`${API_BASE_URL}/api/notifications/unregister-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ token })
    });

    if (response.ok) {
      console.log('[NativePush] Device token unregistered from backend.');
      localStorage.removeItem(DEVICE_TOKEN_KEY);
    }
  } catch (err) {
    console.warn('[NativePush] Failed to unregister device token on logout:', err);
  }
}
