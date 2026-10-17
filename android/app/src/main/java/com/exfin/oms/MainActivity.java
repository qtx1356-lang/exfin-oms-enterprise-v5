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
    private PermissionRequest pendingVideoPermissionRequest;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d("APP_UPDATE_DEBUG", "[APP UPDATE DEBUG] EXFIN_UPDATER_BUILD=2026-10-05-01");
        registerPlugin(GeofencePlugin.class);
        registerPlugin(UpdatePlugin.class);
        registerPlugin(ExfinFcmTokenPlugin.class);
        Log.d("APP_UPDATE_DEBUG", "[APP UPDATE DEBUG] UpdatePlugin registered");
        registerPlugin(GreetingTtsPlugin.class);
        super.onCreate(savedInstanceState);

        // Capacitor's default WebChromeClient is retained through inheritance, while
        // this subclass adds the Android runtime permission bridge required by
        // WebRTC/LiveKit getUserMedia() inside the Capacitor WebView.
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().setWebChromeClient(
                        new ExfinWebChromeClient(getBridge(), this)
                );
                Log.d("MainActivity", "Video WebView permission bridge installed");
            }
        } catch (Throwable t) {
            Log.w("MainActivity", "Could not install video WebView permission bridge: " + t.getMessage());
        }

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
        restoreNativePendingExitState("onCreate");
        refreshNativeGeofenceRegistration("onCreate");
        ensureNativeAttendanceMonitoring("onCreate");
        checkAndRestoreActiveLocationService();
        dispatchNativeVideoCallAction(getIntent());
    }

    @Override
    public void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        dispatchNativeVideoCallAction(intent);
    }

    /** Delivers native Answer/Decline actions to the existing authenticated video-call UI. */
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
        final String script = "(function(){var d={callId:" +
                org.json.JSONObject.quote(callId) + ",action:" + org.json.JSONObject.quote(action) +
                ",eventId:" + org.json.JSONObject.quote(eventId) +
                "};window.__exfinPendingVideoCallActions=window.__exfinPendingVideoCallActions||[];" +
                "if(!window.__exfinPendingVideoCallActions.some(function(x){return x.eventId===d.eventId;}))" +
                "window.__exfinPendingVideoCallActions.push(d);" +
                "window.dispatchEvent(new CustomEvent('exfin:native-video-call-action',{detail:d}));})();";
        final String route = intent.getStringExtra("exfin_video_call_route");
        if ("open".equalsIgnoreCase(action) && route != null && !route.isEmpty()) {
            getWindow().getDecorView().post(() -> {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript("window.location.hash=" + org.json.JSONObject.quote(route) + ";", null);
                }
            });
        }
        final android.os.Handler handler = new android.os.Handler(getMainLooper());
        handler.postDelayed(new Runnable() {
            int attempts = 0;
            @Override public void run() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(script, null);
                }
                if (++attempts < 10) handler.postDelayed(this, 700L);
            }
        }, 900L);
    }

    @Override
    public void onResume() {
        super.onResume();
        restoreNativePendingExitState("onResume");
        refreshNativeGeofenceRegistration("onResume");
        ensureNativeAttendanceMonitoring("onResume");
        checkAndRestoreActiveLocationService();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != VIDEO_PERMISSION_REQUEST_CODE) return;

        PermissionRequest request = pendingVideoPermissionRequest;
        pendingVideoPermissionRequest = null;
        if (request == null) return;

        // Android returns results only for the runtime permissions requested in this
        // particular WebView request. Do not require BOTH camera and microphone when
        // LiveKit asks for only one of them; that incorrectly denies camera-only capture.
        boolean requestedPermissionsGranted = grantResults.length > 0;
        for (int result : grantResults) {
            if (result != PackageManager.PERMISSION_GRANTED) {
                requestedPermissionsGranted = false;
                break;
            }
        }

        if (requestedPermissionsGranted) {
            try {
                request.grant(request.getResources());
                Log.i("MainActivity", "WebRTC protected resources granted: "
                        + java.util.Arrays.toString(request.getResources()));
            } catch (Exception e) {
                Log.w("MainActivity", "Failed to grant WebRTC permission: " + e.getMessage());
                try { request.deny(); } catch (Exception ignored) {}
            }
        } else {
            try {
                request.deny();
            } catch (Exception ignored) {}
            Log.w("MainActivity", "WebRTC runtime permission denied for requested resources: "
                    + java.util.Arrays.toString(request.getResources()));
        }
    }

    /**
     * Bridges WebView getUserMedia() requests to Android runtime permissions while
     * preserving Capacitor's normal BridgeWebChromeClient behavior.
     */
    private static final class ExfinWebChromeClient extends BridgeWebChromeClient {
        private final Activity activity;

        ExfinWebChromeClient(com.getcapacitor.Bridge bridge, Activity activity) {
            super(bridge);
            this.activity = activity;
        }

        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            activity.runOnUiThread(() -> {
                String[] resources = request.getResources();
                boolean wantsCamera = false;
                boolean wantsMicrophone = false;

                for (String resource : resources) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wantsCamera = true;
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsMicrophone = true;
                }

                // Do not grant unrelated WebView protected resources.
                if (!wantsCamera && !wantsMicrophone) {
                    request.deny();
                    return;
                }

                List<String> missingPermissions = new ArrayList<>();
                if (wantsCamera && ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
                        != PackageManager.PERMISSION_GRANTED) {
                    missingPermissions.add(Manifest.permission.CAMERA);
                }
                if (wantsMicrophone && ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO)
                        != PackageManager.PERMISSION_GRANTED) {
                    missingPermissions.add(Manifest.permission.RECORD_AUDIO);
                }

                if (missingPermissions.isEmpty()) {
                    try {
                        request.grant(request.getResources());
                        Log.i("MainActivity", "WebRTC permission granted from existing Android permissions");
                    } catch (Exception e) {
                        Log.w("MainActivity", "Failed to grant existing WebRTC permissions: " + e.getMessage());
                        request.deny();
                    }
                    return;
                }

                if (activity instanceof MainActivity) {
                    MainActivity mainActivity = (MainActivity) activity;
                    mainActivity.pendingVideoPermissionRequest = request;
                    ActivityCompat.requestPermissions(
                            mainActivity,
                            missingPermissions.toArray(new String[0]),
                            VIDEO_PERMISSION_REQUEST_CODE
                    );
                } else {
                    request.deny();
                }
            });
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (activity instanceof MainActivity) {
                MainActivity mainActivity = (MainActivity) activity;
                if (mainActivity.pendingVideoPermissionRequest == request) {
                    mainActivity.pendingVideoPermissionRequest = null;
                }
            }
            super.onPermissionRequestCanceled(request);
        }
    }

    /**
     * Force the native geofence registration path to reconcile the durable
     * registration with Google Play Services whenever the Activity starts/resumes.
     * The existing request IDs are reused, so this refreshes the office boundary
     * rather than creating a second attendance boundary.
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
     * Restores a durable native EXIT before the Activity/WebView resumes.
     * One EXIT is allowed per continuous outside session; app-open/current-location
     * recovery must never manufacture a later EXIT while the employee remains outside.
     */
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
