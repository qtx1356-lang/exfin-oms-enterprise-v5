package com.exfin.oms.notification;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Direct access to Firebase's native FCM token. The JavaScript PushNotifications
 * registration event remains the primary path; this bridge is a startup fallback.
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
}
