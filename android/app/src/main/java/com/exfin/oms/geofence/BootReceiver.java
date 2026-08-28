package com.exfin.oms.geofence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Log.i(TAG, "Device boot or package update detected (" + action + "). Re-registering authoritative office geofence.");
        
        OfficeGeofenceHelper.registerOfficeGeofence(context);

        org.json.JSONObject activeSession = OfficeGeofenceHelper.getActiveSession(context);
        if (activeSession != null) {
            String state = activeSession.optString("sessionState", "");
            if ("ACTIVE".equalsIgnoreCase(state) || "PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state)) {
                Log.i(TAG, "Restoring native location monitoring service for active attendance session on boot.");
                OfficeLocationService.start(context);
            }
        }
    }
}
