package com.exfin.oms.calls;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.exfin.oms.MainActivity;
import com.exfin.oms.R;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Native incoming-call notification handler. The server sends video-call invitations
 * as high-priority data messages so Android can show a CallStyle notification instead
 * of its generic message notification while the WebView is backgrounded or stopped.
 */
public class ExfinCallMessagingService extends MessagingService {
    private static final String CHANNEL_ID = "exfin_video_calls_v1";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        // Preserve Capacitor's normal token/message bridge for all existing app features.
        super.onMessageReceived(message);

        Map<String, String> data = message.getData();
        if (!"video_call".equals(data.get("type"))) return;

        String callId = safe(data.get("callId"), "");
        if (callId.isEmpty()) return;

        String callerName = safe(data.get("callerName"), "EXFIN OMS user");
        String title = safe(data.get("title"), "EXFIN OMS video call");
        showIncomingCall(callId, callerName, title);
    }

    private void showIncomingCall(String callId, String callerName, String title) {
        Context context = getApplicationContext();
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        createCallChannel(manager);

        int requestBase = callId.hashCode() & 0x00ffffff;
        PendingIntent openIntent = activityIntent(context, callId, "open", requestBase + 1);
        PendingIntent answerIntent = activityIntent(context, callId, "answer", requestBase + 2);
        PendingIntent declineIntent = activityIntent(context, callId, "decline", requestBase + 3);

        Person caller = new Person.Builder()
                .setName(callerName)
                .setImportant(true)
                .setIcon(androidx.core.graphics.drawable.IconCompat.createWithResource(context, R.mipmap.ic_launcher))
                .build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle(callerName + " is calling")
                .setContentText(title)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setSound(android.provider.Settings.System.DEFAULT_RINGTONE_URI)
                .setVibrate(new long[] { 0, 700, 350, 700 })
                .setContentIntent(openIntent)
                .setFullScreenIntent(openIntent, true)
                .addAction(new NotificationCompat.Action.Builder(0, "Decline", declineIntent).build())
                .addAction(new NotificationCompat.Action.Builder(0, "Answer", answerIntent).build());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, declineIntent, answerIntent));
        }

        manager.notify(700000 + (requestBase % 100000), builder.build());
    }

    private PendingIntent activityIntent(Context context, String callId, String action, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.exfin.oms.VIDEO_CALL_" + action.toUpperCase());
        intent.putExtra("exfin_video_call_id", callId);
        intent.putExtra("exfin_video_call_action", action);
        intent.putExtra("exfin_video_call_event_id", callId + ":" + action);
        intent.putExtra("exfin_video_call_route", "/video-calls");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void createCallChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Incoming video calls", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Ringing alerts for EXFIN OMS direct calls and group meetings");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 700, 350, 700 });
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        Uri ringtone = android.provider.Settings.System.DEFAULT_RINGTONE_URI;
        channel.setSound(ringtone, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        manager.createNotificationChannel(channel);
    }

    private static String safe(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }
}
