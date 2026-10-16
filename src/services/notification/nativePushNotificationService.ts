import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildApiUrl } from '@/src/utils/apiConfig';
import { auth } from '../firebase/config';

const DEVICE_TOKEN_KEY = 'exfin_device_fcm_token';

let activePushContext: { userId: string; employeeCode: string; role: string } | null = null;
let appResumeListenerInstalled = false;

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
  activePushContext = { userId, employeeCode, role };

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
      console.warn('[NativePush] OS notification permission is not granted:', permission.receive,
        '- continuing FCM token registration; visible alerts may be blocked by Android.');
    }

    await PushNotifications.addListener('registration', async (token) => {
      console.log('[NativePush] Device successfully registered with FCM.');
      localStorage.setItem(DEVICE_TOKEN_KEY, token.value);
      try {
        const context = activePushContext;
        if (context) await registerTokenWithBackend(token.value, context.userId, context.employeeCode, context.role);
      } catch (err) {
        console.error('[NativePush] Failed to register token with backend:', err);
      }
    }).catch((e) => console.warn('[NativePush] addListener registration error:', e));

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[NativePush] Push registration failed:', error.error);
    }).catch((e) => console.warn('[NativePush] addListener registrationError error:', e));

    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[NativePush] Native push received in foreground:', notification);
      // Incoming video-call UI is rendered by ExfinCallMessagingService as a native
      // CallStyle notification in both foreground and background. Do not schedule a
      // second generic LocalNotifications alert for the same FCM message.
    }).catch((e) => console.warn('[NativePush] addListener pushNotificationReceived error:', e));

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[NativePush] Push action performed by user:', action);
      const data = action.notification?.data || {};
      const route = data?.route || '/video-calls';
      if (route && typeof window !== 'undefined') {
        window.location.hash = route;
      }
    }).catch((e) => console.warn('[NativePush] Push action listener error:', e));

    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification?.extra || {};
      if (String(extra.type || '') === 'video_call' && typeof window !== 'undefined') {
        window.location.hash = String(extra.route || '/video-calls');
      }
    }).catch((e) => console.warn('[NativePush] local notification listener error:', e));

    const cachedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (cachedToken) {
      try {
        await registerTokenWithBackend(cachedToken, userId, employeeCode, role);
        console.log('[NativePush] Cached FCM token re-registered with backend.');
      } catch (err) {
        console.warn('[NativePush] Cached FCM token re-registration failed:', err);
      }
    }

    if (!appResumeListenerInstalled) {
      await App.addListener('appStateChange', async ({ isActive }) => {
        const context = activePushContext;
        if (!isActive || !context) return;
        const savedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
        if (savedToken) {
          try {
            await registerTokenWithBackend(savedToken, context.userId, context.employeeCode, context.role);
          } catch (err) {
            console.warn('[NativePush] Foreground token re-registration failed:', err);
          }
        }
        await PushNotifications.register().catch((err) => {
          console.error('[NativePush] Foreground FCM re-registration failed:', err);
        });
      }).then(() => { appResumeListenerInstalled = true; })
        .catch((e) => console.warn('[NativePush] appStateChange listener error:', e));
    }

    await PushNotifications.register().catch((err) => {
      console.error('[NativePush] PushNotifications.register failed:', err);
    });

  } catch (err) {
    console.error('[NativePush] Exception initializing PushNotifications:', err);
  }
}

/**
 * Registers device push token with the authenticated backend securely.
 * This must match the server's canonical notification token route.
 */
async function registerTokenWithBackend(
  token: string,
  userId: string,
  employeeCode: string,
  role: string
) {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Firebase user is not authenticated yet; token registration will be retried.');
  }

  const idToken = await currentUser.getIdToken(true);

  const response = await fetch(buildApiUrl('/api/notifications/register-device'), {
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
    const response = await fetch(buildApiUrl('/api/notifications/unregister-device'), {
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
