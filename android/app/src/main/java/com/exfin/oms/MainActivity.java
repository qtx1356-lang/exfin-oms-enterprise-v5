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

        // Create high-importance Android notification channel with sound & vibration
        createDefaultNotificationChannels();

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

    private void createDefaultNotificationChannels() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try {
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    String channelId = "exfin_oms_messages_v2";
                    CharSequence channelName = "EXFIN OMS Messages";
                    String channelDesc = "Normal and High Priority EXFIN OMS Push Notifications & Alerts";
                    int importance = android.app.NotificationManager.IMPORTANCE_HIGH;

                    android.app.NotificationChannel channel = new android.app.NotificationChannel(channelId, channelName, importance);
                    channel.setDescription(channelDesc);

                    android.media.AudioAttributes audioAttributes = new android.media.AudioAttributes.Builder()
                            .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                            .build();
                    android.net.Uri soundUri = android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION);
                    channel.setSound(soundUri, audioAttributes);

                    channel.enableVibration(true);
                    channel.setVibrationPattern(new long[]{0, 250, 150, 250});

                    nm.createNotificationChannel(channel);
                    Log.d("MainActivity", "Successfully registered exfin_oms_messages_v2 channel with sound & vibration");
                }
            } catch (Exception e) {
                Log.e("MainActivity", "Error creating notification channel: " + e.getMessage());
            }
        }
    }
}
