package com.exfin.oms.geofence;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.exfin.oms.scheduler.DayEndAlarmScheduler;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Log.i(TAG, "Device boot or package update detected (" + action + "). Re-registering authoritative office geofence.");
        
        OfficeGeofenceHelper.registerOfficeGeofence(context);
        DayEndAlarmScheduler.scheduleDayEndAlarm(context);
        OfficeGeofenceHelper.retryPendingNativeCheckIn(context);
    }
}
