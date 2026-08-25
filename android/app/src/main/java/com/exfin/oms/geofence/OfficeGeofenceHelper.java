package com.exfin.oms.geofence;

import android.Manifest;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicBoolean;

public class OfficeGeofenceHelper {
    public static final String TAG = "OfficeGeofenceHelper";
    public static final String GEOFENCE_ID = "exfin_office_geofence_25m";
    public static final double OFFICE_LAT = 23.616227;
    public static final double OFFICE_LNG = 87.117063;
    public static final float GEOFENCE_RADIUS_METERS = 25.0f; // 25-meter office boundary

    private static final String PREFS_NAME = "exfin_native_geofence_prefs";
    private static final String KEY_EVENTS = "unconsumed_geofence_events";
    private static final String KEY_LAST_EXIT_TIME = "last_native_exit_time";
    private static final String KEY_IS_REGISTERED = "is_geofence_registered";

    private static PendingIntent geofencePendingIntent;

    public static void registerOfficeGeofence(Context context) {
        if (context == null) return;

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Cannot register geofence: ACCESS_FINE_LOCATION permission not granted");
            return;
        }

        try {
            GeofencingClient geofencingClient = LocationServices.getGeofencingClient(context);

            Geofence geofence = new Geofence.Builder()
                    .setRequestId(GEOFENCE_ID)
                    .setCircularRegion(OFFICE_LAT, OFFICE_LNG, GEOFENCE_RADIUS_METERS)
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER | Geofence.GEOFENCE_TRANSITION_EXIT)
                    .setNotificationResponsiveness(5000) // 5 seconds
                    .build();

            GeofencingRequest request = new GeofencingRequest.Builder()
                    .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                    .addGeofence(geofence)
                    .build();

            PendingIntent pendingIntent = getGeofencePendingIntent(context);

            geofencingClient.addGeofences(request, pendingIntent)
                    .addOnSuccessListener(aVoid -> {
                        Log.i(TAG, "Authoritative 25m office geofence registered successfully.");
                        setGeofenceRegistered(context, true);
                    })
                    .addOnFailureListener(e -> {
                        Log.e(TAG, "Failed to register office geofence: " + e.getMessage(), e);
                        setGeofenceRegistered(context, false);
                    });
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException registering geofence: " + se.getMessage(), se);
        } catch (Exception e) {
            Log.e(TAG, "Exception registering geofence: " + e.getMessage(), e);
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

    public static void recordNativeGeofenceEvent(Context context, String transitionType, double lat, double lng) {
        recordNativeGeofenceEvent(context, transitionType, lat, lng, System.currentTimeMillis(), null);
    }

    public static void recordNativeGeofenceEvent(Context context, String transitionType, double lat, double lng, long eventTimestamp) {
        recordNativeGeofenceEvent(context, transitionType, lat, lng, eventTimestamp, null);
    }

    public static void recordNativeGeofenceEvent(Context context, String transitionType, double lat, double lng, long eventTimestamp, BroadcastReceiver.PendingResult pendingResult) {
        final AtomicBoolean finishedFlag = new AtomicBoolean(false);
        if (context == null) {
            safeFinishPendingResult(pendingResult, finishedFlag);
            return;
        }

        double distance = 25.0;
        boolean hasCoords = (lat != 0.0 && lng != 0.0);
        if (hasCoords) {
            distance = calculateDistance(lat, lng, OFFICE_LAT, OFFICE_LNG);
        }

        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingEventsJson = prefs.getString(KEY_EVENTS, "[]");
            JSONArray events = new JSONArray(existingEventsJson);

            Date eventDate = new Date(eventTimestamp);
            SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            String timeStr = sdf.format(eventDate);

            SimpleDateFormat sdfDate = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            sdfDate.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            String dateStr = sdfDate.format(eventDate);

            String employeeId = prefs.getString("employee_id", "");
            String eventId = "evt_native_" + transitionType + "_" + (employeeId != null ? employeeId : "") + "_" + eventTimestamp;

            JSONObject evt = new JSONObject();
            evt.put("eventId", eventId);
            evt.put("employeeId", employeeId);
            evt.put("eventType", transitionType);
            evt.put("transition", transitionType);
            evt.put("time", timeStr);
            evt.put("date", dateStr);
            evt.put("timestamp", eventTimestamp);
            evt.put("exitTimestamp", eventTimestamp);
            evt.put("createdAt", System.currentTimeMillis());
            evt.put("distance", distance);
            evt.put("latitude", lat);
            evt.put("longitude", lng);

            events.put(evt);

            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(KEY_EVENTS, events.toString());
            if ("EXIT".equalsIgnoreCase(transitionType)) {
                editor.putString(KEY_LAST_EXIT_TIME, timeStr);
            }
            editor.apply();

            Log.i(TAG, "Recorded native geofence event: " + transitionType + " at " + timeStr + " (timestamp=" + eventTimestamp + ", dist=" + Math.round(distance) + "m)");
        } catch (Exception e) {
            Log.e(TAG, "Failed to record native geofence event: " + e.getMessage(), e);
        }

        // Trigger Fallback Location Check & Background Synchronization with exact event timestamp and distance
        getFallbackLocationAndProcess(context, transitionType, lat, lng, eventTimestamp, distance, pendingResult, finishedFlag);
    }

    private static final String KEY_SYNC_QUEUE = "native_geofence_sync_queue";
    private static final java.util.concurrent.ExecutorService executor = java.util.concurrent.Executors.newSingleThreadExecutor();
    private static boolean isSyncRunning = false;
    private static boolean isNetworkCallbackRegistered = false;

    public static void registerNetworkCallbackIfNecessary(Context context) {
        if (context == null || isNetworkCallbackRegistered) return;
        try {
            android.net.ConnectivityManager connectivityManager = 
                (android.net.ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    connectivityManager.registerDefaultNetworkCallback(new android.net.ConnectivityManager.NetworkCallback() {
                        @Override
                        public void onAvailable(android.net.Network network) {
                            Log.i(TAG, "Native Network Available! Retrying background sync for queued geofence events...");
                            triggerBackgroundSync(context);
                        }
                    });
                    isNetworkCallbackRegistered = true;
                    Log.i(TAG, "Default network callback registered for background geofence sync retry.");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to register default network callback: " + e.getMessage(), e);
        }
    }

    private static void getFallbackLocationAndProcess(Context context, String transitionType, double inputLat, double inputLng, long eventTimestamp, double calculatedDistance, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        // If input coordinates are valid and not exactly the office center (which indicates a default fallback)
        boolean hasValidLocation = (inputLat != 0.0 && inputLng != 0.0 && 
                                    (Math.abs(inputLat - OFFICE_LAT) > 0.000001 || Math.abs(inputLng - OFFICE_LNG) > 0.000001));

        if (hasValidLocation) {
            queueAndSyncEvent(context, transitionType, inputLat, inputLng, 10.0f, eventTimestamp, calculatedDistance, pendingResult, finishedFlag);
        } else {
            // Try to fetch background location via FusedLocationProviderClient
            try {
                com.google.android.gms.location.FusedLocationProviderClient fusedClient = 
                    com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(context);
                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    fusedClient.getLastLocation().addOnSuccessListener(location -> {
                        if (location != null) {
                            double dist = calculateDistance(location.getLatitude(), location.getLongitude(), OFFICE_LAT, OFFICE_LNG);
                            queueAndSyncEvent(context, transitionType, location.getLatitude(), location.getLongitude(), location.getAccuracy(), eventTimestamp, dist, pendingResult, finishedFlag);
                        } else {
                            // Try system LocationManager as secondary fallback
                            try {
                                android.location.LocationManager lm = (android.location.LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
                                android.location.Location loc = null;
                                if (lm != null) {
                                    if (lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER)) {
                                        loc = lm.getLastKnownLocation(android.location.LocationManager.GPS_PROVIDER);
                                    }
                                    if (loc == null && lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)) {
                                        loc = lm.getLastKnownLocation(android.location.LocationManager.NETWORK_PROVIDER);
                                    }
                                }
                                if (loc != null) {
                                    double dist = calculateDistance(loc.getLatitude(), loc.getLongitude(), OFFICE_LAT, OFFICE_LNG);
                                    queueAndSyncEvent(context, transitionType, loc.getLatitude(), loc.getLongitude(), loc.getAccuracy(), eventTimestamp, dist, pendingResult, finishedFlag);
                                } else {
                                    // Persistent with location_unavailable
                                    queueAndSyncEventLocationUnavailable(context, transitionType, eventTimestamp, pendingResult, finishedFlag);
                                }
                            } catch (Exception ex) {
                                Log.e(TAG, "Error getting location from LocationManager", ex);
                                queueAndSyncEventLocationUnavailable(context, transitionType, eventTimestamp, pendingResult, finishedFlag);
                            }
                        }
                    }).addOnFailureListener(e -> {
                        queueAndSyncEventLocationUnavailable(context, transitionType, eventTimestamp, pendingResult, finishedFlag);
                    });
                } else {
                    queueAndSyncEventLocationUnavailable(context, transitionType, eventTimestamp, pendingResult, finishedFlag);
                }
            } catch (Exception e) {
                Log.e(TAG, "Error getting FusedLocationProvider location", e);
                queueAndSyncEventLocationUnavailable(context, transitionType, eventTimestamp, pendingResult, finishedFlag);
            }
        }
    }

    private static void queueAndSyncEvent(Context context, String transitionType, double lat, double lng, float accuracy, long eventTimestamp, double distance, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        saveEventToQueue(context, transitionType, lat, lng, accuracy, false, eventTimestamp, distance);
        triggerBackgroundSync(context, pendingResult, finishedFlag);
    }

    private static void queueAndSyncEventLocationUnavailable(Context context, String transitionType, long eventTimestamp, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        saveEventToQueue(context, transitionType, 0, 0, 0, true, eventTimestamp, 25.0);
        triggerBackgroundSync(context, pendingResult, finishedFlag);
    }

    private static synchronized void saveEventToQueue(Context context, String transitionType, double lat, double lng, float accuracy, boolean locationUnavailable, long eventTimestamp, double distance) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String employeeId = prefs.getString("employee_id", null);
            String employeeName = prefs.getString("employee_name", null);
            String townCity = prefs.getString("town_city", "Raniganj HQ");
            String deviceId = android.provider.Settings.Secure.getString(context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);

            if (employeeId == null || employeeId.trim().isEmpty()) {
                Log.w(TAG, "Skipping saving event to queue: employee_id is not set yet in native preferences.");
                return;
            }

            long timestamp = (eventTimestamp > 0) ? eventTimestamp : System.currentTimeMillis();
            String eventId = "evt_native_" + transitionType + "_" + employeeId + "_" + timestamp;

            JSONObject event = new JSONObject();
            event.put("eventId", eventId);
            event.put("employeeId", employeeId);
            event.put("employeeName", employeeName);
            event.put("townCity", townCity);
            event.put("deviceId", deviceId);
            event.put("eventType", transitionType);
            event.put("transition", transitionType);
            event.put("eventTimestamp", timestamp);
            event.put("createdAt", System.currentTimeMillis());
            event.put("retryCount", 0);
            event.put("syncStatus", "PENDING");
            event.put("distance", distance);

            if (!locationUnavailable) {
                event.put("latitude", lat);
                event.put("longitude", lng);
                event.put("accuracy", accuracy);
            } else {
                event.put("locationUnavailable", true);
            }

            String existingQueueStr = prefs.getString(KEY_SYNC_QUEUE, "[]");
            JSONArray queue = new JSONArray(existingQueueStr);
            queue.put(event);

            prefs.edit().putString(KEY_SYNC_QUEUE, queue.toString()).apply();
            Log.i(TAG, "Successfully queued native background geofence event: " + eventId + " (Type: " + transitionType + ", Timestamp: " + timestamp + ")");
        } catch (Exception e) {
            Log.e(TAG, "Failed to save event to queue: " + e.getMessage(), e);
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

    private static void performBackgroundSync(Context context) {
        performBackgroundSync(context, null, null);
    }

    private static void performBackgroundSync(Context context, BroadcastReceiver.PendingResult pendingResult, AtomicBoolean finishedFlag) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String serverUrl = prefs.getString("server_url", null);
            if (serverUrl == null || serverUrl.trim().isEmpty()) {
                Log.w(TAG, "Cannot background sync: server_url is not configured yet in SharedPreferences.");
                Log.w(TAG, "[NativeGeofenceLifecycle] ENTRY_SYNC_FAILED (missing server_url)");
                return;
            }

            String queueStr = prefs.getString(KEY_SYNC_QUEUE, "[]");
            JSONArray queue;
            try {
                queue = new JSONArray(queueStr);
            } catch (Exception e) {
                Log.e(TAG, "Failed to parse sync queue SharedPreferences content:", e);
                Log.e(TAG, "[NativeGeofenceLifecycle] ENTRY_SYNC_FAILED (queue parse error)");
                return;
            }

            if (queue.length() == 0) {
                return;
            }

            Log.i(TAG, "[NativeGeofenceLifecycle] ENTRY_SYNC_STARTED");
            Log.i(TAG, "Starting background synchronization for " + queue.length() + " queued native events...");
            JSONArray updatedQueue = new JSONArray();

            for (int i = 0; i < queue.length(); i++) {
                JSONObject event = queue.optJSONObject(i);
                if (event == null) continue;

                String status = event.optString("syncStatus", "PENDING");
                if ("SYNCED".equals(status)) {
                    continue;
                }

                int retryCount = event.optInt("retryCount", 0);
                String eventId = event.optString("eventId");
                String employeeId = event.optString("employeeId");
                String eventType = event.optString("eventType");
                long eventTimestamp = event.optLong("eventTimestamp");

                try {
                    event.put("syncStatus", "SYNCING");
                } catch (Exception ex) {
                    Log.e(TAG, "Failed to update event status to SYNCING", ex);
                }

                // Format JSON payload for backend
                JSONObject payload = new JSONObject();
                try {
                    payload.put("employeeId", employeeId);
                    payload.put("employeeName", event.optString("employeeName"));
                    payload.put("townCity", event.optString("townCity"));
                    payload.put("deviceId", event.optString("deviceId"));
                    payload.put("eventId", eventId);
                    payload.put("eventType", eventType);
                    payload.put("transition", eventType);
                    payload.put("distance", event.optDouble("distance", 25.0));
                    payload.put("source", "NATIVE_GEOFENCE_" + eventType);

                    if (event.optBoolean("locationUnavailable", false)) {
                        payload.put("locationUnavailable", true);
                    } else {
                        payload.put("latitude", event.optDouble("latitude"));
                        payload.put("longitude", event.optDouble("longitude"));
                        payload.put("accuracy", event.optDouble("accuracy"));
                    }

                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                    sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                    String isoTimestamp = sdf.format(new Date(eventTimestamp));
                    payload.put("timestamp", isoTimestamp);

                } catch (Exception e) {
                    Log.e(TAG, "Failed to build sync request payload", e);
                    updatedQueue.put(event);
                    continue;
                }

                // Perform HTTP request
                boolean success = false;
                try {
                    java.net.URL url = new java.net.URL(serverUrl + "/api/median-background-location");
                    java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);

                    java.io.OutputStream os = conn.getOutputStream();
                    os.write(payload.toString().getBytes("UTF-8"));
                    os.close();

                    int code = conn.getResponseCode();
                    if (code == 200 || code == 201) {
                        success = true;
                        Log.i(TAG, "Successfully synced native background event " + eventId + " to backend. HTTP " + code);
                        Log.i(TAG, "[NativeGeofenceLifecycle] ENTRY_SYNC_SUCCESS");
                    } else {
                        Log.w(TAG, "Server rejected background geofence event " + eventId + ". HTTP response: " + code);
                        Log.w(TAG, "[NativeGeofenceLifecycle] ENTRY_SYNC_FAILED (HTTP " + code + ")");
                    }
                    conn.disconnect();
                } catch (Exception e) {
                    Log.w(TAG, "Network connection error while syncing background geofence event " + eventId + ": " + e.getMessage());
                    Log.w(TAG, "[NativeGeofenceLifecycle] ENTRY_SYNC_FAILED (Network error: " + e.getMessage() + ")");
                }

                if (success) {
                    // Event synced, do not put back into the updated queue.
                } else {
                    try {
                        event.put("syncStatus", "FAILED");
                        event.put("retryCount", retryCount + 1);
                    } catch (Exception e) {
                        Log.e(TAG, "Error updating event retry state", e);
                    }
                    updatedQueue.put(event);
                }
            }

            prefs.edit().putString(KEY_SYNC_QUEUE, updatedQueue.toString()).apply();
        } catch (Exception e) {
            Log.e(TAG, "Exception in performBackgroundSync", e);
            Log.e(TAG, "[NativeGeofenceLifecycle] ENTRY_SYNC_FAILED (Exception)");
        } finally {
            safeFinishPendingResult(pendingResult, finishedFlag);
        }
    }

    public static JSONArray getAndClearUnconsumedEvents(Context context) {
        if (context == null) return new JSONArray();
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingEventsJson = prefs.getString(KEY_EVENTS, "[]");
            JSONArray events = new JSONArray(existingEventsJson);

            // Clear unconsumed queue
            prefs.edit().putString(KEY_EVENTS, "[]").apply();
            return events;
        } catch (Exception e) {
            Log.e(TAG, "Failed to get unconsumed events: " + e.getMessage(), e);
            return new JSONArray();
        }
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
