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

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

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
            }
            editor.apply();

            Log.i(TAG, "Recorded native geofence event: " + transitionType + " at " + timeStr);
        } catch (Exception e) {
            Log.e(TAG, "Failed to record native geofence event: " + e.getMessage(), e);
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
