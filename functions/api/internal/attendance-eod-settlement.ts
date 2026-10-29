type Env = {
  CRON_SECRET?: string;
  FIREBASE_SERVICE_ACCOUNT_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
};

type FsValue = Record<string, unknown>;

const PROJECT_ID_FALLBACK = 'exfin-oms-production';
const INVALID_TIME_VALUES = new Set(['', '--:--', 'UNRESOLVED', 'Pending', 'N/A', 'null']);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function b64url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

function decodeDoc(document: any): Record<string, any> {
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decodeFs(value)]));
}

function docPath(env: Env, collection: string, id: string): string {
  const projectId = env.FIREBASE_PROJECT_ID || PROJECT_ID_FALLBACK;
  return `projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

async function accessToken(env: Env): Promise<string> {
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not configured');
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = String(account.private_key || '').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const keyBytes = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claim}`));
  let binary = '';
  for (const byte of new Uint8Array(signature)) binary += String.fromCharCode(byte);
  const assertion = `${header}.${claim}.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!response.ok) throw new Error(`Google OAuth exchange failed (${response.status})`);
  const result = await response.json() as any;
  if (!result.access_token) throw new Error('Firebase service token was not returned');
  return String(result.access_token);
}

async function firestore(env: Env, token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', 'application/json');
  return fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers });
}

async function listAttendance(env: Env, token: string): Promise<Record<string, any>[]> {
  const projectId = env.FIREBASE_PROJECT_ID || PROJECT_ID_FALLBACK;
  const documents: Record<string, any>[] = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const response = await firestore(env, token, `projects/${projectId}/databases/(default)/documents/attendance?${query.toString()}`);
    if (!response.ok) throw new Error(`Firestore attendance list failed (${response.status})`);
    const payload = await response.json() as any;
    for (const document of payload.documents || []) {
      const decoded = decodeDoc(document);
      decoded.__documentName = document.name;
      documents.push(decoded);
    }
    pageToken = String(payload.nextPageToken || '');
  } while (pageToken);
  return documents;
}

async function getAttendance(env: Env, token: string, id: string): Promise<Record<string, any> | null> {
  const response = await firestore(env, token, docPath(env, 'attendance', id));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore attendance GET failed (${response.status})`);
  return decodeDoc(await response.json());
}

async function patchAttendance(env: Env, token: string, id: string, fields: Record<string, unknown>): Promise<void> {
  const mask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  const response = await firestore(env, token, `${docPath(env, 'attendance', id)}?${mask}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeFs(value)])) }),
  });
  if (!response.ok) throw new Error(`Firestore attendance update failed (${response.status})`);
}

function kolkataDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseTimeMs(value: unknown, dateStr: string): number {
  const raw = String(value || '').trim();
  if (!raw || INVALID_TIME_VALUES.has(raw)) return 0;
  if (raw.includes('T')) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return 0;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridian = match[3]?.toUpperCase();
  if (meridian === 'PM' && hour < 12) hour += 12;
  if (meridian === 'AM' && hour === 12) hour = 0;
  const iso = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:30`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isExit(type: unknown): boolean {
  const value = String(type || '').toUpperCase();
  return value.includes('EXIT') || value === 'OUT';
}

function isReturn(type: unknown): boolean {
  const value = String(type || '').toUpperCase();
  return value.includes('RETURN') || value === 'ENTRY' || value === 'REENTRY';
}

function findAuthoritativeExit(record: Record<string, any>): string | null {
  const checkInMs = parseTimeMs(record.checkInTime, record.date);
  const history = Array.isArray(record.eventHistory) ? [...record.eventHistory] : [];
  const events = history
    .filter((event) => event && (isExit(event.eventType) || isReturn(event.eventType)))
    .map((event) => ({ event, ms: parseTimeMs(event.timestamp || event.eventTime, record.date) }))
    .filter((item) => item.ms === 0 || item.ms >= checkInMs)
    .sort((a, b) => a.ms - b.ms);

  let openExit: { event: any; ms: number } | null = null;
  for (const item of events) {
    if (isExit(item.event.eventType)) {
      if (!openExit) openExit = item;
    } else if (isReturn(item.event.eventType)) {
      if (openExit && (item.ms === 0 || openExit.ms === 0 || item.ms >= openExit.ms)) openExit = null;
    }
  }

  if (openExit) {
    const time = String(openExit.event.eventTime || '').trim();
    if (time && !INVALID_TIME_VALUES.has(time)) return time;
  }

  const exitTime = String(record.recordedExitTime || record.geofenceExitTime || record.lastExitTime || record.exitTime || '').trim();
  if (!exitTime || INVALID_TIME_VALUES.has(exitTime)) return null;
  const exitMs = parseTimeMs(record.lastExitAt || record.geofenceExitTimestamp || record.exitDetectedAt || exitTime, record.date);
  const returnMs = parseTimeMs(record.lastReturnAt || record.lastReturnTime || record.returnTime, record.date);
  const pending = record.pendingCheckoutConfirmation === true ||
    ['PENDING_AUTO_CHECKOUT', 'PENDING_EXIT_CONFIRMATION', 'PENDING_FINAL_EXIT', 'CHECKOUT_NOT_DETECTED', 'EXIT_PROMPT_RESOLVED_OUTSIDE'].includes(String(record.currentState || '').toUpperCase());
  if (!pending && returnMs > 0 && exitMs > 0 && returnMs > exitMs) return null;
  if (checkInMs > 0 && exitMs > 0 && exitMs < checkInMs) return null;
  return exitTime;
}

function calculateWorkingHours(checkIn: unknown, checkOut: unknown): string | null {
  const inMs = parseTimeMs(checkIn, '2000-01-01');
  const outMs = parseTimeMs(checkOut, '2000-01-01');
  if (!inMs || !outMs) return null;
  const inMinutes = new Date(inMs).getUTCHours() * 60 + new Date(inMs).getUTCMinutes();
  const outMinutes = new Date(outMs).getUTCHours() * 60 + new Date(outMs).getUTCMinutes();
  if (outMinutes < inMinutes) return null;
  const diff = outMinutes - inMinutes;
  return `${Math.floor(diff / 60)}h ${diff % 60}m`;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);
  const expected = String(env.CRON_SECRET || '');
  const authorization = request.headers.get('Authorization') || '';
  if (!expected || authorization !== `Bearer ${expected}`) return json({ success: false, error: 'Unauthorized' }, 401);
  if (!env.FIREBASE_SERVICE_ACCOUNT_KEY) return json({ success: false, error: 'FIREBASE_SERVICE_ACCOUNT_KEY is not configured' }, 500);

  try {
    const body = await request.json().catch(() => ({})) as any;
    const requestedDate = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
    const today = kolkataDateString();
    const targetDate = requestedDate || (() => {
      const now = new Date();
      now.setTime(now.getTime() - 24 * 60 * 60 * 1000);
      return kolkataDateString(now);
    })();
    if (targetDate >= today) return json({ success: true, finalized: 0, unresolved: 0, skipped: 0, targetDate, message: 'Current-day settlement is intentionally deferred until the next day.' });

    const token = await accessToken(env);
    const records = await listAttendance(env, token);
    let finalized = 0;
    let unresolved = 0;
    let skipped = 0;

    for (const listed of records.filter((item) => String(item.date || '') === targetDate)) {
      const employeeId = String(listed.employeeId || '').trim();
      if (!employeeId) { skipped++; continue; }
      const record = await getAttendance(env, token, employeeId + '_' + targetDate) || listed;
      if (!record.checkInTime || INVALID_TIME_VALUES.has(String(record.checkInTime).trim())) { skipped++; continue; }
      const checkout = String(record.checkOutTime || '').trim();
      if (!INVALID_TIME_VALUES.has(checkout) && checkout) { skipped++; continue; }
      if (record.isAdminRectified === true || record.manualRectified === true || record.correctedAt) { skipped++; continue; }
      if (record.attendanceType && record.attendanceType !== 'OFFICE') { skipped++; continue; }

      const exitTime = findAuthoritativeExit(record);
      if (!exitTime) {
        unresolved++;
        continue;
      }

      const eventId = `evt_eod_checkout_${employeeId}_${targetDate}_${exitTime.replace(/[^0-9APMapm]/g, '')}`;
      const now = new Date().toISOString();
      const history = Array.isArray(record.eventHistory) ? record.eventHistory : [];
      const alreadySettled = history.some((event: any) => String(event?.eventId || '') === eventId);
      const nextHistory = alreadySettled ? history : [...history, {
        eventId,
        employeeId,
        eventType: 'CHECK_OUT',
        eventTime: exitTime,
        timestamp: now,
        source: 'AUTO_SYSTEM_END_OF_DAY',
        action: 'AUTO_CHECKOUT',
      }];

      await patchAttendance(env, token, employeeId + '_' + targetDate, {
        checkOutTime: exitTime,
        checkOutMode: 'AUTO_SYSTEM',
        checkoutType: 'AUTO_CHECKOUT',
        checkoutSource: 'EXIT_DETECTED',
        attendanceStatus: 'RESOLVED',
        checkoutStatus: 'FINALIZED',
        checkoutFinalizationSource: 'END_OF_DAY_NATIVE_EXIT',
        checkoutFinalized: true,
        checkoutConfirmed: true,
        confirmationCompletedAt: now,
        status: 'completed',
        workingHours: calculateWorkingHours(record.checkInTime, exitTime),
        currentState: 'FINALIZED_CHECKOUT',
        pendingCheckoutConfirmation: false,
        returningToOffice: false,
        exitPromptResolvedOutside: false,
        pendingCheckoutEventId: null,
        resolutionSource: 'AUTO_GEOFENCE',
        settledAt: now,
        updatedAt: now,
        eventHistory: nextHistory,
      });
      finalized++;
    }

    return json({ success: true, finalized, unresolved, skipped, targetDate });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
};
