type Env = {
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  FIREBASE_PROJECT_ID?: string;
};

type FsValue = Record<string, unknown>;

const PROJECT_ID = 'exfin-oms-production';
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'TEAM_LEADER']);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
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

function getServiceAccount(env: Env): any {
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured.');
  return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
}

async function getGoogleAccessToken(env: Env): Promise<string> {
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
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeFs);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([k, v]) => [k, decodeFs(v)]));
  return null;
}

function decodeDoc(document: any): any {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(document?.fields || {})) result[key] = decodeFs(value);
  return result;
}

function docPath(collection: string, id: string) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

async function firestoreRequest(env: Env, path: string, init: RequestInit = {}) {
  const token = await getGoogleAccessToken(env);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', 'application/json');
  return fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers });
}

async function getDoc(env: Env, collection: string, id: string): Promise<any | null> {
  const response = await firestoreRequest(env, docPath(collection, id));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore GET failed: ${response.status}`);
  return response.json();
}

async function queryByField(env: Env, collection: string, field: string, value: string, limit = 5): Promise<any[]> {
  const body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeFs(value) } },
      limit,
    },
  };
  const response = await firestoreRequest(env, `projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Firestore QUERY failed: ${response.status}`);
  const rows = await response.json() as any[];
  return rows.filter((row) => row.document).map((row) => row.document);
}

async function createOrUpdateDoc(env: Env, collection: string, id: string, data: Record<string, unknown>) {
  const fields: Record<string, FsValue> = {};
  for (const [key, value] of Object.entries(data)) fields[key] = encodeFs(value);
  const existing = await getDoc(env, collection, id);
  if (!existing) {
    const response = await firestoreRequest(env, `${docPath(collection, id)}?currentDocument.exists=false`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
    if (!response.ok) throw new Error(`Firestore SET failed: ${response.status}`);
    return response.json();
  }
  const updateMask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  const response = await firestoreRequest(env, `${docPath(collection, id)}?${updateMask}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`Firestore UPDATE failed: ${response.status}`);
  return response.json();
}

async function verifyFirebaseIdToken(token: string, projectId: string): Promise<any | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: any, claims: any;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64UrlSegment(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64UrlSegment(parts[1])));
  } catch (_) {
    return null;
  }
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
    const signature = decodeBase64UrlSegment(parts[2]);
    const signedBytes = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signedBytes) ? claims : null;
  } catch (_) {
    return null;
  }
}

async function isCallerActive(env: Env, uid: string, email: string): Promise<boolean> {
  const adminDoc = await getDoc(env, 'admin_users', uid);
  if (adminDoc) {
    const data = decodeDoc(adminDoc);
    const role = String(data.role || data.userRole || data.roleName || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    const status = String(data.status || '').trim().toUpperCase();
    return ADMIN_ROLES.has(role) && data.active !== false && !['SUSPENDED', 'DELETED', 'INACTIVE', 'DISABLED', 'BLOCKED'].includes(status);
  }
  let employeeDocs = await queryByField(env, 'registrations', 'uid', uid, 5);
  if (!employeeDocs.length) employeeDocs = await queryByField(env, 'registrations', 'authUid', uid, 5);
  if (!employeeDocs.length && email) employeeDocs = await queryByField(env, 'registrations', 'email', email.trim().toLowerCase(), 5);
  if (!employeeDocs.length) return false;
  const data = decodeDoc(employeeDocs[0]);
  const status = String(data.status || 'Pending Approval').trim().toUpperCase();
  return status === 'APPROVED' && data.isDeleted !== true && data.active !== false;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'Authorization, Content-Type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
  try {
    if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed.' }, 405);
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return json({ success: false, error: 'Authentication required.' }, 401);
    const decoded = await verifyFirebaseIdToken(authHeader.slice(7).trim(), env.FIREBASE_PROJECT_ID || PROJECT_ID);
    if (!decoded) return json({ success: false, error: 'Authentication required.' }, 401);
    const uid = String(decoded.sub), email = String(decoded.email || '').trim().toLowerCase();
    if (!(await isCallerActive(env, uid, email))) return json({ success: false, error: 'Your account is inactive or not approved.' }, 403);

    const body = await request.json().catch(() => ({})) as any;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (token.length < 20 || token.length > 4096) return json({ success: false, error: 'Invalid device token.' }, 400);

    const tokenIdBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const tokenId = Array.from(new Uint8Array(tokenIdBytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    await createOrUpdateDoc(env, 'push_device_tokens', tokenId, {
      token,
      uid,
      employeeCode: typeof body?.employeeCode === 'string' ? body.employeeCode : '',
      role: typeof body?.role === 'string' ? body.role : 'EMPLOYEE',
      platform: body?.platform === 'android' ? 'android' : 'web',
      appId: body?.appId === 'com.exfin.oms' ? 'com.exfin.oms' : 'web',
      updatedAt: new Date().toISOString(),
    });

    return json({ success: true, registered: true });
  } catch (error: any) {
    console.error('[Video device-token]', error?.message || error);
    if (error?.message?.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) return json({ success: false, error: 'Video server Firebase credentials are not configured yet.' }, 503);
    return json({ success: false, error: 'Could not register the device token.' }, 500);
  }
};
