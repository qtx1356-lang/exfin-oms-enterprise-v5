package com.exfin.oms.geofence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Repairs native attendance monitoring when the user turns Android Location Services
 * back on after it was disabled. It never fabricates an attendance event; it only
 * re-registers monitoring and requests a fresh location verification.
 */
public class LocationModeReceiver extends BroadcastReceiver {
    private static final String TAG = "LocationModeReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        Log.i(TAG, "Location mode changed. Repairing native attendance monitoring.");
        try {
            OfficeGeofenceHelper.ensureNativeAttendanceReady(context.getApplicationContext());
            OfficeLocationService.verifyCurrentLocationAndDecide(context.getApplicationContext());
        } catch (Exception e) {
            Log.w(TAG, "Location monitoring repair failed: " + e.getMessage());
        }
    }
}
