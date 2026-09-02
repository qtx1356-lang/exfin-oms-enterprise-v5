import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { 
  getWhatsAppConfig, 
  saveWhatsAppConfig, 
  getWhatsAppEnvCredentials, 
  dispatchWhatsAppAttendanceNotification, 
  sendMetaWhatsAppMessage, 
  normalizePhoneNumber,
  DEFAULT_WHATSAPP_TEMPLATES,
  DEFAULT_META_TEMPLATES,
  ALLOWED_ATTENDANCE_EVENT_TYPES
} from "./server/services/whatsappService";
import {
  getDailyReportConfig,
  saveDailyReportConfig,
  generateAndSendDailyReport,
  sendDailyReportTestEmail,
  validateAdminEmails,
  checkAndRunScheduledDailyReport,
  to12HourFormat,
  to24HourFormat,
  formatDateStringFriendly,
  getKolkataCurrentMinutes,
  getKolkataDateString,
  getPreviousKolkataDateString,
  parseTimeToMinutes
} from "./server/services/dailyAdminReportService";

const OFFICE_LAT = 23.616227;
const OFFICE_LNG = 87.117063;
const GEOFENCE_RADIUS_METERS = 25.0;

// Initialize Firebase Admin
let db: Firestore | null = null;
let authAdmin: Auth | null = null;
try {
  let serviceAccount: any = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      console.warn("[Median Backend] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY JSON");
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    try {
      serviceAccount = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    } catch (e) {
      console.warn("[Median Backend] Could not read GOOGLE_APPLICATION_CREDENTIALS file");
    }
  }

  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  let projectId: string | undefined;
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    projectId = config.projectId;
  }

  if (!getApps().length) {
    if (serviceAccount) {
      initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
    } else if (projectId) {
      initializeApp({
        projectId,
      });
    } else {
      initializeApp();
    }
  }

  db = getFirestore();
  authAdmin = getAuth();
  console.log("[Median Backend] Firebase Admin Firestore & Auth initialized successfully.");
} catch (error) {
  console.error("[Median Backend] Failed to initialize Firebase Admin:", error);
}

function calculateDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getFormattedDateStr(date: Date): string {
  try {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch (e) {
    const kolkataTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    const year = kolkataTime.getUTCFullYear();
    const month = String(kolkataTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kolkataTime.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

function getFormattedTimeStr(date: Date): string {
  try {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch (e) {
    const kolkataTime = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    let hours = kolkataTime.getUTCHours();
    const minutes = String(kolkataTime.getUTCMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  }
}

function parseAttendanceTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  if (!clean || clean === 'Pending' || clean === 'N/A' || clean === 'UNRESOLVED' || clean === '--:--') {
    return null;
  }
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridian = match12[3].toUpperCase();
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (meridian === 'AM') {
      if (hours === 12) hours = 0;
    } else if (meridian === 'PM') {
      if (hours < 12) hours += 12;
    }
    return hours * 60 + minutes;
  }
  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}

function calculateWorkingHours(checkInTimeStr: string | null | undefined, checkOutTimeStr: string | null | undefined): string | null {
  if (!checkInTimeStr || !checkOutTimeStr) return null;
  const inMins = parseAttendanceTimeToMinutes(checkInTimeStr);
  const outMins = parseAttendanceTimeToMinutes(checkOutTimeStr);
  if (inMins === null || outMins === null || outMins < inMins) return null;
  const diffMins = outMins - inMins;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return `${h}h ${m}m`;
}

let firestoreAdminNoticeLogged = false;

async function runServerAttendanceFinalizer() {
  if (!db) return;
  try {
    const now = new Date();
    // Deterministic Asia/Kolkata timezone resolution
    const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const nowKolkata = new Date(kolkataStr);
    
    const year = nowKolkata.getFullYear();
    const month = String(nowKolkata.getMonth() + 1).padStart(2, "0");
    const day = String(nowKolkata.getDate()).padStart(2, "0");
    const todayKolkataStr = `${year}-${month}-${day}`;
    
    const hours = nowKolkata.getHours();
    const minutes = nowKolkata.getMinutes();

    // 11:59 PM (23:59) is the attendance day settlement boundary
    const isEndOfDay = hours === 23 && minutes >= 59;

    // Fetch active/unsettled attendance documents
    const qSnap = await db.collection("attendance")
      .where("checkoutStatus", "in", ["Pending", "PENDING_CONFIRMATION", null])
      .limit(100)
      .get()
      .catch(async (queryErr: any) => {
        if (queryErr?.code === 7 || queryErr?.message?.includes("PERMISSION_DENIED") || queryErr?.message?.includes("7 PERMISSION_DENIED")) {
          throw queryErr;
        }
        return await db!.collection("attendance").where("checkOutTime", "==", null).limit(100).get();
      });

    if (qSnap.empty) return;

    for (const docSnap of qSnap.docs) {
      const data = docSnap.data();
      if (!data) continue;

      // 1. If genuine completed checkout already exists, preserve it completely
      if (data.checkOutTime && data.checkoutStatus === "COMPLETED") continue;
      if (data.manualRectified || data.isAdminRectified || data.correctedAt) continue;

      const recDate = data.date;
      if (!recDate) continue;

      const isPastDay = recDate < todayKolkataStr;
      const isToday = recDate === todayKolkataStr;

      // Settle today's records only at/after 23:59 Asia/Kolkata, or past days immediately
      if (!isPastDay && (!isToday || !isEndOfDay)) {
        continue;
      }

      // 2. Determine checkout time strictly adhering to priority:
      // Priority 1: Genuine manual checkout (already handled above)
      // Priority 2: Genuine GPS/native geofence exit observation (e.g. 6:40 PM exit preserved)
      // Priority 3: Existing valid automatic checkout
      // Priority 4: 11:59 PM end-of-day settlement boundary
      const genuineExitTime = data.geofenceExitTime || data.lastExitTime || data.exitTime;
      let finalCheckoutTime: string;
      let resolutionSource: string;

      if (genuineExitTime && genuineExitTime !== "Pending" && genuineExitTime !== "N/A" && genuineExitTime !== "UNRESOLVED") {
        // Genuine GPS observation preserved - DO NOT overwrite with 11:59 PM
        finalCheckoutTime = genuineExitTime;
        resolutionSource = "AUTO_GEOFENCE";
      } else {
        // Day-end settlement boundary at 11:59 PM
        finalCheckoutTime = "11:59 PM";
        resolutionSource = "AUTO_SYSTEM";
      }

      const workingHours = calculateWorkingHours(data.checkInTime, finalCheckoutTime);
      const cleanTimeKey = finalCheckoutTime.replace(/[^a-zA-Z0-9]/g, "_");
      const eventId = `evt_srv_final_${data.employeeId}_${recDate}_${cleanTimeKey}`;

      await docSnap.ref.update({
        checkOutTime: finalCheckoutTime,
        checkoutStatus: "COMPLETED",
        checkOutMode: "AUTO_SYSTEM",
        checkoutType: "AUTO_CHECKOUT",
        status: "completed",
        workingHours: workingHours,
        currentState: "FINALIZED_CHECKOUT",
        resolutionSource: resolutionSource,
        evidenceSource: "SERVER_FINALIZATION",
        updatedAt: new Date().toISOString(),
        serverSyncTime: new Date().toISOString(),
        serverSyncTimestamp: FieldValue.serverTimestamp(),
        processedEvents: FieldValue.arrayUnion(eventId)
      });

      console.log(`[ServerFinalizer] Settled attendance for ${data.employeeId} on ${recDate} at ${finalCheckoutTime} (Evidence: SERVER_FINALIZATION, Source: ${resolutionSource})`);
    }
  } catch (err: any) {
    if (err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.message?.includes("7 PERMISSION_DENIED")) {
      if (!firestoreAdminNoticeLogged) {
        console.log("[ServerFinalizer] Standby: Firebase Admin service account not configured. Client-side engines manage real-time attendance settlement.");
        firestoreAdminNoticeLogged = true;
      }
      return;
    }
    console.warn("[ServerFinalizer] Error during background finalizer run:", err?.message || err);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // CORS Middleware for Cloudflare Pages and cross-origin frontend apps
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, Accept, Origin");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, Accept, Origin");
    }

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    next();
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      service: "EXFIN OMS API",
      firebaseAdminInitialized: !!db,
      firebaseAuthInitialized: !!authAdmin,
      timestamp: new Date().toISOString(),
      environment: "production"
    });
  });

  // Helper to extract and verify Firebase Admin ID token (Admins & Employees)
  async function verifyCaller(req: express.Request): Promise<{
    uid: string;
    email?: string;
    role: string;
    loginId?: string;
    employeeId?: string;
    employeeCode?: string;
    isAdmin: boolean;
    isSuperAdmin: boolean;
  } | null> {
    if (!authAdmin || !db) return null;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1].trim();
    try {
      const decoded = await authAdmin.verifyIdToken(token);
      const uid = decoded.uid;

      // 1. Check admin_users collection
      const adminSnap = await db.collection("admin_users").doc(uid).get();
      if (adminSnap.exists) {
        const data = adminSnap.data() || {};
        const role = data.role || "EMPLOYEE";
        return {
          uid,
          email: data.email || decoded.email,
          role,
          loginId: data.loginId || "",
          isAdmin: role === "SUPER_ADMIN" || role === "ADMIN" || role === "HR" || role === "TEAM_LEADER",
          isSuperAdmin: role === "SUPER_ADMIN"
        };
      }

      // 2. Check registrations collection for employee identification
      let employeeId = uid;
      let employeeCode = "";
      const regSnap = await db.collection("registrations").doc(uid).get();
      if (regSnap.exists) {
        const rData = regSnap.data() || {};
        employeeId = regSnap.id;
        employeeCode = rData.employeeCode || "";
      } else {
        const qSnap = await db.collection("registrations").where("uid", "==", uid).limit(1).get();
        if (!qSnap.empty) {
          employeeId = qSnap.docs[0].id;
          employeeCode = qSnap.docs[0].data().employeeCode || "";
        } else if (decoded.email) {
          const qEmail = await db.collection("registrations").where("email", "==", decoded.email).limit(1).get();
          if (!qEmail.empty) {
            employeeId = qEmail.docs[0].id;
            employeeCode = qEmail.docs[0].data().employeeCode || "";
          }
        }
      }

      return {
        uid,
        email: decoded.email,
        role: "EMPLOYEE",
        loginId: "",
        employeeId,
        employeeCode,
        isAdmin: false,
        isSuperAdmin: false
      };
    } catch (err) {
      console.error("[Backend Auth] Token verification failed:", err);
      return null;
    }
  }

  // Backward compatibility alias for existing admin routes
  const verifyAdminCaller = verifyCaller;

  // 1. Super-Admin Reset / Generate Temporary Password for Administrator
  app.post("/api/admin/super-admin/reset-password", async (req, res) => {
    try {
      if (!authAdmin || !db) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }

      const caller = await verifyAdminCaller(req);
      if (!caller || caller.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Unauthorized. Super-Admin authorization is required." });
      }

      const { targetUid, temporaryPassword, mustChangePassword } = req.body || {};
      if (!targetUid || typeof targetUid !== "string") {
        return res.status(400).json({ error: "Missing or invalid targetUid." });
      }

      // Check target admin user in Firestore or Auth
      const targetDocRef = db.collection("admin_users").doc(targetUid);
      const targetDoc = await targetDocRef.get();

      // Generate or sanitize temporary password
      let finalTempPassword = typeof temporaryPassword === "string" && temporaryPassword.trim().length >= 8
        ? temporaryPassword.trim()
        : null;

      if (!finalTempPassword) {
        // Auto-generate strong 10-char temporary password
        const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const lower = "abcdefghijkmnopqrstuvwxyz";
        const digits = "23456789";
        const special = "!@#$%&*";
        let pass = "";
        pass += upper.charAt(Math.floor(Math.random() * upper.length));
        pass += lower.charAt(Math.floor(Math.random() * lower.length));
        pass += digits.charAt(Math.floor(Math.random() * digits.length));
        pass += special.charAt(Math.floor(Math.random() * special.length));
        const allChars = upper + lower + digits + special;
        for (let i = 0; i < 6; i++) {
          pass += allChars.charAt(Math.floor(Math.random() * allChars.length));
        }
        finalTempPassword = pass.split("").sort(() => 0.5 - Math.random()).join("");
      }

      // Update password in Firebase Auth
      await authAdmin.updateUser(targetUid, {
        password: finalTempPassword,
      });

      const nowIso = new Date().toISOString();
      const targetData = targetDoc.exists ? targetDoc.data() || {} : {};

      // Update admin_users document in Firestore
      await targetDocRef.set({
        mustChangePassword: mustChangePassword !== false,
        passwordResetAt: nowIso,
        passwordResetBy: caller.loginId || caller.email || caller.uid,
        temporaryPasswordAssignedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: caller.loginId || caller.email || caller.uid,
      }, { merge: true });

      // Record in audit logs
      await db.collection("audit_logs").add({
        actorEmail: caller.email || caller.loginId || "super_admin",
        actorUid: caller.uid,
        action: "ADMIN_PASSWORD_RESET_BY_SUPER_ADMIN",
        targetType: "USER",
        targetId: targetUid,
        newValue: {
          targetLoginId: targetData.loginId || targetUid,
          targetEmail: targetData.email || "",
          mustChangePassword: mustChangePassword !== false,
          resetAt: nowIso,
        },
        timestamp: nowIso,
        createdAtServer: FieldValue.serverTimestamp(),
      });

      console.log(`[Admin Backend] Password reset executed by Super-Admin ${caller.loginId || caller.uid} for target ${targetData.loginId || targetUid}`);

      return res.json({
        success: true,
        temporaryPassword: finalTempPassword,
        targetUid,
        targetLoginId: targetData.loginId || "",
        targetEmail: targetData.email || "",
        mustChangePassword: mustChangePassword !== false,
        message: "Administrator password reset successfully."
      });
    } catch (err: any) {
      console.error("[Admin Backend] Error resetting admin password:", err);
      return res.status(500).json({ error: err.message || "Failed to reset administrator password." });
    }
  });

  // 2. Super-Admin List of Administrator Accounts with Security Status
  app.get("/api/admin/super-admin/admin-users", async (req, res) => {
    try {
      if (!authAdmin || !db) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }

      const caller = await verifyAdminCaller(req);
      if (!caller || caller.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Unauthorized. Super-Admin authorization is required." });
      }

      const snap = await db.collection("admin_users").get();
      const adminUsers = snap.docs.map(doc => {
        const data = doc.data();
        return {
          uid: doc.id,
          loginId: data.loginId || doc.id,
          email: data.email || "",
          displayName: data.displayName || data.name || data.loginId || "",
          role: data.role || "ADMIN",
          active: data.active !== false && data.status !== "Suspended",
          status: data.status || (data.active !== false ? "Approved" : "Suspended"),
          authorizedOffice: data.authorizedOffice || "ALL",
          mustChangePassword: !!data.mustChangePassword,
          passwordChangedAt: data.passwordChangedAt || null,
          passwordResetAt: data.passwordResetAt || null,
          passwordResetBy: data.passwordResetBy || null,
          temporaryPasswordAssignedAt: data.temporaryPasswordAssignedAt || null,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy,
        };
      });

      return res.json({
        success: true,
        adminUsers,
      });
    } catch (err: any) {
      console.error("[Admin Backend] Error fetching admin users list:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch admin users list." });
    }
  });

  // 3. Admin Self Password Changed Notification
  app.post("/api/admin/password-changed", async (req, res) => {
    try {
      if (!authAdmin || !db) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }

      const caller = await verifyAdminCaller(req);
      if (!caller) {
        return res.status(401).json({ error: "Unauthorized. Please sign in." });
      }

      const nowIso = new Date().toISOString();
      const targetDocRef = db.collection("admin_users").doc(caller.uid);
      await targetDocRef.set({
        mustChangePassword: false,
        passwordChangedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: caller.loginId || caller.email || caller.uid,
      }, { merge: true });

      await db.collection("audit_logs").add({
        actorEmail: caller.email || caller.loginId || "admin",
        actorUid: caller.uid,
        action: "ADMIN_PASSWORD_CHANGED_BY_USER",
        targetType: "USER",
        targetId: caller.uid,
        newValue: {
          mustChangePassword: false,
          passwordChangedAt: nowIso,
        },
        timestamp: nowIso,
        createdAtServer: FieldValue.serverTimestamp(),
      });

      return res.json({ success: true, message: "Password status updated successfully." });
    } catch (err: any) {
      console.error("[Admin Backend] Error updating password status:", err);
      return res.status(500).json({ error: err.message || "Failed to update password status." });
    }
  });

  // App Version Config endpoint
  app.get("/api/app-version", async (req, res) => {
    try {
      let versionConfig = {
        latestVersionCode: 1,
        latestVersionName: "1.0.0",
        minimumSupportedVersionCode: 1,
        updateUrl: "",
        releaseNotes: "",
        published: false,
        forceUpdate: false,
        nativeAppAvailable: false,
        nativeAppDownloadUrl: "",
        nativeAppLandingUrl: ""
      };

      if (db) {
        try {
          const doc = await db.collection("app_config").doc("version").get();
          if (doc.exists) {
            const data = doc.data();
            if (data) {
              versionConfig = { ...versionConfig, ...data };
            }
          }
        } catch (e: any) {
          // Fallback gracefully if app_config collection doesn't exist or permission denied
          if (!e?.message?.includes('PERMISSION_DENIED')) {
            console.warn("[AppVersion] Could not fetch version config from Firestore, using default:", e?.message || e);
          }
        }
      }

      return res.json(versionConfig);
    } catch (err: any) {
      console.error("[AppVersion] Error serving app version:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch version config" });
    }
  });

  // Welcome Screen High-Quality Female Voice Greeting Endpoint (Aoede female voice)
  const greetingAudioCache = new Map<string, { audioBase64: string; timestamp: number }>();
  app.post("/api/tts/welcome", async (req, res) => {
    try {
      const { text } = req.body || {};
      const cleanText = typeof text === "string" ? text.trim() : "";
      
      if (!cleanText || cleanText.length > 100) {
        return res.status(400).json({ error: "Invalid greeting text parameter" });
      }

      // Check in-memory server cache first
      const cached = greetingAudioCache.get(cleanText.toLowerCase());
      if (cached && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
        return res.json({ audioBase64: cached.audioBase64, cached: true });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }

      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: cleanText,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede" // Natural, professional warm female voice
              }
            }
          }
        }
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        return res.status(502).json({ error: "Failed to generate audio stream from voice model" });
      }

      greetingAudioCache.set(cleanText.toLowerCase(), {
        audioBase64,
        timestamp: Date.now()
      });

      return res.json({ audioBase64, cached: false });
    } catch (err: any) {
      console.warn("[TTS Welcome] Server voice generation error:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Internal voice generation error" });
    }
  });

  // Flow 2 — Real Notification / Alert Voice Endpoint (Aoede female voice)
  const notificationAudioCache = new Map<string, { audioBase64: string; timestamp: number }>();
  app.post("/api/tts/notification", async (req, res) => {
    try {
      const { text } = req.body || {};
      const cleanText = typeof text === "string" ? text.trim() : "";
      
      if (!cleanText || cleanText.length > 250) {
        return res.status(400).json({ error: "Invalid notification text parameter (must be 1-250 chars)" });
      }

      // Check in-memory server cache first
      const cached = notificationAudioCache.get(cleanText.toLowerCase());
      if (cached && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
        return res.json({ audioBase64: cached.audioBase64, cached: true });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }

      const ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: cleanText,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede" // Natural, professional warm female voice
              }
            }
          }
        }
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        return res.status(502).json({ error: "Failed to generate audio stream from voice model" });
      }

      notificationAudioCache.set(cleanText.toLowerCase(), {
        audioBase64,
        timestamp: Date.now()
      });

      return res.json({ audioBase64, cached: false });
    } catch (err: any) {
      console.warn("[TTS Notification] Server voice generation error:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Internal voice generation error" });
    }
  });

  // Secure Median Background Location POST endpoint
  app.post("/api/median-background-location", async (req, res) => {
    try {
      const payload = req.body || {};
      const query = req.query || {};

      const latitude = typeof payload.latitude === "number" ? payload.latitude : parseFloat(query.lat as string || "0");
      const longitude = typeof payload.longitude === "number" ? payload.longitude : parseFloat(query.lng as string || "0");
      const employeeId = (payload.employeeId || query.emp || payload.customData?.employeeId || "").toString().trim();
      const accuracy = typeof payload.accuracy === "number" ? payload.accuracy : (payload.horizontalAccuracy || 0);
      const source = payload.source || query.source || "MEDIAN_BACKGROUND_LOCATION";

      // 1. Validate employee identity presence
      if (!employeeId || employeeId === "ANONYMOUS" || employeeId === "SYSTEM") {
        console.warn("[Median Backend] Rejected request due to missing or anonymous employee identity.");
        return res.status(400).json({ error: "Missing or invalid employee identity" });
      }

      const eventTypeParam = payload.eventType || (payload.transition === "EXIT" ? "EXIT" : payload.transition === "ENTER" ? "ENTER" : null);
      const isLocationUnavailable = !!payload.locationUnavailable || (typeof latitude !== "number" || isNaN(latitude) || (latitude === 0 && longitude === 0));

      // 2. Validate coordinates bounds & values
      if (isLocationUnavailable && eventTypeParam) {
        // Legitimate transition but location is unavailable. This is acceptable under fallback requirements.
      } else {
        if (
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          isNaN(latitude) ||
          isNaN(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180 ||
          (latitude === 0 && longitude === 0)
        ) {
          console.warn(`[Median Backend] Rejected invalid coordinates from ${employeeId}: lat=${latitude}, lng=${longitude}`);
          return res.status(400).json({ error: "Invalid coordinates provided" });
        }
      }

      // 3. Validate timestamp sanity
      const tsInput = payload.timestamp || query.ts;
      let tsDate = new Date();
      if (tsInput) {
        const parsedDate = new Date(tsInput);
        if (!isNaN(parsedDate.getTime())) {
          tsDate = parsedDate;
        }
      }
      
      // Reject dates in the future or extreme past (older than 24 hours)
      const nowMs = Date.now();
      const tsMs = tsDate.getTime();
      if (tsMs > nowMs + 300000) { // 5 minutes buffer
        console.warn(`[Median Backend] Rejected future timestamp from ${employeeId}: ${tsDate.toISOString()}`);
        return res.status(400).json({ error: "Timestamp cannot be in the future" });
      }
      if (nowMs - tsMs > 86400000) { // 24 hours
        console.warn(`[Median Backend] Rejected stale timestamp (>24h) from ${employeeId}: ${tsDate.toISOString()}`);
        return res.status(400).json({ error: "Stale background location data ignored" });
      }

      if (!db) {
        console.error("[Median Backend] Firebase Admin not initialized. Cannot process persistence.");
        return res.status(503).json({ error: "Database service temporarily unavailable" });
      }

      // 4. Validate registration and active authorization status
      const empRef = db.collection("registrations").doc(employeeId);
      const empSnap = await empRef.get();
      if (!empSnap.exists) {
        console.warn(`[Median Backend] Unauthorized: Employee document '${employeeId}' does not exist in registrations.`);
        return res.status(401).json({ error: "Unauthorized: Employee record does not exist" });
      }

      const empData = empSnap.data() || {};
      const regStatus = empData.status || "Pending Approval";
      const isDeleted = empData.isDeleted || regStatus === "Deleted";

      if (
        regStatus !== "Approved" ||
        isDeleted ||
        regStatus === "Suspended" ||
        regStatus === "Blocked" ||
        regStatus === "INACTIVE"
      ) {
        console.warn(`[Median Backend] Forbidden: Employee '${employeeId}' has status '${regStatus}' (isDeleted: ${isDeleted}).`);
        return res.status(403).json({ error: "Forbidden: Employee is suspended, deleted, or unapproved" });
      }

      const employeeName = empData.name || "Employee";
      const townCity = empData.townCity || "Raniganj HQ";

      // Calculate distance to office authoritatively (ignoring client-supplied distance/isInside/isExit/geofenceState)
      const distance = isLocationUnavailable ? null : calculateDistanceInMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
      
      let isInside = false;
      let isExit = false;
      if (isLocationUnavailable) {
        isInside = false;
        isExit = false;
      } else {
        isInside = distance !== null && distance <= GEOFENCE_RADIUS_METERS;
        isExit = distance !== null && distance > GEOFENCE_RADIUS_METERS;
      }

      console.log(`[Median Backend] Location payload validated for ${employeeName} (${employeeId}): Lat/Lng=${isLocationUnavailable ? "Unavailable" : `(${latitude.toFixed(6)}, ${longitude.toFixed(6)})`} - Distance: ${distance !== null ? `${Math.round(distance)}m` : "Unavailable"} - Inside: ${isInside} - EventType: ${eventTypeParam || "PERIODIC"}`);

      // 5. Persist to live_locations/{employeeId}
      const liveDocRef = db.collection("live_locations").doc(employeeId);
      await liveDocRef.set({
        employeeId,
        employeeName,
        latitude: isLocationUnavailable ? null : latitude,
        longitude: isLocationUnavailable ? null : longitude,
        accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
        distanceFromOffice: isLocationUnavailable ? "location unavailable" : distance,
        townCity,
        timestamp: tsDate.toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 6. Check Active Attendance and perform INSIDE/OUTSIDE state transitions in a transaction
      const dateStr = getFormattedDateStr(tsDate);
      const timeStr = getFormattedTimeStr(tsDate);
      const attDocId = `${employeeId}_${dateStr}`;
      const attDocRef = db.collection("attendance").doc(attDocId);

      let transitionRecorded = false;
      let targetState = "UNCHANGED";

      await db.runTransaction(async (transaction) => {
        const attSnap = await transaction.get(attDocRef);
        const eventIso = tsDate.toISOString();

        if (!attSnap.exists) {
          // Background Auto Check-In Path: If no daily attendance record exists yet,
          // create canonical check-in document if this is a valid native ENTRY event inside the 25m office geofence.
          const isEntryEvent = isInside || eventTypeParam === "ENTER" || eventTypeParam === "GEOFENCE_TRANSITION_ENTER" || eventTypeParam === "GEOFENCE_RETURN";
          const isWithinBoundary = isInside || (distance !== null && distance <= GEOFENCE_RADIUS_METERS);

          if (isEntryEvent && isWithinBoundary) {
            console.log(`[BackgroundAttendance] GEOFENCE_ENTRY detected for ${employeeName} (${employeeId})`);
            console.log(`[BackgroundAttendance] VALIDATED entry location: Lat=${latitude}, Lng=${longitude}, Dist=${distance !== null ? `${Math.round(distance)}m` : "N/A"}`);

            const eventId = payload.eventId || `evt_bg_CHECK_IN_${employeeId}_${dateStr}_${timeStr.replace(/\s+/g, "_")}`;
            const attUuid = payload.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

            console.log(`[BackgroundAttendance] CHECKIN_REQUEST processing for canonical document ${attDocId}`);

            const newRecord: any = {
              id: attUuid,
              docId: attDocId,
              employeeId: employeeId,
              employeeName: employeeName,
              date: dateStr,
              attendanceType: "OFFICE",
              checkInTime: timeStr,
              checkOutTime: null,
              workingHours: null,
              latitude: isLocationUnavailable ? null : latitude,
              longitude: isLocationUnavailable ? null : longitude,
              distance: isLocationUnavailable ? "location unavailable" : distance,
              townCity: townCity,
              checkInMode: "AUTO",
              checkOutMode: "N/A",
              exitTime: null,
              returnTime: null,
              reason: null,
              createdAtDeviceTime: eventIso,
              syncStatus: "Synced",
              serverSyncTime: new Date().toISOString(),
              serverSyncTimestamp: FieldValue.serverTimestamp(),
              updatedAt: new Date().toISOString(),
              isOffline: false,
              reminderCount: 0,
              currentState: "CHECKED_IN",
              processedEvents: [eventId],

              // Permanent Check-In Location
              checkInLatitude: isLocationUnavailable ? null : latitude,
              checkInLongitude: isLocationUnavailable ? null : longitude,
              checkInDistance: isLocationUnavailable ? "location unavailable" : distance,
              checkInTownCity: townCity,

              // Dynamic Current Location
              currentLatitude: isLocationUnavailable ? null : latitude,
              currentLongitude: isLocationUnavailable ? null : longitude,
              currentDistance: isLocationUnavailable ? "location unavailable" : distance,
              currentTownCity: townCity,
              currentLocationTimestamp: eventIso,
              currentLocationStatus: "LIVE"
            };

            transaction.set(attDocRef, newRecord);

            // Write audit event to attendance_events tracking collection
            const eventRef = db!.collection("attendance_events").doc(eventId);
            transaction.set(eventRef, {
              eventId,
              employeeId,
              attendanceDate: dateStr,
              eventType: "CHECK_IN",
              eventTime: timeStr,
              location: {
                latitude: isLocationUnavailable ? null : latitude,
                longitude: isLocationUnavailable ? null : longitude,
                townCity,
                distance: isLocationUnavailable ? "location unavailable" : distance
              },
              attendanceMode: "OFFICE",
              source: source || "NATIVE_GEOFENCE_ENTER",
              syncStatus: "Synced",
              syncedAt: new Date().toISOString(),
              serverSyncTime: FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`[BackgroundAttendance] CHECKIN_CREATED: Daily attendance document ${attDocId} created with checkInTime ${timeStr}`);
            console.log(`[BackgroundAttendance] CHECKIN_SYNCED: Synced to Firestore for employee ${employeeId}`);
            transitionRecorded = true;
            targetState = "CHECKED_IN";
          } else {
            console.log(`[BackgroundAttendance] No existing attendance for ${employeeId} on ${dateStr}, payload is not an entry event inside geofence (isInside: ${isInside}, distance: ${distance}m). Skipping.`);
          }
          return;
        }

        console.log(`[BackgroundAttendance] CHECKIN_ALREADY_EXISTS for ${employeeId} on ${dateStr}`);
        const record = attSnap.data() || {};

        // If the record has already been finalized/checked out, do not perform automatic transitions.
        if (record.checkOutTime && record.checkOutTime !== "--:--" && record.checkoutStatus === "COMPLETED") {
          return;
        }

        const currentState = record.currentState || "CHECKED_IN";

        // Idempotency: Create a unique event ID based on type and timestamp to prevent duplicates
        const eventType = isInside ? "GEOFENCE_RETURN" : "GEOFENCE_EXIT";
        const eventId = payload.eventId || `evt_${employeeId}_${dateStr}_${eventType}_${timeStr.replace(/\s+/g, "_")}`;

        if (record.processedEvents?.includes(eventId)) {
          console.log(`[BackgroundAttendance] DUPLICATE_SUPPRESSED: Event ${eventId} already processed for ${attDocId}`);
          return;
        }

        const updatedProcessedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));
        let modified = false;

        if (!isInside) {
          console.log(`[BackgroundAttendance] GEOFENCE_EXIT detected for ${employeeId} on ${dateStr}`);
          // Geofence exit transition (INSIDE -> OUTSIDE)
          if (currentState === "CHECKED_IN" || currentState === "ENTERING" || currentState === "RETURNING_TO_OFFICE") {
            const existingTimestampMs = record.geofenceExitTimestamp ? new Date(record.geofenceExitTimestamp).getTime() : Infinity;
            const newTimestampMs = tsDate.getTime();

            if (!record.geofenceExitTime || !record.recordedExitTime || newTimestampMs < existingTimestampMs || currentState === "RETURNING_TO_OFFICE") {
              record.lastExitTime = timeStr;
              record.exitTime = record.exitTime || timeStr;
              record.geofenceExitTime = timeStr;
              record.geofenceExitTimestamp = eventIso;
              record.recordedExitTime = timeStr;
              record.exitDetectedAt = eventIso;
              record.exitDetectedTime = timeStr;
              record.exitDetectionSource = "NATIVE_GEOFENCE";
            }
            record.pendingCheckoutConfirmation = true;
            record.returningToOffice = false;
            record.currentState = "PENDING_EXIT_CONFIRMATION";
            
            if (!isLocationUnavailable) {
              record.checkoutLatitude = latitude;
              record.checkoutLongitude = longitude;
              record.checkoutDistance = distance;
            } else {
              record.checkoutLocationUnavailable = true;
              record.checkoutDistance = "location unavailable";
            }
            record.checkoutTownCity = townCity;

            record.processedEvents = updatedProcessedEvents;
            record.syncStatus = "Synced";
            record.updatedAt = new Date().toISOString();
            record.serverSyncTime = new Date().toISOString();
            record.serverSyncTimestamp = FieldValue.serverTimestamp();

            modified = true;
            targetState = "PENDING_EXIT_CONFIRMATION";
            transitionRecorded = true;
            console.log(`[BackgroundAttendance] EXIT_SYNCED: Recorded geofence exit for ${employeeId} at ${timeStr}`);
          }
        } else {
          // Return to office transition (OUTSIDE -> INSIDE)
          if (
            currentState === "PENDING_FINAL_EXIT" ||
            currentState === "PENDING_EXIT_CONFIRMATION" ||
            currentState === "RETURNING_TO_OFFICE" ||
            record.pendingCheckoutConfirmation ||
            record.lastExitTime ||
            record.exitTime ||
            record.geofenceExitTime
          ) {
            record.returnTime = timeStr;
            record.lastExitTime = null;
            record.exitTime = null;
            record.geofenceExitTime = null;
            record.geofenceExitTimestamp = null;
            record.pendingCheckoutConfirmation = false;
            record.returningToOffice = false;
            record.currentState = "CHECKED_IN";

            // Remove candidate exit fields cleanly
            record.checkoutLatitude = FieldValue.delete();
            record.checkoutLongitude = FieldValue.delete();
            record.checkoutDistance = FieldValue.delete();
            record.checkoutTownCity = FieldValue.delete();

            record.processedEvents = updatedProcessedEvents;
            record.syncStatus = "Synced";
            record.updatedAt = new Date().toISOString();
            record.serverSyncTime = new Date().toISOString();
            record.serverSyncTimestamp = FieldValue.serverTimestamp();

            modified = true;
            targetState = "CHECKED_IN";
            transitionRecorded = true;
          }
        }

        if (modified) {
          transaction.update(attDocRef, record);

          // Write to attendance_events tracking collection for auditing
          const eventRef = db!.collection("attendance_events").doc(eventId);
          transaction.set(eventRef, {
            eventId,
            employeeId,
            attendanceDate: dateStr,
            eventType,
            eventTime: timeStr,
            location: {
              latitude: isLocationUnavailable ? null : latitude,
              longitude: isLocationUnavailable ? null : longitude,
              townCity,
              distance: isLocationUnavailable ? "location unavailable" : distance
            },
            attendanceMode: record.attendanceType || "OFFICE",
            source: "AUTO_GEOFENCE",
            syncStatus: "Synced",
            syncedAt: new Date().toISOString(),
            serverSyncTime: FieldValue.serverTimestamp()
          }, { merge: true });
        }
      });

      if (transitionRecorded) {
        console.log(`[Median Backend] Transition successful for ${employeeName} to state: ${targetState} (Distance: ${isLocationUnavailable ? "unavailable" : `${Math.round(distance!)}m`})`);
        
        // Auxiliary WhatsApp notification trigger for background geofence events
        if (db) {
          try {
            const isEntry = targetState === "CHECKED_IN";
            const eventType = isEntry ? "AUTO_CHECK_IN" : "OUTSIDE_OFFICE";
            const eventId = `evt_bg_${employeeId}_${dateStr}_${eventType}_${timeStr.replace(/\s+/g, '_')}`;

            dispatchWhatsAppAttendanceNotification(db, {
              eventId,
              eventType,
              employeeId,
              employeeCode: employeeId,
              employeeName,
              attendanceType: "OFFICE",
              checkInTime: timeStr,
              distance: isLocationUnavailable ? 0 : Math.round(distance!),
              townCity: townCity || "Raniganj HQ",
              eventTime: timeStr
            }).catch((waErr) => {
              console.warn("[BackgroundAttendance] Auxiliary WhatsApp dispatch warning (non-fatal):", waErr);
            });
          } catch (waTriggerErr) {
            console.warn("[BackgroundAttendance] Non-fatal WhatsApp trigger error:", waTriggerErr);
          }
        }
      }

      return res.json({
        success: true,
        processed: true,
        employeeId,
        employeeName,
        distanceMeters: isLocationUnavailable ? null : Math.round(distance!),
        isInsideGeofence: isInside,
        isExitCandidate: isExit,
        geofenceRadius: GEOFENCE_RADIUS_METERS,
        transitionOccurred: transitionRecorded,
        newState: targetState,
        source,
        timestamp: tsDate.toISOString(),
        accuracy
      });
    } catch (err: any) {
      console.error("[Median Backend] Error processing background location:", err);
      return res.status(500).json({ error: "Internal server error processing location" });
    }
  });

  // Secure /api/background-location alias endpoint matching Median background configuration
  app.post("/api/background-location", async (req, res) => {
    // Delegate to the robust median-background-location handler
    req.url = "/api/median-background-location";
    return app._router.handle(req, res);
  });

  // GET /api/attendance/today — Returns today's authoritative attendance state for the authenticated employee
  app.get("/api/attendance/today", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    try {
      const employeeId = (req.query.employeeId || caller.employeeId || caller.uid || "").toString().trim();
      const todayStr = new Date().toISOString().substring(0, 10);
      const attDocId = `${employeeId}_${todayStr}`;

      const attSnap = await db.collection("attendance").doc(attDocId).get();
      const liveSnap = await db.collection("live_locations").doc(employeeId).get();

      let liveData = liveSnap.exists ? liveSnap.data() || {} : {};
      let attData = attSnap.exists ? attSnap.data() || {} : {};

      return res.json({
        date: todayStr,
        employeeId,
        currentGeofenceState: liveData.distanceFromOffice !== undefined && typeof liveData.distanceFromOffice === "number" ? (liveData.distanceFromOffice <= 25 ? "INSIDE" : "OUTSIDE") : "UNKNOWN",
        currentDistanceMeters: liveData.distanceFromOffice ?? null,
        lastLocationAt: liveData.timestamp || null,
        checkInAt: attData.checkInTime || null,
        checkOutAt: attData.checkOutTime || attData.exitTime || null,
        workedDuration: attData.workingHours || "00:00:00",
        attendanceSource: attData.checkInMode || "AUTOMATIC_GEOFENCE",
        status: attData.currentState || (attData.checkInTime ? "CHECKED_IN" : "ABSENT")
      });
    } catch (err: any) {
      console.error("[Attendance Today API] Error:", err);
      return res.status(500).json({ error: "Internal server error fetching today's attendance" });
    }
  });

  // GET /api/attendance/latest — Returns latest attendance event for employee (used by Welcome screen)
  app.get("/api/attendance/latest", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    try {
      const employeeId = (req.query.employeeId || caller.employeeId || caller.uid || "").toString().trim();
      const eventsSnap = await db.collection("attendance_events")
        .where("employeeId", "==", employeeId)
        .orderBy("serverSyncTime", "desc")
        .limit(1)
        .get();

      if (eventsSnap.empty) {
        // Fallback to today's attendance doc
        const todayStr = new Date().toISOString().substring(0, 10);
        const attSnap = await db.collection("attendance").doc(`${employeeId}_${todayStr}`).get();
        if (attSnap.exists) {
          const data = attSnap.data() || {};
          return res.json({
            eventType: data.checkOutTime ? "CHECK_OUT" : "CHECK_IN",
            timestamp: data.updatedAt || new Date().toISOString(),
            timeStr: data.checkOutTime || data.checkInTime || "No attendance yet",
            source: "AUTOMATIC_GEOFENCE"
          });
        }
        return res.json({ eventType: "NONE", timestamp: null, timeStr: "No attendance yet", source: "NONE" });
      }

      const latestEvent = eventsSnap.docs[0].data();
      return res.json({
        eventType: latestEvent.eventType,
        timestamp: latestEvent.eventTime || latestEvent.syncedAt,
        timeStr: latestEvent.eventTime,
        source: latestEvent.source
      });
    } catch (err: any) {
      console.error("[Attendance Latest API] Error:", err);
      return res.status(500).json({ error: "Internal server error fetching latest attendance" });
    }
  });

  // GET /api/attendance/history — Paginated attendance history
  app.get("/api/attendance/history", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    try {
      const employeeId = (req.query.employeeId || caller.employeeId || caller.uid || "").toString().trim();
      const limit = parseInt(req.query.limit as string || "30", 10);

      const qSnap = await db.collection("attendance")
        .where("employeeId", "==", employeeId)
        .limit(limit)
        .get();

      const history = qSnap.docs.map(doc => doc.data());
      return res.json({ success: true, count: history.length, history });
    } catch (err: any) {
      console.error("[Attendance History API] Error:", err);
      return res.status(500).json({ error: "Internal server error fetching attendance history" });
    }
  });

  // GET /api/reports/daily — Daily report summary and metrics for management decision making
  app.get("/api/reports/daily", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    try {
      const dateStr = (req.query.date || new Date().toISOString().substring(0, 10)).toString();
      const regSnap = await db.collection("registrations").get();
      const totalEmployees = regSnap.size;

      const attSnap = await db.collection("attendance").where("date", "==", dateStr).get();
      const presentCount = attSnap.size;

      return res.json({
        date: dateStr,
        summary: {
          totalEmployees,
          present: presentCount,
          absent: Math.max(0, totalEmployees - presentCount),
          late: 0,
          earlyDeparture: 0
        },
        efficiency: {
          top: [],
          bottom: []
        },
        attendance: {
          best: [],
          exceptions: []
        },
        workingHours: {
          highest: [],
          lowest: []
        },
        tasks: {
          highestCompletion: [],
          lowestCompletion: [],
          overdue: []
        }
      });
    } catch (err: any) {
      console.error("[Daily Reports API] Error:", err);
      return res.status(500).json({ error: "Internal server error generating daily report" });
    }
  });

  // ==========================================
  // WHATSAPP REAL-TIME NOTIFICATION API ROUTES
  // ==========================================

  // 1. Dispatch Attendance WhatsApp Notification (Authenticated & Role Checked)
  app.post("/api/notifications/whatsapp", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid Firebase authentication token required" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    try {
      const payload = req.body;
      if (!payload || !payload.eventType) {
        return res.status(400).json({ error: "Invalid payload: eventType is required" });
      }

      // Event Type Whitelist Check
      if (!ALLOWED_ATTENDANCE_EVENT_TYPES.includes(payload.eventType)) {
        return res.status(400).json({ 
          error: `Unsupported eventType: ${payload.eventType}. Must be one of: ${ALLOWED_ATTENDANCE_EVENT_TYPES.join(', ')}` 
        });
      }

      // Role & Ownership Verification
      const targetEmployeeId = payload.employeeId || caller.employeeId || caller.uid;
      const targetEmployeeCode = payload.employeeCode || caller.employeeCode || "";

      if (!caller.isAdmin) {
        // Regular employees can ONLY trigger attendance notifications for their own account
        const isOwnAccount = 
          (caller.employeeId && (caller.employeeId === payload.employeeId || caller.uid === payload.employeeId)) ||
          (caller.employeeCode && caller.employeeCode === payload.employeeCode) ||
          caller.uid === payload.employeeId;

        if (!isOwnAccount) {
          return res.status(403).json({ 
            error: "Forbidden: Employees can only dispatch attendance notifications for their own verified account" 
          });
        }
      }

      // Server-side enrichment: lookup registration doc to get authoritative details
      let authoritativeName = payload.employeeName;
      let authoritativeCode = targetEmployeeCode;
      let authoritativePhone = "";
      let authoritativeConsent = "";

      try {
        let regDoc = null;
        if (targetEmployeeId) {
          const doc = await db.collection("registrations").doc(targetEmployeeId).get();
          if (doc.exists) regDoc = doc;
        }
        if (!regDoc && targetEmployeeCode) {
          const q = await db.collection("registrations").where("employeeCode", "==", targetEmployeeCode).limit(1).get();
          if (!q.empty) regDoc = q.docs[0];
        }

        if (regDoc && regDoc.exists) {
          const rData = regDoc.data() || {};
          authoritativeName = rData.name || authoritativeName || "Employee";
          authoritativeCode = rData.employeeCode || authoritativeCode || targetEmployeeId;
          authoritativePhone = rData.phone || rData.mobileNumber || rData.whatsappNumber || rData.mobile || "";
          authoritativeConsent = rData.whatsappConsent || rData.whatsappOptIn || "";
        }
      } catch (regLookupErr) {
        console.warn("[WhatsApp API] Registration lookup non-fatal error:", regLookupErr);
      }

      // Construct verified server payload (ignoring client-injected recipient overrides)
      const verifiedPayload = {
        ...payload,
        employeeId: targetEmployeeId,
        employeeCode: authoritativeCode || targetEmployeeId,
        employeeName: authoritativeName || "Employee",
        employeeMobile: authoritativePhone || undefined,
        whatsappConsent: authoritativeConsent || undefined
      };

      const results = await dispatchWhatsAppAttendanceNotification(db, verifiedPayload);
      return res.json({
        success: true,
        results
      });
    } catch (err: any) {
      console.error("[WhatsApp API] Error dispatching notification:", err);
      return res.status(500).json({ error: err.message || "Internal server error dispatching WhatsApp message" });
    }
  });

  // 2. Super-Admin: Get WhatsApp Configuration & Status (Masked)
  app.get("/api/admin/whatsapp/config", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isAdmin) {
      return res.status(401).json({ error: "Unauthorized access: Valid Admin token required" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    try {
      const env = getWhatsAppEnvCredentials();
      const config = await getWhatsAppConfig(db);

      const maskString = (str: string) => {
        if (!str || str.length <= 4) return str ? "****" : "";
        return `${str.slice(0, 3)}****${str.slice(-4)}`;
      };

      return res.json({
        configured: env.isConfigured,
        status: env.isConfigured ? "CONNECTED" : "NOT_CONFIGURED",
        maskedPhoneNumberId: maskString(env.phoneNumberId),
        maskedWabaId: maskString(env.businessAccountId),
        apiVersion: config.apiVersion || env.apiVersion,
        globalEnabled: config.globalEnabled,
        recipientMode: config.recipientMode,
        adminRecipients: config.adminRecipients || [],
        templates: config.templates || DEFAULT_WHATSAPP_TEMPLATES,
        metaTemplates: config.metaTemplates || DEFAULT_META_TEMPLATES,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy
      });
    } catch (err: any) {
      console.error("[WhatsApp Admin] Error fetching config:", err);
      return res.status(500).json({ error: "Failed to fetch WhatsApp configuration" });
    }
  });

  // 3. Super-Admin: Save WhatsApp Configuration
  app.post("/api/admin/whatsapp/config", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: Super-Administrator authorization required" });
    }

    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    try {
      const updateData = req.body;
      const updatedConfig = await saveWhatsAppConfig(
        db,
        {
          globalEnabled: updateData.globalEnabled,
          recipientMode: updateData.recipientMode,
          adminRecipients: updateData.adminRecipients,
          templates: updateData.templates,
          metaTemplates: updateData.metaTemplates
        },
        caller.email || caller.loginId || "SUPER_ADMIN"
      );

      // Record Audit Log
      try {
        const auditRef = db.collection("audit_logs").doc();
        await auditRef.set({
          id: auditRef.id,
          actionCategory: "SYSTEM_SETTINGS",
          action: "Updated WhatsApp Notification Configuration",
          performedByUserId: caller.loginId || caller.uid,
          performedByName: caller.email || "Super Admin",
          timestamp: new Date().toISOString(),
          details: {
            globalEnabled: updatedConfig.globalEnabled,
            recipientMode: updatedConfig.recipientMode,
            adminRecipientsCount: (updatedConfig.adminRecipients || []).length
          }
        });
      } catch (auditErr) {
        console.warn("[WhatsApp Admin] Non-fatal audit log warning:", auditErr);
      }

      const env = getWhatsAppEnvCredentials();
      const maskString = (str: string) => {
        if (!str || str.length <= 4) return str ? "****" : "";
        return `${str.slice(0, 3)}****${str.slice(-4)}`;
      };

      return res.json({
        configured: env.isConfigured,
        status: env.isConfigured ? "CONNECTED" : "NOT_CONFIGURED",
        maskedPhoneNumberId: maskString(env.phoneNumberId),
        maskedWabaId: maskString(env.businessAccountId),
        apiVersion: updatedConfig.apiVersion || env.apiVersion,
        globalEnabled: updatedConfig.globalEnabled,
        recipientMode: updatedConfig.recipientMode,
        adminRecipients: updatedConfig.adminRecipients || [],
        templates: updatedConfig.templates || DEFAULT_WHATSAPP_TEMPLATES,
        metaTemplates: updatedConfig.metaTemplates || DEFAULT_META_TEMPLATES,
        updatedAt: updatedConfig.updatedAt,
        updatedBy: updatedConfig.updatedBy
      });
    } catch (err: any) {
      console.error("[WhatsApp Admin] Error saving config:", err);
      return res.status(500).json({ error: "Failed to save WhatsApp configuration" });
    }
  });

  // 4. Super-Admin: Send Live Test WhatsApp Message
  app.post("/api/admin/whatsapp/test", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: Super-Administrator authorization required" });
    }

    const { recipient, testMessage, templateName, languageCode, type } = req.body;
    if (!recipient) {
      return res.status(400).json({ error: "Recipient phone number is required" });
    }

    try {
      const messageBody = testMessage || "EXFIN OMS WhatsApp Connection Test Successful.";
      
      let sendRes;
      if (type === 'template' && templateName) {
        sendRes = await sendMetaWhatsAppMessage(recipient, {
          type: 'template',
          templateName,
          languageCode: languageCode || 'en',
          parameters: [{ type: 'text', text: 'Admin Test' }],
          textBody: messageBody
        });
      } else {
        sendRes = await sendMetaWhatsAppMessage(recipient, messageBody);
      }

      if (sendRes.success) {
        // Record Audit Log
        if (db) {
          try {
            const auditRef = db.collection("audit_logs").doc();
            await auditRef.set({
              id: auditRef.id,
              actionCategory: "SYSTEM_SETTINGS",
              action: "Sent WhatsApp Live Test Message",
              performedByUserId: caller.loginId || caller.uid,
              performedByName: caller.email || "Super Admin",
              timestamp: new Date().toISOString(),
              details: {
                recipientPhone: normalizePhoneNumber(recipient),
                providerMessageId: sendRes.providerMessageId,
                templateUsed: templateName || 'text'
              }
            });
          } catch (e) {}
        }

        return res.json({
          success: true,
          message: "Test WhatsApp message sent successfully!",
          providerMessageId: sendRes.providerMessageId
        });
      } else {
        return res.status(400).json({
          success: false,
          error: sendRes.error || "Failed to send WhatsApp test message via Meta API"
        });
      }
    } catch (err: any) {
      console.error("[WhatsApp Admin] Error sending test message:", err);
      return res.status(500).json({ error: err.message || "Failed to execute WhatsApp test dispatch" });
    }
  });

  // =======================================================
  // DAILY OPERATIONS ADMIN EMAIL REPORT SYSTEM API ROUTES
  // (RESTRICTED EXCLUSIVELY TO SUPER_ADMIN)
  // =======================================================

  // 1. Get Daily Report Config (Super-Admin only)
  app.get(["/api/admin/daily-report/config", "/api/admin/daily-email-report/config"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }

    try {
      const config = await getDailyReportConfig(db);
      return res.json({
        success: true,
        config
      });
    } catch (err: any) {
      console.error("[DailyReport API] Error fetching config:", err);
      return res.status(500).json({ success: false, error: "Failed to fetch daily report configuration" });
    }
  });

  // 2. Save Daily Report Config (Super-Admin only)
  app.post(["/api/admin/daily-report/config", "/api/admin/daily-email-report/config"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }

    try {
      // Validate configuration payload
      if (req.body.adminEmails !== undefined) {
        const valResult = validateAdminEmails(req.body.adminEmails);
        if (!valResult.valid) {
          return res.status(400).json({ success: false, error: valResult.error });
        }
      }

      const updatedConfig = await saveDailyReportConfig(db, req.body, caller.email || caller.uid);
      return res.json({
        success: true,
        config: updatedConfig
      });
    } catch (err: any) {
      console.error("[DailyReport API] Error saving config:", err);
      return res.status(400).json({ success: false, error: err.message || "Failed to save daily report configuration" });
    }
  });

  // 3. Send Test Email (Super-Admin only)
  app.post(["/api/admin/daily-report/send-test", "/api/admin/daily-email-report/test"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }

    try {
      const result = await sendDailyReportTestEmail(db, caller.email || caller.uid);
      return res.json(result);
    } catch (err: any) {
      console.error("[DailyReport API] Error sending test email:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to send test email" });
    }
  });

  // 4. Send Yesterday's / Specific Date Report Manually & Retry (Super-Admin only)
  app.post([
    "/api/admin/daily-report/send-yesterday", 
    "/api/admin/daily-email-report/send-yesterday",
    "/api/admin/daily-report/retry-yesterday",
    "/api/admin/daily-email-report/retry-yesterday"
  ], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }

    try {
      const targetDate = req.body.date; // Optional custom target date YYYY-MM-DD
      const result = await generateAndSendDailyReport(db, targetDate, true, caller.email || caller.uid);
      return res.json(result);
    } catch (err: any) {
      console.error("[DailyReport API] Error manually sending report:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to manually generate/send report" });
    }
  });

  // 5. Get Daily Report Sending History (Super-Admin only)
  app.get(["/api/admin/daily-report/history", "/api/admin/daily-email-report/history"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }

    try {
      const historySnap = await db.collection("daily_admin_reports")
        .orderBy("startedAt", "desc")
        .limit(30)
        .get();

      const history: any[] = [];
      historySnap.forEach((doc) => {
        history.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return res.json({
        success: true,
        history
      });
    } catch (err: any) {
      console.error("[DailyReport API] Error fetching history:", err);
      return res.status(500).json({ success: false, error: "Failed to fetch daily report history" });
    }
  });

  // 6. Get Daily Report Scheduler Diagnostics (Super-Admin only)
  app.get(["/api/admin/daily-report/diagnostics", "/api/admin/daily-email-report/diagnostics"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }

    if (!db) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }

    try {
      const config = await getDailyReportConfig(db);
      const currentMinutes = getKolkataCurrentMinutes();
      const scheduledMinutes = parseTimeToMinutes ? (parseTimeToMinutes(config.sendTime) ?? 420) : 420;
      const todayKolkata = getKolkataDateString();
      
      // Calculate next run date
      let nextRunDateStr = todayKolkata;
      if (currentMinutes >= scheduledMinutes) {
        const [yearStr, monthStr, dayStr] = todayKolkata.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
        const day = parseInt(dayStr, 10);
        const utc = new Date(Date.UTC(year, month, day));
        utc.setUTCDate(utc.getUTCDate() + 1);
        const nextYear = utc.getUTCFullYear();
        const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, '0');
        const nextDay = String(utc.getUTCDate()).padStart(2, '0');
        nextRunDateStr = `${nextYear}-${nextMonth}-${nextDay}`;
      }

      // Convert stored sendTime to friendly 12-hour format
      const { hour, minute, period } = to12HourFormat(config.sendTime);
      const formattedSendTime = `${hour}:${minute} ${period}`;
      const nextRun = `${formatDateStringFriendly(nextRunDateStr)}, ${formattedSendTime}`;

      // Fetch last run from daily_admin_reports
      const lastRunSnap = await db.collection("daily_admin_reports")
        .orderBy("startedAt", "desc")
        .limit(1)
        .get();

      let lastRun = "NEVER RUN";
      let lastStatus = "NOT RUN";

      if (!lastRunSnap.empty) {
        const doc = lastRunSnap.docs[0];
        const data = doc.data();
        const reportDate = data.reportDate || doc.id;
        const completedAtStr = data.completedAt || data.startedAt;
        
        let completedFormatted = "";
        if (completedAtStr) {
          try {
            const completedDate = new Date(completedAtStr);
            const kTimeStr = completedDate.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
              timeZone: "Asia/Kolkata",
            });
            completedFormatted = ` (Sent At: ${kTimeStr})`;
          } catch (e) {}
        }

        lastRun = `${formatDateStringFriendly(reportDate)}${completedFormatted}`;
        lastStatus = data.status || "UNKNOWN";
      }

      const currentKolkataTimeStr = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(new Date());

      let lastSchedulerTickFormatted = "NEVER CALLED";
      if (config.lastSchedulerTick) {
        try {
          const tickDate = new Date(config.lastSchedulerTick);
          lastSchedulerTickFormatted = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          }).format(tickDate);
        } catch (e) {
          lastSchedulerTickFormatted = config.lastSchedulerTick;
        }
      }

      return res.json({
        success: true,
        diagnostics: {
          enabled: config.enabled,
          configuredTime: formattedSendTime,
          timezone: "Asia/Kolkata",
          currentTimeInTimezone: currentKolkataTimeStr,
          nextRun,
          lastRun,
          lastStatus,
          schedulerMode: "EXTERNAL CRON",
          endpointStatus: "READY",
          lastSchedulerTick: lastSchedulerTickFormatted
        }
      });
    } catch (err: any) {
      console.error("[DailyReport API] Error generating diagnostics:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to generate diagnostics" });
    }
  });

  // 7. Automated Scheduler Endpoint: POST /api/internal/daily-admin-report
  app.post("/api/internal/daily-admin-report", async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }

    // Secure via Header checking against CRON_SECRET env variable
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    
    // Fallback secret only allowed in non-production environments
    const expectedSecret = process.env.CRON_SECRET || (process.env.NODE_ENV !== "production" ? "exfin_oms_secure_scheduler_token_2026" : undefined);

    if (!expectedSecret) {
      console.error("[DailyReport Scheduler] CRON_SECRET environment variable is missing in production!");
      return res.status(500).json({ error: "Server Configuration Error: CRON_SECRET not configured in production." });
    }

    const isAuthorized = 
      (authHeader === `Bearer ${expectedSecret}`) || 
      (queryToken === expectedSecret);

    if (!isAuthorized) {
      console.warn(`[DailyReport Scheduler] Unauthorized attempt to invoke scheduler endpoint.`);
      return res.status(401).json({ error: "Unauthorized: Invalid or missing scheduling credentials" });
    }

    try {
      const config = await getDailyReportConfig(db);
      const currentKolkataTimeStr = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      }).format(new Date());

      const scheduledMinutes = parseTimeToMinutes(config.sendTime) ?? 420;
      const currentMinutes = getKolkataCurrentMinutes();
      const targetDate = getPreviousKolkataDateString();

      let alreadySent = false;
      try {
        const logSnap = await db.collection('daily_admin_reports').doc(targetDate).get();
        if (logSnap.exists && logSnap.data()?.status === 'SENT') {
          alreadySent = true;
        }
      } catch (e) {
        // Log query failure safely
      }

      let action = "SKIP";
      if (!config.enabled) {
        action = "SKIP (Disabled)";
      } else if (currentMinutes < scheduledMinutes) {
        action = "SKIP (Too Early)";
      } else if (alreadySent) {
        action = "SKIP (Already Sent)";
      } else {
        action = "SEND";
      }

      console.log("=========================================");
      console.log("Daily report scheduler tick received");
      console.log(`Kolkata time: ${currentKolkataTimeStr}`);
      console.log(`Configured time: ${config.sendTime}`);
      console.log(`Target report date: ${targetDate}`);
      console.log(`Already sent: ${alreadySent}`);
      console.log(`Action: ${action}`);
      console.log("=========================================");

      // Record last scheduler tick timestamp in Firestore settings for UI diagnostics
      try {
        await db.collection("system_settings").doc("daily_admin_report").set({
          lastSchedulerTick: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.error("[DailyReport Scheduler] Failed to save scheduler tick to Firestore:", e);
      }

      const passedDate = req.body?.date || req.query?.date; // Allows passing a custom date for testing/re-running
      
      if (passedDate) {
        // Force manual execution for specific date (bypass time check and lock for testing)
        const result = await generateAndSendDailyReport(db, passedDate, false, "AUTOMATED_SCHEDULER");
        return res.json(result);
      } else {
        // Run standard scheduled check (handles sendTime, timezone, and transactional locks)
        await checkAndRunScheduledDailyReport(db);
        return res.json({ 
          success: true, 
          message: "Standard scheduled daily report verification executed successfully",
          tick: {
            kolkataTime: currentKolkataTimeStr,
            configuredTime: config.sendTime,
            targetReportDate: targetDate,
            alreadySent,
            action
          }
        });
      }
    } catch (err: any) {
      console.error("[DailyReport Scheduler] Error in scheduled report execution:", err);
      return res.status(500).json({ error: err.message || "Failed to execute scheduled report process" });
    }
  });

  // Serve Codester final download packages and APKs with explicit MIME type and fallback protection
  const downloadsPath = path.join(process.cwd(), "public", "downloads");
  
  app.get("/downloads/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(downloadsPath, filename);
    if (fs.existsSync(filePath)) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.sendFile(filePath);
    } else {
      return res.status(404).json({ error: "APK file not found on server", requested: filename });
    }
  });
  app.use("/downloads", express.static(downloadsPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.apk')) {
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", "attachment");
      }
    }
  }));

  // Catch-all for unresolved API endpoints to prevent HTML SPA fallback intercepting them
  app.all(['/api', '/api/*'], (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    return res.status(404).json({ success: false, error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Office Management System Server running on http://0.0.0.0:${PORT}`);
    // Run finalizer and daily report scheduler on boot and every 60 seconds
    runServerAttendanceFinalizer().catch(() => {});
    
    // In-memory scheduler runs ONLY in local development to preserve resources/reliability on serverless Cloud Run
    if (process.env.NODE_ENV !== "production" && db) {
      console.log("[DailyReport Scheduler] In-memory local development scheduler active.");
      checkAndRunScheduledDailyReport(db).catch(() => {});
    } else {
      console.log("[DailyReport Scheduler] Production Mode: Relying entirely on external CRON trigger endpoint.");
    }

    setInterval(() => {
      runServerAttendanceFinalizer().catch(() => {});
      if (process.env.NODE_ENV !== "production" && db) {
        checkAndRunScheduledDailyReport(db).catch(() => {});
      }
    }, 60000);
  });
}

startServer();
