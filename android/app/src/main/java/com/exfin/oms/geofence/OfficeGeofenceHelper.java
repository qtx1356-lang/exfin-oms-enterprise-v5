package com.exfin.oms.geofence;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.android.gms.tasks.CancellationTokenSource;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Production-Hardened Authoritative Native Background Attendance Engine for EXFIN OMS.
 *
 * MISSION-CRITICAL RELIABILITY ARCHITECTURE:
 * 1. Two-Stage Wake-Up: 120m GeofencingClient circle triggers WakeLock + CPU wake-up.
 * 2. Strict Authoritative 25.0m Boundary: Haversine distance <= 25.0m = INSIDE, > 25.0m = OUTSIDE.
 * 3. Accuracy & Jitter Filtering: Rejects accuracy > 50.0m. Requires consecutive confirmations or hysteresis.
 * 4. Debounced Boundary Transitions: Prevents rapid ping-pong transitions (60s minimum transition interval).
 * 5. Idempotent Deduplication: Deterministic canonical event IDs prevent duplicate check-ins or check-outs.
 * 6. Autonomous Background HTTP Queue: Direct sync to /api/median-background-location with automatic network recovery.
 * 7. Multi-OS Android 12/13/14/15/16 Compliance: Proper PendingIntent flags, ForegroundServiceTypes, and power locks.
 */
public class OfficeGeofenceHelper {
    public static final String TAG = "OfficeGeofenceHelper";

    // Office Geofence Authoritative Parameters
    public static final String OFFICE_NAME = "EXFIN OFFICE";
    public static final double OFFICE_LAT = 23.616227;
    public static final double OFFICE_LNG = 87.117063;
    public static final float AUTHORITATIVE_RADIUS_METERS = 25.0f; // 25m Authoritative Boundary (UNCHANGED)
    public static final float WAKEUP_TRIGGER_RADIUS_METERS = 120.0f; // 120m Wake-Up Radius ONLY

    public static final float MAX_USABLE_ACCURACY_METERS = 50.0f; // Reject fixes with accuracy > 50m
    public static final long MIN_TRANSITION_COOLDOWN_MS = 60000L; // 60s cooldown to prevent boundary oscillation

    public static final String GEOFENCE_ID = "exfin_office_geofence_wake_120m";
    public static final int SCHEMA_VERSION = 2;

    // Persistent SharedPreferences Storage
    public static final String PREFS_NAME = "exfin_native_geofence_prefs";
    public static final String KEY_EVENTS = "unconsumed_geofence_events";
    public static final String KEY_SYNC_QUEUE = "exfin_native_sync_queue";
    public static final String KEY_ACTIVE_SESSION = "active_attendance_session";
    public static final String KEY_LAST_LOCATION_DIAGNOSTIC = "last_location_diagnostic";
    public static final String KEY_IS_REGISTERED = "is_geofence_registered";
    public static final String KEY_LAST_KNOWN_STATE = "last_known_inside_outside_state"; // "INSIDE", "OUTSIDE", "UNKNOWN"
    public static final String KEY_LAST_CHECKIN_TIMESTAMP = "last_check_in_timestamp";
    public static final String KEY_LAST_CHECKOUT_TIMESTAMP = "last_check_out_timestamp";
    public static final String KEY_LAST_TRANSITION_TIMESTAMP = "last_transition_timestamp";
    public static final String KEY_LAST_PROCESSED_EVENT_ID = "last_processed_geofence_event_id";
    public static final String KEY_LAST_NATIVE_TRIGGER = "last_native_trigger_time";
    public static final String KEY_LAST_NATIVE_ERROR = "last_native_error";
    public static final String KEY_LAST_SYNC_TIME = "last_sync_timestamp";
    public static final String KEY_LAST_EXIT_TIME = "last_native_exit_time";

    private static PendingIntent geofencePendingIntent;
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static boolean isSyncRunning = false;
    private static boolean isNetworkCallbackRegistered = false;

    // Consecutive reading trackers for GPS noise / jitter suppression
    private static int consecutiveOutsideReadings = 0;
    private static int consecutiveInsideReadings = 0;

    /**
     * Registers the native Android Geofence with 120m wake-up radius.
     */
    public static void registerOfficeGeofence(Context context) {
        if (context == null) return;

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Cannot register geofence: ACCESS_FINE_LOCATION permission not granted");
            setGeofenceRegistered(context, false);
            return;
        }

        try {
            GeofencingClient geofencingClient = LocationServices.getGeofencingClient(context);

            Geofence geofence = new Geofence.Builder()
                    .setRequestId(GEOFENCE_ID)
                    .setCircularRegion(OFFICE_LAT, OFFICE_LNG, WAKEUP_TRIGGER_RADIUS_METERS)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_EXIT | Geofence.GEOFENCE_TRANSITION_DWELL)
                    .setLoiteringDelay(5000) // 5 second dwell
                    .setNotificationResponsiveness(0) // Immediate wake-up
                    .build();

            GeofencingRequest request = new GeofencingRequest.Builder()
                    .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER | GeofencingRequest.INITIAL_TRIGGER_DWELL)
                    .addGeofence(geofence)
                    .build();

            PendingIntent pendingIntent = getGeofencePendingIntent(context);

            geofencingClient.addGeofences(request, pendingIntent)
                    .addOnSuccessListener(aVoid -> {
                        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                        String empId = prefs.getString("employee_id", "UNKNOWN");
                        Log.i(TAG, "[NATIVE_GEOFENCE_REGISTERED] employeeId=" + empId + " wakeRadius=" + WAKEUP_TRIGGER_RADIUS_METERS + "m authRadius=" + AUTHORITATIVE_RADIUS_METERS + "m");
                        setGeofenceRegistered(context, true);
                    })
                    .addOnFailureListener(e -> {
                        Log.e(TAG, "Failed to register office geofence: " + e.getMessage(), e);
                        setGeofenceRegistered(context, false);
                        recordNativeError(context, "Registration failed: " + e.getMessage());
                    });
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException registering geofence: " + se.getMessage(), se);
            recordNativeError(context, "SecurityException: " + se.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Exception registering geofence: " + e.getMessage(), e);
            recordNativeError(context, "Exception: " + e.getMessage());
        }
    }

    public static void removeOfficeGeofence(Context context) {
        if (context == null) return;
        try {
            GeofencingClient geofencingClient = LocationServices.getGeofencingClient(context);
            PendingIntent pendingIntent = getGeofencePendingIntent(context);
            geofencingClient.removeGeofences(pendingIntent)
                    .addOnCompleteListener(task -> {
                        Log.i(TAG, "Office geofence removed.");
                        setGeofenceRegistered(context, false);
                    });
        } catch (Exception e) {
            Log.e(TAG, "Error removing geofence: " + e.getMessage(), e);
        }
    }

    private static PendingIntent getGeofencePendingIntent(Context context) {
        if (geofencePendingIntent != null) {
            return geofencePendingIntent;
        }
        Intent intent = new Intent(context, GeofenceBroadcastReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        geofencePendingIntent = PendingIntent.getBroadcast(context, 2501, intent, flags);
        return geofencePendingIntent;
    }

    /**
     * Exact Haversine distance calculation in meters.
     */
    public static double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371000; // Earth radius in meters
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                   Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                   Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static void safeFinishPendingResult(BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        if (pendingResult != null && finishedFlag != null) {
            if (finishedFlag.compareAndSet(false, true)) {
                try {
                    Log.i(TAG, "[NativeGeofenceLifecycle] GO_ASYNC_FINISHED");
                    pendingResult.finish();
                } catch (Exception e) {
                    Log.w(TAG, "Error finishing BroadcastReceiver.PendingResult", e);
                }
            }
        }
    }

    /**
     * Handles geofence wake-up trigger and begins Stage 2 high-accuracy location verification.
     */
    public static void handleNativeGeofenceTransition(Context context, int transitionType, Location triggerLocation, BroadcastReceiver.PendingResult pendingResult) {
        final AtomicBoolean finishedFlag = new AtomicBoolean(false);
        if (context == null) {
            safeFinishPendingResult(pendingResult, finishedFlag);
            return;
        }

        saveLastNativeTrigger(context, System.currentTimeMillis());

        // Acquire partial WakeLock to keep CPU active during high-accuracy fix & sync
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            try {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "exfin:geofence_verification");
                wakeLock.acquire(15000); // 15s max wake lock
            } catch (Exception e) {
                Log.w(TAG, "Could not acquire WakeLock: " + e.getMessage());
            }
        }

        final PowerManager.WakeLock finalWakeLock = wakeLock;

        executor.execute(() -> {
            try {
                requestHighAccuracyLocationAndDecide(context, transitionType, triggerLocation, pendingResult, finishedFlag);
            } catch (Exception e) {
                Log.e(TAG, "Error in handleNativeGeofenceTransition task: " + e.getMessage(), e);
                recordNativeError(context, "handleNativeGeofenceTransition: " + e.getMessage());
                safeFinishPendingResult(pendingResult, finishedFlag);
            } finally {
                if (finalWakeLock != null && finalWakeLock.isHeld()) {
                    try {
                        finalWakeLock.release();
                    } catch (Exception e) {
                        Log.w(TAG, "Error releasing WakeLock: " + e.getMessage());
                    }
                }
            }
        });
    }

    private static void requestHighAccuracyLocationAndDecide(Context context, int transitionType, Location triggerLocation, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "ACCESS_FINE_LOCATION not granted during geofence wake-up");
            safeFinishPendingResult(pendingResult, finishedFlag);
            return;
        }

        FusedLocationProviderClient fusedClient = LocationServices.getFusedLocationProviderClient(context);
        CancellationTokenSource cts = new CancellationTokenSource();

        try {
            fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.getToken())
                    .addOnSuccessListener(location -> {
                        if (location != null && validateLocation(location)) {
                            Log.i(TAG, "Fresh high-accuracy location obtained: " + location.getLatitude() + ", " + location.getLongitude() + " (acc=" + location.getAccuracy() + "m)");
                            evaluateAttendanceDecision(context, location, transitionType, pendingResult, finishedFlag);
                        } else {
                            fallbackToLastLocation(context, fusedClient, triggerLocation, transitionType, pendingResult, finishedFlag);
                        }
                    })
                    .addOnFailureListener(e -> {
                        Log.w(TAG, "getCurrentLocation failed: " + e.getMessage() + ". Falling back to last known location.");
                        fallbackToLastLocation(context, fusedClient, triggerLocation, transitionType, pendingResult, finishedFlag);
                    });
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException getting current location", se);
            fallbackToLastLocation(context, fusedClient, triggerLocation, transitionType, pendingResult, finishedFlag);
        } catch (Exception e) {
            Log.e(TAG, "Exception getting current location", e);
            fallbackToLastLocation(context, fusedClient, triggerLocation, transitionType, pendingResult, finishedFlag);
        }
    }

    private static void fallbackToLastLocation(Context context, FusedLocationProviderClient fusedClient, Location triggerLocation, int transitionType, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        try {
            fusedClient.getLastLocation()
                    .addOnSuccessListener(location -> {
                        if (location != null && validateLocation(location)) {
                            Log.i(TAG, "Using FusedLocationProviderClient lastLocation: " + location.getLatitude() + ", " + location.getLongitude() + " (acc=" + location.getAccuracy() + "m)");
                            evaluateAttendanceDecision(context, location, transitionType, pendingResult, finishedFlag);
                        } else if (triggerLocation != null && validateLocation(triggerLocation)) {
                            Log.i(TAG, "Using geofence triggerLocation: " + triggerLocation.getLatitude() + ", " + triggerLocation.getLongitude());
                            evaluateAttendanceDecision(context, triggerLocation, transitionType, pendingResult, finishedFlag);
                        } else {
                            Location lmLoc = getSystemLastKnownLocation(context);
                            if (lmLoc != null && validateLocation(lmLoc)) {
                                Log.i(TAG, "Using LocationManager lastKnownLocation: " + lmLoc.getLatitude() + ", " + lmLoc.getLongitude());
                                evaluateAttendanceDecision(context, lmLoc, transitionType, pendingResult, finishedFlag);
                            } else {
                                Log.w(TAG, "No valid high-accuracy location available after geofence wake-up.");
                                recordNativeError(context, "No valid location fix available");
                                safeFinishPendingResult(pendingResult, finishedFlag);
                            }
                        }
                    })
                    .addOnFailureListener(e -> {
                        if (triggerLocation != null && validateLocation(triggerLocation)) {
                            evaluateAttendanceDecision(context, triggerLocation, transitionType, pendingResult, finishedFlag);
                        } else {
                            safeFinishPendingResult(pendingResult, finishedFlag);
                        }
                    });
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException in fallbackToLastLocation", se);
            safeFinishPendingResult(pendingResult, finishedFlag);
        } catch (Exception e) {
            Log.e(TAG, "Exception in fallbackToLastLocation", e);
            safeFinishPendingResult(pendingResult, finishedFlag);
        }
    }

    private static Location getSystemLastKnownLocation(Context context) {
        try {
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;
            Location loc = null;
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                loc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            }
            if (loc == null && lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                loc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            }
            return loc;
        } catch (SecurityException se) {
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Validates location coordinates, freshness, and accuracy.
     * Rejects accuracy > 50.0m to prevent inaccurate cell tower jumps from falsifying attendance.
     */
    public static boolean validateLocation(Location location) {
        if (location == null) return false;
        double lat = location.getLatitude();
        double lng = location.getLongitude();
        if (Double.isNaN(lat) || Double.isNaN(lng) || Double.isInfinite(lat) || Double.isInfinite(lng)) return false;
        if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) return false;
        if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false; // Reject 0,0

        // Reject fixes with poor accuracy (> 50m)
        if (location.hasAccuracy() && location.getAccuracy() > MAX_USABLE_ACCURACY_METERS) {
            Log.d(TAG, "Rejecting location with poor accuracy: " + location.getAccuracy() + "m > " + MAX_USABLE_ACCURACY_METERS + "m");
            return false;
        }

        // Reject stale fixes older than 5 minutes
        long ageMs = System.currentTimeMillis() - location.getTime();
        if (location.getTime() > 0 && ageMs > 300000) {
            Log.d(TAG, "Rejecting stale location fix (age=" + (ageMs / 1000) + "s)");
            return false;
        }
        return true;
    }

    /**
     * Authoritative decision logic:
     * Calculates distance using Haversine formula against EXFIN Office (23.616227, 87.117063).
     * distance <= 25.0m => INSIDE
     * distance > 25.0m => OUTSIDE
     */
    public static synchronized void evaluateAttendanceDecision(Context context, Location location, int transitionType, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        if (context == null || location == null) {
            safeFinishPendingResult(pendingResult, finishedFlag);
            return;
        }

        double lat = location.getLatitude();
        double lng = location.getLongitude();
        float accuracy = location.getAccuracy();
        long eventTimestamp = (location.getTime() > 0) ? location.getTime() : System.currentTimeMillis();

        double distance = calculateDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
        saveLastLocationDiagnostic(context, lat, lng, accuracy, eventTimestamp, distance);

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String lastKnownState = prefs.getString(KEY_LAST_KNOWN_STATE, "UNKNOWN");
        long lastTransitionTime = prefs.getLong(KEY_LAST_TRANSITION_TIMESTAMP, 0);
        String currentCalculatedState = (distance <= AUTHORITATIVE_RADIUS_METERS) ? "INSIDE" : "OUTSIDE";

        Log.i(TAG, "[Authoritative Decision] Verified distance: " + String.format(Locale.US, "%.1f", distance) + "m (acc=" + accuracy + "m). Current: " + currentCalculatedState + ", Prev: " + lastKnownState);

        // Date strings in Asia/Kolkata timezone
        Date eventDate = new Date(eventTimestamp);
        SimpleDateFormat sdfTime = new SimpleDateFormat("hh:mm a", Locale.US);
        sdfTime.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        String timeStr = sdfTime.format(eventDate);

        SimpleDateFormat sdfDate = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        sdfDate.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        String dateStr = sdfDate.format(eventDate);

        String employeeId = prefs.getString("employee_id", "");
        String employeeName = prefs.getString("employee_name", "Employee");
        String townCity = prefs.getString("town_city", "Raniganj HQ");

        // -------------------------------------------------------------
        // ENTRY LOGIC: OUTSIDE -> INSIDE (distance <= 25.0m)
        // -------------------------------------------------------------
        if ("INSIDE".equals(currentCalculatedState)) {
            consecutiveInsideReadings++;
            consecutiveOutsideReadings = 0;

            boolean hasOpenSession = hasActiveSessionForDate(context, dateStr);

            // Debounce check: prevent rapid oscillation if transitioned within last 60s
            long timeSinceLastTransition = eventTimestamp - lastTransitionTime;
            if ("OUTSIDE".equals(lastKnownState) && timeSinceLastTransition < MIN_TRANSITION_COOLDOWN_MS && lastTransitionTime > 0) {
                Log.i(TAG, "Debounce: Skipping rapid transition to INSIDE (elapsed: " + (timeSinceLastTransition / 1000) + "s < 60s)");
                safeFinishPendingResult(pendingResult, finishedFlag);
                return;
            }

            if (!"INSIDE".equals(lastKnownState) || !hasOpenSession) {
                Log.i(TAG, "=== NATIVE AUTHORITATIVE CHECK-IN TRIGGERED (Distance: " + String.format(Locale.US, "%.1f", distance) + "m <= 25m) ===");

                String eventId = "evt_native_CHECK_IN_" + employeeId + "_" + dateStr;

                // Create persistent event
                JSONObject checkInEvent = new JSONObject();
                try {
                    checkInEvent.put("eventId", eventId);
                    checkInEvent.put("employeeId", employeeId);
                    checkInEvent.put("employeeName", employeeName);
                    checkInEvent.put("townCity", townCity);
                    checkInEvent.put("eventType", "CHECK_IN");
                    checkInEvent.put("transition", "ENTER");
                    checkInEvent.put("timestamp", eventTimestamp);
                    checkInEvent.put("eventTimestamp", eventTimestamp);
                    checkInEvent.put("createdAt", System.currentTimeMillis());
                    checkInEvent.put("time", timeStr);
                    checkInEvent.put("date", dateStr);
                    checkInEvent.put("latitude", lat);
                    checkInEvent.put("longitude", lng);
                    checkInEvent.put("accuracy", accuracy);
                    checkInEvent.put("distanceFromOffice", distance);
                    checkInEvent.put("distance", distance);
                    checkInEvent.put("source", "native_geofence");
                    checkInEvent.put("schemaVersion", SCHEMA_VERSION);
                    checkInEvent.put("deviceId", getDeviceId(context));
                    checkInEvent.put("syncStatus", "PENDING");
                    checkInEvent.put("retryCount", 0);
                } catch (Exception e) {
                    Log.e(TAG, "Error constructing check-in JSON: " + e.getMessage());
                }

                // Update native persistent state
                SharedPreferences.Editor editor = prefs.edit();
                editor.putString(KEY_LAST_KNOWN_STATE, "INSIDE");
                editor.putLong(KEY_LAST_CHECKIN_TIMESTAMP, eventTimestamp);
                editor.putLong(KEY_LAST_TRANSITION_TIMESTAMP, eventTimestamp);
                editor.putString(KEY_LAST_PROCESSED_EVENT_ID, eventId);
                editor.apply();

                // Persist session
                startActiveSession(context, employeeId, employeeName, townCity, dateStr, timeStr);

                // Add to unconsumed events queue for JS bridge
                addUnconsumedEvent(context, checkInEvent);

                // Add to offline sync queue (with deduplication)
                addEventToSyncQueue(context, checkInEvent);

                // Notify JS listeners if webview is active
                GeofencePlugin.notifyNativeCheckIn(checkInEvent);
                GeofencePlugin.notifyNativeTransition("ENTER", lat, lng, eventTimestamp);

                // Trigger autonomous background HTTP sync
                triggerBackgroundSync(context, pendingResult, finishedFlag);
                return;
            } else {
                Log.d(TAG, "Already verified inside office with active check-in. Duplicate check-in suppressed.");
            }
        }
        // -------------------------------------------------------------
        // EXIT LOGIC: INSIDE -> OUTSIDE (distance > 25.0m)
        // -------------------------------------------------------------
        else if ("OUTSIDE".equals(currentCalculatedState)) {
            consecutiveOutsideReadings++;
            consecutiveInsideReadings = 0;

            JSONObject activeSession = getActiveSession(context);
            boolean hasOpenSession = (activeSession != null && 
                    ("ACTIVE".equalsIgnoreCase(activeSession.optString("sessionState")) || 
                     "PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(activeSession.optString("sessionState"))));

            // Debounce check: prevent rapid oscillation if transitioned within last 60s unless distance > 100m
            long timeSinceLastTransition = eventTimestamp - lastTransitionTime;
            if ("INSIDE".equals(lastKnownState) && distance < 100.0 && timeSinceLastTransition < MIN_TRANSITION_COOLDOWN_MS && lastTransitionTime > 0) {
                Log.i(TAG, "Debounce: Skipping rapid transition to OUTSIDE (elapsed: " + (timeSinceLastTransition / 1000) + "s < 60s)");
                safeFinishPendingResult(pendingResult, finishedFlag);
                return;
            }

            if ("INSIDE".equals(lastKnownState) || hasOpenSession) {
                // Jitter protection: If accuracy > 30m and distance is close to boundary, require 2 consecutive readings
                if (accuracy > 30.0f && distance <= 35.0 && consecutiveOutsideReadings < 2) {
                    Log.i(TAG, "Exit detected near boundary with moderate accuracy (" + accuracy + "m, dist=" + Math.round(distance) + "m). Waiting for second reading confirmation.");
                    safeFinishPendingResult(pendingResult, finishedFlag);
                    return;
                }

                consecutiveOutsideReadings = 0;
                Log.i(TAG, "=== NATIVE AUTHORITATIVE CHECK-OUT TRIGGERED (Distance: " + String.format(Locale.US, "%.1f", distance) + "m > 25m) ===");

                String eventId = "evt_native_CHECK_OUT_" + employeeId + "_" + dateStr + "_" + eventTimestamp;

                JSONObject checkOutEvent = new JSONObject();
                try {
                    checkOutEvent.put("eventId", eventId);
                    checkOutEvent.put("employeeId", employeeId);
                    checkOutEvent.put("employeeName", employeeName);
                    checkOutEvent.put("townCity", townCity);
                    checkOutEvent.put("eventType", "CHECK_OUT");
                    checkOutEvent.put("transition", "EXIT");
                    checkOutEvent.put("timestamp", eventTimestamp);
                    checkOutEvent.put("eventTimestamp", eventTimestamp);
                    checkOutEvent.put("exitTimestamp", eventTimestamp);
                    checkOutEvent.put("createdAt", System.currentTimeMillis());
                    checkOutEvent.put("time", timeStr);
                    checkOutEvent.put("date", dateStr);
                    checkOutEvent.put("latitude", lat);
                    checkOutEvent.put("longitude", lng);
                    checkOutEvent.put("accuracy", accuracy);
                    checkOutEvent.put("distanceFromOffice", distance);
                    checkOutEvent.put("distance", distance);
                    checkOutEvent.put("source", "native_geofence");
                    checkOutEvent.put("schemaVersion", SCHEMA_VERSION);
                    checkOutEvent.put("deviceId", getDeviceId(context));
                    checkOutEvent.put("syncStatus", "PENDING");
                    checkOutEvent.put("retryCount", 0);
                } catch (Exception e) {
                    Log.e(TAG, "Error constructing check-out JSON: " + e.getMessage());
                }

                // Update native persistent state
                SharedPreferences.Editor editor = prefs.edit();
                editor.putString(KEY_LAST_KNOWN_STATE, "OUTSIDE");
                editor.putLong(KEY_LAST_CHECKOUT_TIMESTAMP, eventTimestamp);
                editor.putLong(KEY_LAST_TRANSITION_TIMESTAMP, eventTimestamp);
                editor.putString(KEY_LAST_PROCESSED_EVENT_ID, eventId);
                editor.putString(KEY_LAST_EXIT_TIME, timeStr);
                editor.apply();

                // Update active session with immutable exit time
                recordExitEvent(context, location, "NATIVE_GEOFENCE_VERIFIED");

                // Add to unconsumed events queue for JS bridge
                addUnconsumedEvent(context, checkOutEvent);

                // Add to offline sync queue (with deduplication)
                addEventToSyncQueue(context, checkOutEvent);

                // Notify JS listeners if webview is active
                GeofencePlugin.notifyNativeCheckOut(checkOutEvent);
                GeofencePlugin.notifyNativeTransition("EXIT", lat, lng, eventTimestamp);

                // Trigger autonomous background HTTP sync
                triggerBackgroundSync(context, pendingResult, finishedFlag);
                return;
            } else {
                Log.d(TAG, "Already verified outside office with no active session to checkout.");
            }
        }

        safeFinishPendingResult(pendingResult, finishedFlag);
    }

    private static String getDeviceId(Context context) {
        try {
            return android.provider.Settings.Secure.getString(context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
        } catch (Exception e) {
            return "UNKNOWN_DEVICE";
        }
    }

    private static boolean hasActiveSessionForDate(Context context, String dateStr) {
        JSONObject session = getActiveSession(context);
        if (session != null) {
            String sessDate = session.optString("date", "");
            String state = session.optString("sessionState", "");
            return dateStr.equals(sessDate) && ("ACTIVE".equalsIgnoreCase(state) || "PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state));
        }
        return false;
    }

    private static synchronized void addUnconsumedEvent(Context context, JSONObject event) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(KEY_EVENTS, "[]");
            JSONArray arr = new JSONArray(existing);
            arr.put(event);
            prefs.edit().putString(KEY_EVENTS, arr.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Error adding unconsumed event: " + e.getMessage());
        }
    }

    /**
     * Queues an event for offline background sync with duplicate suppression.
     */
    private static synchronized void addEventToSyncQueue(Context context, JSONObject event) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(KEY_SYNC_QUEUE, "[]");
            JSONArray arr = new JSONArray(existing);

            String targetEventId = event.optString("eventId");
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item != null && targetEventId.equals(item.optString("eventId"))) {
                    Log.d(TAG, "Event already in sync queue: " + targetEventId + ". Skipping duplicate enqueue.");
                    return;
                }
            }

            arr.put(event);
            prefs.edit().putString(KEY_SYNC_QUEUE, arr.toString()).apply();
            Log.i(TAG, "Event queued for background sync: " + targetEventId);
        } catch (Exception e) {
            Log.e(TAG, "Error adding event to sync queue: " + e.getMessage());
        }
    }

    public static JSONArray getAndClearUnconsumedEvents(Context context) {
        if (context == null) return new JSONArray();
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingEventsJson = prefs.getString(KEY_EVENTS, "[]");
            JSONArray events = new JSONArray(existingEventsJson);
            prefs.edit().putString(KEY_EVENTS, "[]").apply();
            return events;
        } catch (Exception e) {
            Log.e(TAG, "Failed to get unconsumed events: " + e.getMessage(), e);
            return new JSONArray();
        }
    }

    public static void registerNetworkCallbackIfNecessary(Context context) {
        if (context == null || isNetworkCallbackRegistered) return;
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                cm.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
                    @Override
                    public void onAvailable(Network network) {
                        Log.i(TAG, "Network became available. Draining native offline attendance queue...");
                        triggerBackgroundSync(context);
                    }
                });
                isNetworkCallbackRegistered = true;
                Log.i(TAG, "Default network callback registered for background attendance sync.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register network callback: " + e.getMessage(), e);
        }
    }

    public static void triggerBackgroundSync(Context context) {
        triggerBackgroundSync(context, null, null);
    }

    public static void triggerBackgroundSync(Context context, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        if (context == null) {
            safeFinishPendingResult(pendingResult, finishedFlag);
            return;
        }
        registerNetworkCallbackIfNecessary(context);

        executor.execute(() -> {
            synchronized (OfficeGeofenceHelper.class) {
                if (isSyncRunning) {
                    safeFinishPendingResult(pendingResult, finishedFlag);
                    return;
                }
                isSyncRunning = true;
            }
            try {
                performBackgroundSync(context, pendingResult, finishedFlag);
            } catch (Exception e) {
                Log.e(TAG, "Exception during background sync task:", e);
                safeFinishPendingResult(pendingResult, finishedFlag);
            } finally {
                synchronized (OfficeGeofenceHelper.class) {
                    isSyncRunning = false;
                }
            }
        });
    }

    private static void performBackgroundSync(Context context, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String serverUrl = prefs.getString("server_url", null);
            if (serverUrl == null || serverUrl.trim().isEmpty()) {
                Log.w(TAG, "Cannot sync: server_url is not configured in SharedPreferences.");
                return;
            }

            String queueStr = prefs.getString(KEY_SYNC_QUEUE, "[]");
            JSONArray queue;
            try {
                queue = new JSONArray(queueStr);
            } catch (Exception e) {
                Log.e(TAG, "Failed to parse sync queue: " + e.getMessage());
                return;
            }

            if (queue.length() == 0) {
                return;
            }

            Log.i(TAG, "Draining native offline sync queue: " + queue.length() + " pending events...");
            JSONArray remainingQueue = new JSONArray();

            for (int i = 0; i < queue.length(); i++) {
                JSONObject event = queue.optJSONObject(i);
                if (event == null) continue;

                String eventId = event.optString("eventId");
                String employeeId = event.optString("employeeId");
                String eventType = event.optString("eventType");
                long eventTimestamp = event.optLong("eventTimestamp", event.optLong("timestamp", System.currentTimeMillis()));

                JSONObject payload = new JSONObject();
                try {
                    payload.put("employeeId", employeeId);
                    payload.put("employeeName", event.optString("employeeName"));
                    payload.put("townCity", event.optString("townCity"));
                    payload.put("deviceId", event.optString("deviceId"));
                    payload.put("eventId", eventId);
                    payload.put("eventType", eventType);
                    payload.put("transition", event.optString("transition", eventType));
                    payload.put("distance", event.optDouble("distance", 25.0));
                    payload.put("distanceFromOffice", event.optDouble("distanceFromOffice", 25.0));
                    payload.put("source", "native_geofence");
                    payload.put("schemaVersion", SCHEMA_VERSION);
                    payload.put("latitude", event.optDouble("latitude", OFFICE_LAT));
                    payload.put("longitude", event.optDouble("longitude", OFFICE_LNG));
                    payload.put("accuracy", event.optDouble("accuracy", 20.0));

                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                    sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                    payload.put("timestamp", sdf.format(new Date(eventTimestamp)));
                } catch (Exception e) {
                    Log.e(TAG, "Failed to build payload for event " + eventId + ": " + e.getMessage());
                    remainingQueue.put(event);
                    continue;
                }

                boolean success = false;
                try {
                    URL url = new URL(serverUrl + "/api/median-background-location");
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);

                    OutputStream os = conn.getOutputStream();
                    os.write(payload.toString().getBytes("UTF-8"));
                    os.close();

                    int code = conn.getResponseCode();
                    if (code == 200 || code == 201) {
                        success = true;
                        Log.i(TAG, "Successfully synced native event " + eventId + " to backend (HTTP " + code + ").");
                        prefs.edit().putLong(KEY_LAST_SYNC_TIME, System.currentTimeMillis()).apply();
                        GeofencePlugin.notifyNativeSync(eventId, true);
                    } else {
                        Log.w(TAG, "Backend returned HTTP " + code + " for event " + eventId);
                    }
                    conn.disconnect();
                } catch (Exception e) {
                    Log.w(TAG, "Network failure syncing event " + eventId + ": " + e.getMessage());
                }

                if (!success) {
                    try {
                        int retryCount = event.optInt("retryCount", 0);
                        event.put("retryCount", retryCount + 1);
                        event.put("syncStatus", "RETRY");
                    } catch (Exception ignored) {}
                    remainingQueue.put(event);
                }
            }

            prefs.edit().putString(KEY_SYNC_QUEUE, remainingQueue.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Exception in performBackgroundSync", e);
        } finally {
            safeFinishPendingResult(pendingResult, finishedFlag);
        }
    }

    public static synchronized void startActiveSession(Context context, String employeeId, String employeeName, String townCity, String date, String checkInTime) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONObject session = new JSONObject();
            session.put("attendanceId", "att_" + employeeId + "_" + date);
            session.put("employeeId", employeeId);
            session.put("employeeName", employeeName);
            session.put("townCity", townCity != null ? townCity : "Raniganj HQ");
            session.put("date", date);
            session.put("checkInTime", checkInTime);
            session.put("attendanceMode", "OFFICE");
            session.put("officeLatitude", OFFICE_LAT);
            session.put("officeLongitude", OFFICE_LNG);
            session.put("geofenceRadius", AUTHORITATIVE_RADIUS_METERS);
            session.put("sessionState", "ACTIVE");
            session.put("checkoutStatus", "ACTIVE");
            session.put("recordedExitTime", JSONObject.NULL);
            session.put("exitDetectedAt", JSONObject.NULL);
            session.put("exitSource", "NONE");

            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(KEY_ACTIVE_SESSION, session.toString());
            editor.putString("employee_id", employeeId);
            editor.putString("employee_name", employeeName);
            editor.putString("town_city", townCity != null ? townCity : "Raniganj HQ");
            editor.apply();

            Log.i(TAG, "[NATIVE_SESSION_STARTED] Active office session initialized for " + employeeId + " at " + checkInTime);

            registerOfficeGeofence(context);
            OfficeLocationService.start(context);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start native active session: " + e.getMessage(), e);
        }
    }

    public static synchronized void clearActiveSession(Context context) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String sessionStr = prefs.getString(KEY_ACTIVE_SESSION, null);
            if (sessionStr != null) {
                JSONObject session = new JSONObject(sessionStr);
                session.put("sessionState", "FINALIZED");
                session.put("checkoutStatus", "FINALIZED");
                prefs.edit().putString(KEY_ACTIVE_SESSION, session.toString()).apply();
            }
            Log.i(TAG, "[NATIVE_SESSION_FINALIZED] Native active session cleared.");
            OfficeLocationService.stop(context);
        } catch (Exception e) {
            Log.e(TAG, "Failed to clear native active session: " + e.getMessage(), e);
        }
    }

    public static JSONObject getActiveSession(Context context) {
        if (context == null) return null;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String sessionStr = prefs.getString(KEY_ACTIVE_SESSION, null);
            if (sessionStr != null) {
                return new JSONObject(sessionStr);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error reading active session: " + e.getMessage(), e);
        }
        return null;
    }

    public static synchronized void recordExitEvent(Context context, Location location, String source) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String sessionStr = prefs.getString(KEY_ACTIVE_SESSION, null);
            if (sessionStr == null) return;

            JSONObject session = new JSONObject(sessionStr);
            String sessionState = session.optString("sessionState", "ACTIVE");
            if (!"ACTIVE".equals(sessionState) && !"PENDING_EXIT_CONFIRMATION".equals(sessionState)) {
                return;
            }

            String existingRecordedExitTime = session.optString("recordedExitTime", null);
            if (existingRecordedExitTime != null && !existingRecordedExitTime.isEmpty() && !"null".equals(existingRecordedExitTime)) {
                Log.i(TAG, "[IMMUTABLE_EXIT_TIME] Native exit timestamp already set: " + existingRecordedExitTime + ". Skipping overwrite from " + source);
                return;
            }

            long eventTimestamp = (location != null && location.getTime() > 0) ? location.getTime() : System.currentTimeMillis();
            SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            String timeStr = sdf.format(new Date(eventTimestamp));

            SimpleDateFormat isoSdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            isoSdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String isoTimestamp = isoSdf.format(new Date(eventTimestamp));

            session.put("recordedExitTime", timeStr);
            session.put("exitDetectedAt", isoTimestamp);
            session.put("exitSource", source);
            session.put("sessionState", "PENDING_EXIT_CONFIRMATION");
            session.put("checkoutStatus", "PENDING_EXIT_CONFIRMATION");

            prefs.edit().putString(KEY_ACTIVE_SESSION, session.toString()).apply();
            Log.i(TAG, "[NATIVE_EXIT_RECORDED] Authoritative immutable exit time captured: " + timeStr + " via " + source);
        } catch (Exception e) {
            Log.e(TAG, "Failed to record native exit event: " + e.getMessage(), e);
        }
    }

    public static synchronized void cancelPendingExit(Context context) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String sessionStr = prefs.getString(KEY_ACTIVE_SESSION, null);
            if (sessionStr == null) return;

            JSONObject session = new JSONObject(sessionStr);
            if ("PENDING_EXIT_CONFIRMATION".equals(session.optString("sessionState"))) {
                session.put("recordedExitTime", JSONObject.NULL);
                session.put("exitDetectedAt", JSONObject.NULL);
                session.put("exitSource", "NONE");
                session.put("sessionState", "ACTIVE");
                session.put("checkoutStatus", "ACTIVE");
                prefs.edit().putString(KEY_ACTIVE_SESSION, session.toString()).apply();
                Log.i(TAG, "[NATIVE_RETURN_CANCELLED] Returned to office boundary. Cancelled pending exit state.");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to cancel pending exit: " + e.getMessage(), e);
        }
    }

    public static void saveLastLocationDiagnostic(Context context, double lat, double lng, float accuracy, long timestamp, double distance) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            JSONObject diag = new JSONObject();
            diag.put("latitude", lat);
            diag.put("longitude", lng);
            diag.put("accuracy", accuracy);
            diag.put("timestamp", timestamp);
            diag.put("distance", distance);
            prefs.edit().putString(KEY_LAST_LOCATION_DIAGNOSTIC, diag.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed to save last location diagnostic: " + e.getMessage());
        }
    }

    public static void saveLastNativeTrigger(Context context, long timestamp) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putLong(KEY_LAST_NATIVE_TRIGGER, timestamp).apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed to save last native trigger: " + e.getMessage());
        }
    }

    public static void recordNativeError(Context context, String error) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_LAST_NATIVE_ERROR, error + " (" + new Date().toString() + ")").apply();
            GeofencePlugin.notifyNativeError(error);
        } catch (Exception e) {
            Log.w(TAG, "Failed to record native error: " + e.getMessage());
        }
    }

    public static JSONObject getDiagnosticState(Context context) {
        JSONObject res = new JSONObject();
        if (context == null) return res;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean fineLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean bgLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean geofenceRegistered = isGeofenceRegistered(context);
            boolean locationServiceRunning = OfficeLocationService.isRunning();

            res.put("nativeGeofenceRegistered", geofenceRegistered);
            res.put("locationPermission", fineLocation ? "GRANTED" : "DENIED");
            res.put("backgroundLocationPermission", bgLocation ? "GRANTED" : "DENIED");
            res.put("foregroundService", locationServiceRunning ? "RUNNING" : "STOPPED");
            res.put("lastKnownState", prefs.getString(KEY_LAST_KNOWN_STATE, "UNKNOWN"));
            res.put("authoritativeRadiusMeters", AUTHORITATIVE_RADIUS_METERS);
            res.put("wakeupTriggerRadiusMeters", WAKEUP_TRIGGER_RADIUS_METERS);

            boolean ignoringBatteryOptimizations = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    ignoringBatteryOptimizations = pm.isIgnoringBatteryOptimizations(context.getPackageName());
                }
            }
            res.put("batteryOptimizationState", ignoringBatteryOptimizations ? "OPTIMIZED_DISABLED" : "RESTRICTED");

            String activeSessionStr = prefs.getString(KEY_ACTIVE_SESSION, null);
            if (activeSessionStr != null) {
                res.put("activeSession", new JSONObject(activeSessionStr));
            } else {
                res.put("activeSession", JSONObject.NULL);
            }

            String diagStr = prefs.getString(KEY_LAST_LOCATION_DIAGNOSTIC, null);
            if (diagStr != null) {
                JSONObject locObj = new JSONObject(diagStr);
                res.put("lastVerifiedLocation", locObj);
                res.put("lastVerifiedDistance", locObj.optDouble("distance", 0.0));
            }

            String syncQueueStr = prefs.getString(KEY_SYNC_QUEUE, "[]");
            JSONArray queueArr = new JSONArray(syncQueueStr);
            res.put("pendingEventCount", queueArr.length());

            res.put("lastNativeTrigger", prefs.getLong(KEY_LAST_NATIVE_TRIGGER, 0));
            res.put("lastCheckInTimestamp", prefs.getLong(KEY_LAST_CHECKIN_TIMESTAMP, 0));
            res.put("lastCheckOutTimestamp", prefs.getLong(KEY_LAST_CHECKOUT_TIMESTAMP, 0));
            res.put("lastSyncTime", prefs.getLong(KEY_LAST_SYNC_TIME, 0));
            res.put("lastNativeError", prefs.getString(KEY_LAST_NATIVE_ERROR, "None"));
            res.put("lastExitTime", prefs.getString(KEY_LAST_EXIT_TIME, null));
        } catch (Exception e) {
            Log.e(TAG, "Error generating diagnostic state: " + e.getMessage(), e);
        }
        return res;
    }

    public static boolean isGeofenceRegistered(Context context) {
        if (context == null) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_IS_REGISTERED, false);
    }

    public static void setGeofenceRegistered(Context context, boolean registered) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_IS_REGISTERED, registered).apply();
    }
}
