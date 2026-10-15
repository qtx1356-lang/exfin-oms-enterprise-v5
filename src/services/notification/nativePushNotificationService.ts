import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { API_BASE_URL } from '@/src/utils/apiConfig';
import { auth } from '../firebase/config';

const DEVICE_TOKEN_KEY = 'exfin_device_fcm_token';

/**
 * Initializes Native Android Push Notifications with permission requests and token registration.
 * FCM itself is the source of truth for Firebase configuration; do not gate registration on
 * an unrelated native startup/configuration probe.
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
    const { ensureNotificationChannelsCreated } = await import('./pushNotificationService');
    await ensureNotificationChannelsCreated().catch(() => {});

    const permission = await PushNotifications.requestPermissions().catch((e) => {
      console.warn('[NativePush] requestPermissions error:', e);
      return { receive: 'denied' as const };
    });

    if (permission.receive !== 'granted') {
      console.warn('[NativePush] OS push notifications permission denied:', permission.receive);
      return;
    }

    // Do not remove all listeners: other EXFIN OMS notification handlers may be active.
    await PushNotifications.addListener('registration', async (token) => {
      console.log('[NativePush] Device successfully registered with FCM.');
      localStorage.setItem(DEVICE_TOKEN_KEY, token.value);
      try {
        await registerTokenWithBackend(token.value, userId, employeeCode, role);
      } catch (err) {
        console.error('[NativePush] Failed to register token with backend:', err);
      }
    }).catch((e) => console.warn('[NativePush] addListener registration error:', e));

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[NativePush] Push registration failed:', error.error);
    }).catch((e) => console.warn('[NativePush] addListener registrationError error:', e));

    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[NativePush] Native push received in foreground:', notification);

      // Android does not automatically display an FCM notification while the app is
      // foregrounded. Surface incoming calls explicitly as a local notification.
      const data = notification.data || {};
      if (String(data.type || '') === 'video_call') {
        try {
          await LocalNotifications.schedule({
            notifications: [{
              id: Math.floor(Date.now() % 2147483647),
              title: notification.title || 'Incoming EXFIN OMS video call',
              body: notification.body || 'EXFIN OMS Admin is calling you',
              channelId: 'exfin_oms_messages_v2',
              sound: 'notification.wav',
              extra: {
                type: 'video_call',
                callId: data.callId || '',
                route: data.route || '/video-calls',
                title: data.title || 'EXFIN OMS video call',
              },
            }],
          });
        } catch (err) {
          console.warn('[NativePush] Failed to show foreground incoming-call notification:', err);
        }
      }
    }).catch((e) => console.warn('[NativePush] addListener pushNotificationReceived error:', e));

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[NativePush] Push action performed by user:', action);
      const data = action.notification?.data || {};
      const route = data?.route || '/video-calls';
      if (route && typeof window !== 'undefined') {
        window.location.hash = route;
      }
    }).catch((e) => console.warn('[NativePush] addListener pushNotificationActionPerformed error:', e));

    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification?.extra || {};
      if (String(extra.type || '') === 'video_call' && typeof window !== 'undefined') {
        window.location.hash = String(extra.route || '/video-calls');
      }
    }).catch((e) => console.warn('[NativePush] local notification listener error:', e));

    await PushNotifications.register().catch((err) => {
      console.error('[NativePush] PushNotifications.register failed:', err);
    });

  } catch (err) {
    console.error('[NativePush] Exception initializing PushNotifications:', err);
  }
}

/**
 * Registers device push token with the authenticated Cloudflare video API securely.
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

  const idToken = await currentUser.getIdToken(true);

  const response = await fetch(`${API_BASE_URL}/api/video/device-token`, {
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
    const response = await fetch(`${API_BASE_URL}/api/video/device-token/unregister`, {
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
