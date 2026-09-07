package com.exfin.oms.geofence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Handles device boot, locked boot (direct boot), and app update events.
 * Re-registers native office geofence, restores active sessions, and triggers offline sync queue.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || context == null) return;
        String action = intent.getAction();
        Log.i(TAG, "Device boot or package update detected (" + action + "). Re-registering authoritative office geofence.");

        // 1. Re-register the native 120m wake-up geofence with Play Services
        OfficeGeofenceHelper.registerOfficeGeofence(context);

        // 2. Restore active session foreground monitoring if an active session was running before reboot
        org.json.JSONObject activeSession = OfficeGeofenceHelper.getActiveSession(context);
        if (activeSession != null) {
            String state = activeSession.optString("sessionState", "");
            if ("ACTIVE".equalsIgnoreCase(state) || "PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state)) {
                Log.i(TAG, "Restoring native location monitoring service for active attendance session on boot.");
                OfficeLocationService.start(context);
            }
        }

        // 3. Register network callback and trigger sync of any pending offline attendance events
        OfficeGeofenceHelper.registerNetworkCallbackIfNecessary(context);
        OfficeGeofenceHelper.triggerBackgroundSync(context);
    }
}
