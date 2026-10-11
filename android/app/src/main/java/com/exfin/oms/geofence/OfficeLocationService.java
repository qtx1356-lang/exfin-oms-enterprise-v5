package com.exfin.oms.geofence;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

/**
 * Foreground Service that provides location updates during an active office session.
 * Fully compatible with Android 12, 13, 14, 15, and 16 foreground service lifecycles.
 */
public class OfficeLocationService extends Service {
    public static final String TAG = "OfficeLocationService";
    public static final String CHANNEL_ID = "exfin_oms_location_channel";
    public static final int NOTIFICATION_ID = 2502;

    // Persistent exit candidate state. The first trustworthy outside reading is the
    // authoritative candidate; later readings only confirm the transition.
    private static final String KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP = "pending_exit_candidate_timestamp";
    private static final String KEY_PENDING_EXIT_CANDIDATE_SESSION_ID = "pending_exit_candidate_session_id";
    private static final String KEY_PENDING_EXIT_CANDIDATE_DATE = "pending_exit_candidate_date";

    private static boolean isServiceRunning = false;
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private PowerManager.WakeLock cpuWakeLock;
    private int consecutiveOutsideCount = 0;
    private int consecutiveInsideCount = 0;

    public static boolean isRunning() {
        return isServiceRunning;
    }

    public static void start(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, OfficeLocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start OfficeLocationService: " + e.getMessage(), e);
        }
    }

    public static void stop(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, OfficeLocationService.class);
            context.stopService(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop OfficeLocationService: " + e.getMessage(), e);
        }
    }

    public static void verifyCurrentLocationAndDecide(Context context) {
        if (context == null) return;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Cannot verify current location: precise location permission is not granted.");
            return;
        }

        try {
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            boolean locationEnabled = lm != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.P
                    ? (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                    : lm.isLocationEnabled());
            if (!locationEnabled) {
                Log.w(TAG, "Cannot verify current location: device Location Services are OFF.");
                return;
            }

            FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(context);
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                    .addOnSuccessListener(loc -> {
                        if (loc == null || !OfficeGeofenceHelper.isLocationTrustworthyForAttendance(loc)) {
                            Log.w(TAG, "Current location verification unavailable or inaccurate.");
                            return;
                        }

                        double distance = OfficeGeofenceHelper.calculateDistance(
                                loc.getLatitude(), loc.getLongitude(),
                                OfficeGeofenceHelper.OFFICE_LAT, OfficeGeofenceHelper.OFFICE_LNG
                        );
                        OfficeGeofenceHelper.saveLastLocationDiagnostic(
                                context, loc.getLatitude(), loc.getLongitude(),
                                loc.getAccuracy(), loc.getTime(), distance
                        );

                        JSONObject activeSession = OfficeGeofenceHelper.getActiveSession(context);
                        String state = activeSession != null ? activeSession.optString("sessionState", "ACTIVE") : "NO_SESSION";

                        if ("NO_SESSION".equalsIgnoreCase(state)) {
                            if (distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) {
                                Log.i(TAG, "[LOCATION_RECOVERY] Current location is inside 25m. Verifying automatic check-in.");
                                OfficeGeofenceHelper.evaluateAttendanceDecision(
                                        context, loc, "LOCATION_RECOVERY", com.google.android.gms.location.Geofence.GEOFENCE_TRANSITION_ENTER, null, null
                                );
                            } else {
                                Log.i(TAG, "[LOCATION_RECOVERY] Current location is outside 25m (" + Math.round(distance) + "m). No attendance mutation.");
                            }
                        } else if ("ACTIVE".equalsIgnoreCase(state)) {
                            if (distance > OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) {
                                Log.i(TAG, "[LOCATION_RECOVERY] Current location is outside 25m. Verifying exit.");
                                OfficeGeofenceHelper.processExitTransition(context, loc, "NATIVE_LOCATION_RECOVERY", null, null);
                            }
                        } else if ("PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state)
                                || "PENDING_AUTO_CHECKOUT".equalsIgnoreCase(state)
                                || OfficeGeofenceHelper.STATE_EXIT_PROMPT_RESOLVED_OUTSIDE.equalsIgnoreCase(state)
                                || "RETURNING_TO_OFFICE".equalsIgnoreCase(state)) {
                            if (distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) {
                                clearPendingExitCandidate(context);
                                Log.i(TAG, "[LOCATION_RECOVERY] Current location is back inside 25m. Verifying return.");
                                OfficeGeofenceHelper.processReturnTransition(context, loc, "NATIVE_LOCATION_RECOVERY_RETURN", null, null);
                            }
                        }
                    })
                    .addOnFailureListener(e -> Log.w(TAG, "Current location recovery failed: " + e.getMessage()));
        } catch (Exception e) {
            Log.e(TAG, "Error in verifyCurrentLocationAndDecide: " + e.getMessage(), e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isServiceRunning = true;
        acquireCpuWakeLock();
        Log.i(TAG, "OfficeLocationService created. Starting foreground monitoring.");
        createNotificationChannel();
        Notification notification = buildNotification("Active Office Attendance Monitoring");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to startForeground: " + e.getMessage(), e);
        }

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        startLocationUpdates();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        isServiceRunning = true;
        acquireCpuWakeLock();
        Log.i(TAG, "OfficeLocationService onStartCommand executed.");
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Smart Workforce Office Location Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Monitors office attendance location in background");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String contentText) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Smart Workforce Attendance")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true);
        return builder.build();
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Location permissions missing. Stopping OfficeLocationService.");
            stopSelf();
            return;
        }

        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000)
                .setMinUpdateIntervalMillis(2500)
                .setMaxUpdateDelayMillis(5000)
                .setWaitForAccurateLocation(true)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                for (Location location : locationResult.getLocations()) {
                    if (location != null) {
                        processLocationUpdate(location);
                    }
                }
            }
        };

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
            Log.i(TAG, "Fused high-accuracy location updates requested every 5s (min 2.5s), including screen-off operation.");
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException requesting location updates: " + se.getMessage(), se);
            stopSelf();
        } catch (Exception e) {
            Log.e(TAG, "Exception requesting location updates: " + e.getMessage(), e);
            stopSelf();
        }
    }

    private void processLocationUpdate(Location location) {
        if (location == null) return;

        double lat = location.getLatitude();
        double lng = location.getLongitude();
        float accuracy = location.getAccuracy();
        long time = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        double distance = OfficeGeofenceHelper.calculateDistance(lat, lng, OfficeGeofenceHelper.OFFICE_LAT, OfficeGeofenceHelper.OFFICE_LNG);

        OfficeGeofenceHelper.saveLastLocationDiagnostic(this, lat, lng, accuracy, time, distance);

        // Validate accuracy to reject wild GPS jumps.
        if (accuracy > OfficeGeofenceHelper.MAX_USABLE_ACCURACY_METERS) {
            Log.d(TAG, "Ignoring location update due to poor accuracy: " + accuracy + "m > " + OfficeGeofenceHelper.MAX_USABLE_ACCURACY_METERS + "m");
            return;
        }

        JSONObject activeSession = OfficeGeofenceHelper.getActiveSession(this);
        if (activeSession == null) {
            if (distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS &&
                    OfficeGeofenceHelper.isLocationTrustworthyForCheckIn(location)) {
                Log.i(TAG, "[AUTO_CHECKIN_BACKGROUND] Fresh location is inside 25m; creating automatic check-in.");
                OfficeGeofenceHelper.evaluateAttendanceDecision(
                        this,
                        location,
                        "NATIVE_BACKGROUND_FUSED_LOCATION",
                        com.google.android.gms.location.Geofence.GEOFENCE_TRANSITION_ENTER,
                        null,
                        null
                );
                return;
            }

            Log.i(TAG, "[AUTO_CHECKIN_BACKGROUND] No active session yet; continuing background monitoring until the 25m boundary is verified.");
            return;
        }

        String sessionState = activeSession.optString("sessionState", "ACTIVE");

        if ("ACTIVE".equalsIgnoreCase(sessionState)) {
            if (distance > OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) {
                // IMPORTANT: latch the FIRST trustworthy outside reading. The second
                // reading only confirms the exit and must never replace its timestamp.
                long candidateTimestamp = getPendingExitCandidateTimestamp(activeSession, time);
                if (candidateTimestamp <= 0) {
                    candidateTimestamp = time;
                }
                latchPendingExitCandidate(this, activeSession, candidateTimestamp);

                consecutiveOutsideCount++;
                consecutiveInsideCount = 0;
                Log.i(TAG, "Outside 25m boundary: " + Math.round(distance) + "m (count: " + consecutiveOutsideCount + "/2), firstOutsideTimestamp=" + candidateTimestamp);

                if (consecutiveOutsideCount >= 2 || distance > 35.0) {
                    consecutiveOutsideCount = 0;
                    long authoritativeExitTimestamp = getPendingExitCandidateTimestamp(activeSession, candidateTimestamp);
                    if (authoritativeExitTimestamp <= 0) authoritativeExitTimestamp = candidateTimestamp;
                    Log.i(TAG, "[NATIVE ATTENDANCE] === Authoritative 25m exit detected (dist=" + Math.round(distance) + "m > 25m) ===");
                    Log.i(TAG, "[NATIVE ATTENDANCE] Preserving FIRST outside reading timestamp=" + authoritativeExitTimestamp + "; confirmation reading timestamp=" + time);
                    OfficeGeofenceHelper.processExitTransition(
                            this,
                            location,
                            "NATIVE_FUSED_LOCATION",
                            "FUSED_CURRENT",
                            null,
                            null,
                            authoritativeExitTimestamp
                    );
                    clearPendingExitCandidate(this);
                }
            } else {
                // Outside candidate was not confirmed; employee returned inside.
                consecutiveOutsideCount = 0;
                consecutiveInsideCount++;
                clearPendingExitCandidate(this);
            }
        } else if ("PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(sessionState)) {
            if (distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) {
                consecutiveInsideCount++;
                consecutiveOutsideCount = 0;
                clearPendingExitCandidate(this);
                Log.i(TAG, "Returned inside 25m office boundary: " + Math.round(distance) + "m (count: " + consecutiveInsideCount + "/2)");

                if (consecutiveInsideCount >= 2 || distance <= 20.0) {
                    consecutiveInsideCount = 0;
                    Log.i(TAG, "[NATIVE ATTENDANCE] === Authoritative 25m return to office detected (dist=" + Math.round(distance) + "m <= 25m) ===");
                    OfficeGeofenceHelper.processReturnTransition(this, location, "NATIVE_FUSED_LOCATION_RETURN", null, null);
                }
            } else {
                consecutiveInsideCount = 0;
            }
        } else if ("CHECKED_OUT".equalsIgnoreCase(sessionState) || "FINALIZED".equalsIgnoreCase(sessionState)) {
            clearPendingExitCandidate(this);
            Log.i(TAG, "Session is finalized. Stopping OfficeLocationService.");
            stopSelf();
        }
    }

    private long getPendingExitCandidateTimestamp(JSONObject activeSession, long fallbackTimestamp) {
        SharedPreferences prefs = getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
        long candidate = prefs.getLong(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP, 0L);
        String candidateSessionId = prefs.getString(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID, "");
        String candidateDate = prefs.getString(KEY_PENDING_EXIT_CANDIDATE_DATE, "");
        String sessionId = activeSession != null ? activeSession.optString("attendanceId", "") : "";
        String sessionDate = activeSession != null ? activeSession.optString("date", "") : "";

        if (candidate > 0 && (candidateSessionId.isEmpty() || candidateSessionId.equals(sessionId)) &&
                (candidateDate.isEmpty() || candidateDate.equals(sessionDate))) {
            return candidate;
        }
        return fallbackTimestamp;
    }

    private void latchPendingExitCandidate(Context context, JSONObject activeSession, long timestamp) {
        if (context == null || timestamp <= 0) return;
        SharedPreferences prefs = context.getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
        String sessionId = activeSession != null ? activeSession.optString("attendanceId", "") : "";
        String sessionDate = activeSession != null ? activeSession.optString("date", "") : "";
        long existing = prefs.getLong(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP, 0L);

        // Never move the candidate forward while the same attendance session is active.
        String existingSessionId = prefs.getString(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID, "");
        if (existing > 0 && (existingSessionId.isEmpty() || existingSessionId.equals(sessionId))) {
            return;
        }

        prefs.edit()
                .putLong(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP, timestamp)
                .putString(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID, sessionId)
                .putString(KEY_PENDING_EXIT_CANDIDATE_DATE, sessionDate)
                .apply();
        Log.i(TAG, "[NATIVE ATTENDANCE] Latched first trustworthy outside timestamp=" + timestamp + " for session=" + sessionId);
    }

    private static void clearPendingExitCandidate(Context context) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .remove(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP)
                .remove(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID)
                .remove(KEY_PENDING_EXIT_CANDIDATE_DATE)
                .apply();
    }

    private void acquireCpuWakeLock() {
        try {
            if (cpuWakeLock != null && cpuWakeLock.isHeld()) return;
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                cpuWakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, TAG + ":AttendanceCpu");
                cpuWakeLock.setReferenceCounted(false);
                cpuWakeLock.acquire();
                Log.i(TAG, "[BACKGROUND_ATTENDANCE] Partial CPU wake lock acquired for active location monitoring.");
            }
        } catch (Exception e) {
            Log.w(TAG, "[BACKGROUND_ATTENDANCE] Unable to acquire CPU wake lock: " + e.getMessage());
        }
    }

    private void releaseCpuWakeLock() {
        try {
            if (cpuWakeLock != null && cpuWakeLock.isHeld()) {
                cpuWakeLock.release();
                Log.i(TAG, "[BACKGROUND_ATTENDANCE] Partial CPU wake lock released.");
            }
        } catch (Exception e) {
            Log.w(TAG, "[BACKGROUND_ATTENDANCE] Unable to release CPU wake lock: " + e.getMessage());
        } finally {
            cpuWakeLock = null;
        }
    }

    @Override
    public void onDestroy() {
        releaseCpuWakeLock();
        super.onDestroy();
        isServiceRunning = false;
        Log.i(TAG, "OfficeLocationService destroyed.");
        if (fusedLocationClient != null && locationCallback != null) {
            try {
                fusedLocationClient.removeLocationUpdates(locationCallback);
            } catch (Exception e) {
                Log.e(TAG, "Error removing location updates: " + e.getMessage());
            }
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
