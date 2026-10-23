package com.exfin.oms.calls;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.exfin.oms.MainActivity;
import com.exfin.oms.R;

/**
 * Native full-screen incoming video-call UI. The notification tap shows this
 * screen instead of dropping the employee onto the app home screen.
 */
public final class IncomingCallActivity extends Activity {
    private String callId = "";
    private String callerName = "EXFIN OMS Admin";
    private String callTitle = "Incoming video conference";
    private boolean handled = false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        callId = safe(getIntent().getStringExtra("exfin_video_call_id"), "");
        callerName = safe(getIntent().getStringExtra("exfin_video_caller_name"), "EXFIN OMS Admin");
        callTitle = safe(getIntent().getStringExtra("exfin_video_call_title"), "Incoming video conference");
        if (callId.isEmpty()) { finish(); return; }
        render();
    }

    private void render() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(32), dp(28), dp(32));
        root.setBackgroundColor(Color.rgb(17, 24, 39));

        TextView brand = text("EXFIN OMS", 16, Color.rgb(156, 163, 175), false);
        TextView type = text("INCOMING VIDEO CALL", 13, Color.rgb(134, 239, 172), true);
        TextView avatar = text("●", 66, Color.rgb(134, 239, 172), true);
        TextView caller = text(callerName, 30, Color.WHITE, true);
        TextView title = text(callTitle, 16, Color.rgb(209, 213, 219), false);
        TextView subtitle = text("Calling…", 15, Color.rgb(156, 163, 175), false);
        root.addView(brand, params(LinearLayout.LayoutParams.WRAP_CONTENT, dp(35)));
        root.addView(type, params(LinearLayout.LayoutParams.WRAP_CONTENT, dp(30)));
        LinearLayout.LayoutParams avatarParams = params(dp(124), dp(124));
        avatarParams.topMargin = dp(35); avatarParams.bottomMargin = dp(28);
        avatar.setGravity(Gravity.CENTER);
        avatar.setBackground(makeCircle());
        root.addView(avatar, avatarParams);
        root.addView(caller, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)));
        root.addView(title, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(40)));
        root.addView(subtitle, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(34)));

        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setPadding(0, dp(38), 0, 0);
        Button decline = new Button(this);
        decline.setText("Decline");
        decline.setTextColor(Color.WHITE);
        decline.setAllCaps(false);
        decline.setTextSize(16);
        decline.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(220, 38, 38)));
        Button answer = new Button(this);
        answer.setText("Answer");
        answer.setTextColor(Color.WHITE);
        answer.setAllCaps(false);
        answer.setTextSize(16);
        answer.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(22, 163, 74)));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(0, dp(58), 1f);
        buttonParams.setMargins(dp(7), 0, dp(7), 0);
        actions.addView(decline, buttonParams);
        actions.addView(answer, buttonParams);
        root.addView(actions, params(LinearLayout.LayoutParams.MATCH_PARENT, dp(100)));
        setContentView(root);
        decline.setOnClickListener(v -> declineCall());
        answer.setOnClickListener(v -> answerCall());
    }

    private android.graphics.drawable.Drawable makeCircle() {
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        d.setColor(Color.rgb(31, 41, 55));
        d.setStroke(dp(2), Color.rgb(74, 222, 128));
        return d;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView v = new TextView(this);
        v.setText(value); v.setTextSize(size); v.setTextColor(color);
        v.setGravity(Gravity.CENTER);
        if (bold) v.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return v;
    }

    private LinearLayout.LayoutParams params(int width, int height) {
        return new LinearLayout.LayoutParams(width, height);
    }

    private int dp(int value) { return (int) (value * getResources().getDisplayMetrics().density + 0.5f); }
    private String safe(String value, String fallback) { return value == null || value.trim().isEmpty() ? fallback : value.trim(); }

    private void cancelCallNotification() {
        try {
            NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (manager != null) {
                int requestBase = callId.hashCode() & 0x00ffffff;
                manager.cancel(700000 + (requestBase % 100000));
            }
        } catch (Exception ignored) {}
    }

    private void declineCall() {
        if (handled) return;
        handled = true;
        cancelCallNotification();
        finishAndRemoveTask();
    }

    private void answerCall() {
        if (handled) return;
        handled = true;
        cancelCallNotification();
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.exfin.oms.VIDEO_CALL_ANSWER");
        intent.putExtra("exfin_video_call_id", callId);
        intent.putExtra("exfin_video_call_action", "answer");
        intent.putExtra("exfin_video_call_event_id", callId + ":answer");
        intent.putExtra("exfin_video_call_route", "/video-calls");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        finish();
    }
}
