import type express from "express";
import { randomUUID } from "crypto";
import { getMessaging } from "firebase-admin/messaging";
import type { Auth } from "firebase-admin/auth";
import type { Firestore, DocumentReference, QuerySnapshot } from "firebase-admin/firestore";

const COLLECTION = "video_conferences";
const PUBLICATIONS = "video_conference_publications";
const TOKEN_COLLECTION = "push_device_tokens";
const MAX_PARTICIPANTS = 31;
const CONFERENCE_TTL_MS = 6 * 60 * 60 * 1000;
const SFU_BASE = "https://rtc.live.cloudflare.com/v1";

function bearerToken(req: express.Request): string { const value = String(req.headers.authorization || ""); return value.startsWith("Bearer ") ? value.slice(7).trim() : ""; }
async function verifyCaller(req: express.Request, authAdmin: Auth) { const token = bearerToken(req); if (!token) return null; try { return await authAdmin.verifyIdToken(token, true); } catch { return null; } }
async function isApprovedAdmin(db: Firestore, uid: string): Promise<boolean> {
  const admin = await db.collection("admin_users").doc(uid).get(); if (!admin.exists) return false;
  const data = admin.data() || {}; const role = String(data.role || "").toUpperCase(); const status = String(data.status || data.accountStatus || "ACTIVE").trim().toUpperCase();
  return ["SUPER_ADMIN", "ADMIN", "HR", "TEAM_LEADER"].includes(role) && data.active !== false && ["ACTIVE", "APPROVED", "APPROVED / ACTIVE"].includes(status);
}
function configured() { return Boolean(String(process.env.REALTIME_SFU_APP_ID || "").trim() && String(process.env.REALTIME_SFU_BEARER_TOKEN || "").trim()); }
function sfuHeaders() { return { Authorization: `Bearer ${String(process.env.REALTIME_SFU_BEARER_TOKEN || "").trim()}`, "Content-Type": "application/json" }; }
async function sfuRequest(path: string, init: RequestInit = {}) {
  if (!configured()) throw new Error("REALTIME_SFU_NOT_CONFIGURED");
  const response = await fetch(`${SFU_BASE}/apps/${encodeURIComponent(String(process.env.REALTIME_SFU_APP_ID).trim())}${path}`, { ...init, headers: { ...sfuHeaders(), ...(init.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.errorCode) throw new Error(`SFU_${response.status}_${body?.errorCode || "REQUEST_FAILED"}:${body?.errorDescription || "Cloudflare Realtime request failed"}`);
  return body as any;
}
async function sendConferencePush(db: Firestore, uid: string, payload: Record<string, string>) {
  const candidates = new Map<string, { token: string; ref: DocumentReference }>();
  const add = (snap: QuerySnapshot) => snap.docs.forEach((doc) => { const data = doc.data() || {}; const token = String(data.token || data.fcmToken || data.deviceToken || "").trim(); if (token) candidates.set(token, { token, ref: doc.ref }); });
  add(await db.collection(TOKEN_COLLECTION).where("uid", "==", uid).limit(50).get());
  const tokens = [...candidates.keys()]; if (!tokens.length) return { sent: 0, failed: 0, errors: ["NO_ANDROID_FCM_TOKEN"] };
  const response = await getMessaging().sendEachForMulticast({ tokens, data: payload, android: { priority: "high", ttl: 60_000, collapseKey: `exfin_conference_${payload.conferenceId}` }, fcmOptions: { analyticsLabel: "exfin-native-video-conference" } });
  const errors: string[] = [];
  await Promise.all(response.responses.map(async (result, index) => { if (result.success) return; errors.push(String(result.error?.code || result.error?.message || "FCM_SEND_FAILED")); const code = String(result.error?.code || ""); if (/registration-token-not-registered|invalid-registration-token/i.test(code)) await candidates.get(tokens[index])?.ref.delete().catch(() => {}); }));
  return { sent: response.successCount, failed: response.failureCount, errors };
}

export function mountCloudflareSfuVideoRoutes(app: express.Express, db: Firestore | null, authAdmin: Auth | null) {
  app.get("/api/video-conference/config", async (req, res) => {
    if (!authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." });
    const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    if (!configured()) return res.status(503).json({ success: false, error: "Cloudflare Realtime SFU is not configured." });
    return res.json({ success: true, iceServers: [{ urls: ["stun:stun.cloudflare.com:3478"] }] });
  });

  app.get("/api/video-conference/invitations", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." });
    const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    const snap = await db.collection(COLLECTION).where("participantUids", "array-contains", caller.uid).where("status", "==", "active").limit(10).get();
    const invitations = snap.docs.map((doc) => { const data = doc.data() || {}; return { conferenceId: data.conferenceId, title: data.title, callerUid: data.callerUid, callerName: data.callerName, expiresAt: data.expiresAt }; }).filter((item) => new Date(String(item.expiresAt || 0)).getTime() > Date.now());
    return res.json({ success: true, invitations });
  });

  app.post("/api/video-conference/create", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." });
    const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    if (!(await isApprovedAdmin(db, caller.uid))) return res.status(403).json({ success: false, error: "Only an active admin can start a conference." });
    if (!configured()) return res.status(503).json({ success: false, error: "Cloudflare Realtime SFU is not configured on the server." });
    const rawParticipants = Array.isArray(req.body?.participantUids) ? req.body.participantUids : [];
    const participantUids: string[] = [...new Set<string>(rawParticipants.map((value: unknown) => String(value || "").trim()).filter((value): value is string => Boolean(value)))].filter((uid) => uid !== caller.uid).slice(0, MAX_PARTICIPANTS - 1);
    if (!participantUids.length) return res.status(400).json({ success: false, error: "Select at least one employee." });
    const conferenceId = randomUUID(); const title = String(req.body?.title || "EXFIN OMS video conference").trim().slice(0, 120) || "EXFIN OMS video conference"; const now = new Date(); const expiresAt = new Date(now.getTime() + CONFERENCE_TTL_MS); const adminName = String(req.body?.adminName || caller.name || caller.email || "EXFIN OMS Admin").slice(0, 80);
    const participants = [{ uid: caller.uid, name: adminName, role: "ADMIN", status: "HOST" }, ...participantUids.map((uid) => ({ uid, name: "Employee", role: "EMPLOYEE", status: "INVITED" }))];
    await db.collection(COLLECTION).doc(conferenceId).set({ conferenceId, title, callerUid: caller.uid, callerName: adminName, participantUids: [caller.uid, ...participantUids], participants, status: "active", createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
    const results = await Promise.all(participantUids.map((uid) => sendConferencePush(db, uid, { type: "video_conference", conferenceId, callerUid: caller.uid, callerName: adminName, title, route: "/video-calls", expiresAt: expiresAt.toISOString() }).catch((error) => ({ sent: 0, failed: 1, errors: [String(error?.message || "FCM_SEND_FAILED")] }))));
    await db.collection(COLLECTION).doc(conferenceId).update({ pushSummary: { invited: participantUids.length, sent: results.reduce((sum, item) => sum + item.sent, 0), failed: results.reduce((sum, item) => sum + item.failed, 0) } });
    return res.json({ success: true, conferenceId, title, expiresAt: expiresAt.toISOString(), participantCount: participantUids.length + 1 });
  });

  app.get("/api/video-conference/:conferenceId/snapshot", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." }); const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    const conferenceRef = db.collection(COLLECTION).doc(String(req.params.conferenceId)); const snap = await conferenceRef.get(); if (!snap.exists) return res.status(404).json({ success: false, error: "Conference not found." }); const conference = snap.data() || {};
    const participantUids = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : []; if (!participantUids.includes(caller.uid)) return res.status(403).json({ success: false, error: "You are not invited to this conference." });
    if (conference.status !== "active" || new Date(String(conference.expiresAt || 0)).getTime() <= Date.now()) return res.status(410).json({ success: false, error: "This conference has ended or expired." });
    const pubs = await db.collection(PUBLICATIONS).where("conferenceId", "==", conference.conferenceId).where("active", "==", true).limit(100).get();
    return res.json({ success: true, conference: { conferenceId: conference.conferenceId, title: conference.title, callerUid: conference.callerUid, status: conference.status, expiresAt: conference.expiresAt }, participants: Array.isArray(conference.participants) ? conference.participants : [], publications: pubs.docs.map((doc) => ({ publicationId: doc.id, ...doc.data() })) });
  });

  app.post("/api/video-conference/:conferenceId/join", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." }); const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    const conferenceRef = db.collection(COLLECTION).doc(String(req.params.conferenceId)); const snap = await conferenceRef.get(); if (!snap.exists) return res.status(404).json({ success: false, error: "Conference not found." }); const conference = snap.data() || {}; const participantUids = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : [];
    if (!participantUids.includes(caller.uid)) return res.status(403).json({ success: false, error: "You are not invited to this conference." }); if (conference.status !== "active" || new Date(String(conference.expiresAt || 0)).getTime() <= Date.now()) return res.status(410).json({ success: false, error: "This conference has ended or expired." });
    const participantName = String(req.body?.displayName || caller.name || caller.email || "EXFIN OMS user").slice(0, 80); await conferenceRef.update({ participants: (conference.participants || []).map((item: any) => String(item.uid) === caller.uid ? { ...item, name: participantName, status: "JOINED", joinedAt: new Date().toISOString() } : item) });
    return res.json({ success: true, conferenceId: conference.conferenceId, title: conference.title, callerUid: conference.callerUid, participantName });
  });

  app.post("/api/video-conference/:conferenceId/publish", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." }); const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    const conferenceSnap = await db.collection(COLLECTION).doc(String(req.params.conferenceId)).get(); if (!conferenceSnap.exists) return res.status(404).json({ success: false, error: "Conference not found." }); const conference = conferenceSnap.data() || {}; const participantUids = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : [];
    if (!participantUids.includes(caller.uid)) return res.status(403).json({ success: false, error: "You are not invited to this conference." }); if (conference.status !== "active") return res.status(410).json({ success: false, error: "Conference has ended." });
    const offer = req.body?.sessionDescription; const tracks = Array.isArray(req.body?.tracks) ? req.body.tracks : []; if (!offer?.sdp || !tracks.length) return res.status(400).json({ success: false, error: "A WebRTC offer and media tracks are required." });
    const existing = await db.collection(PUBLICATIONS).where("conferenceId", "==", conference.conferenceId).where("uid", "==", caller.uid).where("active", "==", true).limit(1).get(); if (!existing.empty) return res.status(409).json({ success: false, error: "This participant is already publishing to the conference." });
    const session = await sfuRequest("/sessions/new", { method: "POST" }); const result = await sfuRequest(`/sessions/${encodeURIComponent(session.sessionId)}/tracks/new`, { method: "POST", body: JSON.stringify({ sessionDescription: offer, tracks }) }); const returnedTracks = Array.isArray(result.tracks) ? result.tracks : [];
    await db.collection(PUBLICATIONS).doc(`${conference.conferenceId}_${caller.uid}`).set({ conferenceId: conference.conferenceId, uid: caller.uid, sessionId: session.sessionId, tracks: returnedTracks.map((item: any, index: number) => ({ trackName: String(item.trackName || tracks[index]?.trackName || ""), kind: String(item.kind || tracks[index]?.kind || ""), mid: String(item.mid || tracks[index]?.mid || "") })), active: true, updatedAt: new Date().toISOString() });
    return res.json({ success: true, sessionId: session.sessionId, sessionDescription: result.sessionDescription, tracks: returnedTracks });
  });

  app.post("/api/video-conference/:conferenceId/subscribe", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." }); const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    const conferenceSnap = await db.collection(COLLECTION).doc(String(req.params.conferenceId)).get(); if (!conferenceSnap.exists) return res.status(404).json({ success: false, error: "Conference not found." }); const conference = conferenceSnap.data() || {}; const participantUids = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : [];
    if (!participantUids.includes(caller.uid)) return res.status(403).json({ success: false, error: "You are not invited to this conference." }); if (conference.status !== "active") return res.status(410).json({ success: false, error: "Conference has ended." });
    const requested = Array.isArray(req.body?.publications) ? req.body.publications : []; const allowed = new Set(participantUids.filter((uid) => uid !== caller.uid)); const publications = requested.filter((item: any) => allowed.has(String(item?.uid || "")) && String(item?.sessionId || "") && Array.isArray(item?.tracks));
    const locators = publications.flatMap((publication: any) => publication.tracks.map((track: any) => ({ location: "remote", sessionId: String(publication.sessionId), trackName: String(track.trackName) })));
    if (!locators.length) return res.json({ success: true, empty: true, tracks: [] });
    let sessionId = String(req.body?.sessionId || "").trim(); if (!sessionId) { const session = await sfuRequest("/sessions/new", { method: "POST" }); sessionId = session.sessionId; }
    const result = await sfuRequest(`/sessions/${encodeURIComponent(sessionId)}/tracks/new`, { method: "POST", body: JSON.stringify({ tracks: locators }) });
    return res.json({ success: true, sessionId, sessionDescription: result.sessionDescription || null, requiresImmediateRenegotiation: Boolean(result.requiresImmediateRenegotiation), tracks: Array.isArray(result.tracks) ? result.tracks : [] });
  });

  app.put("/api/video-conference/:conferenceId/renegotiate", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." }); const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    const snap = await db.collection(COLLECTION).doc(String(req.params.conferenceId)).get(); if (!snap.exists) return res.status(404).json({ success: false, error: "Conference not found." }); const conference = snap.data() || {}; const members = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : [];
    if (!members.includes(caller.uid)) return res.status(403).json({ success: false, error: "You are not a conference participant." });
    const sessionId = String(req.body?.sessionId || "").trim(); const sessionDescription = req.body?.sessionDescription; if (!sessionId || !sessionDescription?.sdp) return res.status(400).json({ success: false, error: "Session ID and SDP answer are required." });
    if (!configured()) return res.status(503).json({ success: false, error: "Cloudflare Realtime SFU is not configured." });
    await sfuRequest(`/sessions/${encodeURIComponent(sessionId)}/renegotiate`, { method: "PUT", body: JSON.stringify({ sessionDescription }) }); return res.json({ success: true });
  });

  app.post("/api/video-conference/:conferenceId/leave", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." }); const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    const conferenceRef = db.collection(COLLECTION).doc(String(req.params.conferenceId)); const conferenceSnap = await conferenceRef.get(); if (!conferenceSnap.exists) return res.status(404).json({ success: false, error: "Conference not found." }); const conference = conferenceSnap.data() || {}; const participantUids = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : [];
    if (!participantUids.includes(caller.uid)) return res.status(403).json({ success: false, error: "You are not a participant." });
    if (caller.uid === String(conference.callerUid)) { await conferenceRef.update({ status: "ended", endedAt: new Date().toISOString() }); const pubs = await db.collection(PUBLICATIONS).where("conferenceId", "==", conference.conferenceId).where("active", "==", true).limit(100).get(); await Promise.all(pubs.docs.map((doc) => doc.ref.update({ active: false, endedAt: new Date().toISOString() }))); }
    else { await conferenceRef.update({ participants: (conference.participants || []).map((item: any) => String(item.uid) === caller.uid ? { ...item, status: "LEFT", leftAt: new Date().toISOString() } : item) }); await db.collection(PUBLICATIONS).doc(`${conference.conferenceId}_${caller.uid}`).set({ active: false, leftAt: new Date().toISOString() }, { merge: true }); }
    return res.json({ success: true });
  });

  app.post("/api/video-conference/:conferenceId/end", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." }); const caller = await verifyCaller(req, authAdmin); if (!caller) return res.status(401).json({ success: false, error: "Authentication required." }); if (!(await isApprovedAdmin(db, caller.uid))) return res.status(403).json({ success: false, error: "Only an active admin can end a conference." });
    const ref = db.collection(COLLECTION).doc(String(req.params.conferenceId)); const snap = await ref.get(); if (!snap.exists || String(snap.data()?.callerUid || "") !== caller.uid) return res.status(404).json({ success: false, error: "Conference not found." });
    await ref.update({ status: "ended", endedAt: new Date().toISOString() }); const pubs = await db.collection(PUBLICATIONS).where("conferenceId", "==", String(req.params.conferenceId)).where("active", "==", true).limit(100).get(); await Promise.all(pubs.docs.map((doc) => doc.ref.update({ active: false, endedAt: new Date().toISOString() })));
    return res.json({ success: true });
  });
}
