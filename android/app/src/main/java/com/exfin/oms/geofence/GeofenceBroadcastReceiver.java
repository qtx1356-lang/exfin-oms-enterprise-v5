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
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Intercepts Google Play Services geofence wake-up transitions even when the app is killed,
 * backgrounded, or screen is locked.
 */
public class GeofenceBroadcastReceiver extends BroadcastReceiver {
    private static final String TAG = "GeofenceReceiver";
    private static final String PREF_PENDING_EXIT_CANDIDATE_TIMESTAMP = "pending_exit_candidate_timestamp";
    private static final String PREF_PENDING_EXIT_CANDIDATE_DATE = "pending_exit_candidate_date";

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
        List<Geofence> triggeringGeofences = geofencingEvent.getTriggeringGeofences();
        List<String> triggeringGeofenceIds = new java.util.ArrayList<>();
        if (triggeringGeofences != null) {
            for (Geofence geofence : triggeringGeofences) {
                if (geofence != null && geofence.getRequestId() != null) {
                    triggeringGeofenceIds.add(geofence.getRequestId());
                }
            }
        }

        String transitionName = transitionType == Geofence.GEOFENCE_TRANSITION_ENTER ? "ENTER" :
                (transitionType == Geofence.GEOFENCE_TRANSITION_EXIT ? "EXIT" : "DWELL");
        long eventTs = (triggerLocation != null && triggerLocation.getTime() > 0)
                ? triggerLocation.getTime() : System.currentTimeMillis();
        Log.i(TAG, "[GEOFENCE_EVENT_RECEIVED] transition=" + transitionName +
                " timestamp=" + eventTs + " geofenceId=" + triggeringGeofenceIds);

        final PendingResult pendingResult = goAsync();
        final AtomicBoolean finishedFlag = new AtomicBoolean(false);

        if (transitionType == Geofence.GEOFENCE_TRANSITION_EXIT) {
            // Preserve the Play Services boundary timestamp for the authoritative exit
            // record, while still requiring the normal fresh-location verification.
            String eventDate = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
                    .format(new java.util.Date(eventTs));
            SharedPreferences prefs = context.getSharedPreferences(
                    OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
            long existingTimestamp = prefs.getLong(PREF_PENDING_EXIT_CANDIDATE_TIMESTAMP, 0L);
            String existingDate = prefs.getString(PREF_PENDING_EXIT_CANDIDATE_DATE, "");
            if (existingTimestamp <= 0L || !eventDate.equals(existingDate)) {
                prefs.edit()
                        .putLong(PREF_PENDING_EXIT_CANDIDATE_TIMESTAMP, eventTs)
                        .putString(PREF_PENDING_EXIT_CANDIDATE_DATE, eventDate)
                        .remove("pending_exit_candidate_session_id")
                        .apply();
            }

            // Do not wait for the service's next periodic GPS callback. The same
            // authoritative verifier used by the foreground path runs immediately;
            // if it cannot confirm the exit, its existing fallback leaves attendance
            // unchanged and the native monitor remains responsible for confirmation.
            OfficeGeofenceHelper.handleNativeGeofenceTransition(
                    context, transitionType, triggerLocation, triggeringGeofenceIds, pendingResult);
            return;
        }

        OfficeGeofenceHelper.handleNativeGeofenceTransition(
                context, transitionType, triggerLocation, triggeringGeofenceIds, pendingResult);
    }
}
