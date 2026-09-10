package com.exfin.oms.geofence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
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
                    Log.i(TAG, "Native Geofence wake-up triggered by: " + geofence.getRequestId() + " (transition=" + transitionType + ")");
                }
            }
        }

        // Delegate to high-accuracy verification and decision engine with goAsync()
        final PendingResult pendingResult = goAsync();
        Log.i(TAG, "[NativeGeofenceLifecycle] GO_ASYNC_STARTED for transition: " + transitionType);
        OfficeGeofenceHelper.handleNativeGeofenceTransition(context, transitionType, triggerLocation, triggeringGeofenceIds, pendingResult);
    }
}
