import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const OFFICE_LAT = 23.616227;
const OFFICE_LNG = 87.117063;
const GEOFENCE_RADIUS_METERS = 25.0;

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

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "exfin-oms-backend", timestamp: new Date().toISOString() });
  });

  // Secure Median Background Location POST endpoint
  app.post("/api/median-background-location", (req, res) => {
    try {
      const payload = req.body || {};
      const query = req.query || {};

      const latitude = typeof payload.latitude === 'number' ? payload.latitude : parseFloat(query.lat as string || '0');
      const longitude = typeof payload.longitude === 'number' ? payload.longitude : parseFloat(query.lng as string || '0');
      const employeeId = (payload.employeeId || query.emp || payload.customData?.employeeId || 'ANONYMOUS').toString();
      const accuracy = payload.accuracy || payload.horizontalAccuracy || 0;
      const timestamp = payload.timestamp ? new Date(payload.timestamp).toISOString() : new Date().toISOString();
      const source = payload.source || query.source || "MEDIAN_BACKGROUND_LOCATION";

      if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ error: "Invalid coordinates provided" });
      }

      const distance = calculateDistanceInMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
      const isInside = distance <= GEOFENCE_RADIUS_METERS;
      const isExit = distance > GEOFENCE_RADIUS_METERS;

      console.log(`[Median Backend] Background location received for ${employeeId}: (${latitude.toFixed(6)}, ${longitude.toFixed(6)}) - Distance: ${Math.round(distance)}m - Inside: ${isInside} - Exit: ${isExit}`);

      return res.json({
        success: true,
        processed: true,
        employeeId,
        distanceMeters: Math.round(distance),
        isInsideGeofence: isInside,
        isExitCandidate: isExit,
        geofenceRadius: GEOFENCE_RADIUS_METERS,
        source,
        timestamp,
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
