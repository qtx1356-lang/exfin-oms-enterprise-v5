import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeFcmTokenBridge {
  getToken(): Promise<{ token?: string }>;
}

// Direct native Firebase SDK fallback: this works even if the JS plugin's
// registration event is missed during startup or WebView initialization.
const NativeFcmToken = registerPlugin<NativeFcmTokenBridge>('ExfinFcmToken');
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

    // Ask Firebase's native SDK for the actual FCM token independently of the
    // Capacitor registration event. Backend writes are idempotent by token hash.
    try {
      const nativeResult = await NativeFcmToken.getToken();
      const nativeToken = String(nativeResult?.token || '').trim();
      if (nativeToken.length >= 20) {
        localStorage.setItem(DEVICE_TOKEN_KEY, nativeToken);
        await registerTokenWithBackend(nativeToken, userId, employeeCode, role);
        console.info('[NativePush] Native Firebase token fallback registered successfully.');
      } else {
        console.warn('[NativePush] Native Firebase token fallback returned an empty token.');
      }
    } catch (err) {
      console.error('[NativePush] Native Firebase token fallback failed:', err);
      try {
        localStorage.setItem('exfin_fcm_registration_error', String((err as any)?.message || err));
      } catch {}
    }

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
  // Retry transient startup/network failures. A token is cached before this call,
  // so retries and app-resume registration are safe and idempotent on the server.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Firebase user is not authenticated yet; token registration will be retried.');
      }

      const idToken = await currentUser.getIdToken(true);
      const response = await fetch(buildApiUrl('/api/video/device-token'), {
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
        const error = new Error(`Server returned ${response.status}: ${errorText}`);
        // Authentication/identity errors need a code or account fix, not rapid retries.
        if (response.status < 500 && response.status !== 408 && response.status !== 429) throw error;
        lastError = error;
      } else {
        const payload = await response.json().catch(() => ({})) as { success?: boolean; registered?: boolean; error?: string };
        if (payload.success === false || payload.registered === false) {
          throw new Error(payload.error || 'Server did not confirm FCM token registration.');
        }
        console.log('[NativePush] Device token successfully registered/updated on backend.', {
          employeeCodePresent: Boolean(employeeCode),
          attempt
        });
        return;
      }
    } catch (err) {
      lastError = err;
      const message = String((err as any)?.message || err);
      console.warn(`[NativePush] Token registration attempt ${attempt}/3 failed:`, message);
      // Do not hammer the backend for invalid credentials or rejected employee identity.
      if (/Server returned 4(?!08|29)\d\d/.test(message)) throw err;
    }

    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }

  throw lastError instanceof Error ? lastError : new Error('FCM token registration failed after retries.');
}

/**
 * On-demand native push repair and safe diagnostics for employee support.
 * Never returns or logs the actual FCM token.
 */
export async function diagnoseAndRepairNativePushRegistration(): Promise<string> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return 'This diagnostic is available only in the native Android app.';
  }
  const currentUser = auth.currentUser;
  if (!currentUser) return 'Firebase authentication is not ready. Sign out, sign in again, and retry.';
  let employeeCode = activePushContext?.employeeCode || '';
  if (!employeeCode) {
    try {
      const cached = JSON.parse(localStorage.getItem('cached_registration_data') || '{}');
      employeeCode = String(cached.employeeCode || cached.employeeId || cached.id || localStorage.getItem('registrationId') || '').trim();
    } catch {
      employeeCode = String(localStorage.getItem('registrationId') || '').trim();
    }
  }
  let token = '';
  try {
    const nativeResult = await NativeFcmToken.getToken();
    token = String(nativeResult?.token || '').trim();
  } catch (error: any) {
    const message = String(error?.message || error || 'Unknown native Firebase error');
    localStorage.setItem('exfin_fcm_registration_error', 'native-token: ' + message);
    return 'FCM token retrieval failed: ' + message;
  }
  if (token.length < 20) return 'Firebase did not return a usable FCM token.';
  try {
    const idToken = await currentUser.getIdToken(true);
    const response = await fetch(buildApiUrl('/api/video/device-token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({
        token,
        userId: currentUser.uid,
        employeeCode,
        role: activePushContext?.role || 'EMPLOYEE',
        platform: 'android',
        appId: 'com.exfin.oms',
      }),
    });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; registered?: boolean; error?: string; diagnosticCode?: string; stage?: string };
    if (!response.ok || payload.success === false || payload.registered === false) {
      const detail = [`HTTP ${response.status}`, payload.stage, payload.diagnosticCode, payload.error].filter(Boolean).join(' · ');
      localStorage.setItem('exfin_fcm_registration_error', detail || 'Backend rejected FCM token registration.');
      return 'FCM token acquired, but backend registration failed: ' + (detail || 'No registration confirmation was returned.') +
        `\nEmployee code available: ${employeeCode ? 'yes' : 'no'}.`;
    }
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
    localStorage.setItem('exfin_fcm_registration_status', JSON.stringify({
      registered: true, at: new Date().toISOString(), employeeCodePresent: Boolean(employeeCode),
      httpStatus: response.status,
    }));
    localStorage.removeItem('exfin_fcm_registration_error');
    return 'SUCCESS: Android FCM token was acquired and the server confirmed it was saved. ' +
      `Employee code available: ${employeeCode ? 'yes' : 'no'}. Try an admin-to-employee call now.`;
  } catch (error: any) {
    const message = String(error?.message || error || 'Network request failed');
    localStorage.setItem('exfin_fcm_registration_error', 'network: ' + message);
    return 'FCM token acquired, but the registration request failed: ' + message;
  }
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
