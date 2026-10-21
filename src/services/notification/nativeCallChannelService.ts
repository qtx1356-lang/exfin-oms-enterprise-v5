import { Capacitor, registerPlugin } from '@capacitor/core';

interface ExfinFcmCallTopicBridge {
  subscribeToCallTopic(options: { employeeCode: string }): Promise<{ subscribed?: boolean; topic?: string }>;
  unsubscribeFromCallTopic(options: { employeeCode: string }): Promise<void>;
}

const NativeFcmCallTopic = registerPlugin<ExfinFcmCallTopicBridge>('ExfinFcmToken');

function readEmployeeCode(): string {
  try {
    const cached = JSON.parse(localStorage.getItem('cached_registration_data') || '{}');
    return String(
      cached.employeeCode ||
      cached.employeeId ||
      cached.id ||
      localStorage.getItem('registrationId') ||
      ''
    ).trim();
  } catch {
    return String(localStorage.getItem('registrationId') || '').trim();
  }
}

let started = false;

/**
 * Subscribes the Android installation to its private EXFIN call channel.
 *
 * This intentionally does not send or expose the FCM token. The Firebase Android
 * SDK owns the token and topic subscription. Once subscribed, the backend can ring
 * the employee by topic without querying push_device_tokens for every call.
 */
export async function initNativeEmployeeCallChannel(): Promise<void> {
  if (started || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  started = true;

  const trySubscribe = async () => {
    const employeeCode = readEmployeeCode();
    if (!employeeCode) return false;
    try {
      const result = await NativeFcmCallTopic.subscribeToCallTopic({ employeeCode });
      console.info('[NativeCall] Employee call channel subscribed:', result?.topic || 'private topic');
      localStorage.setItem('exfin_call_topic_subscribed', employeeCode);
      return true;
    } catch (error) {
      console.warn('[NativeCall] Employee call-channel subscription is not ready yet:', error);
      return false;
    }
  };

  if (await trySubscribe()) return;

  // Registration data may become available shortly after Firebase authentication.
  // Retry briefly during startup, then stop; the next app start retries automatically.
  let attempts = 0;
  const timer = window.setInterval(async () => {
    attempts += 1;
    if (await trySubscribe() || attempts >= 30) window.clearInterval(timer);
  }, 2000);
}

export async function removeNativeEmployeeCallChannel(employeeCode?: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  const code = String(employeeCode || readEmployeeCode()).trim();
  if (!code) return;
  try {
    await NativeFcmCallTopic.unsubscribeFromCallTopic({ employeeCode: code });
    localStorage.removeItem('exfin_call_topic_subscribed');
  } catch (error) {
    console.warn('[NativeCall] Could not remove employee call channel:', error);
  }
}
