package com.exfin.oms.scheduler;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import com.exfin.oms.geofence.OfficeGeofenceHelper;
import com.exfin.oms.location.BackgroundLocationService;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class DayEndBroadcastReceiver extends BroadcastReceiver {
    public static final String TAG = "DayEndReceiver";
    public static final String ACTION_DAY_END_CHECKOUT = "com.exfin.oms.scheduler.ACTION_DAY_END_CHECKOUT";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
        String timeStr = sdf.format(new Date());

        Log.i(TAG, "=== 6:00 PM IST DAY-END ALARM TRIGGERED AT " + timeStr + " IST ===");

        try {
            // Check if active background location tracking is running
            SharedPreferences locPrefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
            boolean isTracking = locPrefs.getBoolean(BackgroundLocationService.KEY_IS_TRACKING, false);
            String empId = locPrefs.getString(BackgroundLocationService.KEY_EMPLOYEE_ID, "");

            if (isTracking && !empId.isEmpty()) {
                Log.i(TAG, "Active background location tracking detected for " + empId + " at 6 PM. Checking if finalization is required.");

                // Run native finalization
                DayEndFinalizer.finalizeAttendance(context, empId, timeStr);
            }

            // Reschedule for next day 18:00 IST
            DayEndAlarmScheduler.scheduleDayEndAlarm(context);
        } catch (Exception e) {
            Log.e(TAG, "Error executing day-end receiver: " + e.getMessage(), e);
        }
    }
}
