type Env = {
  LIVEKIT_API_KEY: string;
  LIVEKIT_API_SECRET: string;
  LIVEKIT_URL: string;
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  FIREBASE_PROJECT_ID?: string;
};

type PagesFunction<E> = (context: { request: Request; env: E }) => Response | Promise<Response>;
type Caller = { uid: string; email?: string; role: string; employeeId?: string; employeeCode?: string; isAdmin: boolean };
type FsValue = Record<string, unknown>;

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'HR', 'TEAM_LEADER']);
const PROJECT_ID = 'exfin-oms-production';

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }); }
function base64UrlEncode(value: string): string { const bytes = new TextEncoder().encode(value); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function getServiceAccount(env: Env): any { if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured.'); return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY); }

async function getGoogleAccessToken(env: Env): Promise<string> {
  const account = getServiceAccount(env), now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = String(account.private_key).replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(pem), keyBytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  let sig = ''; for (const byte of new Uint8Array(signature)) sig += String.fromCharCode(byte);
  const assertion = `${header}.${claim}.${btoa(sig).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
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
  if (typeof value === 'object') { const fields: Record<string, FsValue> = {}; for (const [key, item] of Object.entries(value as Record<string, unknown>)) fields[key] = encodeFs(item); return { mapValue: { fields } }; }
  return { stringValue: String(value) };
}
function decodeFs(value: any): any { if (!value || typeof value !== 'object') return null; if ('stringValue' in value) return value.stringValue; if ('integerValue' in value) return Number(value.integerValue); if ('doubleValue' in value) return value.doubleValue; if ('booleanValue' in value) return value.booleanValue; if ('timestampValue' in value) return value.timestampValue; if ('nullValue' in value) return null; if ('referenceValue' in value) return value.referenceValue; if ('arrayValue' in value) return (value.arrayValue?.values || []).map(decodeFs); if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([k, v]) => [k, decodeFs(v)])); return null; }
function decodeDoc(document: any): any { const result: Record<string, unknown> = {}; for (const [key, value] of Object.entries(document?.fields || {})) result[key] = decodeFs(value); return result; }
function docPath(collection: string, id: string) { return `projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`; }

async function firestoreRequest(env: Env, path: string, init: RequestInit = {}) { const token = await getGoogleAccessToken(env); const headers = new Headers(init.headers); headers.set('authorization', `Bearer ${token}`); headers.set('content-type', 'application/json'); return fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers }); }
async function getDoc(env: Env, collection: string, id: string): Promise<any | null> { const response = await firestoreRequest(env, docPath(collection, id)); if (response.status === 404) return null; if (!response.ok) throw new Error(`Firestore GET failed: ${response.status}`); return response.json(); }
async function setDoc(env: Env, collection: string, id: string, data: Record<string, unknown>) { const fields: Record<string, FsValue> = {}; for (const [key, value] of Object.entries(data)) fields[key] = encodeFs(value); const response = await firestoreRequest(env, `${docPath(collection, id)}?currentDocument.exists=false`, { method: 'PATCH', body: JSON.stringify({ fields }) }); if (!response.ok) throw new Error(`Firestore SET failed: ${response.status}`); return response.json(); }
async function updateDoc(env: Env, collection: string, id: string, data: Record<string, unknown>) { const fields: Record<string, FsValue> = {}; for (const [key, value] of Object.entries(data)) fields[key] = encodeFs(value); const updateMask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&'); const response = await firestoreRequest(env, `${docPath(collection, id)}?${updateMask}`, { method: 'PATCH', body: JSON.stringify({ fields }) }); if (!response.ok) throw new Error(`Firestore UPDATE failed: ${response.status}`); return response.json(); }
async function listCollection(env: Env, collection: string, limit = 500): Promise<any[]> { const response = await firestoreRequest(env, `projects/${PROJECT_ID}/databases/(default)/documents/${collection}?pageSize=${limit}`); if (!response.ok) throw new Error(`Firestore LIST failed: ${response.status}`); const payload = await response.json() as any; return Array.isArray(payload.documents) ? payload.documents : []; }
async function queryByField(env: Env, collection: string, field: string, value: string, limit = 20): Promise<any[]> { const body = { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeFs(value) } }, limit } }; const response = await firestoreRequest(env, `projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, { method: 'POST', body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Firestore QUERY failed: ${response.status}`); const rows = await response.json() as any[]; return rows.filter((row) => row.document).map((row) => row.document); }

async function findRegistration(env: Env, uid: string): Promise<any | null> { const direct = await getDoc(env, 'registrations', uid); if (direct) { const data = decodeDoc(direct); if (String(data.uid || data.authUid || uid) === uid) return { document: direct, data, id: uid }; } const matches = await queryByField(env, 'registrations', 'uid', uid, 1); if (matches.length) return { document: matches[0], data: decodeDoc(matches[0]), id: String(matches[0].name).split('/').pop() }; return null; }

function decodeBase64UrlSegment(segment: string): Uint8Array {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - segment.length % 4) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function verifyFirebaseIdToken(token: string, projectId: string): Promise<any | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header: any, claims: any;
  try {
    header = JSON.parse(new TextDecoder().decode(decodeBase64UrlSegment(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(decodeBase64UrlSegment(parts[1])));
  } catch (_) { return null; }
  if (header.alg !== 'RS256' || !header.kid || !claims.sub || claims.aud !== projectId ||
      claims.iss !== `https://securetoken.google.com/${projectId}` ||
      Number(claims.exp || 0) <= Math.floor(Date.now() / 1000) ||
      Number(claims.iat || 0) > Math.floor(Date.now() / 1000) + 60 ||
      Number(claims.auth_time || 0) > Math.floor(Date.now() / 1000) + 60 ||
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
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, signature, signedBytes);
    return valid ? claims : null;
  } catch (_) { return null; }
}

async function verifyCaller(request: Request, env: Env): Promise<Caller | null> {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const projectId = env.FIREBASE_PROJECT_ID || PROJECT_ID;
  const decoded = await verifyFirebaseIdToken(token, projectId);
  if (!decoded) return null;
  const uid = String(decoded.sub), adminDoc = await getDoc(env, 'admin_users', uid);
  if (adminDoc) {
    const data = decodeDoc(adminDoc), role = String(data.role || '');
    if (ADMIN_ROLES.has(role)) return { uid, email: String(data.email || decoded.email || ''), role, employeeId: String(data.employeeId || ''), employeeCode: String(data.employeeCode || ''), isAdmin: true };
  }
  const registration = await findRegistration(env, uid), data = registration?.data || {};
  return { uid, email: String(decoded.email || data.email || ''), role: 'EMPLOYEE', employeeId: registration?.id || uid, employeeCode: String(data.employeeCode || ''), isAdmin: false };
}
async function isCallerActive(env: Env, caller: Caller): Promise<boolean> { if (caller.isAdmin) { const doc = await getDoc(env, 'admin_users', caller.uid); if (!doc) return false; const data = decodeDoc(doc); return ADMIN_ROLES.has(String(data.role || '')) && data.active !== false && data.status !== 'Suspended' && data.status !== 'Deleted'; } const employee = await findRegistration(env, caller.uid); if (!employee) return false; const data = employee.data || {}; return String(data.status || 'Pending Approval') === 'Approved' && data.isDeleted !== true && data.active !== false; }
async function findApprovedEmployee(env: Env, uid: string) { const found = await findRegistration(env, uid); if (!found) return null; const data = found.data || {}; if (String(data.status || 'Pending Approval') !== 'Approved' || data.isDeleted === true || data.active === false) return null; return found; }
async function nameForUid(env: Env, uid: string): Promise<string> { const admin = await getDoc(env, 'admin_users', uid); if (admin) { const data = decodeDoc(admin); return String(data.name || data.displayName || data.loginId || data.email || 'Administrator').slice(0, 80); } const employee = await findRegistration(env, uid); if (employee) { const data = employee.data || {}; return String(data.name || data.fullName || data.employeeCode || 'Employee').slice(0, 80); } return 'EXFIN OMS user'; }

function liveKitUrl(env: Env): string {
  if (!env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET || !env.LIVEKIT_URL) throw new Error('LIVEKIT_NOT_CONFIGURED');
  const value = String(env.LIVEKIT_URL).trim().replace(/\/$/, '');
  if (!/^wss:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) throw new Error('LIVEKIT_NOT_CONFIGURED');
  return value;
}
function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function signLiveKitJwt(env: Env, claims: Record<string, unknown>): Promise<string> {
  liveKitUrl(env);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(header + '.' + payload));
  return header + '.' + payload + '.' + base64UrlEncodeBytes(new Uint8Array(signature));
}
async function createMeetingToken(env: Env, roomName: string, uid: string, userName: string, _owner: boolean, exp: number) {
  const now = Math.floor(Date.now() / 1000);
  return signLiveKitJwt(env, { iss: env.LIVEKIT_API_KEY, sub: uid, name: userName.slice(0, 80), nbf: now - 5, iat: now, exp, video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true } });
}
async function deleteLiveKitRoom(env: Env, roomName: string) {
  const url = liveKitUrl(env).replace(/^wss:/, 'https:');
  const now = Math.floor(Date.now() / 1000);
  const token = await signLiveKitJwt(env, { iss: env.LIVEKIT_API_KEY, sub: env.LIVEKIT_API_KEY, nbf: now - 5, iat: now, exp: now + 60, video: { roomAdmin: true, room: roomName } });
  const response = await fetch(url + '/twirp/livekit.RoomService/DeleteRoom', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ room: roomName }) });
  if (!response.ok && response.status !== 404) throw new Error('LIVEKIT_PROVIDER_ERROR');
}
function pathParts(request: Request) { const pathname = new URL(request.url).pathname.replace(/^\/api\/video\/?/, '').replace(/\/$/, ''); return pathname ? pathname.split('/') : []; }

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
  try {
    const caller = await verifyCaller(request, env); if (!caller) return json({ success: false, error: 'Authentication required.' }, 401); if (!(await isCallerActive(env, caller))) return json({ success: false, error: 'Your account is inactive or not approved for video calls.' }, 403);
    const parts = pathParts(request), method = request.method;

    if (method === 'GET' && parts.length === 1 && parts[0] === 'recipients') {
      const recipients: Array<{ uid: string; name: string; employeeCode?: string; role: string; email?: string }> = [];
      if (caller.isAdmin && ADMIN_ROLES.has(caller.role)) {
        const documents = await listCollection(env, 'registrations', 500);
        for (const document of documents) {
          const data = decodeDoc(document);
          const status = String(data.status || 'Pending Approval').trim().toUpperCase();
          const uid = String(data.uid || data.authUid || '');
          if (!uid || uid === caller.uid || status !== 'APPROVED' || data.isDeleted === true || data.active === false) continue;
          recipients.push({ uid, name: String(data.name || data.fullName || data.employeeCode || 'Employee').slice(0, 80), employeeCode: String(data.employeeCode || ''), role: 'EMPLOYEE', email: String(data.email || '') });
        }
      } else {
        const documents = await listCollection(env, 'admin_users', 500);
        for (const document of documents) {
          const data = decodeDoc(document);
          const uid = String(document.name || '').split('/').pop() || String(data.uid || data.authUid || '');
          const role = String(data.role || '').trim().toUpperCase();
          const status = String(data.status || '').trim().toUpperCase();
          const inactive = data.active === false || ['SUSPENDED', 'DELETED', 'INACTIVE', 'DISABLED', 'BLOCKED'].includes(status);
          if (!uid || uid === caller.uid || !ADMIN_ROLES.has(role) || inactive) continue;
          recipients.push({ uid, name: String(data.name || data.displayName || data.loginId || data.email || 'Administrator').slice(0, 80), role, email: String(data.email || '') });
        }
      }
      recipients.sort((a, b) => a.name.localeCompare(b.name)); return json({ success: true, recipients });
    }

    if (method === 'POST' && parts.length === 1 && parts[0] === 'calls') {
      const body = await request.json().catch(() => ({})) as any, mode = body?.mode === 'group' ? 'group' : 'direct';
      const rawRecipients = Array.isArray(body?.recipientUids) ? body.recipientUids : [], recipientUids = Array.from(new Set(rawRecipients.filter((value: unknown) => typeof value === 'string' && value.length > 0 && value.length <= 128))) as string[];
      if (!recipientUids.length || recipientUids.length > 50 || (mode === 'direct' && recipientUids.length !== 1)) return json({ success: false, error: 'Select one recipient for a direct call, or up to 50 for a group meeting.' }, 400);
      if (mode === 'group' && (!caller.isAdmin || !ADMIN_ROLES.has(caller.role))) return json({ success: false, error: 'Only authorized administrators can start group meetings.' }, 403);
      if (recipientUids.includes(caller.uid)) return json({ success: false, error: 'You cannot call your own account.' }, 400);
      const resolved: Array<{ uid: string; name: string; role: string }> = [];
      for (const uid of recipientUids) { if (caller.isAdmin && ADMIN_ROLES.has(caller.role)) { const employee = await findApprovedEmployee(env, uid); if (!employee) return json({ success: false, error: 'One or more selected employees are not active and approved.' }, 403); const data = employee.data || {}; resolved.push({ uid, name: String(data.name || data.fullName || data.employeeCode || 'Employee').slice(0, 80), role: 'EMPLOYEE' }); } else { const admin = await getDoc(env, 'admin_users', uid); if (!admin) return json({ success: false, error: 'The selected administrator is not available.' }, 403); const data = decodeDoc(admin), role = String(data.role || ''); if (!ADMIN_ROLES.has(role) || data.active === false || data.status === 'Suspended' || data.status === 'Deleted') return json({ success: false, error: 'The selected administrator is not active.' }, 403); resolved.push({ uid, name: String(data.name || data.displayName || data.loginId || data.email || 'Administrator').slice(0, 80), role }); } }
      const now = Math.floor(Date.now() / 1000), exp = now + 60 * 60 * 2, roomName = `exfin-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const roomUrl = liveKitUrl(env);
      const callId = crypto.randomUUID(), callerName = await nameForUid(env, caller.uid), title = String(body?.title || (mode === 'group' ? 'EXFIN OMS group meeting' : 'EXFIN OMS video call')).trim().slice(0, 100) || 'EXFIN OMS video call', token = await createMeetingToken(env, roomName, caller.uid, callerName, true, exp), createdAt = new Date().toISOString(), expiresAt = new Date(exp * 1000).toISOString(), participantUids = [caller.uid, ...recipientUids];
      await setDoc(env, 'video_calls', callId, { callId, roomName, roomUrl, title, mode, callerUid: caller.uid, participantUids, status: 'active', createdAt, expiresAt });
      for (const person of resolved) { const inviteId = `${callId}_${person.uid}`; await setDoc(env, 'video_call_invites', inviteId, { callId, recipientUid: person.uid, senderUid: caller.uid, senderName: callerName, senderRole: caller.role, roomName, roomUrl, title, mode, status: 'pending', createdAt, expiresAt }); }
      return json({ success: true, callId, roomUrl, token, title, peerName: resolved.map((item) => item.name).join(', ') });
    }

    if (method === 'POST' && parts.length === 3 && parts[0] === 'calls' && ['accept', 'decline', 'leave'].includes(parts[2])) {
      const callId = decodeURIComponent(parts[1]), action = parts[2], inviteId = `${callId}_${caller.uid}`, inviteDoc = await getDoc(env, 'video_call_invites', inviteId); if (!inviteDoc) return json({ success: false, error: 'This call invitation is not addressed to your account.' }, 403); const invite = decodeDoc(inviteDoc);
      if (action === 'accept') { if (invite.status !== 'pending' || !invite.expiresAt || new Date(String(invite.expiresAt)).getTime() <= Date.now()) return json({ success: false, error: 'This call invitation has expired or is no longer available.' }, 410); const callDoc = await getDoc(env, 'video_calls', callId); if (!callDoc || decodeDoc(callDoc).status !== 'active') return json({ success: false, error: 'This call has ended.' }, 410); const callData = decodeDoc(callDoc), owner = caller.isAdmin && ADMIN_ROLES.has(caller.role), token = await createMeetingToken(env, String(invite.roomName), caller.uid, await nameForUid(env, caller.uid), owner, Math.floor(new Date(String(invite.expiresAt)).getTime() / 1000)); await updateDoc(env, 'video_call_invites', inviteId, { status: 'accepted', acceptedAt: new Date().toISOString() }); return json({ success: true, token, roomUrl: liveKitUrl(env), title: invite.title || callData.title, callerName: invite.senderName || 'EXFIN OMS user' }); }
      if (action === 'decline') { await updateDoc(env, 'video_call_invites', inviteId, { status: 'declined', respondedAt: new Date().toISOString() }); return json({ success: true }); }
      const callDoc = await getDoc(env, 'video_calls', callId); if (!callDoc) return json({ success: false, error: 'Call not found.' }, 404); const callData = decodeDoc(callDoc), participants = Array.isArray(callData.participantUids) ? callData.participantUids.map(String) : []; if (!participants.includes(caller.uid)) return json({ success: false, error: 'You are not a participant in this call.' }, 403);
      if (String(callData.callerUid) === caller.uid) { await updateDoc(env, 'video_calls', callId, { status: 'ended', endedAt: new Date().toISOString() }); try { await deleteLiveKitRoom(env, String(callData.roomName)); } catch (error) { console.warn('[Pages Video API] LiveKit room cleanup failed:', (error as any)?.message || error); } } else await updateDoc(env, 'video_call_invites', inviteId, { status: 'left', leftAt: new Date().toISOString() });
      return json({ success: true });
    }

    if (method === 'POST' && parts.length === 1 && parts[0] === 'push-subscription') { const body = await request.json().catch(() => ({})) as any; if (!body?.subscription) return json({ success: false, error: 'Push subscription is required.' }, 400); await setDoc(env, 'video_push_subscriptions', `${caller.uid}_${crypto.randomUUID()}`, { uid: caller.uid, subscription: body.subscription, createdAt: new Date().toISOString() }); return json({ success: true }); }
    return json({ success: false, error: 'Video API endpoint not found.' }, 404);
  } catch (error: any) { console.error('[Pages Video API]', error?.message || error); if (error?.message === 'LIVEKIT_NOT_CONFIGURED') return json({ success: false, error: 'LiveKit is not configured yet. Add LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET to Cloudflare Pages production secrets.' }, 503); if (error?.message === 'LIVEKIT_PROVIDER_ERROR') return json({ success: false, error: 'The video provider is temporarily unavailable.' }, 502); if (error?.message?.includes('FIREBASE_SERVICE_ACCOUNT_KEY')) return json({ success: false, error: 'Video server Firebase credentials are not configured yet.' }, 503); return json({ success: false, error: 'Could not process the video request.' }, 500); }
};
