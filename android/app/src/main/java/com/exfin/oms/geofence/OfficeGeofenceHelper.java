package com.exfin.oms.geofence;

import android.Manifest;
import android.app.PendingIntent;
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

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import com.exfin.oms.location.BackgroundLocationService;
import com.exfin.oms.scheduler.DayEndAlarmScheduler;

public class OfficeGeofenceHelper {
    public static final String TAG = "OfficeGeofenceHelper";
    public static final String GEOFENCE_ID = "exfin_office_geofence_25m";
    public static final double OFFICE_LAT = 23.616227;
    public static final double OFFICE_LNG = 87.117063;
    public static final float GEOFENCE_RADIUS_METERS = 25.0f; // 25-meter office boundary

    private static final String PREFS_NAME = "exfin_native_geofence_prefs";
    private static final String KEY_EVENTS = "unconsumed_geofence_events";
    private static final String KEY_LAST_EXIT_TIME = "last_native_exit_time";
    private static final String KEY_LAST_EXIT_DATE = "last_native_exit_date";
    private static final String KEY_LAST_EXIT_LAT = "last_native_exit_lat";
    private static final String KEY_LAST_EXIT_LNG = "last_native_exit_lng";
    private static final String KEY_HAS_UNRESOLVED_EXIT = "has_unresolved_native_exit";
    private static final String KEY_IS_REGISTERED = "is_geofence_registered";

    public static final String KEY_EMPLOYEE_ID = "employee_id";
    public static final String KEY_EMPLOYEE_NAME = "employee_name";
    public static final String KEY_TOWN_CITY = "town_city";
    public static final String KEY_LAST_CHECKIN_DATE = "last_native_checkin_date";
    public static final String KEY_LAST_CHECKIN_TIME = "last_native_checkin_time";
    public static final String KEY_LAST_CHECKIN_LAT = "last_native_checkin_lat";
    public static final String KEY_LAST_CHECKIN_LNG = "last_native_checkin_lng";
    public static final String KEY_PENDING_CHECKIN = "pending_native_checkin_json";

    private static final ExecutorService bgExecutor = Executors.newSingleThreadExecutor();
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

    public static void recordNativeGeofenceEvent(Context context, String transitionType, double lat, double lng) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existingEventsJson = prefs.getString(KEY_EVENTS, "[]");
            JSONArray events = new JSONArray(existingEventsJson);

            SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            String timeStr = sdf.format(new Date());

            SimpleDateFormat sdfDate = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            sdfDate.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            String dateStr = sdfDate.format(new Date());

            JSONObject evt = new JSONObject();
            evt.put("transition", transitionType);
            evt.put("time", timeStr);
            evt.put("date", dateStr);
            evt.put("timestamp", System.currentTimeMillis());
            evt.put("latitude", lat);
            evt.put("longitude", lng);

            events.put(evt);

            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(KEY_EVENTS, events.toString());
            if ("EXIT".equalsIgnoreCase(transitionType)) {
                editor.putString(KEY_LAST_EXIT_TIME, timeStr);
                editor.putString(KEY_LAST_EXIT_DATE, dateStr);
                editor.putString(KEY_LAST_EXIT_LAT, String.valueOf(lat));
                editor.putString(KEY_LAST_EXIT_LNG, String.valueOf(lng));
                editor.putBoolean(KEY_HAS_UNRESOLVED_EXIT, true);
            } else if ("ENTER".equalsIgnoreCase(transitionType)) {
                editor.putBoolean(KEY_HAS_UNRESOLVED_EXIT, false);
            }
            editor.apply();

            Log.i(TAG, "Recorded native geofence event: " + transitionType + " at " + timeStr);
        } catch (Exception e) {
            Log.e(TAG, "Failed to record native geofence event: " + e.getMessage(), e);
        }
    }

    public static String getLastExitTime(Context context) {
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_LAST_EXIT_TIME, "");
    }

    public static String getLastExitDate(Context context) {
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_LAST_EXIT_DATE, "");
    }

    public static boolean hasUnresolvedExit(Context context) {
        if (context == null) return false;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_HAS_UNRESOLVED_EXIT, false);
    }

    public static void clearUnresolvedExit(Context context) {
        if (context == null) return;
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_HAS_UNRESOLVED_EXIT, false).apply();
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

    public static void setEmployeeInfo(Context context, String employeeId, String employeeName, String townCity) {
        if (context == null || employeeId == null || employeeId.trim().isEmpty()) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putString(KEY_EMPLOYEE_ID, employeeId.trim())
                    .putString(KEY_EMPLOYEE_NAME, employeeName != null && !employeeName.trim().isEmpty() ? employeeName.trim() : "Employee")
                    .putString(KEY_TOWN_CITY, townCity != null && !townCity.trim().isEmpty() ? townCity.trim() : "Raniganj HQ")
                    .apply();

            // Also mirror to location preferences so BackgroundLocationService has it immediately
            SharedPreferences locPrefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
            locPrefs.edit()
                    .putString(BackgroundLocationService.KEY_EMPLOYEE_ID, employeeId.trim())
                    .putString(BackgroundLocationService.KEY_EMPLOYEE_NAME, employeeName != null && !employeeName.trim().isEmpty() ? employeeName.trim() : "Employee")
                    .apply();

            Log.i(TAG, "Persisted native employee identity: " + employeeId);
        } catch (Exception e) {
            Log.e(TAG, "Error persisting native employee info: " + e.getMessage(), e);
        }
    }

    public static String getEmployeeId(Context context) {
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String empId = prefs.getString(KEY_EMPLOYEE_ID, "");
        if (empId.isEmpty()) {
            SharedPreferences locPrefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
            empId = locPrefs.getString(BackgroundLocationService.KEY_EMPLOYEE_ID, "");
        }
        return empId;
    }

    public static String getEmployeeName(Context context) {
        if (context == null) return "Employee";
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String empName = prefs.getString(KEY_EMPLOYEE_NAME, "");
        if (empName.isEmpty()) {
            SharedPreferences locPrefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
            empName = locPrefs.getString(BackgroundLocationService.KEY_EMPLOYEE_NAME, "Employee");
        }
        return empName.isEmpty() ? "Employee" : empName;
    }

    public static String getTownCity(Context context) {
        if (context == null) return "Raniganj HQ";
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_TOWN_CITY, "Raniganj HQ");
    }

    public static String getLastCheckinDate(Context context) {
        if (context == null) return "";
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_LAST_CHECKIN_DATE, "");
    }

    public static void handleNativeAutoCheckIn(Context context, double lat, double lng) {
        if (context == null) return;

        String employeeId = getEmployeeId(context);
        String employeeName = getEmployeeName(context);
        String townCity = getTownCity(context);

        if (employeeId == null || employeeId.trim().isEmpty()) {
            Log.w(TAG, "Cannot perform native auto check-in: No employeeId saved in native preferences.");
            return;
        }

        // Determine current date and time in Asia/Kolkata
        SimpleDateFormat sdfDate = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        sdfDate.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        String dateStr = sdfDate.format(new Date());

        SimpleDateFormat sdfTime = new SimpleDateFormat("hh:mm a", Locale.US);
        sdfTime.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        String timeStr = sdfTime.format(new Date());

        // Check duplicate check-in in native SharedPreferences
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String lastCheckinDate = prefs.getString(KEY_LAST_CHECKIN_DATE, "");
        if (dateStr.equals(lastCheckinDate)) {
            Log.i(TAG, "Native auto check-in already recorded for " + employeeId + " on " + dateStr + ". Skipping duplicate.");
            startBackgroundLocationTracking(context, employeeId, employeeName);
            DayEndAlarmScheduler.scheduleDayEndAlarm(context);
            return;
        }

        Log.i(TAG, "Executing native automatic check-in for " + employeeId + " on " + dateStr + " at " + timeStr + " IST (" + lat + ", " + lng + ")");

        // Asynchronously perform REST write to Firestore
        bgExecutor.execute(() -> {
            boolean success = writeCheckInToFirestore(context, employeeId, employeeName, townCity, dateStr, timeStr, lat, lng);

            // Always persist last_checkin_date to prevent continuous duplicate check-in loops
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(KEY_LAST_CHECKIN_DATE, dateStr);
            editor.putString(KEY_LAST_CHECKIN_TIME, timeStr);
            editor.putString(KEY_LAST_CHECKIN_LAT, String.valueOf(lat));
            editor.putString(KEY_LAST_CHECKIN_LNG, String.valueOf(lng));
            editor.apply();

            // Start background location service and schedule 11:59 PM day-end finalizer
            startBackgroundLocationTracking(context, employeeId, employeeName);
            DayEndAlarmScheduler.scheduleDayEndAlarm(context);
        });
    }

    private static boolean writeCheckInToFirestore(
            Context context,
            String employeeId,
            String employeeName,
            String townCity,
            String dateStr,
            String timeStr,
            double lat,
            double lng
    ) {
        HttpURLConnection conn = null;
        try {
            String docId = employeeId + "_" + dateStr;
            String firebaseUrl = "https://firestore.googleapis.com/v1/projects/" + BackgroundLocationService.FIREBASE_PROJECT_ID
                    + "/databases/(default)/documents/attendance/" + docId
                    + "?updateMask.fieldPaths=id"
                    + "&updateMask.fieldPaths=docId"
                    + "&updateMask.fieldPaths=employeeId"
                    + "&updateMask.fieldPaths=employeeName"
                    + "&updateMask.fieldPaths=date"
                    + "&updateMask.fieldPaths=attendanceType"
                    + "&updateMask.fieldPaths=checkInTime"
                    + "&updateMask.fieldPaths=checkInMode"
                    + "&updateMask.fieldPaths=checkInLatitude"
                    + "&updateMask.fieldPaths=checkInLongitude"
                    + "&updateMask.fieldPaths=currentState"
                    + "&updateMask.fieldPaths=checkoutStatus"
                    + "&updateMask.fieldPaths=status"
                    + "&updateMask.fieldPaths=townCity"
                    + "&updateMask.fieldPaths=checkInTownCity"
                    + "&updateMask.fieldPaths=checkInLocation"
                    + "&updateMask.fieldPaths=timestamp"
                    + "&updateMask.fieldPaths=updatedAt"
                    + "&updateMask.fieldPaths=syncStatus"
                    + "&updateMask.fieldPaths=isSynced"
                    + "&key=" + BackgroundLocationService.FIREBASE_API_KEY;

            SimpleDateFormat isoSdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            isoSdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String isoTimestamp = isoSdf.format(new Date());

            JSONObject patchFields = new JSONObject();
            patchFields.put("id", new JSONObject().put("stringValue", "att_" + docId));
            patchFields.put("docId", new JSONObject().put("stringValue", docId));
            patchFields.put("employeeId", new JSONObject().put("stringValue", employeeId));
            patchFields.put("employeeName", new JSONObject().put("stringValue", employeeName != null ? employeeName : "Employee"));
            patchFields.put("date", new JSONObject().put("stringValue", dateStr));
            patchFields.put("attendanceType", new JSONObject().put("stringValue", "OFFICE"));
            patchFields.put("checkInTime", new JSONObject().put("stringValue", timeStr));
            patchFields.put("checkInMode", new JSONObject().put("stringValue", "AUTO"));
            patchFields.put("checkInLatitude", new JSONObject().put("doubleValue", lat));
            patchFields.put("checkInLongitude", new JSONObject().put("doubleValue", lng));
            patchFields.put("currentState", new JSONObject().put("stringValue", "CHECKED_IN"));
            patchFields.put("checkoutStatus", new JSONObject().put("stringValue", "PENDING"));
            patchFields.put("status", new JSONObject().put("stringValue", "pending"));
            patchFields.put("townCity", new JSONObject().put("stringValue", townCity != null && !townCity.trim().isEmpty() ? townCity.trim() : "Raniganj HQ"));
            patchFields.put("checkInTownCity", new JSONObject().put("stringValue", townCity != null && !townCity.trim().isEmpty() ? townCity.trim() : "Raniganj HQ"));
            patchFields.put("checkInLocation", new JSONObject().put("stringValue", townCity != null && !townCity.trim().isEmpty() ? townCity.trim() : "Raniganj HQ"));
            patchFields.put("timestamp", new JSONObject().put("stringValue", isoTimestamp));
            patchFields.put("updatedAt", new JSONObject().put("stringValue", isoTimestamp));
            patchFields.put("syncStatus", new JSONObject().put("stringValue", "Synced"));
            patchFields.put("isSynced", new JSONObject().put("booleanValue", true));

            JSONObject payload = new JSONObject();
            payload.put("fields", patchFields);

            URL url = new URL(firebaseUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            conn.setDoOutput(true);

            byte[] payloadBytes = payload.toString().getBytes("UTF-8");
            conn.setFixedLengthStreamingMode(payloadBytes.length);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payloadBytes);
                os.flush();
            }

            int responseCode = conn.getResponseCode();
            if (responseCode >= 200 && responseCode < 300) {
                Log.i(TAG, "Native auto check-in successfully synced to Firestore for " + employeeId + " (HTTP " + responseCode + ")");
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                prefs.edit().remove(KEY_PENDING_CHECKIN).apply();
                return true;
            } else {
                Log.w(TAG, "Firestore write returned non-200 status: " + responseCode + ". Caching for offline retry.");
                cachePendingCheckIn(context, employeeId, employeeName, townCity, dateStr, timeStr, lat, lng);
                return false;
            }
        } catch (Exception e) {
            Log.e(TAG, "Network/Firestore error during native check-in: " + e.getMessage() + ". Caching for offline retry.");
            cachePendingCheckIn(context, employeeId, employeeName, townCity, dateStr, timeStr, lat, lng);
            return false;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private static void cachePendingCheckIn(
            Context context,
            String employeeId,
            String employeeName,
            String townCity,
            String dateStr,
            String timeStr,
            double lat,
            double lng
    ) {
        if (context == null) return;
        try {
            JSONObject pendingObj = new JSONObject();
            pendingObj.put("employeeId", employeeId);
            pendingObj.put("employeeName", employeeName);
            pendingObj.put("townCity", townCity);
            pendingObj.put("date", dateStr);
            pendingObj.put("time", timeStr);
            pendingObj.put("latitude", lat);
            pendingObj.put("longitude", lng);

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_PENDING_CHECKIN, pendingObj.toString()).apply();
            Log.i(TAG, "Cached pending native check-in in SharedPreferences for offline retry: " + employeeId + "_" + dateStr);
        } catch (Exception e) {
            Log.e(TAG, "Failed to cache pending check-in: " + e.getMessage(), e);
        }
    }

    public static void retryPendingNativeCheckIn(Context context) {
        if (context == null) return;
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String pendingStr = prefs.getString(KEY_PENDING_CHECKIN, "");
            if (pendingStr == null || pendingStr.trim().isEmpty()) return;

            JSONObject pending = new JSONObject(pendingStr);
            String employeeId = pending.optString("employeeId");
            String employeeName = pending.optString("employeeName", "Employee");
            String townCity = pending.optString("townCity", "Raniganj HQ");
            String dateStr = pending.optString("date");
            String timeStr = pending.optString("time");
            double lat = pending.optDouble("latitude", OFFICE_LAT);
            double lng = pending.optDouble("longitude", OFFICE_LNG);

            if (!employeeId.isEmpty() && !dateStr.isEmpty()) {
                bgExecutor.execute(() -> {
                    Log.i(TAG, "Retrying pending native check-in for " + employeeId + "_" + dateStr);
                    writeCheckInToFirestore(context, employeeId, employeeName, townCity, dateStr, timeStr, lat, lng);
                });
            }
        } catch (Exception e) {
            Log.e(TAG, "Error retrying pending native check-in: " + e.getMessage(), e);
        }
    }

    private static void startBackgroundLocationTracking(Context context, String employeeId, String employeeName) {
        if (context == null || employeeId == null || employeeId.trim().isEmpty()) return;
        try {
            Intent serviceIntent = new Intent(context, BackgroundLocationService.class);
            serviceIntent.setAction(BackgroundLocationService.ACTION_START);
            serviceIntent.putExtra(BackgroundLocationService.EXTRA_EMPLOYEE_ID, employeeId.trim());
            serviceIntent.putExtra(BackgroundLocationService.EXTRA_EMPLOYEE_NAME, employeeName != null ? employeeName.trim() : "Employee");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.i(TAG, "Triggered native BackgroundLocationService after automatic check-in for " + employeeId);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start BackgroundLocationService natively: " + e.getMessage(), e);
        }
    }
}
