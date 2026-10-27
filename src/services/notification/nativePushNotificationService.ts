import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeFcmTokenBridge {
  getToken(): Promise<{ token?: string }>;
  registerCurrentToken(): Promise<{ queued?: boolean; tokenPresent?: boolean }>;
  getCallReadiness(): Promise<{ notificationsEnabled?: boolean; fullScreenIntentAllowed?: boolean; apiLevel?: number }>;
  openFullScreenIntentSettings(): Promise<void>;
}

const NativeFcmToken = registerPlugin<NativeFcmTokenBridge>('ExfinFcmToken');
import { App } from '@capacitor/app';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { buildApiUrl } from '@/src/utils/apiConfig';
import { auth } from '../firebase/config';

const DEVICE_TOKEN_KEY = 'exfin_device_fcm_token';
const DEVICE_TOKEN_REGISTER_ENDPOINT = '/api/video/device-token';
const FULL_SCREEN_PROMPT_KEY = 'exfin_call_full_screen_prompt_v5';

let activePushContext: { userId: string; employeeCode: string; role: string } | null = null;
let appResumeListenerInstalled = false;

export async function initNativePushNotifications(userContext: {
  userId?: string; id?: string; uid?: string; employeeCode?: string; role?: string;
} | null) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  if (!userContext) return;

  const userId = userContext.userId || userContext.id || userContext.uid || '';
  const employeeCode = userContext.employeeCode || '';
  const role = userContext.role || 'EMPLOYEE';
  activePushContext = { userId, employeeCode, role };
  if (!userId) return;

  try {
    const { ensureNotificationChannelsCreated } = await import('./pushNotificationService');
    await ensureNotificationChannelsCreated().catch(() => {});

    const permission = await PushNotifications.requestPermissions().catch((e) => {
      console.warn('[NativePush] requestPermissions error:', e);
      return { receive: 'denied' as const };
    });
    if (permission.receive !== 'granted') {
      console.warn('[NativePush] Android notification permission is not granted:', permission.receive);
    }

    // Android 14+ can disable full-screen intent access independently of POST_NOTIFICATIONS.
    // Resolve that state during authenticated app startup instead of waiting for the first
    // incoming call. The user is sent to Android's official per-app setting only once per
    // v5 call-alert setup; after access is granted, incoming calls can surface directly.
    try {
      const readiness = await NativeFcmToken.getCallReadiness();
      if (readiness?.apiLevel >= 34 && readiness.fullScreenIntentAllowed === false) {
        const alreadyPrompted = localStorage.getItem(FULL_SCREEN_PROMPT_KEY) === 'true';
        if (!alreadyPrompted) {
          localStorage.setItem(FULL_SCREEN_PROMPT_KEY, 'true');
          await NativeFcmToken.openFullScreenIntentSettings().catch((err) => {
            console.warn('[NativePush] Could not open Android full-screen call setting:', err);
          });
        }
      }
    } catch (err) {
      console.warn('[NativePush] Call full-screen readiness check failed:', err);
    }

    await PushNotifications.addListener('registration', async (token) => {
      localStorage.setItem(DEVICE_TOKEN_KEY, token.value);
      try {
        const context = activePushContext;
        if (context) await registerTokenWithBackend(token.value, context.userId, context.employeeCode, context.role);
      } catch (err) { console.error('[NativePush] Failed to register token with backend:', err); }
    }).catch((e) => console.warn('[NativePush] registration listener error:', e));

    await PushNotifications.addListener('registrationError', (error) => {
      console.error('[NativePush] Push registration failed:', error.error);
    }).catch((e) => console.warn('[NativePush] registrationError listener error:', e));

    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      console.log('[NativePush] Native push received in foreground:', notification);
    }).catch((e) => console.warn('[NativePush] pushNotificationReceived listener error:', e));

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action.notification?.data || {};
      const route = data?.route || '/video-calls';
      if (route && typeof window !== 'undefined') window.location.hash = route;
    }).catch((e) => console.warn('[NativePush] pushNotificationActionPerformed listener error:', e));

    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action.notification?.extra || {};
      if (String(extra.type || '') === 'video_call' && typeof window !== 'undefined') {
        window.location.hash = String(extra.route || '/video-calls');
      }
    }).catch((e) => console.warn('[NativePush] local notification listener error:', e));

    const cachedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (cachedToken) {
      await registerTokenWithBackend(cachedToken, userId, employeeCode, role).catch((err) =>
        console.warn('[NativePush] Cached FCM token re-registration failed:', err));
    }

    // Native registration is a second independent path. It uses FirebaseAuth + the
    // current FCM token directly and does not depend on a WebView registration event.
    await NativeFcmToken.registerCurrentToken().catch((err) => {
      console.warn('[NativePush] Native current-token backend registration failed:', err);
    });

    if (!appResumeListenerInstalled) {
      await App.addListener('appStateChange', async ({ isActive }) => {
        const context = activePushContext;
        if (!isActive || !context) return;
        const savedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
        if (savedToken) await registerTokenWithBackend(savedToken, context.userId, context.employeeCode, context.role).catch(() => {});
        await NativeFcmToken.registerCurrentToken().catch(() => {});
        await PushNotifications.register().catch((err) => console.error('[NativePush] Foreground FCM registration failed:', err));
      }).then(() => { appResumeListenerInstalled = true; }).catch(() => {});
    }

    await PushNotifications.register().catch((err) => console.error('[NativePush] PushNotifications.register failed:', err));

    try {
      const nativeResult = await NativeFcmToken.getToken();
      const nativeToken = String(nativeResult?.token || '').trim();
      if (nativeToken.length >= 20) {
        localStorage.setItem(DEVICE_TOKEN_KEY, nativeToken);
        await registerTokenWithBackend(nativeToken, userId, employeeCode, role);
      }
    } catch (err) {
      console.error('[NativePush] Native Firebase token fallback failed:', err);
      try { localStorage.setItem('exfin_fcm_registration_error', String((err as any)?.message || err)); } catch {}
    }
  } catch (err) {
    console.error('[NativePush] Exception initializing PushNotifications:', err);
  }
}

async function registerTokenWithBackend(token: string, userId: string, employeeCode: string, role: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Firebase user is not authenticated yet; token registration will be retried.');
      const idToken = await currentUser.getIdToken(true);
      const response = await fetch(buildApiUrl(DEVICE_TOKEN_REGISTER_ENDPOINT), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token, userId, employeeCode, role, platform: 'android', appId: 'com.exfin.oms' }),
      });
      if (!response.ok) {
        const error = new Error(`Server returned ${response.status}: ${await response.text()}`);
        if (response.status < 500 && response.status !== 408 && response.status !== 429) throw error;
        lastError = error;
      } else {
        const payload = await response.json().catch(() => ({})) as { success?: boolean; registered?: boolean; error?: string };
        if (payload.success === false || payload.registered === false) throw new Error(payload.error || 'Server did not confirm FCM token registration.');
        console.log('[NativePush] Device token registered with backend.', { employeeCodePresent: Boolean(employeeCode), attempt });
        return;
      }
    } catch (err) {
      lastError = err;
      const message = String((err as any)?.message || err);
      console.warn(`[NativePush] Token registration attempt ${attempt}/3 failed:`, message);
      if (/Server returned 4(?!08|29)\d\d/.test(message)) throw err;
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError instanceof Error ? lastError : new Error('FCM token registration failed after retries.');
}

export async function diagnoseAndRepairNativePushRegistration(): Promise<string> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return 'This diagnostic is available only in the native Android app.';
  const currentUser = auth.currentUser;
  if (!currentUser) return 'Firebase authentication is not ready. Sign out, sign in again, and retry.';
  let employeeCode = activePushContext?.employeeCode || '';
  if (!employeeCode) {
    try {
      const cached = JSON.parse(localStorage.getItem('cached_registration_data') || '{}');
      employeeCode = String(cached.employeeCode || cached.employeeId || cached.id || localStorage.getItem('registrationId') || '').trim();
    } catch { employeeCode = String(localStorage.getItem('registrationId') || '').trim(); }
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
    const response = await fetch(buildApiUrl(DEVICE_TOKEN_REGISTER_ENDPOINT), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + idToken },
      body: JSON.stringify({ token, userId: currentUser.uid, employeeCode, role: activePushContext?.role || 'EMPLOYEE', platform: 'android', appId: 'com.exfin.oms' }),
    });
    const payload = await response.json().catch(() => ({})) as { success?: boolean; registered?: boolean; error?: string; diagnosticCode?: string; stage?: string };
    if (!response.ok || payload.success === false || payload.registered === false) {
      const detail = [`HTTP ${response.status}`, payload.stage, payload.diagnosticCode, payload.error].filter(Boolean).join(' · ');
      localStorage.setItem('exfin_fcm_registration_error', detail || 'Backend rejected FCM token registration.');
      return 'FCM token acquired, but backend registration failed: ' + (detail || 'No registration confirmation was returned.') + `\nEmployee code available: ${employeeCode ? 'yes' : 'no'}.`;
    }
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
    localStorage.setItem('exfin_fcm_registration_status', JSON.stringify({ registered: true, at: new Date().toISOString(), employeeCodePresent: Boolean(employeeCode), httpStatus: response.status }));
    localStorage.removeItem('exfin_fcm_registration_error');
    return 'SUCCESS: Android FCM token was acquired and the server confirmed it was saved. ' + `Employee code available: ${employeeCode ? 'yes' : 'no'}.`;
  } catch (error: any) {
    const message = String(error?.message || error || 'Network request failed');
    localStorage.setItem('exfin_fcm_registration_error', 'network: ' + message);
    return 'FCM token acquired, but the registration request failed: ' + message;
  }
}

export async function unregisterTokenFromBackend() {
  const token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) return;
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  try {
    const idToken = await currentUser.getIdToken();
    const response = await fetch(buildApiUrl('/api/notifications/unregister-device'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ token })
    });
    if (response.ok) localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch (err) { console.warn('[NativePush] Failed to unregister device token on logout:', err); }
}
