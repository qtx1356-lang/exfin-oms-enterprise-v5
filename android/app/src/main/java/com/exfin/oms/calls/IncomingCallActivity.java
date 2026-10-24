package com.exfin.oms.calls;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.exfin.oms.MainActivity;

/** Native full-screen incoming video-call UI. */
public final class IncomingCallActivity extends Activity {
    private String callId = "";
    private String callerName = "EXFIN OMS Admin";
    private String callTitle = "Incoming video conference";
    private boolean handled = false;
    private Ringtone ringtone;
    private Vibrator vibrator;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) { setShowWhenLocked(true); setTurnScreenOn(true); }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        Intent launchIntent = getIntent();
        callId = safe(launchIntent.getStringExtra("exfin_video_call_id"),
                safe(launchIntent.getStringExtra("conferenceId"), safe(launchIntent.getStringExtra("callId"), "")));
        callerName = safe(launchIntent.getStringExtra("exfin_video_caller_name"),
                safe(launchIntent.getStringExtra("callerName"), "EXFIN OMS Admin"));
        callTitle = safe(launchIntent.getStringExtra("exfin_video_call_title"),
                safe(launchIntent.getStringExtra("title"), "Incoming video conference"));
        if (callId.isEmpty()) { finish(); return; }
        render();
        startRinging();
    }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); recreate(); }

    private void startRinging() {
        try {
            android.net.Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(getApplicationContext(), uri);
            if (ringtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) ringtone.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
                ringtone.play();
            }
        } catch (Throwable ignored) {}
        try {
            long[] pattern = {0, 700, 350, 700, 350, 700};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(VIBRATOR_MANAGER_SERVICE);
                vibrator = vm == null ? null : vm.getDefaultVibrator();
            } else vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                else vibrator.vibrate(pattern, 0);
            }
        } catch (Throwable ignored) {}
    }

    private void stopRinging() {
        try { if (ringtone != null && ringtone.isPlaying()) ringtone.stop(); } catch (Throwable ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Throwable ignored) {}
    }

    @Override protected void onDestroy() { stopRinging(); super.onDestroy(); }

    private void render() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setGravity(Gravity.CENTER); root.setPadding(dp(28), dp(32), dp(28), dp(32));
        root.setBackgroundColor(Color.rgb(17, 24, 39));
        TextView brand = text("EXFIN OMS", 16, Color.rgb(156, 163, 175), false);
        TextView type = text("INCOMING VIDEO CALL", 13, Color.rgb(134, 239, 172), true);
        TextView avatar = text("●", 66, Color.rgb(134, 239, 172), true);
        TextView caller = text(callerName, 30, Color.WHITE, true);
        TextView title = text(callTitle, 16, Color.rgb(209, 213, 219), false);
        TextView subtitle = text("Calling…", 15, Color.rgb(156, 163, 175), false);
        root.addView(brand, params(LinearLayout.LayoutParams.WRAP_CONTENT, dp(35)));
        root.addView(type, params(LinearLayout.LayoutParams.WRAP_CONTENT, dp(30)));
        LinearLayout.LayoutParams avatarParams = params(dp(124), dp(124)); avatarParams.topMargin = dp(35); avatarParams.bottomMargin = dp(28);
        avatar.setGravity(Gravity.CENTER); avatar.setBackground(makeCircle()); root.addView(avatar, avatarParams);
        root.addView(caller, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));
        root.addView(title, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(40)));
        root.addView(subtitle, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(34)));
        LinearLayout actions = new LinearLayout(this); actions.setGravity(Gravity.CENTER); actions.setOrientation(LinearLayout.HORIZONTAL); actions.setPadding(0, dp(38), 0, 0);
        Button decline = new Button(this); decline.setText("Decline"); decline.setTextColor(Color.WHITE); decline.setAllCaps(false); decline.setTextSize(16); decline.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(220, 38, 38)));
        Button answer = new Button(this); answer.setText("Answer"); answer.setTextColor(Color.WHITE); answer.setAllCaps(false); answer.setTextSize(16); answer.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(22, 163, 74)));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(0, dp(58), 1f); buttonParams.setMargins(dp(7), 0, dp(7), 0);
        actions.addView(decline, buttonParams); actions.addView(answer, buttonParams); root.addView(actions, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(100)));
        setContentView(root); decline.setOnClickListener(v -> declineCall()); answer.setOnClickListener(v -> answerCall());
    }

    private android.graphics.drawable.Drawable makeCircle() { android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable(); d.setShape(android.graphics.drawable.GradientDrawable.OVAL); d.setColor(Color.rgb(31, 41, 55)); d.setStroke(dp(2), Color.rgb(74, 222, 128)); return d; }
    private TextView text(String value, int size, int color, boolean bold) { TextView v = new TextView(this); v.setText(value); v.setTextSize(size); v.setTextColor(color); v.setGravity(Gravity.CENTER); if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD); return v; }
    private LinearLayout.LayoutParams params(int width, int height) { return new LinearLayout.LayoutParams(width, height); }
    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }
    private String safe(String value, String fallback) { return value == null || value.trim().isEmpty() ? fallback : value.trim(); }

    private void cancelCallNotification() {
        try { NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE); if (manager != null) { int requestBase = callId.hashCode() & 0x00ffffff; manager.cancel(700000 + (requestBase % 100000)); } } catch (Exception ignored) {}
    }
    private void declineCall() { if (handled) return; handled = true; stopRinging(); cancelCallNotification(); finishAndRemoveTask(); }
    private void answerCall() {
        if (handled) return; handled = true; stopRinging(); cancelCallNotification();
        Intent intent = new Intent(this, MainActivity.class); intent.setAction("com.exfin.oms.VIDEO_CALL_ANSWER");
        intent.putExtra("exfin_video_call_id", callId); intent.putExtra("exfin_video_call_action", "answer"); intent.putExtra("exfin_video_call_event_id", callId + ":answer"); intent.putExtra("exfin_video_call_route", "/video-calls");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP); startActivity(intent); finish();
    }
}
