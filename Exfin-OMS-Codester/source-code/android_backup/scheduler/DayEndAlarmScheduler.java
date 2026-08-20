package com.exfin.oms.scheduler;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class DayEndAlarmScheduler {
    public static final String TAG = "DayEndAlarmScheduler";
    public static final int ALARM_REQUEST_CODE = 2504;

    public static void scheduleDayEndAlarm(Context context) {
        if (context == null) return;
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) {
                Log.w(TAG, "AlarmManager not available.");
                return;
            }

            Intent intent = new Intent(context, DayEndBroadcastReceiver.class);
            intent.setAction(DayEndBroadcastReceiver.ACTION_DAY_END_CHECKOUT);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);

            // Compute next 18:00 (6:00 PM) IST in Asia/Kolkata
            Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
            cal.set(Calendar.HOUR_OF_DAY, 18);
            cal.set(Calendar.MINUTE, 0);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);

            long targetTimeMs = cal.getTimeInMillis();
            long nowMs = System.currentTimeMillis();

            if (nowMs >= targetTimeMs) {
                // Already passed 18:00 today, schedule for tomorrow 18:00 IST
                cal.add(Calendar.DAY_OF_YEAR, 1);
                targetTimeMs = cal.getTimeInMillis();
            }

            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            Log.i(TAG, "Scheduling 6:00 PM IST Day-End Alarm for: " + sdf.format(new Date(targetTimeMs)) + " IST");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, targetTimeMs, pendingIntent);
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, targetTimeMs, pendingIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule day-end alarm: " + e.getMessage(), e);
        }
    }

    public static void cancelDayEndAlarm(Context context) {
        if (context == null) return;
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(context, DayEndBroadcastReceiver.class);
            intent.setAction(DayEndBroadcastReceiver.ACTION_DAY_END_CHECKOUT);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, ALARM_REQUEST_CODE, intent, flags);
            alarmManager.cancel(pendingIntent);
            Log.i(TAG, "Cancelled Day-End alarm.");
        } catch (Exception e) {
            Log.e(TAG, "Error cancelling day-end alarm: " + e.getMessage(), e);
        }
    }
}
