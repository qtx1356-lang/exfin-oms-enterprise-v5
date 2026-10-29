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
import android.os.Handler;
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
 * Native short-lived foreground verifier for automatic office attendance.
 * Native geofences remain the low-power always-on boundary monitor. This service
 * is started only for a short high-accuracy verification burst after a geofence
 * or recovery event and is stopped once the transition is confirmed.
 */
public class OfficeLocationService extends Service {
    public static final String TAG = "OfficeLocationService";
    public static final String CHANNEL_ID = "exfin_oms_location_channel";
    public static final int NOTIFICATION_ID = 2502;

    private static final String KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP = "pending_exit_candidate_timestamp";
    private static final String KEY_PENDING_EXIT_CANDIDATE_SESSION_ID = "pending_exit_candidate_session_id";
    private static final String KEY_PENDING_EXIT_CANDIDATE_DATE = "pending_exit_candidate_date";

    private static final int REQUIRED_OUTSIDE_CONFIRMATIONS = 2;
    private static final int REQUIRED_INSIDE_CONFIRMATIONS = 2;
    private static final long MAX_VERIFICATION_WINDOW_MS = 45_000L;

    private static boolean isServiceRunning = false;

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private PowerManager.WakeLock cpuWakeLock;
    private Handler serviceHandler;
    private Runnable verificationTimeoutRunnable;
    private int consecutiveOutsideCount = 0;
    private int consecutiveInsideCount = 0;

    public static boolean isRunning() {
        return isServiceRunning;
    }

    public static void start(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, OfficeLocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start OfficeLocationService: " + e.getMessage(), e);
        }
    }

    public static void stop(Context context) {
        if (context == null) return;
        try { context.stopService(new Intent(context, OfficeLocationService.class)); }
        catch (Exception e) { Log.e(TAG, "Failed to stop OfficeLocationService: " + e.getMessage(), e); }
    }

    public static void verifyCurrentLocationAndDecide(Context context) {
        if (context == null) return;
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Cannot verify current location: precise location permission is not granted.");
            return;
        }
        try {
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            boolean enabled = lm != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.P
                    ? (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                    : lm.isLocationEnabled());
            if (!enabled) return;

            FusedLocationProviderClient client = LocationServices.getFusedLocationProviderClient(context);
            client.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                    .addOnSuccessListener(location -> {
                        if (location == null || !OfficeGeofenceHelper.isLocationTrustworthyForAttendance(location)) return;
                        double distance = OfficeGeofenceHelper.calculateDistance(location.getLatitude(), location.getLongitude(), OfficeGeofenceHelper.OFFICE_LAT, OfficeGeofenceHelper.OFFICE_LNG);
                        OfficeGeofenceHelper.saveLastLocationDiagnostic(context, location.getLatitude(), location.getLongitude(), location.getAccuracy(), location.getTime(), distance);
                        JSONObject session = OfficeGeofenceHelper.getActiveSession(context);
                        String state = session != null ? session.optString("sessionState", "ACTIVE") : "NO_SESSION";
                        if (("NO_SESSION".equalsIgnoreCase(state) || "ACTIVE".equalsIgnoreCase(state)) && distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) start(context);
                        else if ("ACTIVE".equalsIgnoreCase(state) && distance > OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) start(context);
                        else if (("PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state) || "PENDING_AUTO_CHECKOUT".equalsIgnoreCase(state) || OfficeGeofenceHelper.STATE_EXIT_PROMPT_RESOLVED_OUTSIDE.equalsIgnoreCase(state) || "RETURNING_TO_OFFICE".equalsIgnoreCase(state)) && distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) start(context);
                    })
                    .addOnFailureListener(e -> Log.w(TAG, "Current location recovery failed: " + e.getMessage()));
        } catch (Exception e) { Log.e(TAG, "Error in verifyCurrentLocationAndDecide: " + e.getMessage(), e); }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isServiceRunning = true;
        acquireCpuWakeLock();
        createNotificationChannel();
        Notification notification = buildNotification("Verifying office attendance location");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTIFICATION_ID, notification);
        } catch (Exception e) { Log.e(TAG, "Failed to startForeground: " + e.getMessage(), e); }
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        startLocationUpdates();
        scheduleVerificationTimeout();
        Log.i(TAG, "[BATTERY_OPTIMIZED_ATTENDANCE] Short high-accuracy verification window started; geofences remain the always-on monitor.");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        isServiceRunning = true;
        acquireCpuWakeLock();
        if (serviceHandler == null || verificationTimeoutRunnable == null) scheduleVerificationTimeout();
        return START_NOT_STICKY;
    }

    private void scheduleVerificationTimeout() {
        try {
            if (serviceHandler == null) serviceHandler = new Handler(getMainLooper());
            if (verificationTimeoutRunnable != null) serviceHandler.removeCallbacks(verificationTimeoutRunnable);
            verificationTimeoutRunnable = () -> {
                Log.i(TAG, "[BATTERY_OPTIMIZED_ATTENDANCE] Verification window expired; stopping high-accuracy GPS service. Native geofences remain active.");
                stopSelf();
            };
            serviceHandler.postDelayed(verificationTimeoutRunnable, MAX_VERIFICATION_WINDOW_MS);
        } catch (Exception e) { Log.w(TAG, "Unable to schedule verification timeout: " + e.getMessage()); }
    }

    private void acquireCpuWakeLock() {
        try {
            if (cpuWakeLock != null && cpuWakeLock.isHeld()) return;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                cpuWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, TAG + ":AttendanceCpu");
                cpuWakeLock.setReferenceCounted(false);
                cpuWakeLock.acquire();
            }
        } catch (Exception e) { Log.w(TAG, "Unable to acquire CPU wake lock: " + e.getMessage()); }
    }

    private void releaseCpuWakeLock() {
        try { if (cpuWakeLock != null && cpuWakeLock.isHeld()) cpuWakeLock.release(); }
        catch (Exception e) { Log.w(TAG, "Unable to release CPU wake lock: " + e.getMessage()); }
        finally { cpuWakeLock = null; }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Smart Workforce Office Location Service", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Temporary background attendance verification");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Smart Workforce Attendance")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return;
        }
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
                .setMinUpdateIntervalMillis(2_500L)
                .setMaxUpdateDelayMillis(5_000L)
                .setWaitForAccurateLocation(true)
                .build();
        locationCallback = new LocationCallback() {
            @Override public void onLocationResult(LocationResult result) {
                if (result == null) return;
                for (Location location : result.getLocations()) if (location != null) processLocationUpdate(location);
            }
        };
        try { fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper()); }
        catch (SecurityException e) { Log.e(TAG, "Location permission error: " + e.getMessage(), e); stopSelf(); }
        catch (Exception e) { Log.e(TAG, "Unable to request verification location updates: " + e.getMessage(), e); stopSelf(); }
    }

    private void processLocationUpdate(Location location) {
        if (location == null) return;
        double distance = OfficeGeofenceHelper.calculateDistance(location.getLatitude(), location.getLongitude(), OfficeGeofenceHelper.OFFICE_LAT, OfficeGeofenceHelper.OFFICE_LNG);
        long timestamp = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        OfficeGeofenceHelper.saveLastLocationDiagnostic(this, location.getLatitude(), location.getLongitude(), location.getAccuracy(), timestamp, distance);
        if (location.getAccuracy() > OfficeGeofenceHelper.MAX_USABLE_ACCURACY_METERS) return;

        JSONObject session = OfficeGeofenceHelper.getActiveSession(this);
        if (session != null) {
            String storedDate = session.optString("date", "");
            String today = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date());
            if (!today.equals(storedDate)) session = null;
        }

        if (session == null) {
            if (distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS && OfficeGeofenceHelper.isLocationTrustworthyForCheckIn(location)) {
                OfficeGeofenceHelper.evaluateAttendanceDecision(this, location, "NATIVE_BACKGROUND_FUSED_LOCATION", com.google.android.gms.location.Geofence.GEOFENCE_TRANSITION_ENTER, null, null);
                stopSelf();
            }
            return;
        }

        String state = session.optString("sessionState", "ACTIVE");
        if ("ACTIVE".equalsIgnoreCase(state)) {
            if (distance > OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) {
                long candidate = getPendingExitCandidateTimestamp(session, timestamp);
                if (candidate <= 0) candidate = timestamp;
                latchPendingExitCandidate(this, session, candidate);
                consecutiveOutsideCount++;
                consecutiveInsideCount = 0;
                if (consecutiveOutsideCount >= REQUIRED_OUTSIDE_CONFIRMATIONS) {
                    consecutiveOutsideCount = 0;
                    long authoritativeExit = getPendingExitCandidateTimestamp(session, candidate);
                    if (authoritativeExit <= 0) authoritativeExit = candidate;
                    Log.i(TAG, "[NATIVE ATTENDANCE] Stable 25m exit confirmed; preserving first outside timestamp=" + authoritativeExit);
                    OfficeGeofenceHelper.processExitTransition(this, location, "NATIVE_FUSED_LOCATION", "FUSED_CURRENT", null, null, authoritativeExit);
                    clearPendingExitCandidate(this);
                    stopSelf();
                }
            } else {
                consecutiveOutsideCount = 0;
                consecutiveInsideCount++;
                clearPendingExitCandidate(this);
                if (consecutiveInsideCount >= REQUIRED_INSIDE_CONFIRMATIONS) {
                    consecutiveInsideCount = 0;
                    stopSelf();
                }
            }
            return;
        }

        if ("PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state) || "PENDING_AUTO_CHECKOUT".equalsIgnoreCase(state) || OfficeGeofenceHelper.STATE_EXIT_PROMPT_RESOLVED_OUTSIDE.equalsIgnoreCase(state) || "RETURNING_TO_OFFICE".equalsIgnoreCase(state)) {
            if (distance <= OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS) {
                consecutiveInsideCount++;
                consecutiveOutsideCount = 0;
                if (consecutiveInsideCount >= REQUIRED_INSIDE_CONFIRMATIONS) {
                    consecutiveInsideCount = 0;
                    clearPendingExitCandidate(this);
                    OfficeGeofenceHelper.processReturnTransition(this, location, "NATIVE_FUSED_LOCATION_RETURN", null, null);
                    stopSelf();
                }
            } else consecutiveInsideCount = 0;
            return;
        }

        if ("CHECKED_OUT".equalsIgnoreCase(state) || "FINALIZED".equalsIgnoreCase(state)) {
            clearPendingExitCandidate(this);
            consecutiveOutsideCount = 0;
            consecutiveInsideCount = 0;
            stopSelf();
        }
    }

    private long getPendingExitCandidateTimestamp(JSONObject session, long fallback) {
        SharedPreferences prefs = getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
        long candidate = prefs.getLong(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP, 0L);
        String candidateSession = prefs.getString(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID, "");
        String candidateDate = prefs.getString(KEY_PENDING_EXIT_CANDIDATE_DATE, "");
        String sessionId = session != null ? session.optString("attendanceId", "") : "";
        String sessionDate = session != null ? session.optString("date", "") : "";
        if (candidate > 0 && (candidateSession.isEmpty() || candidateSession.equals(sessionId)) && (candidateDate.isEmpty() || candidateDate.equals(sessionDate))) return candidate;
        return fallback;
    }

    private void latchPendingExitCandidate(Context context, JSONObject session, long timestamp) {
        if (context == null || timestamp <= 0) return;
        SharedPreferences prefs = context.getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
        long existing = prefs.getLong(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP, 0L);
        String existingSession = prefs.getString(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID, "");
        String sessionId = session != null ? session.optString("attendanceId", "") : "";
        if (existing > 0 && (existingSession.isEmpty() || existingSession.equals(sessionId))) return;
        prefs.edit().putLong(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP, timestamp).putString(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID, sessionId).putString(KEY_PENDING_EXIT_CANDIDATE_DATE, session != null ? session.optString("date", "") : "").apply();
    }

    private static void clearPendingExitCandidate(Context context) {
        if (context == null) return;
        context.getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE).edit()
                .remove(KEY_PENDING_EXIT_CANDIDATE_TIMESTAMP).remove(KEY_PENDING_EXIT_CANDIDATE_SESSION_ID).remove(KEY_PENDING_EXIT_CANDIDATE_DATE).apply();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try { OfficeGeofenceHelper.registerOfficeGeofence(getApplicationContext()); }
        catch (Exception e) { Log.w(TAG, "[BATTERY_OPTIMIZED_ATTENDANCE] Geofence re-registration failed: " + e.getMessage()); }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        if (serviceHandler != null && verificationTimeoutRunnable != null) {
            try { serviceHandler.removeCallbacks(verificationTimeoutRunnable); } catch (Exception ignored) { }
        }
        verificationTimeoutRunnable = null;
        if (fusedLocationClient != null && locationCallback != null) {
            try { fusedLocationClient.removeLocationUpdates(locationCallback); } catch (Exception e) { Log.w(TAG, "Error removing location updates: " + e.getMessage()); }
        }
        releaseCpuWakeLock();
        isServiceRunning = false;
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }
}
