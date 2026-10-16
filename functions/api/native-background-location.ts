type Env = {
  FIREBASE_SERVICE_ACCOUNT_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  VITE_OFFICE_LATITUDE?: string;
  VITE_OFFICE_LONGITUDE?: string;
};

type FsValue = Record<string, unknown>;
const PROJECT_ID_FALLBACK = 'exfin-oms-production';
const OFFICE_LAT_FALLBACK = 23.616227;
const OFFICE_LNG_FALLBACK = 87.117063;
const RADIUS_METERS = 25;

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
  if (!response.ok) throw new Error('Could not obtain Firebase service token');
  const result = await response.json() as any;
  if (!result.access_token) throw new Error('Firebase service token was not returned');
  return String(result.access_token);
}
async function firestore(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken(env);
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  headers.set('content-type', 'application/json');
  return fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers });
}
async function getDoc(env: Env, collection: string, id: string): Promise<Record<string, any> | null> {
  const response = await firestore(env, docPath(env, collection, id));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore GET failed (${response.status})`);
  return decodeDoc(await response.json());
}
async function writeDoc(env: Env, collection: string, id: string, data: Record<string, unknown>, createOnly = false): Promise<void> {
  const fields = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFs(value)]));
  const mask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  const precondition = createOnly ? '&currentDocument.exists=false' : '';
  const response = await firestore(env, `${docPath(env, collection, id)}?${mask}${precondition}`, {
    method: 'PATCH', body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    const detail = await response.text();
    const alreadyExists = createOnly && (response.status === 409 ||
      (response.status === 400 && /FAILED_PRECONDITION|already exists/i.test(detail)));
    if (!alreadyExists) throw new Error(`Firestore write failed (${response.status})`);
  }
}
function kolkataParts(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value || '';
  const day = `${part('year')}-${part('month')}-${part('day')}`;
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date);
  return { date: day, time };
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function cleanId(value: unknown): string { return String(value || '').trim(); }
function validCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const payload = await request.json().catch(() => ({})) as Record<string, any>;
    const employeeId = cleanId(payload.employeeId || payload.customData?.employeeId);
    const eventId = cleanId(payload.eventId);
    const eventType = cleanId(payload.eventType).toUpperCase();
    const transition = cleanId(payload.transition).toUpperCase();
    const source = cleanId(payload.source || 'native_geofence');
    if (!employeeId || ['ANONYMOUS', 'SYSTEM'].includes(employeeId.toUpperCase())) {
      return json({ success: false, error: 'Missing or invalid employee identity' }, 400);
    }
    if (!eventId) return json({ success: false, error: 'eventId is required for safe retry/deduplication' }, 400);

    const timestampInput = payload.timestamp;
    const eventDate = timestampInput ? new Date(timestampInput) : new Date();
    if (!Number.isFinite(eventDate.getTime())) return json({ success: false, error: 'Invalid event timestamp' }, 400);
    if (eventDate.getTime() > Date.now() + 5 * 60 * 1000) return json({ success: false, error: 'Timestamp cannot be in the future' }, 400);
    // Offline native events are allowed to sync later; keep the original event time.
    if (Date.now() - eventDate.getTime() > 7 * 24 * 60 * 60 * 1000) return json({ success: false, error: 'Background event is older than the supported 7-day retry window' }, 400);

    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const coordsAvailable = validCoords(latitude, longitude);
    const explicitExit = transition === 'EXIT' || ['CHECK_OUT', 'EXIT', 'GEOFENCE_EXIT', 'GEOFENCE_TRANSITION_EXIT'].includes(eventType);
    const explicitReturn = !explicitExit && (eventType === 'GEOFENCE_RETURN' || eventType === 'RETURN' || eventType === 'ENTRY' || transition === 'ENTER');
    if (!coordsAvailable && !explicitExit && !explicitReturn && eventType !== 'CHECK_IN') {
      return json({ success: false, error: 'Valid coordinates are required for this event' }, 400);
    }

    const employee = await getDoc(env, 'registrations', employeeId);
    if (!employee) return json({ success: false, error: 'Employee record does not exist' }, 401);
    const status = String(employee.status || 'Pending Approval').trim().toUpperCase();
    if (status !== 'APPROVED' || employee.isDeleted === true) return json({ success: false, error: 'Employee is not active and approved' }, 403);

    const duplicate = await getDoc(env, 'attendance_events', eventId);
    if (duplicate) {
      return json({ success: true, processed: true, duplicate: true, employeeId, eventId, timestamp: eventDate.toISOString() });
    }

    const { date: dateStr, time: timeStr } = kolkataParts(eventDate);
    const latOffice = Number(env.VITE_OFFICE_LATITUDE) || OFFICE_LAT_FALLBACK;
    const lngOffice = Number(env.VITE_OFFICE_LONGITUDE) || OFFICE_LNG_FALLBACK;
    const distance = coordsAvailable ? distanceMeters(latitude, longitude, latOffice, lngOffice) : null;
    const inside = distance !== null && distance <= RADIUS_METERS;
    const attDocId = `${employeeId}_${dateStr}`;
    const record = await getDoc(env, 'attendance', attDocId);
    const now = new Date().toISOString();
    const eventIso = eventDate.toISOString();
    const location = {
      latitude: coordsAvailable ? latitude : null,
      longitude: coordsAvailable ? longitude : null,
      townCity: String(employee.townCity || payload.townCity || 'Main Office'),
      distance: distance === null ? 'location unavailable' : distance,
    };
    const employeeName = String(employee.name || employee.fullName || payload.employeeName || 'Employee');
    let nextRecord: Record<string, any>;
    let canonicalType = 'LOCATION_UPDATE';
    let transitionOccurred = false;

    if (!record) {
      const isEntry = eventType === 'CHECK_IN' || eventType === 'ENTER' || eventType === 'GEOFENCE_RETURN' || explicitReturn;
      if (!isEntry || !inside) {
        // A return can be the first observed event after a process restart; only create attendance
        // if it is physically inside the authoritative 25m boundary.
        return json({ success: true, processed: true, transitionOccurred: false, newState: 'UNCHANGED', employeeId, timestamp: eventIso });
      }
      canonicalType = 'CHECK_IN';
      transitionOccurred = true;
      nextRecord = {
        id: `att_${employeeId}_${dateStr}`, docId: attDocId, employeeId, employeeName, date: dateStr,
        attendanceType: 'OFFICE', checkInTime: timeStr, checkOutTime: null, workingHours: null,
        latitude: location.latitude, longitude: location.longitude, distance: location.distance,
        townCity: location.townCity, checkInMode: 'AUTO', checkOutMode: 'N/A', exitTime: null, returnTime: null,
        lastExitAt: null, lastExitTime: null, lastReturnAt: null, lastReturnTime: null,
        eventHistory: [], reason: null, createdAtDeviceTime: eventIso, syncStatus: 'Synced',
        serverSyncTime: now, updatedAt: now, isOffline: false, reminderCount: 0,
        currentState: 'CHECKED_IN', processedEvents: [],
        checkInLatitude: location.latitude, checkInLongitude: location.longitude,
        checkInDistance: location.distance, checkInTownCity: location.townCity,
        currentLatitude: location.latitude, currentLongitude: location.longitude, currentDistance: location.distance,
        currentTownCity: location.townCity, currentLocationTimestamp: eventIso, currentLocationStatus: 'LIVE',
      };
    } else {
      nextRecord = { ...record };
      const processed = Array.isArray(record.processedEvents) ? record.processedEvents.map(String) : [];
      // If the attendance write succeeded but the audit-event write failed on a prior
      // attempt, continue through the idempotent merge below to repair the audit row.
      // eventHistory and processedEvents are deduplicated before being written.
      if (record.checkOutTime && record.checkoutStatus === 'COMPLETED') {
        return json({ success: true, processed: true, transitionOccurred: false, newState: 'CHECKED_OUT', employeeId, timestamp: eventIso });
      }
      if (explicitExit && !inside) {
        canonicalType = 'GEOFENCE_EXIT';
        transitionOccurred = true;
        nextRecord.lastExitAt = eventIso;
        nextRecord.lastExitTime = timeStr;
        nextRecord.exitTime = nextRecord.exitTime || timeStr;
        nextRecord.geofenceExitTime = timeStr;
        nextRecord.geofenceExitTimestamp = eventIso;
        nextRecord.recordedExitTime = timeStr;
        nextRecord.exitDetectedAt = eventIso;
        nextRecord.exitDetectedTime = timeStr;
        nextRecord.exitDetectionSource = 'NATIVE_GEOFENCE';
        nextRecord.checkOutTime = null;
        nextRecord.checkOutMode = 'N/A';
        nextRecord.checkoutType = null;
        nextRecord.checkoutSource = 'EXIT_DETECTED';
        nextRecord.attendanceStatus = 'PENDING';
        nextRecord.status = 'active';
        nextRecord.checkoutStatus = 'PENDING_EXIT_CONFIRMATION';
        nextRecord.checkoutFinalized = false;
        nextRecord.checkoutConfirmed = false;
        nextRecord.checkoutFinalizationSource = null;
        nextRecord.workingHours = null;
        nextRecord.pendingCheckoutConfirmation = true;
        nextRecord.pendingCheckoutEventId = eventId;
        nextRecord.returningToOffice = false;
        nextRecord.exitPromptResolvedOutside = false;
        nextRecord.currentState = 'PENDING_EXIT_CONFIRMATION';
        nextRecord.resolutionSource = null;
      } else if (explicitReturn && inside) {
        canonicalType = 'GEOFENCE_RETURN';
        transitionOccurred = true;
        nextRecord.returnTime = timeStr;
        nextRecord.lastReturnTime = timeStr;
        nextRecord.lastReturnAt = eventIso;
        nextRecord.pendingCheckoutConfirmation = false;
        nextRecord.pendingCheckoutEventId = null;
        nextRecord.returningToOffice = false;
        nextRecord.currentState = 'CHECKED_IN';
        nextRecord.checkoutStatus = 'ACTIVE';
        nextRecord.checkoutSource = null;
        nextRecord.exitPromptResolvedOutside = true;
        delete nextRecord.checkoutLatitude;
        delete nextRecord.checkoutLongitude;
        delete nextRecord.checkoutDistance;
        delete nextRecord.checkoutTownCity;
        if (!nextRecord.checkInTime) { nextRecord.checkInTime = timeStr; nextRecord.checkInMode = 'AUTO'; }
      } else if (inside && coordsAvailable) {
        nextRecord.currentLatitude = latitude;
        nextRecord.currentLongitude = longitude;
        nextRecord.currentDistance = distance;
        nextRecord.currentTownCity = location.townCity;
        nextRecord.currentLocationTimestamp = eventIso;
        nextRecord.currentLocationStatus = 'LIVE';
      } else {
        canonicalType = 'LOCATION_UPDATE';
      }
      nextRecord.processedEvents = processed;
    }

    const processedEvents = Array.isArray(nextRecord.processedEvents) ? nextRecord.processedEvents.map(String) : [];
    nextRecord.processedEvents = Array.from(new Set([...processedEvents, eventId])).slice(-500);
    const oldHistory = Array.isArray(nextRecord.eventHistory) ? nextRecord.eventHistory : [];
    nextRecord.eventHistory = oldHistory.filter((item: any) => String(item?.eventId || '') !== eventId);
    nextRecord.eventHistory.push({
      eventId, employeeId, eventType: canonicalType, eventTime: timeStr, timestamp: eventIso,
      source, location, distance: location.distance,
    });
    nextRecord.eventHistory.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    nextRecord.updatedAt = now;
    nextRecord.serverSyncTime = now;
    nextRecord.syncStatus = 'Synced';

    await writeDoc(env, 'attendance', attDocId, nextRecord, !record);
    await writeDoc(env, 'attendance_events', eventId, {
      eventId, employeeId, attendanceDate: dateStr, eventType: canonicalType, eventTime: timeStr,
      timestamp: eventIso, location, attendanceMode: 'OFFICE', source, syncStatus: 'Synced',
      syncedAt: now, serverSyncTime: now,
    }, true);
    await writeDoc(env, 'live_locations', employeeId, {
      employeeId, employeeName, latitude: location.latitude, longitude: location.longitude,
      accuracy: Number.isFinite(Number(payload.accuracy)) ? Number(payload.accuracy) : null,
      distanceFromOffice: distance === null ? 'location unavailable' : distance,
      townCity: location.townCity, timestamp: eventIso, updatedAt: now,
    });

    return json({
      success: true, processed: true, employeeId, employeeName, eventId,
      distanceMeters: distance === null ? null : Math.round(distance), isInsideGeofence: inside,
      isExitCandidate: distance !== null && distance > RADIUS_METERS, geofenceRadius: RADIUS_METERS,
      transitionOccurred, newState: nextRecord.currentState || 'UNCHANGED', source, timestamp: eventIso,
    });
  } catch (error: any) {
    console.error('[Native Background Attendance]', error?.message || error);
    return json({ success: false, error: 'Could not persist the native attendance event' }, 500);
  }
};

type PagesFunction<E> = (context: { request: Request; env: E; params: Record<string, string>; waitUntil(promise: Promise<unknown>): void; next(): Promise<Response> }) => Response | Promise<Response>;
