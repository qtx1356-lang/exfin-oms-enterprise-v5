package com.exfin.oms;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.PermissionRequest;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.exfin.oms.geofence.GeofencePlugin;
import com.exfin.oms.geofence.UpdatePlugin;
import com.exfin.oms.notification.ExfinFcmTokenPlugin;
import com.exfin.oms.geofence.OfficeGeofenceHelper;
import com.exfin.oms.geofence.OfficeLocationService;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

public class MainActivity extends BridgeActivity {
    private static final int VIDEO_PERMISSION_REQUEST_CODE = 41042;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 41043;
    private PermissionRequest pendingVideoPermissionRequest;

    @Override public void onCreate(Bundle savedInstanceState) {
        Log.d("APP_UPDATE_DEBUG", "[APP UPDATE DEBUG] EXFIN_UPDATER_BUILD=2026-10-05-01");
        registerPlugin(GeofencePlugin.class);
        registerPlugin(UpdatePlugin.class);
        registerPlugin(ExfinFcmTokenPlugin.class);
        Log.d("APP_UPDATE_DEBUG", "[APP UPDATE DEBUG] UpdatePlugin registered");
        registerPlugin(GreetingTtsPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setWebChromeClient(new ExfinWebChromeClient(getBridge(), this));
                Log.d("MainActivity", "Video WebView permission bridge installed");
            }
        } catch (Throwable t) { Log.w("MainActivity", "Could not install video WebView permission bridge: " + t.getMessage()); }
        try {
            int resId = getResources().getIdentifier("google_app_id", "string", getPackageName());
            if (resId != 0 && com.google.firebase.FirebaseApp.getApps(this).isEmpty()) {
                com.google.firebase.FirebaseApp.initializeApp(this);
                Log.d("MainActivity", "FirebaseApp initialized successfully");
            } else if (resId == 0) Log.w("MainActivity", "google_app_id resource not found; FCM push disabled");
        } catch (Throwable t) { Log.w("MainActivity", "FirebaseApp initialization safe check caught: " + t.getMessage()); }
        createDefaultNotificationChannels();
        requestNotificationPermissionIfNeeded();
        restoreNativePendingExitState("onCreate");
        refreshNativeGeofenceRegistration("onCreate");
        ensureNativeAttendanceMonitoring("onCreate");
        checkAndRestoreActiveLocationService();
        dispatchNativeVideoCallAction(getIntent());
    }

    @Override public void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchNativeVideoCallAction(intent);
    }

    /** Deliver a native call action exactly once after the React video-call bridge is ready. */
    private void dispatchNativeVideoCallAction(android.content.Intent intent) {
        if (intent == null) return;
        String callId = intent.getStringExtra("exfin_video_call_id");
        String action = intent.getStringExtra("exfin_video_call_action");
        String eventId = intent.getStringExtra("exfin_video_call_event_id");
        if (callId == null || callId.trim().isEmpty() || action == null || action.trim().isEmpty()) return;
        if (eventId == null || eventId.trim().isEmpty()) eventId = callId + ":" + action;
        if ("answer".equalsIgnoreCase(action) || "decline".equalsIgnoreCase(action)) {
            try {
                android.app.NotificationManager notificationManager = (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (notificationManager != null) {
                    int requestBase = callId.hashCode() & 0x00ffffff;
                    notificationManager.cancel(700000 + (requestBase % 100000));
                }
            } catch (Exception ignored) {}
        }
        final String finalEventId = eventId;
        final String script = "(function(){try{" +
                "var d={callId:" + JSONObject.quote(callId) + ",action:" + JSONObject.quote(action) + ",eventId:" + JSONObject.quote(finalEventId) + "};" +
                "window.__exfinPendingVideoCallActions=window.__exfinPendingVideoCallActions||[];" +
                "window.__exfinDeliveredVideoCallActions=window.__exfinDeliveredVideoCallActions||{};" +
                "if(!window.__exfinVideoCallBridgeReady){" +
                "if(!window.__exfinPendingVideoCallActions.some(function(x){return x.eventId===d.eventId;}))window.__exfinPendingVideoCallActions.push(d);" +
                "return 'queued';}" +
                "if(window.__exfinDeliveredVideoCallActions[d.eventId])return 'already-delivered';" +
                "window.__exfinDeliveredVideoCallActions[d.eventId]=true;" +
                "if(window.location.pathname!=='/video-calls'){window.history.pushState({},'', '/video-calls');window.dispatchEvent(new PopStateEvent('popstate'));}" +
                "window.dispatchEvent(new CustomEvent('exfin:native-video-call-action',{detail:d}));return 'delivered';" +
                "}catch(e){return 'error';}})();";
        final android.os.Handler handler = new android.os.Handler(getMainLooper());
        handler.post(new Runnable() {
            int attempts = 0;
            @Override public void run() {
                if (getBridge() == null || getBridge().getWebView() == null) return;
                getBridge().getWebView().evaluateJavascript(script, value -> {
                    if (value != null && (value.contains("delivered") || value.contains("already-delivered"))) {
                        Log.i("MainActivity", "[VIDEO_CALL_NATIVE_BRIDGE] " + value + " eventId=" + finalEventId);
                    }
                });
                if (++attempts < 120) handler.postDelayed(this, 500L); else Log.w("MainActivity", "[VIDEO_CALL_NATIVE_BRIDGE] Delivery timed out after 60 seconds eventId=" + finalEventId);
            }
        });
    }

    @Override public void onResume() {
        super.onResume();
        restoreNativePendingExitState("onResume");
        refreshNativeGeofenceRegistration("onResume");
        ensureNativeAttendanceMonitoring("onResume");
        checkAndRestoreActiveLocationService();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
            Log.i("MainActivity", "[FCM_PERMISSION] POST_NOTIFICATIONS result=" + (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED));
            return;
        }
        if (requestCode != VIDEO_PERMISSION_REQUEST_CODE) return;
        PermissionRequest request = pendingVideoPermissionRequest;
        pendingVideoPermissionRequest = null;
        if (request == null) return;
        boolean granted = grantResults.length > 0;
        for (int result : grantResults) if (result != PackageManager.PERMISSION_GRANTED) { granted = false; break; }
        if (granted) { try { request.grant(request.getResources()); } catch (Exception e) { try { request.deny(); } catch (Exception ignored) {} } }
        else { try { request.deny(); } catch (Exception ignored) {} }
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                Log.i("MainActivity", "[FCM_PERMISSION] Requesting POST_NOTIFICATIONS before authenticated push registration");
                ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST_CODE);
            } else {
                Log.i("MainActivity", "[FCM_PERMISSION] POST_NOTIFICATIONS already granted");
            }
        } catch (Throwable error) {
            Log.w("MainActivity", "[FCM_PERMISSION] Native notification permission request failed: " + error.getMessage());
        }
    }

    private static final class ExfinWebChromeClient extends BridgeWebChromeClient {
        private final Activity activity;
        ExfinWebChromeClient(com.getcapacitor.Bridge bridge, Activity activity) { super(bridge); this.activity = activity; }
        @Override public void onPermissionRequest(final PermissionRequest request) {
            activity.runOnUiThread(() -> {
                boolean wantsCamera = false, wantsMicrophone = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wantsCamera = true;
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsMicrophone = true;
                }
                if (!wantsCamera && !wantsMicrophone) { request.deny(); return; }
                List<String> missing = new ArrayList<>();
                if (wantsCamera && ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.CAMERA);
                if (wantsMicrophone && ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) missing.add(Manifest.permission.RECORD_AUDIO);
                if (missing.isEmpty()) { try { request.grant(request.getResources()); } catch (Exception e) { request.deny(); } return; }
                if (activity instanceof MainActivity) {
                    MainActivity mainActivity = (MainActivity) activity;
                    mainActivity.pendingVideoPermissionRequest = request;
                    ActivityCompat.requestPermissions(mainActivity, missing.toArray(new String[0]), VIDEO_PERMISSION_REQUEST_CODE);
                } else request.deny();
            });
        }
        @Override public void onPermissionRequestCanceled(PermissionRequest request) {
            if (activity instanceof MainActivity && ((MainActivity) activity).pendingVideoPermissionRequest == request) ((MainActivity) activity).pendingVideoPermissionRequest = null;
            super.onPermissionRequestCanceled(request);
        }
    }

    private void refreshNativeGeofenceRegistration(String reason) {
        try {
            SharedPreferences prefs = getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(OfficeGeofenceHelper.KEY_IS_REGISTERED, false).apply();
            OfficeGeofenceHelper.registerOfficeGeofence(this);
        } catch (Exception e) { Log.w("MainActivity", "[AUTO_ATTENDANCE_GEOFENCE] Registration refresh failed: " + e.getMessage()); }
    }

    private void restoreNativePendingExitState(String reason) {
        try {
            SharedPreferences prefs = getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
            JSONObject session = OfficeGeofenceHelper.getActiveSession(this);
            if (session == null) return;
            String sessionDate = session.optString("date", "");
            SimpleDateFormat todayFormatter = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            todayFormatter.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            String todayDate = todayFormatter.format(new Date());
            if (!todayDate.equals(sessionDate)) return;
            String sessionState = session.optString("sessionState", "ACTIVE");
            if ("PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(sessionState) || "PENDING_AUTO_CHECKOUT".equalsIgnoreCase(sessionState) || OfficeGeofenceHelper.STATE_EXIT_PROMPT_RESOLVED_OUTSIDE.equalsIgnoreCase(sessionState) || session.optBoolean("exitPromptResolvedOutside", false) || prefs.getBoolean(OfficeGeofenceHelper.KEY_EXIT_PROMPT_RESOLVED_OUTSIDE, false)) return;
            if (!"OUTSIDE".equalsIgnoreCase(prefs.getString(OfficeGeofenceHelper.KEY_LAST_KNOWN_STATE, "UNKNOWN"))) return;
            String exitTime = prefs.getString(OfficeGeofenceHelper.KEY_LAST_EXIT_TIME, "");
            String exitDate = prefs.getString(OfficeGeofenceHelper.KEY_LAST_EXIT_DATE, "");
            String exitSessionId = prefs.getString(OfficeGeofenceHelper.KEY_LAST_EXIT_SESSION_ID, "");
            String attendanceId = session.optString("attendanceId", "");
            if (exitTime == null || exitTime.trim().isEmpty() || !todayDate.equals(exitDate)) return;
            if (!exitSessionId.isEmpty() && !attendanceId.isEmpty() && !exitSessionId.equals(attendanceId)) return;
            long exitTimestamp = prefs.getLong(OfficeGeofenceHelper.KEY_LAST_CHECKOUT_TIMESTAMP, 0L);
            String existingExitDetectedAt = session.optString("exitDetectedAt", "");
            if ((existingExitDetectedAt == null || existingExitDetectedAt.trim().isEmpty()) && exitTimestamp > 0) {
                SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US); iso.setTimeZone(TimeZone.getTimeZone("UTC")); existingExitDetectedAt = iso.format(new Date(exitTimestamp));
            }
            String pendingEventId = session.optString("pendingCheckoutEventId", "");
            if (pendingEventId == null || pendingEventId.trim().isEmpty()) pendingEventId = "evt_native_EXIT_RESTORED_" + attendanceId + "_" + exitTimestamp;
            session.put("recordedExitTime", exitTime); session.put("exitDetectedAt", existingExitDetectedAt); session.put("exitSource", session.optString("exitSource", "NATIVE_BACKGROUND")); session.put("pendingCheckoutConfirmation", true); session.put("pendingCheckoutEventId", pendingEventId); session.put("currentState", "PENDING_AUTO_CHECKOUT"); session.put("checkoutStatus", "PENDING_AUTO_CHECKOUT"); session.put("sessionState", "PENDING_EXIT_CONFIRMATION"); session.put("exitPromptResolvedOutside", false);
            prefs.edit().putString(OfficeGeofenceHelper.KEY_ACTIVE_SESSION, session.toString()).putString("currentState", "PENDING_AUTO_CHECKOUT").putString("checkoutStatus", "PENDING_AUTO_CHECKOUT").putBoolean("pendingCheckoutConfirmation", true).putString("pendingCheckoutEventId", pendingEventId).apply();
        } catch (Exception e) { Log.w("MainActivity", "[AUTO_ATTENDANCE_RESTORE] Failed to restore native exit state: " + e.getMessage()); }
    }

    private void ensureNativeAttendanceMonitoring(String reason) {
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            boolean locationEnabled = lm != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.P ? (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) : lm.isLocationEnabled());
            boolean fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean backgroundGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (!locationEnabled || !fineGranted || !backgroundGranted) return;
            OfficeLocationService.start(this);
        } catch (Exception e) { Log.w("MainActivity", "[AUTO_ATTENDANCE_BACKGROUND] Native monitor start failed: " + e.getMessage()); }
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
                if (todayDate.equals(sessionDate) && ("ACTIVE".equalsIgnoreCase(state) || "PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(state))) OfficeLocationService.start(this);
            }
        } catch (Exception ignored) {}
    }

    private void createDefaultNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm == null) return;
                String channelId = "exfin_oms_messages_v2";
                android.app.NotificationChannel channel = new android.app.NotificationChannel(channelId, "EXFIN OMS Messages", android.app.NotificationManager.IMPORTANCE_HIGH);
                channel.setDescription("Normal and High Priority EXFIN OMS Push Notifications & Alerts");
                android.media.AudioAttributes audioAttributes = new android.media.AudioAttributes.Builder().setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION).setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).build();
                channel.setSound(android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION), audioAttributes);
                channel.enableVibration(true); channel.setVibrationPattern(new long[]{0, 250, 150, 250});
                nm.createNotificationChannel(channel);
            } catch (Exception e) { Log.e("MainActivity", "Error creating notification channel: " + e.getMessage()); }
        }
    }
}
