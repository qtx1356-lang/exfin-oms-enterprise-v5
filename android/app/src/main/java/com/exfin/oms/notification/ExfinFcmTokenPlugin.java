package com.exfin.oms.notification;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Direct access to Firebase's native FCM token and employee-specific call topic.
 *
 * Call alerts use a private per-employee topic rather than a server-side lookup
 * of push_device_tokens. The native Firebase SDK owns the registration/token
 * lifecycle and restores topic subscriptions after app restarts.
 */
@CapacitorPlugin(name = "ExfinFcmToken")
public class ExfinFcmTokenPlugin extends Plugin {
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

    @PluginMethod
    public void subscribeToCallTopic(PluginCall call) {
        String employeeCode = call.getString("employeeCode", "");
        if (employeeCode == null) employeeCode = "";
        employeeCode = employeeCode.trim().toUpperCase(java.util.Locale.US);
        if (employeeCode.isEmpty()) {
            call.reject("Employee code is required to subscribe to the EXFIN call channel.");
            return;
        }

        // FCM topic names are deliberately derived from the canonical employee
        // identifier and contain no Firebase UID or device token.
        String topic = "exfin_call_" + employeeCode.replaceAll("[^A-Z0-9_-]", "_");
        final String finalTopic = topic;
        try {
            FirebaseMessaging.getInstance().subscribeToTopic(finalTopic)
                .addOnSuccessListener(unused -> {
                    JSObject result = new JSObject();
                    result.put("subscribed", true);
                    result.put("topic", finalTopic);
                    call.resolve(result);
                })
                .addOnFailureListener(error -> call.reject(
                    "Could not subscribe to the EXFIN call channel: " +
                    (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage())
                ));
        } catch (Exception error) {
            call.reject("Could not subscribe to the EXFIN call channel: " +
                (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()));
        }
    }

    @PluginMethod
    public void unsubscribeFromCallTopic(PluginCall call) {
        String employeeCode = call.getString("employeeCode", "");
        if (employeeCode == null) employeeCode = "";
        employeeCode = employeeCode.trim().toUpperCase(java.util.Locale.US);
        if (employeeCode.isEmpty()) {
            call.reject("Employee code is required to unsubscribe from the EXFIN call channel.");
            return;
        }

        String topic = "exfin_call_" + employeeCode.replaceAll("[^A-Z0-9_-]", "_");
        try {
            FirebaseMessaging.getInstance().unsubscribeFromTopic(topic)
                .addOnSuccessListener(unused -> call.resolve())
                .addOnFailureListener(error -> call.reject(
                    "Could not unsubscribe from the EXFIN call channel: " +
                    (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage())
                ));
        } catch (Exception error) {
            call.reject("Could not unsubscribe from the EXFIN call channel: " +
                (error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage()));
        }
    }
}
