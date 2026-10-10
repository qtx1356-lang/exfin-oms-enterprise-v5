package com.exfin.oms;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

import androidx.core.content.ContextCompat;

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

        createDefaultNotificationChannels();

        // Native attendance owns physical entry/exit state. Before starting the
        // foreground monitor, restore any native EXIT already detected while the
        // Activity was closed so reopening the UI cannot manufacture a new exit
        // using the app-open timestamp.
        restoreNativePendingExitState("onCreate");

        refreshNativeGeofenceRegistration("onCreate");
        ensureNativeAttendanceMonitoring("onCreate");
        checkAndRestoreActiveLocationService();
    }

    @Override
    public void onResume() {
        super.onResume();

        // Restore the native exit state BEFORE restarting location monitoring.
        // This is critical when the WebView/app was closed after a real EXIT:
        // the first EXIT remains authoritative until a genuine <=25m RETURN.
        restoreNativePendingExitState("onResume");

        refreshNativeGeofenceRegistration("onResume");
        ensureNativeAttendanceMonitoring("onResume");
        checkAndRestoreActiveLocationService();
    }

    /**
     * Samsung/Android can retain our local "registered" flag even if Google Play
     * Services has dropped the actual geofence. Force the native registration path
     * to reconcile the durable registration with Play Services whenever the Activity
     * starts/resumes. The same request IDs are used, so the native registration is
     * refreshed rather than creating a second attendance boundary.
     */
    private void refreshNativeGeofenceRegistration(String reason) {
        try {
            SharedPreferences prefs = getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(OfficeGeofenceHelper.KEY_IS_REGISTERED, false).apply();
            OfficeGeofenceHelper.registerOfficeGeofence(this);
            Log.i("MainActivity", "[AUTO_ATTENDANCE_GEOFENCE] Forced geofence registration refresh (reason=" + reason + ").");
        } catch (Exception e) {
            Log.w("MainActivity", "[AUTO_ATTENDANCE_GEOFENCE] Registration refresh failed: " + e.getMessage());
        }
    }

    /**
     * Reconciles native durable EXIT state before the Activity/WebView resumes.
     *
     * Rule: one EXIT per continuous outside session. If native state already has
     * a today's EXIT and the employee is still OUTSIDE, restore PENDING_EXIT_CONFIRMATION
     * instead of allowing app-open/current-location recovery to create another EXIT.
     * Stay Active is respected through KEY_EXIT_PROMPT_RESOLVED_OUTSIDE and therefore
     * does not get converted back into a new pending prompt.
     */
    private void restoreNativePendingExitState(String reason) {
        try {
            SharedPreferences prefs = getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
            JSONObject session = OfficeGeofenceHelper.getActiveSession(this);
            if (session == null) return;

            String sessionDate = session.optString("date", "");
            String todayDate = new SimpleDateFormat("yyyy-MM-dd", Locale.US) {
                {
                    setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
                }
            }.format(new Date());

            if (!todayDate.equals(sessionDate)) return;

            String sessionState = session.optString("sessionState", "ACTIVE");
            if ("PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(sessionState)
                    || "PENDING_AUTO_CHECKOUT".equalsIgnoreCase(sessionState)
                    || OfficeGeofenceHelper.STATE_EXIT_PROMPT_RESOLVED_OUTSIDE.equalsIgnoreCase(sessionState)
                    || session.optBoolean("exitPromptResolvedOutside", false)
                    || prefs.getBoolean(OfficeGeofenceHelper.KEY_EXIT_PROMPT_RESOLVED_OUTSIDE, false)) {
                return;
            }

            String lastKnownState = prefs.getString(OfficeGeofenceHelper.KEY_LAST_KNOWN_STATE, "UNKNOWN");
            if (!"OUTSIDE".equalsIgnoreCase(lastKnownState)) return;

            String exitTime = prefs.getString(OfficeGeofenceHelper.KEY_LAST_EXIT_TIME, "");
            String exitDate = prefs.getString(OfficeGeofenceHelper.KEY_LAST_EXIT_DATE, "");
            String exitSessionId = prefs.getString(OfficeGeofenceHelper.KEY_LAST_EXIT_SESSION_ID, "");
            String attendanceId = session.optString("attendanceId", "");

            if (exitTime == null || exitTime.trim().isEmpty() || !todayDate.equals(exitDate)) return;
            if (!exitSessionId.isEmpty() && !attendanceId.isEmpty() && !exitSessionId.equals(attendanceId)) return;

            long exitTimestamp = prefs.getLong(OfficeGeofenceHelper.KEY_LAST_CHECKOUT_TIMESTAMP, 0L);
            String existingExitDetectedAt = session.optString("exitDetectedAt", "");
            if ((existingExitDetectedAt == null || existingExitDetectedAt.trim().isEmpty()) && exitTimestamp > 0) {
                SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                iso.setTimeZone(TimeZone.getTimeZone("UTC"));
                existingExitDetectedAt = iso.format(new Date(exitTimestamp));
            }

            String pendingEventId = session.optString("pendingCheckoutEventId", "");
            if (pendingEventId == null || pendingEventId.trim().isEmpty()) {
                pendingEventId = "evt_native_EXIT_RESTORED_" + attendanceId + "_" + exitTimestamp;
            }

            session.put("recordedExitTime", exitTime);
            session.put("exitDetectedAt", existingExitDetectedAt);
            session.put("exitSource", session.optString("exitSource", "NATIVE_BACKGROUND"));
            session.put("pendingCheckoutConfirmation", true);
            session.put("pendingCheckoutEventId", pendingEventId);
            session.put("currentState", "PENDING_AUTO_CHECKOUT");
            session.put("checkoutStatus", "PENDING_AUTO_CHECKOUT");
            session.put("sessionState", "PENDING_EXIT_CONFIRMATION");
            session.put("exitPromptResolvedOutside", false);

            prefs.edit()
                    .putString(OfficeGeofenceHelper.KEY_ACTIVE_SESSION, session.toString())
                    .putString("currentState", "PENDING_AUTO_CHECKOUT")
                    .putString("checkoutStatus", "PENDING_AUTO_CHECKOUT")
                    .putBoolean("pendingCheckoutConfirmation", true)
                    .putString("pendingCheckoutEventId", pendingEventId)
                    .apply();

            Log.i("MainActivity", "[AUTO_ATTENDANCE_RESTORE] Restored native EXIT=" + exitTime
                    + " before app resume; app-open timestamp will NOT create a new EXIT (reason=" + reason + ").");
        } catch (Exception e) {
            Log.w("MainActivity", "[AUTO_ATTENDANCE_RESTORE] Failed to restore native exit state: " + e.getMessage());
        }
    }

    /**
     * Starts the native foreground location service independently of the WebView/session UI.
     * Once initialized while the app is in the foreground, the native service owns the
     * fused-location loop and continues detecting entry/exit while the UI is minimized.
     */
    private void ensureNativeAttendanceMonitoring(String reason) {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            boolean locationEnabled = lm != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.P
                    ? (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                    : lm.isLocationEnabled());
            boolean fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean backgroundGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                    || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;

            if (!locationEnabled || !fineGranted || !backgroundGranted) {
                Log.w("MainActivity", "[AUTO_ATTENDANCE_BACKGROUND] Native monitor not started: locationEnabled="
                        + locationEnabled + ", fineLocation=" + fineGranted + ", backgroundLocation=" + backgroundGranted
                        + " (reason=" + reason + ")");
                return;
            }

            OfficeLocationService.start(this);
            Log.i("MainActivity", "[AUTO_ATTENDANCE_BACKGROUND] Native foreground location monitoring started independently of Activity/UI (reason=" + reason + ").");
        } catch (Exception e) {
            Log.e("MainActivity", "[AUTO_ATTENDANCE_BACKGROUND] Failed to start native monitor: " + e.getMessage(), e);
        }
    }

    /**
     * When the user swipes EXFIN OMS away from Recents, explicitly reassert the native
     * foreground monitoring service. START_STICKY remains enabled in the service itself;
     * this hook adds a second lifecycle safeguard so task removal does not become a
     * hidden attendance-monitoring stop point on Samsung/Android builds.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            Log.i("MainActivity", "[AUTO_ATTENDANCE_BACKGROUND] Activity task removed; reasserting native location service.");
            OfficeLocationService.start(getApplicationContext());
        } catch (Exception e) {
            Log.w("MainActivity", "[AUTO_ATTENDANCE_BACKGROUND] Could not reassert service after task removal: " + e.getMessage());
        }
        super.onTaskRemoved(rootIntent);
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
