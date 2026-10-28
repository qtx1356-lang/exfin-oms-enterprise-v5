interface Env {
  REALTIME_SFU_APP_ID: string;
  REALTIME_SFU_BEARER_TOKEN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_SERVICE_ACCOUNT_JSON: string;
  ALLOWED_ORIGIN?: string;
}

type Json = Record<string, any>;
type Claims = { uid: string; name?: string; email?: string };

const SFU_BASE = "https://rtc.live.cloudflare.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const MAX_PARTICIPANTS = 31;
const CONFERENCE_TTL_MS = 6 * 60 * 60 * 1000;
const certCache = new Map<string, { expiresAt: number; keys: Record<string, Json> }>();
const oauthCache = new Map<string, { token: string; expiresAt: number }>();

function json(data: Json, status = 200, req?: Request, env?: Env) {
  const origin = env?.ALLOWED_ORIGIN || req?.headers.get("Origin") || "*";
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With, Accept, Origin",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Vary": "Origin",
    },
  });
}

function base64UrlBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(normalized);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function base64UrlJson(value: string): Json {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(value)));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToDer(pem: string) {
  const body = pem.replace(/-----BEGIN CERTIFICATE-----/g, "").replace(/-----END CERTIFICATE-----/g, "").replace(/\s/g, "");
  return base64UrlBytes(body.replace(/\+/g, "-").replace(/\//g, "_"));
}

async function firebasePublicKeys() {
  const cached = certCache.get("securetoken");
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if (!response.ok) throw new Error("FIREBASE_PUBLIC_KEYS_UNAVAILABLE");
  const body = await response.json() as { keys: Json[] };
  const keys: Record<string, Json> = {};
  for (const key of body.keys || []) if (key.kid) keys[String(key.kid)] = key;
  certCache.set("securetoken", { keys, expiresAt: Date.now() + 55 * 60 * 1000 });
  return keys;
}

async function verifyFirebaseIdToken(token: string, env: Env): Promise<Claims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = base64UrlJson(parts[0]);
    const payload = base64UrlJson(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now || payload.iat > now + 60) return null;
    if (payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) return null;
    if (typeof payload.sub !== "string" || !payload.sub) return null;
    const jwk = (await firebasePublicKeys())[String(header.kid)];
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlBytes(parts[2]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
    if (!valid) return null;
    return { uid: payload.sub, name: payload.name, email: payload.email };
  } catch {
    return null;
  }
}

function serviceAccount(env: Env): Json {
  return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

function pemToPkcs8(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function googleAccessToken(env: Env, scope: string) {
  const cached = oauthCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const account = serviceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ iss: account.client_email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 })));
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${base64UrlEncode(new Uint8Array(signature))}`;
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error("GOOGLE_OAUTH_FAILED");
  const body = await response.json() as { access_token: string; expires_in: number };
  oauthCache.set(scope, { token: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in - 60) * 1000 });
  return body.access_token;
}

function docName(env: Env, collection: string, id: string) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

function firestoreValue(value: any): Json {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, firestoreValue(v)])) } };
  return { stringValue: String(value) };
}

function fromFirestoreValue(v: any): any {
  if (!v) return null;
  if ("nullValue" in v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue?.values || []).map(fromFirestoreValue);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue?.fields || {}).map(([k, x]) => [k, fromFirestoreValue(x)]));
  return null;
}

function fromDocument(doc: any) {
  return Object.fromEntries(Object.entries(doc?.fields || {}).map(([k, v]) => [k, fromFirestoreValue(v)]));
}

async function firestoreRequest(env: Env, path: string, init: RequestInit = {}) {
  const token = await googleAccessToken(env, FIRESTORE_SCOPE);
  const response = await fetch(`https://firestore.googleapis.com/v1/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`FIRESTORE_${response.status}`);
  return body;
}

async function getDoc(env: Env, collection: string, id: string) {
  const response = await firestoreRequest(env, `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`, { method: "GET" });
  return response?.name ? { name: response.name, data: fromDocument(response) } : null;
}

async function setDoc(env: Env, collection: string, id: string, data: Json) {
  return firestoreRequest(env, docName(env, collection, id), { method: "PATCH", body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, firestoreValue(v)])) }) });
}

async function updateDoc(env: Env, collection: string, id: string, data: Json) {
  const mask = Object.keys(data).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join("&");
  return firestoreRequest(env, `${docName(env, collection, id)}?${mask}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, firestoreValue(v)])) }),
  });
}

async function queryDocs(env: Env, collection: string, fieldFilters: Array<{ field: string; op: string; value: any }>, limit = 50) {
  const structuredQuery: Json = { from: [{ collectionId: collection }], limit };
  if (fieldFilters.length === 1) structuredQuery.where = { fieldFilter: { field: { fieldPath: fieldFilters[0].field }, op: fieldFilters[0].op, value: firestoreValue(fieldFilters[0].value) } };
  else if (fieldFilters.length > 1) structuredQuery.where = { compositeFilter: { op: "AND", filters: fieldFilters.map((f) => ({ fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: firestoreValue(f.value) } })) } };
  const rows = await firestoreRequest(env, `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery }) });
  return (Array.isArray(rows) ? rows : []).filter((row) => row.document).map((row) => ({ name: row.document.name, data: fromDocument(row.document) }));
}

async function approvedEmployeeUidAliases(env: Env, uid: string, email?: string): Promise<string[]> {
  const matches = [
    ...(await queryDocs(env, "registrations", [{ field: "uid", op: "EQUAL", value: uid }], 20)),
    ...(await queryDocs(env, "registrations", [{ field: "authUid", op: "EQUAL", value: uid }], 20)),
  ];
  // Older EXFIN registrations may be linked to Firebase Auth by email rather than UID.
  // Resolve that approved registration so the authenticated employee can join their invitation.
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) {
    try {
      const byEmail = await queryDocs(env, "registrations", [{ field: "email", op: "EQUAL", value: normalizedEmail }], 20);
      matches.push(...byEmail);
    } catch (error) {
      console.warn("video_conference_registration_email_lookup_failed", JSON.stringify({ uid, message: error instanceof Error ? error.message : String(error) }));
    }
  }

  // Recipient lists in older EXFIN deployments may supply an employee code or
  // registration document ID instead of the current Firebase Auth UID. Resolve
  // those identifiers to the same approved registration before persisting an
  // invitation. This scan is bounded and also handles legacy mixed-case emails.
  try {
    const registrations = await queryDocs(env, "registrations", [], 1000);
    const normalizedUid = String(uid || "").trim().toLowerCase();
    matches.push(...registrations.filter((doc) => {
      const data = doc.data || {};
      const docId = String(doc.name || "").split("/").pop() || "";
      const identifiers = [docId, data.uid, data.authUid, data.employeeCode, data.employeeId, data.email]
        .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
      return identifiers.includes(normalizedUid) ||
        (normalizedEmail && String(data.email || "").trim().toLowerCase() === normalizedEmail);
    }));
  } catch (error) {
    console.warn("video_conference_registration_identity_scan_failed", JSON.stringify({ uid, message: error instanceof Error ? error.message : String(error) }));
  }
  try {
    const direct = await getDoc(env, "registrations", uid);
    if (direct) matches.push(direct);
  } catch {}
  const aliases = new Set<string>([uid]);
  for (const doc of matches) {
    const data = doc.data || {};
    const status = String(data.status || data.accountStatus || "").trim().toLowerCase().replace(/\s+/g, " ");
    const approved = ["approved", "approved / active", "active", "approved/active"].includes(status);
    if (!approved || data.isDeleted === true || data.active === false || data.disabled === true) continue;
    const docId = String(doc.name || "").split("/").pop() || "";
    // Keep every supported identifier in the same identity set. The admin
    // recipient endpoint can expose employeeCode/employeeId as the selected UID,
    // while the employee joins using their Firebase Auth UID.
    for (const candidate of [data.uid, data.authUid, docId, data.employeeCode, data.employeeId, data.email]) {
      const value = String(candidate || "").trim();
      if (value) aliases.add(value);
    }
  }
  return [...aliases];
}

async function approvedAdmin(env: Env, uid: string) {
  const doc = await getDoc(env, "admin_users", uid);
  if (!doc) return false;
  const data = doc.data || {};
  const role = String(data.role || "").toUpperCase();
  const status = String(data.status || data.accountStatus || "ACTIVE").trim().toUpperCase();
  return ["SUPER_ADMIN", "ADMIN", "HR", "TEAM_LEADER"].includes(role) && data.active !== false && ["ACTIVE", "APPROVED", "APPROVED / ACTIVE"].includes(status);
}

function sfuHeaders(env: Env) { return { Authorization: `Bearer ${env.REALTIME_SFU_BEARER_TOKEN}`, "Content-Type": "application/json" }; }
async function sfuRequest(env: Env, path: string, init: RequestInit = {}) {
  const response = await fetch(`${SFU_BASE}/apps/${encodeURIComponent(env.REALTIME_SFU_APP_ID)}${path}`, { ...init, headers: { ...sfuHeaders(env), ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.errorCode) throw new Error(`SFU_${response.status}_${body?.errorCode || "REQUEST_FAILED"}`);
  return body;
}

async function sendConferencePush(env: Env, uid: string, payload: Json) {
  const aliases = await approvedEmployeeUidAliases(env, uid);
  // Older Android registrations sometimes key FCM tokens by employeeCode rather
  // than Firebase UID. Resolve the approved registration and search both indexes.
  const registrationGroups = await Promise.all(aliases.map(async (alias) => {
    try {
      const [byUid, byAuthUid, direct] = await Promise.all([
        queryDocs(env, "registrations", [{ field: "uid", op: "EQUAL", value: alias }], 20),
        queryDocs(env, "registrations", [{ field: "authUid", op: "EQUAL", value: alias }], 20),
        getDoc(env, "registrations", alias).then((doc) => doc ? [doc] : []),
      ]);
      return [...byUid, ...byAuthUid, ...direct];
    } catch { return []; }
  }));
  const registrations = registrationGroups.flat();
  const employeeCodes = [...new Set(registrations.map((doc) => String(doc.data?.employeeCode || doc.data?.employeeId || "").trim()).filter(Boolean))];
  const docGroups = await Promise.all([
    ...aliases.map(async (alias) => {
      try { return await queryDocs(env, "push_device_tokens", [{ field: "uid", op: "EQUAL", value: alias }], 50); }
      catch (error) {
        console.warn("video_conference_token_lookup_failed", JSON.stringify({ invitedUid: uid, alias, message: error instanceof Error ? error.message : String(error) }));
        return [];
      }
    }),
    ...employeeCodes.map(async (employeeCode) => {
      try { return await queryDocs(env, "push_device_tokens", [{ field: "employeeCode", op: "EQUAL", value: employeeCode }], 50); }
      catch (error) {
        console.warn("video_conference_token_employee_code_lookup_failed", JSON.stringify({ invitedUid: uid, message: error instanceof Error ? error.message : String(error) }));
        return [];
      }
    }),
  ]);
  const docs = docGroups.flat();
  const expectedUids = new Set(aliases.map((value) => value.trim()).filter(Boolean));
  const expectedEmployeeCodes = new Set(employeeCodes.map((value) => value.trim().toLowerCase()).filter(Boolean));
  // Only use tokens whose stored owner matches the selected approved employee.
  // Employee-code lookup is a legacy fallback, not permission to send to a token
  // that explicitly belongs to a different Firebase UID or an administrator.
  const eligibleDocs = docs.filter((doc) => {
    const data = doc.data || {};
    const ownerIds = [data.uid, data.authUid, data.userId, data.firebaseUid]
      .map((value) => String(value || "").trim()).filter(Boolean);
    const ownerCodes = [data.employeeCode, data.employeeId]
      .map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
    const role = String(data.role || data.accountType || "").trim().toLowerCase();
    if (role === "admin" || role === "administrator") return false;
    if (ownerIds.length && !ownerIds.some((owner) => expectedUids.has(owner))) return false;
    if (ownerCodes.length && !ownerCodes.some((code) => expectedEmployeeCodes.has(code))) return false;
    if (!ownerIds.length && !ownerCodes.length) return false;
    return ownerIds.some((owner) => expectedUids.has(owner)) ||
      ownerCodes.some((code) => expectedEmployeeCodes.has(code));
  });
  const rejectedOwnerDocuments = docs.length - eligibleDocs.length;
  const tokens = [...new Set(eligibleDocs.map((d) => String(d.data.token || d.data.fcmToken || d.data.deviceToken || "").trim()).filter(Boolean))];
  if (!tokens.length) {
    const diagnosticCode = docs.length > 0 && rejectedOwnerDocuments > 0 ? "TOKEN_OWNER_MISMATCH" : "NO_EMPLOYEE_TOKEN";
    console.warn("video_conference_push", JSON.stringify({
      uid, uidAliasCount: aliases.length, result: diagnosticCode,
      documentsFound: docs.length, ownerMatchedDocuments: eligibleDocs.length,
      rejectedOwnerDocuments: rejectedOwnerDocuments,
    }));
    return { uid, sent: 0, failed: 0, tokenCount: 0, errors: [diagnosticCode], diagnosticCode, ownerMatchedDocuments: eligibleDocs.length, rejectedOwnerDocuments };
  }
  const accessToken = await googleAccessToken(env, FCM_SCOPE);
  let sent = 0, failed = 0;
  const errors: string[] = [];
  for (const token of tokens) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token,
        data: Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, String(v)])),
        notification: {
          title: `${String(payload.callerName || "EXFIN OMS Admin")} is inviting you`,
          body: String(payload.title || "EXFIN OMS video conference"),
        },
        android_v2: {
          ttl: "60s",
          direct_boot_ok: true,
          remote_notification: {
            mutable_content: false,
            notification: {
              title: `${String(payload.callerName || "EXFIN OMS Admin")} is inviting you`,
              body: String(payload.title || "EXFIN OMS video conference"),
              channel_id: "exfin_oms_messages_v2",
              click_action: "com.exfin.oms.VIDEO_CALL_OPEN",
              sound: "default",
              notification_priority: "PRIORITY_MAX",
              visibility: "PUBLIC",
              tag: `exfin_video_call_${String(payload.conferenceId || payload.callId || "incoming")}`,
              id: 700001,
            },
          },
        },
      } }),
    });
    if (response.ok) sent++;
    else {
      failed++;
      const body = await response.json().catch(() => ({})) as any;
      const status = String(body?.error?.status || `HTTP_${response.status}`).slice(0, 80);
      const message = String(body?.error?.message || "FCM rejected message").slice(0, 240);
      errors.push(`${status}: ${message}`);
      console.error("video_conference_fcm_rejected", JSON.stringify({ uid, httpStatus: response.status, status, message }));
    }
  }
  const diagnosticCode = sent > 0 ? "FCM_ACCEPTED" : "FCM_REJECTED";
  console.info("video_conference_push", JSON.stringify({
    uid, result: diagnosticCode, tokenCount: tokens.length, sent, failed,
    ownerMatchedDocuments: eligibleDocs.length, rejectedOwnerDocuments,
  }));
  return { uid, sent, failed, tokenCount: tokens.length, errors, diagnosticCode, ownerMatchedDocuments: eligibleDocs.length, rejectedOwnerDocuments };
}

async function auth(req: Request, env: Env) {
  const value = String(req.headers.get("Authorization") || "");
  if (!value.startsWith("Bearer ")) return null;
  return verifyFirebaseIdToken(value.slice(7).trim(), env);
}

async function body(req: Request) { try { return await req.json() as Json; } catch { return {}; } }

async function handler(req: Request, env: Env): Promise<Response> {
  if (req.method === "OPTIONS") return json({}, 200, req, env);
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, "");
  const caller = await auth(req, env);
  if (!caller) return json({ success: false, error: "Authentication required." }, 401, req, env);

  if (req.method === "GET" && path === "/api/video-conference/config") {
    return json({ success: true, iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }] }, 200, req, env);
  }

  if (req.method === "GET" && path === "/api/video-conference/invitations") {
    const docs = await queryDocs(env, "video_conferences", [{ field: "participantUids", op: "ARRAY_CONTAINS", value: caller.uid }, { field: "status", op: "EQUAL", value: "active" }], 10);
    const invitations = docs.map((d) => d.data).filter((d) => new Date(String(d.expiresAt || 0)).getTime() > Date.now()).map((d) => ({ conferenceId: d.conferenceId, title: d.title, callerUid: d.callerUid, callerName: d.callerName, expiresAt: d.expiresAt }));
    return json({ success: true, invitations }, 200, req, env);
  }

  if (req.method === "POST" && path === "/api/video-conference/create") {
    if (!(await approvedAdmin(env, caller.uid))) return json({ success: false, error: "Only an active admin can start a conference." }, 403, req, env);
    const input = await body(req);
    const raw = Array.isArray(input.participantUids) ? input.participantUids : [];
    const selectedUids = [...new Set(raw.map((v: any) => String(v || "").trim()).filter(Boolean))].filter((uid) => uid !== caller.uid).slice(0, MAX_PARTICIPANTS - 1);
    if (!selectedUids.length) return json({ success: false, error: "Select at least one employee." }, 400, req, env);
    // Store every approved identity alias for each selected employee. The admin recipient
    // list can contain a legacy registration UID while the native app authenticates with
    // the current Firebase Auth UID; both must be authorized to join the same conference.
    const participantAliasesBySelectedUid = await Promise.all(selectedUids.map(async (uid) => {
      try { return { selectedUid: uid, aliases: await approvedEmployeeUidAliases(env, uid) }; }
      catch (error) {
        console.error("video_conference_invitee_alias_resolution_failed", JSON.stringify({ selectedUid: uid, message: error instanceof Error ? error.message : String(error) }));
        return { selectedUid: uid, aliases: [uid] };
      }
    }));
    const participantUids = [...new Set(participantAliasesBySelectedUid.flatMap((entry) => entry.aliases))].filter((uid) => uid !== caller.uid);
    if (!participantUids.length) return json({ success: false, error: "No valid employee identities were resolved for the selected invitees." }, 400, req, env);
    const conferenceId = crypto.randomUUID();
    const title = String(input.title || "EXFIN OMS video conference").trim().slice(0, 120) || "EXFIN OMS video conference";
    const adminName = String(input.adminName || caller.name || caller.email || "EXFIN OMS Admin").slice(0, 80);
    const expiresAt = new Date(Date.now() + CONFERENCE_TTL_MS).toISOString();
    const participants = [{ uid: caller.uid, name: adminName, role: "ADMIN", status: "HOST" }, ...participantAliasesBySelectedUid.map((entry) => ({ uid: entry.selectedUid, identityAliases: entry.aliases, name: "Employee", role: "EMPLOYEE", status: "INVITED" }))];
    await setDoc(env, "video_conferences", conferenceId, { conferenceId, title, callerUid: caller.uid, callerName: adminName, participantUids: [caller.uid, ...participantUids], participants, status: "active", createdAt: new Date().toISOString(), expiresAt });
    const pushes = await Promise.all(selectedUids.map(async (uid) => {
      try {
        return await sendConferencePush(env, uid, { type: "video_conference", conferenceId, callerUid: caller.uid, callerName: adminName, title, route: "/video-calls", expiresAt });
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || "Push send failed").slice(0, 240);
        console.error("video_conference_push_exception", JSON.stringify({ uid, message }));
        return { uid, sent: 0, failed: 1, tokenCount: 0, errors: [message], diagnosticCode: "FCM_REJECTED", ownerMatchedDocuments: 0, rejectedOwnerDocuments: 0 };
      }
    }));
    const pushSummary = {
      invited: selectedUids.length,
      participantIdentityCount: participantUids.length,
      sent: pushes.reduce((s, x) => s + x.sent, 0),
      failed: pushes.reduce((s, x) => s + x.failed, 0),
      recipients: pushes.map(({ uid, sent, failed, tokenCount, errors, diagnosticCode, ownerMatchedDocuments, rejectedOwnerDocuments }) => ({
        uid, sent, failed, tokenCount, errors,
        diagnosticCode: diagnosticCode || (sent > 0 ? "FCM_ACCEPTED" : failed > 0 ? "FCM_REJECTED" : "NO_EMPLOYEE_TOKEN"),
        ownerMatchedDocuments: ownerMatchedDocuments ?? 0,
        rejectedOwnerDocuments: rejectedOwnerDocuments ?? 0,
      })),
    };
    await updateDoc(env, "video_conferences", conferenceId, { pushSummary });
    return json({ success: true, conferenceId, title, expiresAt, participantCount: participantUids.length + 1, pushSummary }, 200, req, env);
  }

  const snapshot = path.match(/^\/api\/video-conference\/([^/]+)\/snapshot$/);
  const join = path.match(/^\/api\/video-conference\/([^/]+)\/join$/);
  const publish = path.match(/^\/api\/video-conference\/([^/]+)\/publish$/);
  const subscribe = path.match(/^\/api\/video-conference\/([^/]+)\/subscribe$/);
  const leave = path.match(/^\/api\/video-conference\/([^/]+)\/leave$/);
  const end = path.match(/^\/api\/video-conference\/([^/]+)\/end$/);
  const conferenceId = snapshot?.[1] || join?.[1] || publish?.[1] || subscribe?.[1] || leave?.[1] || end?.[1];
  if (!conferenceId) return json({ success: false, error: "Not found." }, 404, req, env);
  const conferenceDoc = await getDoc(env, "video_conferences", conferenceId);
  if (!conferenceDoc) return json({ success: false, error: "Conference not found." }, 404, req, env);
  const conference = conferenceDoc.data || {};
  const participantUids = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : [];
  const uidAliases = await approvedEmployeeUidAliases(env, caller.uid, caller.email);
  // The invite document is created only by an authenticated, approved admin.
  // Some legacy employee registrations store the email as the invite identity,
  // even when the current Firebase UID cannot be resolved from registrations.
  // Match the authenticated Firebase token's email against that explicit invite.
  const normalizedCallerEmail = String(caller.email || "").trim().toLowerCase();
  if (normalizedCallerEmail && !uidAliases.some((alias) => alias.trim().toLowerCase() === normalizedCallerEmail)) {
    uidAliases.push(normalizedCallerEmail);
  }
  const participants = Array.isArray(conference.participants) ? conference.participants : [];
  // Prefer the per-invitee identity aliases as well as the flattened legacy list.
  // This avoids losing an invite when older conference documents contain a
  // partial participantUids array but do retain the selected invitee's aliases.
  // Compare identity aliases case-insensitively. Legacy registration records may
  // store email aliases with mixed casing while Firebase ID tokens normalize email.
  const normalizeIdentity = (value: unknown) => String(value || "").trim().toLowerCase();
  const callerIdentitySet = new Set(uidAliases.map(normalizeIdentity).filter(Boolean));
  const matchedParticipant = participants.find((item: any) => {
    if (String(item?.role || "").toUpperCase() === "ADMIN" && String(item?.uid || "") !== caller.uid) return false;
    const identities = [item?.uid, ...(Array.isArray(item?.identityAliases) ? item.identityAliases : [])]
      .map(normalizeIdentity).filter(Boolean);
    return identities.some((identity) => callerIdentitySet.has(identity));
  });
  const conferenceParticipantUid = participantUids.find((uid) => callerIdentitySet.has(normalizeIdentity(uid))) ||
    (matchedParticipant ? String(matchedParticipant.uid || "").trim() : "");
  if (!conferenceParticipantUid) {
    // Server-side diagnostic only: do not expose employee identifiers to clients.
    console.warn("video_conference_invitation_mismatch", JSON.stringify({
      conferenceId,
      callerUid: caller.uid,
      callerEmailPresent: Boolean(caller.email),
      callerAliasCount: uidAliases.length,
      callerAliases: uidAliases,
      storedParticipantUidCount: participantUids.length,
      storedParticipantUids: participantUids,
      participantAliasCounts: participants.map((item: any) => ({
        role: String(item?.role || ""),
        uid: String(item?.uid || ""),
        aliasCount: Array.isArray(item?.identityAliases) ? item.identityAliases.length : 0,
        aliases: Array.isArray(item?.identityAliases) ? item.identityAliases : [],
      })),
      conferenceStatus: String(conference.status || ""),
      expiresAt: String(conference.expiresAt || ""),
    }));
    return json({ success: false, error: "You are not invited to this conference.", diagnosticCode: "INVITEE_IDENTITY_MISMATCH" }, 403, req, env);
  }
  if (new Date(String(conference.expiresAt || 0)).getTime() <= Date.now() || conference.status !== "active") return json({ success: false, error: "This conference has ended or expired." }, 410, req, env);

  if (snapshot) {
    const pubs = await queryDocs(env, "video_conference_publications", [{ field: "conferenceId", op: "EQUAL", value: conferenceId }, { field: "active", op: "EQUAL", value: true }], 100);
    return json({ success: true, conference: { conferenceId, title: conference.title, callerUid: conference.callerUid, status: conference.status, expiresAt: conference.expiresAt }, participants: conference.participants || [], publications: pubs.map((d) => ({ publicationId: d.name.split("/").pop(), ...d.data })) }, 200, req, env);
  }

  if (join) {
    const input = await body(req); const participantName = String(input.displayName || caller.name || caller.email || "EXFIN OMS user").slice(0, 80);
    const participants = Array.isArray(conference.participants) ? conference.participants : [];
    await updateDoc(env, "video_conferences", conferenceId, { participants: participants.map((item: any) => String(item.uid) === conferenceParticipantUid ? { ...item, name: participantName, status: "JOINED", joinedAt: new Date().toISOString() } : item) });
    return json({ success: true, conferenceId, title: conference.title, callerUid: conference.callerUid, participantName }, 200, req, env);
  }

  if (publish) {
    const input = await body(req); const offer = input.sessionDescription; const tracks = Array.isArray(input.tracks) ? input.tracks : [];
    if (!offer?.sdp || !tracks.length) return json({ success: false, error: "A WebRTC offer and media tracks are required." }, 400, req, env);
    const existing = await queryDocs(env, "video_conference_publications", [{ field: "conferenceId", op: "EQUAL", value: conferenceId }, { field: "uid", op: "EQUAL", value: caller.uid }, { field: "active", op: "EQUAL", value: true }], 1);
    if (existing.length) return json({ success: false, error: "This participant is already publishing to the conference." }, 409, req, env);
    const session = await sfuRequest(env, "/sessions/new", { method: "POST" });
    const result = await sfuRequest(env, `/sessions/${encodeURIComponent(session.sessionId)}/tracks/new`, { method: "POST", body: JSON.stringify({ sessionDescription: offer, tracks }) });
    const returnedTracks = Array.isArray(result.tracks) ? result.tracks : [];
    await setDoc(env, "video_conference_publications", `${conferenceId}_${caller.uid}`, { conferenceId, uid: caller.uid, sessionId: session.sessionId, tracks: returnedTracks.map((item: any, index: number) => ({ trackName: String(item.trackName || tracks[index]?.trackName || ""), kind: String(item.kind || tracks[index]?.kind || ""), mid: String(item.mid || tracks[index]?.mid || "") })), active: true, updatedAt: new Date().toISOString() });
    return json({ success: true, sessionId: session.sessionId, sessionDescription: result.sessionDescription, tracks: returnedTracks }, 200, req, env);
  }

  if (subscribe) {
    const input = await body(req); const requested = Array.isArray(input.publications) ? input.publications : [];
    const allowed = new Set(participantUids.filter((uid) => uid !== conferenceParticipantUid));
    const publications = requested.filter((item: any) => allowed.has(String(item?.uid || "")) && String(item?.sessionId || "") && Array.isArray(item?.tracks));
    const locators = publications.flatMap((p: any) => p.tracks.map((t: any) => ({ location: "remote", sessionId: String(p.sessionId), trackName: String(t.trackName) })));
    if (!locators.length) return json({ success: true, empty: true, tracks: [] }, 200, req, env);
    let sessionId = String(input.sessionId || "").trim();
    if (!sessionId) { const session = await sfuRequest(env, "/sessions/new", { method: "POST" }); sessionId = session.sessionId; }
    const result = await sfuRequest(env, `/sessions/${encodeURIComponent(sessionId)}/tracks/new`, { method: "POST", body: JSON.stringify({ tracks: locators }) });
    return json({ success: true, sessionId, sessionDescription: result.sessionDescription || null, requiresImmediateRenegotiation: Boolean(result.sessionDescription), tracks: result.tracks || [] }, 200, req, env);
  }

  if (leave) {
    const participants = Array.isArray(conference.participants) ? conference.participants : [];
    await updateDoc(env, "video_conferences", conferenceId, { participants: participants.map((item: any) => String(item.uid) === conferenceParticipantUid ? { ...item, status: "LEFT", leftAt: new Date().toISOString() } : item) });
    const pubs = await queryDocs(env, "video_conference_publications", [{ field: "conferenceId", op: "EQUAL", value: conferenceId }, { field: "uid", op: "EQUAL", value: caller.uid }], 5);
    for (const pub of pubs) await updateDoc(env, "video_conference_publications", pub.name.split("/").pop() || `${conferenceId}_${caller.uid}`, { active: false, updatedAt: new Date().toISOString() });
    return json({ success: true }, 200, req, env);
  }

  if (end) {
    if (!(await approvedAdmin(env, caller.uid)) && caller.uid !== conference.callerUid) return json({ success: false, error: "Only the conference host can end this conference." }, 403, req, env);
    await updateDoc(env, "video_conferences", conferenceId, { status: "ended", endedAt: new Date().toISOString() });
    const pubs = await queryDocs(env, "video_conference_publications", [{ field: "conferenceId", op: "EQUAL", value: conferenceId }, { field: "active", op: "EQUAL", value: true }], 100);
    for (const pub of pubs) await updateDoc(env, "video_conference_publications", pub.name.split("/").pop() || "", { active: false, updatedAt: new Date().toISOString() });
    return json({ success: true }, 200, req, env);
  }

  return json({ success: false, error: "Not found." }, 404, req, env);
}

export default { async fetch(req: Request, env: Env) {
  try { return await handler(req, env); }
  catch (error: any) { console.error("EXFIN video Worker error", error?.message || error); return json({ success: false, error: "Video conference backend error." }, 500, req, env); }
} };