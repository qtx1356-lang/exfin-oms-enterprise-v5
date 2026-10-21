import type express from "express";
import { getMessaging } from "firebase-admin/messaging";
import type { Auth } from "firebase-admin/auth";
import type { Firestore, DocumentReference, QuerySnapshot } from "firebase-admin/firestore";

const CALL_COLLECTION = "native_webrtc_calls";
const TOKEN_COLLECTION = "push_device_tokens";
const RING_TTL_SECONDS = 60;

function bearerToken(req: express.Request): string {
  const value = String(req.headers.authorization || "");
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function verifyFirebaseCaller(req: express.Request, authAdmin: Auth) {
  const token = bearerToken(req);
  if (!token) return null;
  try { return await authAdmin.verifyIdToken(token, true); } catch { return null; }
}

async function isApprovedAdmin(db: Firestore, uid: string): Promise<boolean> {
  const admin = await db.collection("admin_users").doc(uid).get();
  if (!admin.exists) return false;
  const data = admin.data() || {};
  const role = String(data.role || "").toUpperCase();
  const status = String(data.status || data.accountStatus || "ACTIVE").toUpperCase();
  return ["SUPER_ADMIN", "ADMIN", "HR", "TEAM_LEADER"].includes(role)
    && data.active !== false
    && !["INACTIVE", "DISABLED", "SUSPENDED", "REJECTED", "PENDING"].includes(status);
}

async function sendNativeCallPush(db: Firestore, recipientUid: string, employeeCode: string, payload: Record<string, string>) {
  const candidates = new Map<string, { token: string; ref: DocumentReference }>();
  const addSnapshot = (snap: QuerySnapshot) => {
    for (const item of snap.docs) {
      const data = item.data() || {};
      const token = String(data.token || data.fcmToken || data.deviceToken || "").trim();
      if (token) candidates.set(token, { token, ref: item.ref });
    }
  };

  addSnapshot(await db.collection(TOKEN_COLLECTION).where("uid", "==", recipientUid).limit(50).get());
  if (employeeCode) addSnapshot(await db.collection(TOKEN_COLLECTION).where("employeeCode", "==", employeeCode).limit(50).get());

  const tokens = Array.from(candidates.keys());
  if (!tokens.length) return { tokenCount: 0, sent: 0, failed: 0, errors: ["NO_ANDROID_FCM_TOKEN"] };

  const response = await getMessaging().sendEachForMulticast({
    tokens,
    data: payload,
    android: { priority: "high", ttl: RING_TTL_SECONDS * 1000, collapseKey: `exfin_call_${payload.callId}` },
    fcmOptions: { analyticsLabel: "exfin-native-video-call" },
  });

  const errors: string[] = [];
  response.responses.forEach((result, index) => {
    if (!result.success) errors.push(`token-${index}: ${result.error?.code || result.error?.message || "FCM_SEND_FAILED"}`);
  });

  await Promise.all(response.responses.map(async (result, index) => {
    if (result.success) return;
    const code = String(result.error?.code || "");
    if (!/registration-token-not-registered|invalid-registration-token/i.test(code)) return;
    const entry = candidates.get(tokens[index]);
    if (entry) await entry.ref.delete().catch(() => {});
  }));

  return { tokenCount: tokens.length, sent: response.successCount, failed: response.failureCount, errors };
}

export function mountNativeWebRtcRoutes(app: express.Express, db: Firestore | null, authAdmin: Auth | null) {
  app.post("/api/native-webrtc/calls/:callId/ring", async (req, res) => {
    if (!db || !authAdmin) return res.status(503).json({ success: false, error: "Video service is not ready." });
    const caller = await verifyFirebaseCaller(req, authAdmin);
    if (!caller) return res.status(401).json({ success: false, error: "Authentication required." });
    if (!(await isApprovedAdmin(db, caller.uid))) return res.status(403).json({ success: false, error: "Only an active admin can start an employee video call." });

    const callId = String(req.params.callId || "").trim();
    if (!callId) return res.status(400).json({ success: false, error: "Call ID is required." });

    try {
      const callRef = db.collection(CALL_COLLECTION).doc(callId);
      const snapshot = await callRef.get();
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Video call signaling record was not found." });
      const call = snapshot.data() || {};
      if (String(call.callerUid || "") !== caller.uid) return res.status(403).json({ success: false, error: "You are not the caller for this signaling record." });
      if (String(call.status || "") !== "ringing") return res.status(409).json({ success: false, error: "This call is no longer ringing." });
      const recipientUid = String(call.recipientUid || "").trim();
      if (!recipientUid || recipientUid === caller.uid) return res.status(400).json({ success: false, error: "A valid employee recipient is required." });
      const expiresAt = new Date(String(call.expiresAt || "")).getTime();
      if (!expiresAt || expiresAt <= Date.now()) {
        await callRef.update({ status: "expired", expiredAt: new Date().toISOString() }).catch(() => {});
        return res.status(410).json({ success: false, error: "This call has expired." });
      }

      const employeeCode = String(call.recipientEmployeeCode || "").trim().toUpperCase();
      const push = await sendNativeCallPush(db, recipientUid, employeeCode, {
        type: "video_call", callId, callerUid: caller.uid,
        callerName: String(call.callerName || "EXFIN OMS Admin").slice(0, 80),
        title: String(call.title || "EXFIN OMS video call").slice(0, 100),
        recipientUid, employeeCode, route: "/video-calls",
      });

      await callRef.update({ pushSentAt: new Date().toISOString(), pushDelivery: push });
      return res.json({ success: push.sent > 0, callId, push });
    } catch (error: any) {
      console.error("[NativeWebRTC] Ring failed:", error?.message || error);
      return res.status(502).json({ success: false, error: "Could not deliver the employee call alert." });
    }
  });
}
