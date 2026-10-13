package com.exfin.oms.geofence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.util.Log;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofenceStatusCodes;
import com.google.android.gms.location.GeofencingEvent;

import java.util.List;

/**
 * Intercepts Google Play Services geofence wake-up transitions even when the app is killed,
 * backgrounded, or screen is locked.
 */
public class GeofenceBroadcastReceiver extends BroadcastReceiver {
    private static final String TAG = "GeofenceReceiver";
    private static final String PREF_PENDING_EXIT_GEOFENCE_TIMESTAMP = "pending_exit_geofence_timestamp";
    private static final String PREF_PENDING_EXIT_GEOFENCE_DATE = "pending_exit_geofence_date";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || context == null) return;

        GeofencingEvent geofencingEvent = GeofencingEvent.fromIntent(intent);
        if (geofencingEvent == null) {
            Log.e(TAG, "GeofencingEvent is null");
            return;
        }

        if (geofencingEvent.hasError()) {
            String errorMessage = GeofenceStatusCodes.getStatusCodeString(geofencingEvent.getErrorCode());
            Log.e(TAG, "Geofence error code: " + geofencingEvent.getErrorCode() + " (" + errorMessage + ")");
            OfficeGeofenceHelper.recordNativeError(context, "GeofenceReceiver Error: " + errorMessage);
            return;
        }

        int transitionType = geofencingEvent.getGeofenceTransition();
        Location triggerLocation = geofencingEvent.getTriggeringLocation();
        if (triggerLocation != null) {
            long ageMs = triggerLocation.getTime() > 0 ? (System.currentTimeMillis() - triggerLocation.getTime()) : -1;
            Log.i(TAG, "[GeofenceReceiver] Triggering location present: time=" + triggerLocation.getTime() + " (age=" + ageMs + "ms), acc=" + triggerLocation.getAccuracy() + "m");
        }

        List<Geofence> triggeringGeofences = geofencingEvent.getTriggeringGeofences();
        List<String> triggeringGeofenceIds = new java.util.ArrayList<>();
        if (triggeringGeofences != null) {
            for (Geofence geofence : triggeringGeofences) {
                if (geofence != null && geofence.getRequestId() != null) {
                    triggeringGeofenceIds.add(geofence.getRequestId());
                    Log.i(TAG, "[NATIVE ATTENDANCE] Native Geofence wake-up triggered by: " + geofence.getRequestId() + " (transition=" + transitionType + ")");
                }
            }
        }

        String transitionName = transitionType == Geofence.GEOFENCE_TRANSITION_ENTER ? "ENTER" :
                                (transitionType == Geofence.GEOFENCE_TRANSITION_EXIT ? "EXIT" : "DWELL");
        long eventTs = (triggerLocation != null && triggerLocation.getTime() > 0) ? triggerLocation.getTime() : System.currentTimeMillis();
        Log.i(TAG, "[GEOFENCE_EVENT_RECEIVED] transition=" + transitionName +
                " timestamp=" + eventTs +
                " geofenceId=" + triggeringGeofenceIds +
                " lat=" + (triggerLocation != null ? triggerLocation.getLatitude() : "N/A") +
                " lng=" + (triggerLocation != null ? triggerLocation.getLongitude() : "N/A") +
                " accuracy=" + (triggerLocation != null ? triggerLocation.getAccuracy() : "N/A"));

        final PendingResult pendingResult = goAsync();
        Log.i(TAG, "[NativeGeofenceLifecycle] GO_ASYNC_STARTED for transition: " + transitionType);

        if (transitionType == Geofence.GEOFENCE_TRANSITION_EXIT) {
            // Persist the actual Play Services geofence timestamp before waking the
            // foreground service. This closes the timing gap where the service may
            // start several seconds later and otherwise lose the true exit time.
            String eventDate = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                    .format(new java.util.Date(eventTs));
            SharedPreferences prefs = context.getSharedPreferences(
                    OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
            long existingTimestamp = prefs.getLong(PREF_PENDING_EXIT_GEOFENCE_TIMESTAMP, 0L);
            String existingDate = prefs.getString(PREF_PENDING_EXIT_GEOFENCE_DATE, "");
            if (existingTimestamp <= 0L || !eventDate.equals(existingDate)) {
                prefs.edit()
                        .putLong(PREF_PENDING_EXIT_GEOFENCE_TIMESTAMP, eventTs)
                        .putString(PREF_PENDING_EXIT_GEOFENCE_DATE, eventDate)
                        .apply();
                Log.i(TAG, "[NATIVE ATTENDANCE] Latched authoritative geofence EXIT timestamp=" + eventTs);
            } else {
                Log.i(TAG, "[NATIVE ATTENDANCE] Existing geofence EXIT timestamp retained=" + existingTimestamp);
            }

            Log.i(TAG, "[NATIVE ATTENDANCE] Primary 25m EXIT received: waking OfficeLocationService for fresh-location confirmation; no direct EXIT mutation.");
            OfficeLocationService.start(context);
            pendingResult.finish();
            return;
        }

        // ENTER/DWELL continues through the existing high-accuracy verification path.
        OfficeGeofenceHelper.handleNativeGeofenceTransition(context, transitionType, triggerLocation, triggeringGeofences == null ? triggeringGeofenceIds : triggeringGeofences, pendingResult);
    }
}
