package com.exfin.oms.notification;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Native Firebase token bridge; delivery is targeted directly to the registered device token. */
@CapacitorPlugin(name = "ExfinFcmToken")
public class ExfinFcmTokenPlugin extends Plugin {
    private static final String TAG = "ExfinFcmToken";
    private static final String DEVICE_TOKEN_ENDPOINT = "https://exfin-oms-enterprise-v5.pages.dev/api/video/device-token";
    private static final ExecutorService NETWORK_EXECUTOR = Executors.newCachedThreadPool();

    @PluginMethod
    public void getToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    if (token == null || token.trim().length() < 20) {
                        call.reject("Firebase returned an empty FCM token.");
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("token", token.trim());
                    call.resolve(result);
                })
                .addOnFailureListener(error -> call.reject(
                    "Native Firebase FCM token retrieval failed: " +
                    (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage())
                ));
        } catch (Exception error) {
            call.reject("Native Firebase FCM token retrieval failed: " +
                (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()));
        }
    }

    /** Returns the Android state that determines whether a call can use full-screen UI. */
    @PluginMethod
    public void getCallReadiness(PluginCall call) {
        try {
            Context context = getContext();
            boolean notificationsEnabled = true;
            boolean fullScreenAllowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE;
            if (context != null) {
                NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null) {
                    notificationsEnabled = androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled();
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        fullScreenAllowed = manager.canUseFullScreenIntent();
                    }
                }
            }
            JSObject result = new JSObject();
            result.put("notificationsEnabled", notificationsEnabled);
            result.put("fullScreenIntentAllowed", fullScreenAllowed);
            result.put("apiLevel", Build.VERSION.SDK_INT);
            call.resolve(result);
        } catch (Throwable error) {
            call.reject("Could not read incoming-call readiness: " + error.getMessage());
        }
    }

    /** Opens Android's per-app full-screen intent permission screen when required. */
    @PluginMethod
    public void openFullScreenIntentSettings(PluginCall call) {
        try {
            Context context = getContext();
            if (context == null) { call.reject("Android context unavailable."); return; }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                call.resolve();
                return;
            }
            NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null && manager.canUseFullScreenIntent()) {
                call.resolve();
                return;
            }
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.resolve();
        } catch (Throwable error) {
            call.reject("Could not open full-screen call settings: " + error.getMessage());
        }
    }

    /**
     * Registers a token directly from native Android as a safety net for token refreshes.
     * This does not depend on the React/WebView lifecycle and therefore repairs the
     * common case where FCM creates/rotates a token before the employee UI is ready.
     */
    public static void registerTokenWithBackend(Context context, String token) {
        if (context == null || token == null || token.trim().length() < 20) return;
        final String normalizedToken = token.trim();
        NETWORK_EXECUTOR.execute(() -> {
            try {
                FirebaseUser user = FirebaseAuth.getInstance().getCurrentUser();
                if (user == null) {
                    Log.w(TAG, "FCM token registration deferred: no authenticated Firebase user.");
                    return;
                }
                Task<com.google.firebase.auth.GetTokenResult> tokenTask = user.getIdToken(true);
                com.google.firebase.auth.GetTokenResult idTokenResult = com.google.android.gms.tasks.Tasks.await(tokenTask);
                String idToken = idTokenResult == null ? "" : String.valueOf(idTokenResult.getToken());
                if (idToken.trim().isEmpty()) {
                    Log.w(TAG, "FCM token registration skipped: Firebase ID token unavailable.");
                    return;
                }

                URL url = new URL(DEVICE_TOKEN_ENDPOINT);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                try {
                    connection.setRequestMethod("POST");
                    connection.setConnectTimeout(8000);
                    connection.setReadTimeout(10000);
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json");
                    connection.setRequestProperty("Authorization", "Bearer " + idToken);

                    JSONObject body = new JSONObject();
                    body.put("token", normalizedToken);
                    body.put("userId", user.getUid());
                    body.put("platform", "android");
                    body.put("appId", "com.exfin.oms");
                    body.put("role", "EMPLOYEE");
                    byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(bytes);
                    }

                    int status = connection.getResponseCode();
                    if (status >= 200 && status < 300) {
                        Log.i(TAG, "FCM token registered from native Android. HTTP " + status);
                    } else {
                        Log.w(TAG, "Native FCM token registration returned HTTP " + status);
                    }
                } finally {
                    connection.disconnect();
                }
            } catch (Throwable error) {
                Log.w(TAG, "Native FCM token registration failed: " + error.getMessage());
            }
        });
    }
}
