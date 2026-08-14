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

public class GeofenceBroadcastReceiver extends BroadcastReceiver {
    private static final String TAG = "GeofenceReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        GeofencingEvent geofencingEvent = GeofencingEvent.fromIntent(intent);
        if (geofencingEvent == null) {
            Log.e(TAG, "GeofencingEvent is null");
            return;
        }

        if (geofencingEvent.hasError()) {
            String errorMessage = GeofenceStatusCodes.getStatusCodeString(geofencingEvent.getErrorCode());
            Log.e(TAG, "Geofence error code: " + geofencingEvent.getErrorCode() + " (" + errorMessage + ")");
            return;
        }

        int transitionType = geofencingEvent.getGeofenceTransition();
        Location triggerLocation = geofencingEvent.getTriggeringLocation();
        double lat = triggerLocation != null ? triggerLocation.getLatitude() : OfficeGeofenceHelper.OFFICE_LAT;
        double lng = triggerLocation != null ? triggerLocation.getLongitude() : OfficeGeofenceHelper.OFFICE_LNG;

        List<Geofence> triggeringGeofences = geofencingEvent.getTriggeringGeofences();
        if (triggeringGeofences != null) {
            for (Geofence geofence : triggeringGeofences) {
                Log.i(TAG, "Triggered geofence: " + geofence.getRequestId());
            }
        }

        if (transitionType == Geofence.GEOFENCE_TRANSITION_EXIT) {
            Log.i(TAG, "=== NATIVE OFFICE GEOFENCE EXIT EVENT DELIVERED ===");
            OfficeGeofenceHelper.recordNativeGeofenceEvent(context, "EXIT", lat, lng);
            GeofencePlugin.notifyNativeTransition("EXIT", lat, lng);
        } else if (transitionType == Geofence.GEOFENCE_TRANSITION_ENTER) {
            Log.i(TAG, "=== NATIVE OFFICE GEOFENCE ENTER EVENT DELIVERED ===");
            OfficeGeofenceHelper.recordNativeGeofenceEvent(context, "ENTER", lat, lng);
            GeofencePlugin.notifyNativeTransition("ENTER", lat, lng);
        } else {
            Log.w(TAG, "Unhandled geofence transition type: " + transitionType);
        }
    }
}
