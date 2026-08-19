package com.exfin.oms.location;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(
    name = "BackgroundLocation",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class BackgroundLocationPlugin extends Plugin {
    public static final String TAG = "BackgroundLocationPlugin";

    @PluginMethod
    public void startTracking(PluginCall call) {
        String employeeId = call.getString("employeeId");
        String employeeName = call.getString("employeeName", "Employee");

        if (employeeId == null || employeeId.trim().isEmpty()) {
            call.reject("employeeId is required to start background location tracking.");
            return;
        }

        try {
            Context context = getContext();

            // Persist active tracking state
            SharedPreferences prefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putBoolean(BackgroundLocationService.KEY_IS_TRACKING, true)
                    .putString(BackgroundLocationService.KEY_EMPLOYEE_ID, employeeId.trim())
                    .putString(BackgroundLocationService.KEY_EMPLOYEE_NAME, employeeName != null ? employeeName.trim() : "")
                    .apply();

            Intent intent = new Intent(context, BackgroundLocationService.class);
            intent.setAction(BackgroundLocationService.ACTION_START);
            intent.putExtra(BackgroundLocationService.EXTRA_EMPLOYEE_ID, employeeId.trim());
            intent.putExtra(BackgroundLocationService.EXTRA_EMPLOYEE_NAME, employeeName != null ? employeeName.trim() : "");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent);
            } else {
                context.startService(intent);
            }

            Log.i(TAG, "Started native background location tracking for " + employeeId);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("tracking", true);
            ret.put("employeeId", employeeId);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start background tracking: " + e.getMessage(), e);
            call.reject("Failed to start background location tracking: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        try {
            Context context = getContext();

            // Clear active tracking flag
            SharedPreferences prefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit()
                    .putBoolean(BackgroundLocationService.KEY_IS_TRACKING, false)
                    .remove(BackgroundLocationService.KEY_EMPLOYEE_ID)
                    .remove(BackgroundLocationService.KEY_EMPLOYEE_NAME)
                    .apply();

            Intent intent = new Intent(context, BackgroundLocationService.class);
            intent.setAction(BackgroundLocationService.ACTION_STOP);
            context.stopService(intent);

            Log.i(TAG, "Stopped native background location tracking.");
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("tracking", false);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop background tracking: " + e.getMessage(), e);
            call.reject("Failed to stop background location tracking: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void isTrackingActive(PluginCall call) {
        try {
            Context context = getContext();
            SharedPreferences prefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
            boolean isTracking = prefs.getBoolean(BackgroundLocationService.KEY_IS_TRACKING, false);
            String employeeId = prefs.getString(BackgroundLocationService.KEY_EMPLOYEE_ID, null);

            JSObject ret = new JSObject();
            ret.put("isTracking", isTracking);
            ret.put("employeeId", employeeId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to query tracking status: " + e.getMessage(), e);
        }
    }
}
