export type VideoEnv = {
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  LIVEKIT_URL: string;
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  FIREBASE_PROJECT_ID?: string;
};

type FsValue = Record<string, unknown>;

export const PROJECT_ID = 'exfin-oms-production';
export const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'TEAM_LEADER']);

export type Caller = {
  uid: string;
  email?: string;
  role: string;
  employeeId?: string;
  employeeCode?: string;
  isAdmin: boolean;
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
    },
  });
}

export function normalizeRole(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/[\s/\\-]+/g, '_').replace(/_+/g, '_');
}

// EXFIN OMS has used both "Approved" and combined "Approved / Active" status
// values. An employee is callable only when the approval state is explicitly
// approved/active and the record is not deleted or disabled.
export function isApprovedEmployee(data: any): boolean {
  const status = normalizeStatus(data?.status || '');
  const approvedStatus = status === 'APPROVED' || status === 'ACTIVE' || status === 'APPROVED_ACTIVE';
  const inactiveStatus = new Set(['SUSPENDED', 'DELETED', 'INACTIVE', 'DISABLED', 'BLOCKED', 'REJECTED', 'PENDING_APPROVAL']);
  return approvedStatus && !inactiveStatus.has(status) && data?.isDeleted !== true && data?.active !== false;
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64UrlSegment(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - segment.length % 4) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getServiceAccount(env: VideoEnv): any {
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured.');
  return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
}

async function getGoogleAccessToken(env: VideoEnv): Promise<string> {
  const account = getServiceAccount(env), now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = String(account.private_key).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(pem), keyBytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  let sig = '';
  for (const byte of new Uint8Array(signature)) sig += String.fromCharCode(byte);
  const assertion = `${header}.${claim}.${btoa(sig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error('Could not obtain Firebase service token.');
  const payload = await response.json() as any;
  if (!payload.access_token) throw new Error('Firebase service token was not returned.');
  return String(payload.access_token);
}

function encodeFs(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFs) } };
  if (typeof value === 'object') {
    const fields: Record<string, FsValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) fields[key] = encodeFs(item);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function decodeFs(value: any): any {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('referenceValue' in value) return value.referenceValue;
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeFs);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([k, v]) => [k, decodeFs(v)]));
  return null;
}

export function decodeDoc(document: any): any {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(document?.fields || {})) result[key] = decodeFs(value);
  return result;
}

function docPath(collection: string, id: string) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

async function firestoreRequest(env: VideoEnv, path: string, init: RequestInit = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', 'application/json');
  return fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers });
}

export async function getDoc(env: VideoEnv, collection: string, id: string): Promise<any | null> {
  const response = await firestoreRequest(env, docPath(collection, id));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore GET failed: ${response.status}`);
  return response.json();
}

export async function setDoc(env: VideoEnv, collection: string, id: string, data: Record<string, unknown>) {
  const fields: Record<string, FsValue> = {};
  for (const [key, value] of Object.entries(data)) fields[key] = encodeFs(value);
  const response = await firestoreRequest(env, `${docPath(collection, id)}?currentDocument.exists=false`, { method: 'PATCH', body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error(`Firestore SET failed: ${response.status}`);
  return response.json();
}

export async function updateDoc(env: VideoEnv, collection: string, id: string, data: Record<string, unknown>) {
  const fields: Record<string, FsValue> = {};
  for (const [key, value] of Object.entries(data)) fields[key] = encodeFs(value);
  const updateMask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  const response = await firestoreRequest(env, `${docPath(collection, id)}?${updateMask}`, { method: 'PATCH', body: JSON.stringify({ fields }) });
  if (!response.ok) throw new Error(`Firestore UPDATE failed: ${response.status}`);
  return response.json();
}

export async function listCollection(env: VideoEnv, collection: string, limit = 500): Promise<any[]> {
  const documents: any[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: String(Math.min(1000, Math.max(1, limit - documents.length))) });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await firestoreRequest(env, `projects/${PROJECT_ID}/databases/(default)/documents/${collection}?${query.toString()}`);
    if (!response.ok) throw new Error(`Firestore LIST failed: ${response.status}`);
    const payload = await response.json() as any;
    if (Array.isArray(payload.documents)) documents.push(...payload.documents);
    pageToken = String(payload.nextPageToken || '');
  } while (pageToken && documents.length < limit);
  return documents.slice(0, limit);
}

export async function queryByField(env: VideoEnv, collection: string, field: string, value: string, limit = 20): Promise<any[]> {
  const body = { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeFs(value) } }, limit } };
  const response = await firestoreRequest(env, `projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, { method: 'POST', body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Firestore QUERY failed: ${response.status}`);
  const rows = await response.json() as any[];
  return rows.filter((row) => row.document).map((row) => row.document);
}

export async function findRegistration(env: VideoEnv, uid: string, email = ''): Promise<any | null> {
  const candidates: any[] = [];
  const direct = await getDoc(env, 'registrations', uid);
  if (direct) candidates.push(direct);
  for (const field of ['uid', 'authUid']) candidates.push(...await queryByField(env, 'registrations', field, uid, 10));
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail) candidates.push(...await queryByField(env, 'registrations', 'email', normalizedEmail, 10));
  const seen = new Set<string>();
  for (const document of candidates) {
    const id = String(document.name || '').split('/').pop() || '';
    if (seen.has(id)) continue;
    seen.add(id);
    const data = decodeDoc(document);
    const storedUid = String(data.uid || '').trim();
    const storedAuthUid = String(data.authUid || '').trim();
    const storedEmail = String(data.email || '').trim().toLowerCase();
    const identityMatches = storedUid === uid || storedAuthUid === uid || ((!storedUid && !storedAuthUid) && !!normalizedEmail && storedEmail === normalizedEmail);
    if (!identityMatches) continue;
    return { document, data, id };
  }
  return null;
}

export async function findApprovedEmployee(env: VideoEnv, uid: string): Promise<any | null> {
  const found = await findRegistration(env, uid);
  if (!found || !isApprovedEmployee(found.data)) return null;
  return found;
}

async function verifyFirebaseIdToken(token: string, projectId: string): Promise<any | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: any, claims: any;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64UrlSegment(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64UrlSegment(parts[1])));
  } catch (_) { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || !header.kid || !claims.sub || claims.aud !== projectId ||
      claims.iss !== `https://securetoken.google.com/${projectId}` || Number(claims.exp || 0) <= now ||
      Number(claims.iat || 0) > now + 60 || Number(claims.auth_time || 0) > now + 60 ||
      typeof claims.sub !== 'string' || claims.sub.length === 0 || claims.sub.length > 128) return null;
  const keysResponse = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!keysResponse.ok) return null;
  const keySet = await keysResponse.json() as any;
  const jwk = Array.isArray(keySet.keys) ? keySet.keys.find((key: any) => key.kid === header.kid && key.kty === 'RSA') : null;
  if (!jwk) return null;
  try {
    const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, decodeBase64UrlSegment(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1])) ? claims : null;
  } catch (_) { return null; }
}

export async function verifyCaller(request: Request, env: VideoEnv): Promise<Caller | null> {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const projectId = env.FIREBASE_PROJECT_ID || PROJECT_ID;
  const decoded = await verifyFirebaseIdToken(header.slice(7).trim(), projectId);
  if (!decoded) return null;
  const uid = String(decoded.sub);
  const adminDoc = await getDoc(env, 'admin_users', uid);
  if (adminDoc) {
    const data = decodeDoc(adminDoc);
    const role = normalizeRole(data.role || data.userRole || data.roleName);
    if (ADMIN_ROLES.has(role)) return { uid, email: String(data.email || decoded.email || ''), role, employeeId: String(data.employeeId || ''), employeeCode: String(data.employeeCode || ''), isAdmin: true };
  }
  const registration = await findRegistration(env, uid, String(decoded.email || ''));
  const data = registration?.data || {};
  return { uid, email: String(decoded.email || data.email || ''), role: 'EMPLOYEE', employeeId: registration?.id || uid, employeeCode: String(data.employeeCode || ''), isAdmin: false };
}

export async function isCallerActive(env: VideoEnv, caller: Caller): Promise<boolean> {
  if (caller.isAdmin) {
    const doc = await getDoc(env, 'admin_users', caller.uid);
    if (!doc) return false;
    const data = decodeDoc(doc), role = normalizeRole(data.role || data.userRole || data.roleName), status = normalizeStatus(data.status);
    return ADMIN_ROLES.has(role) && data.active !== false && !['SUSPENDED', 'DELETED', 'INACTIVE', 'DISABLED', 'BLOCKED'].includes(status);
  }
  const employee = await findRegistration(env, caller.uid, caller.email || '');
  return !!employee && isApprovedEmployee(employee.data);
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function liveKitUrl(env: VideoEnv): string {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) throw new Error('LIVEKIT_NOT_CONFIGURED');
  const value = String(env.LIVEKIT_URL).trim().replace(/\/$/, '');
  if (!/^wss:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) throw new Error('LIVEKIT_NOT_CONFIGURED');
  return value;
}

export async function signLiveKitJwt(env: VideoEnv, claims: Record<string, unknown>): Promise<string> {
  liveKitUrl(env);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(header + '.' + payload));
  return header + '.' + payload + '.' + base64UrlEncodeBytes(new Uint8Array(signature));
}

export async function createMeetingToken(env: VideoEnv, roomName: string, uid: string, userName: string, exp: number) {
  const now = Math.floor(Date.now() / 1000);
  return signLiveKitJwt(env, { iss: env.LIVEKIT_API_KEY, sub: uid, name: userName.slice(0, 80), nbf: now - 5, iat: now, exp, video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true } });
}

export async function nameForUid(env: VideoEnv, uid: string): Promise<string> {
  const admin = await getDoc(env, 'admin_users', uid);
  if (admin) { const data = decodeDoc(admin); return String(data.name || data.displayName || data.loginId || data.email || 'Administrator').slice(0, 80); }
  const employee = await findRegistration(env, uid);
  if (employee) { const data = employee.data || {}; return String(data.name || data.fullName || data.employeeCode || 'Employee').slice(0, 80); }
  return 'EXFIN OMS user';
}

export async function sendIncomingCallPush(env: VideoEnv, recipientUid: string, employeeCode: string, callId: string, callerName: string, title: string) {
  const identityIds = new Set<string>([recipientUid]);
  const registration = await findRegistration(env, recipientUid);
  if (registration) {
    identityIds.add(String(registration.id || '').trim());
    identityIds.add(String(registration.data?.uid || '').trim());
    identityIds.add(String(registration.data?.authUid || '').trim());
  }
  identityIds.delete('');
  const queries = await Promise.all([
    ...Array.from(identityIds).map((uid) => queryByField(env, 'push_device_tokens', 'uid', uid, 50)),
    employeeCode ? queryByField(env, 'push_device_tokens', 'employeeCode', employeeCode, 50) : Promise.resolve([]),
  ]);
  const documents = queries.flat();
  const unique = new Map<string, any>();
  for (const document of documents) {
    const device = decodeDoc(document);
    const linkedByUid = identityIds.has(String(device.uid || ''));
    const linkedByCode = !!employeeCode && String(device.employeeCode || '').trim().toUpperCase() === employeeCode.trim().toUpperCase();
    const knownAndroid = device.platform === 'android' || device.appId === 'com.exfin.oms';
    if (device.token && (linkedByUid || linkedByCode) && knownAndroid) unique.set(String(device.token), device);
  }
  const devices = Array.from(unique.values());
  if (!devices.length) return { tokenCount: 0, attempted: 0, sent: 0, failed: 0, errors: ['NO_ANDROID_FCM_TOKEN_REGISTERED'] };
  const accessToken = await getGoogleAccessToken(env);
  const projectId = env.FIREBASE_PROJECT_ID || PROJECT_ID;
  const results = await Promise.allSettled(devices.map(async (device) => {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: { token: String(device.token), data: { type: 'video_call', callId, callerName: callerName || 'EXFIN OMS Admin', route: '/video-calls', title: title || 'EXFIN OMS video call' }, android: { priority: 'HIGH', ttl: '60s', collapse_key: 'exfin_video_call_' + callId } } }),
    });
    if (!response.ok) throw new Error(`FCM send failed (${response.status}): ${(await response.text().catch(() => '')).slice(0, 240)}`);
  }));
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => String((r.reason as any)?.message || r.reason || 'FCM_SEND_FAILED').slice(0, 240));
  return { tokenCount: devices.length, attempted: devices.length, sent: devices.length - errors.length, failed: errors.length, errors };
}
