package com.exfin.oms.calls;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.PowerManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

import com.exfin.oms.MainActivity;
import com.exfin.oms.R;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Native incoming-call/conference notification handler.
 *
 * This deliberately extends FirebaseMessagingService rather than Capacitor's
 * MessagingService. Capacitor documents that data-only FCM messages received
 * while the Android app is killed require a FirebaseMessagingService handler.
 * The handler therefore remains independent of the WebView/Capacitor bridge
 * and can publish the native incoming-call UI from a cold/background process.
 */
public class ExfinCallMessagingService extends FirebaseMessagingService {
    private static final String TAG = "ExfinCallFCM";
    private static final String CHANNEL_ID = "exfin_video_calls_v1";
    private static final long RING_TIMEOUT_MS = 60_000L;

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (data == null || data.isEmpty()) return;

        String type = safe(data.get("type"), "");
        if (!"video_call".equals(type) && !"video_conference".equals(type)) return;

        String callId = safe(
                "video_conference".equals(type) ? data.get("conferenceId") : data.get("callId"),
                ""
        );
        if (callId.isEmpty()) return;

        String callerName = safe(data.get("callerName"), "EXFIN OMS Admin");
        String title = safe(data.get("title"), "EXFIN OMS video conference");

        PowerManager.WakeLock wakeLock = null;
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(
                        PowerManager.PARTIAL_WAKE_LOCK,
                        TAG + ":IncomingCall"
                );
                wakeLock.acquire(10_000L);
            }

            showIncomingCall(callId, callerName, title, "video_conference".equals(type));
        } catch (Throwable error) {
            android.util.Log.e(TAG, "Failed to publish incoming video alert", error);
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try { wakeLock.release(); } catch (Throwable ignored) {}
            }
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // Capacitor's PushNotifications.register()/the existing native token
        // bridge owns application-level token registration. Do not duplicate
        // backend registration here; this callback only confirms that FCM has
        // refreshed the token for this Firebase app instance.
        android.util.Log.d(TAG, "FCM token refreshed");
    }

    private void showIncomingCall(String callId, String callerName, String title, boolean conference) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        createCallChannel(manager);

        int requestBase = callId.hashCode() & 0x00ffffff;
        int notificationId = 700000 + (requestBase % 100000);

        PendingIntent openIntent = activityIntent(
                context, callId, "open", callerName, title, requestBase + 1
        );
        PendingIntent answerIntent = activityIntent(
                context, callId, "answer", callerName, title, requestBase + 2
        );
        PendingIntent declineIntent = activityIntent(
                context, callId, "decline", callerName, title, requestBase + 3
        );

        Person caller = new Person.Builder()
                .setName(callerName)
                .setImportant(true)
                .setIcon(androidx.core.graphics.drawable.IconCompat.createWithResource(
                        context, R.mipmap.ic_launcher
                ))
                .build();

        String content = conference
                ? "EXFIN OMS group video conference"
                : title;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(callerName + " is inviting you")
                .setContentText(content)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setTimeoutAfter(RING_TIMEOUT_MS)
                .setSound(android.provider.Settings.System.DEFAULT_RINGTONE_URI)
                .setVibrate(new long[] { 0, 700, 350, 700 })
                .setContentIntent(openIntent)
                .addAction(new NotificationCompat.Action.Builder(0, "Later", declineIntent).build())
                .addAction(new NotificationCompat.Action.Builder(0, "Join", answerIntent).build());

        boolean canUseFullScreen = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            canUseFullScreen = manager.canUseFullScreenIntent();
        }
        if (canUseFullScreen) builder.setFullScreenIntent(openIntent, true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(
                    caller, declineIntent, answerIntent
            ));
        }

        manager.notify(notificationId, builder.build());
    }

    private PendingIntent activityIntent(
            Context context,
            String callId,
            String action,
            String callerName,
            String title,
            int requestCode
    ) {
        // A body tap/full-screen launch must show the native incoming-call screen,
        // not the app home screen. Answer/Decline notification actions remain explicit.
        Class<?> target = "open".equals(action)
                ? IncomingCallActivity.class
                : MainActivity.class;

        Intent intent = new Intent(context, target);
        intent.setAction("com.exfin.oms.VIDEO_CALL_" + action.toUpperCase());
        intent.putExtra("exfin_video_call_id", callId);
        intent.putExtra("exfin_video_call_action", action);
        intent.putExtra("exfin_video_call_event_id", callId + ":" + action);
        intent.putExtra("exfin_video_call_route", "/video-calls");
        intent.putExtra("exfin_video_caller_name", callerName);
        intent.putExtra("exfin_video_call_title", title);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        return PendingIntent.getActivity(
                context,
                requestCode,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void createCallChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Incoming video calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Ringing alerts for EXFIN OMS direct calls and group conferences");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 700, 350, 700 });
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        channel.setSound(
                android.provider.Settings.System.DEFAULT_RINGTONE_URI,
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
        );
        manager.createNotificationChannel(channel);
    }

    private static String safe(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }
}
