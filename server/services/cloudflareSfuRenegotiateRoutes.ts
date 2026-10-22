import type express from "express";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

const COLLECTION = "video_conferences";
const SFU_BASE = "https://rtc.live.cloudflare.com/v1";

function token(req: express.Request) { const value = String(req.headers.authorization || ""); return value.startsWith("Bearer ") ? value.slice(7).trim() : ""; }
async function caller(req: express.Request, authAdmin: Auth) { const value = token(req); if (!value) return null; try { return await authAdmin.verifyIdToken(value, true); } catch { return null; } }
function headers() { return { Authorization: `Bearer ${String(process.env.REALTIME_SFU_BEARER_TOKEN || "").trim()}`, "Content-Type": "application/json" }; }

export function mountCloudflareSfuRenegotiateRoutes(app: express.Express, db: Firestore | null, authAdmin: Auth | null) {
  app.put("/api/video-conference/:conferenceId/renegotiate", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." });
    const user = await caller(req, authAdmin);
    if (!user) return res.status(401).json({ success: false, error: "Authentication required." });
    const conferenceSnap = await db.collection(COLLECTION).doc(String(req.params.conferenceId)).get();
    if (!conferenceSnap.exists) return res.status(404).json({ success: false, error: "Conference not found." });
    const conference = conferenceSnap.data() || {};
    const members = Array.isArray(conference.participantUids) ? conference.participantUids.map(String) : [];
    if (!members.includes(user.uid)) return res.status(403).json({ success: false, error: "You are not a conference participant." });
    const sessionId = String(req.body?.sessionId || "").trim();
    const sessionDescription = req.body?.sessionDescription;
    if (!sessionId || !sessionDescription?.sdp) return res.status(400).json({ success: false, error: "Session ID and SDP answer are required." });
    if (!String(process.env.REALTIME_SFU_APP_ID || "").trim() || !String(process.env.REALTIME_SFU_BEARER_TOKEN || "").trim()) return res.status(503).json({ success: false, error: "Cloudflare Realtime SFU is not configured." });
    const response = await fetch(`${SFU_BASE}/apps/${encodeURIComponent(String(process.env.REALTIME_SFU_APP_ID).trim())}/sessions/${encodeURIComponent(sessionId)}/renegotiate`, {
      method: "PUT", headers: headers(), body: JSON.stringify({ sessionDescription }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.errorCode) return res.status(502).json({ success: false, error: body?.errorDescription || "Cloudflare Realtime renegotiation failed." });
    return res.json({ success: true });
  });
}
