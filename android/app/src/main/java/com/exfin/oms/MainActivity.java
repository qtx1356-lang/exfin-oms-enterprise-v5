package com.exfin.oms;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import com.exfin.oms.geofence.GeofencePlugin;
import com.exfin.oms.geofence.UpdatePlugin;
import com.exfin.oms.geofence.OfficeGeofenceHelper;
import com.exfin.oms.geofence.OfficeLocationService;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d("APP_UPDATE_DEBUG", "[APP UPDATE DEBUG] EXFIN_UPDATER_BUILD=2026-10-05-01");
        registerPlugin(GeofencePlugin.class);
        registerPlugin(UpdatePlugin.class);
        Log.d("APP_UPDATE_DEBUG", "[APP UPDATE DEBUG] UpdatePlugin registered");
        registerPlugin(GreetingTtsPlugin.class);
        super.onCreate(savedInstanceState);

        // Safely initialize FirebaseApp if configured in native resources
        try {
            int resId = getResources().getIdentifier("google_app_id", "string", getPackageName());
            if (resId != 0) {
                if (com.google.firebase.FirebaseApp.getApps(this).isEmpty()) {
                    com.google.firebase.FirebaseApp.initializeApp(this);
                    Log.d("MainActivity", "FirebaseApp initialized successfully");
                }
            } else {
                Log.w("MainActivity", "google_app_id resource not found; FCM push disabled");
            }
        } catch (Throwable t) {
            Log.w("MainActivity", "FirebaseApp initialization safe check caught: " + t.getMessage());
        }

        // Ensure native office geofence is active
        OfficeGeofenceHelper.registerOfficeGeofence(this);
        checkAndRestoreActiveLocationService();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-verify registration on resume
        OfficeGeofenceHelper.registerOfficeGeofence(this);
        checkAndRestoreActiveLocationService();
    }

    private void checkAndRestoreActiveLocationService() {
        try {
            JSONObject activeSession = OfficeGeofenceHelper.getActiveSession(this);
            if (activeSession != null) {
                String state = activeSession.optString("sessionState", "");
                String sessionDate = activeSession.optString("date", "");

                SimpleDateFormat sdfDate = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                sdfDate.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
                String todayDate = sdfDate.format(new Date());

                if (todayDate.equals(sessionDate) && ("ACTIVE".equalsIgnoreCase(state) || "PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state))) {
                    OfficeLocationService.start(this);
                }
            }
        } catch (Exception ignored) {}
    }
}
