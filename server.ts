import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Firestore } from "firebase-admin/firestore";
import { createServer as createViteServer } from "vite";

const OFFICE_LAT = 23.616227;
const OFFICE_LNG = 87.117063;
const GEOFENCE_RADIUS_METERS = 25.0;

// Initialize Firebase Admin
let db: Firestore | null = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (!getApps().length) {
      initializeApp({
        projectId: config.projectId,
      });
    }
  } else {
    if (!getApps().length) {
      initializeApp();
    }
  }
  db = getFirestore();
  console.log("[Median Backend] Firebase Admin Firestore initialized successfully.");
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: "exfin-oms-backend",
      firebaseAdminInitialized: !!db,
      timestamp: new Date().toISOString()
    });
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

      // 2. Validate coordinates bounds & values
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

      // Calculate distance to office
      const distance = calculateDistanceInMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
      const isInside = distance <= GEOFENCE_RADIUS_METERS;
      const isExit = distance > GEOFENCE_RADIUS_METERS;

      console.log(`[Median Backend] Location payload validated for ${employeeName} (${employeeId}): (${latitude.toFixed(6)}, ${longitude.toFixed(6)}) - Distance: ${Math.round(distance)}m - Inside: ${isInside}`);

      // 5. Persist to live_locations/{employeeId}
      const liveDocRef = db.collection("live_locations").doc(employeeId);
      await liveDocRef.set({
        employeeId,
        employeeName,
        latitude,
        longitude,
        accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
        distanceFromOffice: distance,
        townCity,
        timestamp: tsDate.toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 6. Check Active Attendance and perform INSIDE/OUTSIDE state transitions in a transaction
      const dateStr = getFormattedDateStr(tsDate);
      const attDocId = `${employeeId}_${dateStr}`;
      const attDocRef = db.collection("attendance").doc(attDocId);

      let transitionRecorded = false;
      let targetState = "UNCHANGED";

      await db.runTransaction(async (transaction) => {
        const attSnap = await transaction.get(attDocRef);
        if (!attSnap.exists) {
          // If no daily attendance record exists yet, we do NOT automatically create one.
          // Check-ins are initiated locally/foreground first.
          return;
        }

        const record = attSnap.data() || {};

        // If the record has already been finalized/checked out, do not perform automatic transitions.
        if (record.checkOutTime && record.checkOutTime !== "--:--" && record.checkoutStatus === "COMPLETED") {
          return;
        }

        const currentState = record.currentState || "CHECKED_IN";
        const timeStr = getFormattedTimeStr(tsDate);
        const eventIso = tsDate.toISOString();

        // Idempotency: Create a unique event ID based on type and timestamp to prevent duplicates
        const eventType = isInside ? "GEOFENCE_RETURN" : "GEOFENCE_EXIT";
        const eventId = `evt_${employeeId}_${dateStr}_${eventType}_${timeStr.replace(/\s+/g, "_")}`;

        if (record.processedEvents?.includes(eventId)) {
          // Already processed this background transition
          return;
        }

        const updatedProcessedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));
        let modified = false;

        if (!isInside) {
          // Geofence exit transition (INSIDE -> OUTSIDE)
          if (currentState === "CHECKED_IN" || currentState === "ENTERING") {
            record.lastExitTime = timeStr;
            record.exitTime = record.exitTime || timeStr;
            record.geofenceExitTime = record.geofenceExitTime || timeStr;
            record.geofenceExitTimestamp = record.geofenceExitTimestamp || eventIso;
            record.pendingCheckoutConfirmation = true;
            record.returningToOffice = false;
            record.currentState = "PENDING_EXIT_CONFIRMATION";
            
            record.checkoutLatitude = latitude;
            record.checkoutLongitude = longitude;
            record.checkoutDistance = distance;
            record.checkoutTownCity = townCity;

            record.processedEvents = updatedProcessedEvents;
            record.syncStatus = "Synced";
            record.updatedAt = new Date().toISOString();
            record.serverSyncTime = new Date().toISOString();
            record.serverSyncTimestamp = FieldValue.serverTimestamp();

            modified = true;
            targetState = "PENDING_EXIT_CONFIRMATION";
            transitionRecorded = true;
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
              latitude,
              longitude,
              townCity,
              distance
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
        console.log(`[Median Backend] Transition successful for ${employeeName} to state: ${targetState} (Distance: ${Math.round(distance)}m)`);
      }

      return res.json({
        success: true,
        processed: true,
        employeeId,
        employeeName,
        distanceMeters: Math.round(distance),
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
    console.log(`EXFIN OMS Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
