import {
  VideoEnv,
  findRegistration,
  getDoc,
  isCallerActive,
  json,
  setDoc,
  updateDoc,
  verifyCaller,
} from './routeShared';

type PagesFunction<E> = (context: { request: Request; env: E }) => Response | Promise<Response>;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Canonical Android FCM token registration consumed by the LiveKit call sender. */
export const onRequest: PagesFunction<VideoEnv> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return json(null, 204);
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed.' }, 405);

  try {
    const caller = await verifyCaller(request, env);
    if (!caller) return json({ success: false, registered: false, error: 'Authentication required.' }, 401);
    if (!(await isCallerActive(env, caller))) return json({ success: false, registered: false, error: 'Your account is inactive or not approved.' }, 403);

    const body = await request.json().catch(() => ({})) as any;
    const token = String(body?.token || '').trim();
    const clientEmployeeCode = String(body?.employeeCode || '').trim();
    const platform = String(body?.platform || 'android').trim().toLowerCase();
    const appId = String(body?.appId || 'com.exfin.oms').trim();

    if (token.length < 20 || token.length > 4096) return json({ success: false, registered: false, error: 'Invalid FCM token.' }, 400);
    if (platform !== 'android' || appId !== 'com.exfin.oms') return json({ success: false, registered: false, error: 'Invalid EXFIN OMS Android client.' }, 400);

    const registration = caller.isAdmin ? null : await findRegistration(env, caller.uid, caller.email || '');
    const employeeCode = clientEmployeeCode || String(registration?.data?.employeeCode || registration?.data?.employeeId || '').trim();
    const tokenHash = await sha256Hex(token);
    const documentId = `android_${tokenHash}`;
    const now = new Date().toISOString();

    const record = {
      token,
      tokenHash,
      uid: caller.uid,
      authUid: caller.uid,
      userId: caller.uid,
      employeeCode,
      role: caller.role,
      platform: 'android',
      appId: 'com.exfin.oms',
      active: true,
      updatedAt: now,
      lastSeenAt: now,
    };

    const existing = await getDoc(env, 'push_device_tokens', documentId);
    if (existing) await updateDoc(env, 'push_device_tokens', documentId, record);
    else await setDoc(env, 'push_device_tokens', documentId, record);

    return json({ success: true, registered: true, diagnosticCode: 'FCM_TOKEN_SAVED', stage: 'backend-storage', employeeCodePresent: Boolean(employeeCode) });
  } catch (error: any) {
    console.error('[Video Device Token]', error?.message || error);
    if (error?.message?.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) return json({ success: false, registered: false, error: 'Firebase server credentials are not configured.', diagnosticCode: 'FIREBASE_SERVER_CONFIG' }, 503);
    return json({ success: false, registered: false, error: 'Could not register the Android FCM token.', diagnosticCode: 'FCM_TOKEN_STORAGE_FAILED' }, 500);
  }
};
