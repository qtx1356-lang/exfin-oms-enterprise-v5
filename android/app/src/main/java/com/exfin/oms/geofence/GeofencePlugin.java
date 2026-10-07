package com.exfin.oms.geofence;

import android.content.Context;
import android.content.Intent;
import android.location.LocationManager;
import android.provider.Settings;
import android.util.Log;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(name = "ExfinGeofence")
public class GeofencePlugin extends Plugin {
    public static final String TAG = "GeofencePlugin";
    private static GeofencePlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void notifyNativeCheckIn(JSONObject event) {
        if (instance != null && event != null) {
            try {
                JSObject ret = JSObject.fromJSONObject(event);
                instance.notifyListeners("attendanceNativeCheckIn", ret, true);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying attendanceNativeCheckIn: " + e.getMessage());
            }
        }
    }

    public static void notifyNativeCheckOut(JSONObject event) {
        if (instance != null && event != null) {
            try {
                JSObject ret = JSObject.fromJSONObject(event);
                instance.notifyListeners("attendanceNativeCheckOut", ret, true);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying attendanceNativeCheckOut: " + e.getMessage());
            }
        }
    }

    public static void notifyNativeReturn(JSONObject event) {
        if (instance != null && event != null) {
            try {
                JSObject ret = JSObject.fromJSONObject(event);
                instance.notifyListeners("attendanceNativeReturn", ret, true);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying attendanceNativeReturn: " + e.getMessage());
            }
        }
    }

    public static void notifyNativeSync(String eventId, boolean success) {
        if (instance != null) {
            try {
                JSObject ret = new JSObject();
                ret.put("eventId", eventId);
                ret.put("success", success);
                ret.put("timestamp", System.currentTimeMillis());
                instance.notifyListeners("attendanceNativeSync", ret, true);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying attendanceNativeSync: " + e.getMessage());
            }
        }
    }

    public static void notifyNativeError(String error) {
        if (instance != null) {
            try {
                JSObject ret = new JSObject();
                ret.put("error", error);
                ret.put("timestamp", System.currentTimeMillis());
                instance.notifyListeners("attendanceNativeError", ret, true);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying attendanceNativeError: " + e.getMessage());
            }
        }
    }

    public static void notifyNativeTransition(String transition, double lat, double lng, long eventTimestamp) {
        if (instance != null) {
            try {
                Date eventDate = new Date(eventTimestamp);
                SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", Locale.US);
                sdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
                String timeStr = sdf.format(eventDate);

                SimpleDateFormat sdfDate = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                sdfDate.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
                String dateStr = sdfDate.format(eventDate);

                JSObject ret = new JSObject();
                ret.put("transition", transition);
                ret.put("time", timeStr);
                ret.put("date", dateStr);
                if (!Double.isNaN(lat) && !Double.isInfinite(lat)) {
                    ret.put("latitude", lat);
                } else {
                    ret.put("latitude", (String) null);
                }
                if (!Double.isNaN(lng) && !Double.isInfinite(lng)) {
                    ret.put("longitude", lng);
                } else {
                    ret.put("longitude", (String) null);
                }
                ret.put("timestamp", eventTimestamp);
                ret.put("exitTimestamp", eventTimestamp);

                instance.notifyListeners("geofenceTransition", ret, true);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying JS listeners: " + e.getMessage(), e);
            }
        }
    }

    @PluginMethod
    public void getLocationReadiness(PluginCall call) {
        try {
            Context context = getContext();
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            boolean locationEnabled = false;
            if (lm != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    locationEnabled = lm.isLocationEnabled();
                } else {
                    locationEnabled = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
                            || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
                }
            }

            boolean fine = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            boolean coarse = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            boolean background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
                    androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_BACKGROUND_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;

            JSObject ret = new JSObject();
            ret.put("locationEnabled", locationEnabled);
            ret.put("fineLocationGranted", fine);
            ret.put("coarseLocationGranted", coarse);
            ret.put("backgroundLocationGranted", background);
            ret.put("locationReady", locationEnabled && fine && background);
            ret.put("geofenceRegistered", OfficeGeofenceHelper.isGeofenceRegistered(context));
            ret.put("foregroundServiceRunning", OfficeLocationService.isRunning());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to check location readiness: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void openLocationSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open Location Settings: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void repairLocationMonitoring(PluginCall call) {
        try {
            Context context = getContext();
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            boolean locationEnabled = lm != null && (Build.VERSION.SDK_INT < Build.VERSION_CODES.P
                    ? (lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
                    : lm.isLocationEnabled());

            boolean fine = androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
            if (!locationEnabled || !fine) {
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("locationEnabled", locationEnabled);
                ret.put("fineLocationGranted", fine);
                call.resolve(ret);
                return;
            }

            OfficeGeofenceHelper.ensureNativeAttendanceReady(context);
            OfficeLocationService.verifyCurrentLocationAndDecide(context);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("locationEnabled", true);
            ret.put("geofenceRegistered", OfficeGeofenceHelper.isGeofenceRegistered(context));
            ret.put("foregroundServiceRunning", OfficeLocationService.isRunning());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to repair native location monitoring: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void registerOfficeGeofence(PluginCall call) {
        try {
            Context context = getContext();
            OfficeGeofenceHelper.registerOfficeGeofence(context);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("geofenceId", OfficeGeofenceHelper.GEOFENCE_ID);
            ret.put("authoritativeRadius", OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS);
            ret.put("wakeupTriggerRadius", OfficeGeofenceHelper.WAKEUP_TRIGGER_RADIUS_METERS);
            ret.put("assistRadius", OfficeGeofenceHelper.ASSIST_RADIUS_METERS);
            ret.put("latitude", OfficeGeofenceHelper.OFFICE_LAT);
            ret.put("longitude", OfficeGeofenceHelper.OFFICE_LNG);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to register office geofence: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getGeofenceStatus(PluginCall call) {
        try {
            Context context = getContext();
            boolean isRegistered = OfficeGeofenceHelper.isGeofenceRegistered(context);

            JSObject ret = new JSObject();
            ret.put("isRegistered", isRegistered);
            ret.put("geofenceId", OfficeGeofenceHelper.GEOFENCE_ID);
            ret.put("authoritativeRadius", OfficeGeofenceHelper.AUTHORITATIVE_RADIUS_METERS);
            ret.put("wakeupTriggerRadius", OfficeGeofenceHelper.WAKEUP_TRIGGER_RADIUS_METERS);
            ret.put("assistRadius", OfficeGeofenceHelper.ASSIST_RADIUS_METERS);
            ret.put("latitude", OfficeGeofenceHelper.OFFICE_LAT);
            ret.put("longitude", OfficeGeofenceHelper.OFFICE_LNG);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get geofence status: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getUnconsumedNativeEvents(PluginCall call) {
        try {
            Context context = getContext();
            JSONArray events = OfficeGeofenceHelper.getAndClearUnconsumedEvents(context);

            JSObject ret = new JSObject();
            JSArray arr = new JSArray();
            for (int i = 0; i < events.length(); i++) {
                JSONObject obj = events.getJSONObject(i);
                JSObject item = JSObject.fromJSONObject(obj);
                arr.put(item);
            }
            ret.put("events", arr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to retrieve unconsumed events: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void removeOfficeGeofence(PluginCall call) {
        try {
            Context context = getContext();
            OfficeGeofenceHelper.removeOfficeGeofence(context);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to remove office geofence: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void setEmployeeIdentity(PluginCall call) {
        try {
            Context context = getContext();
            String id = call.getString("id");
            String name = call.getString("name");
            String townCity = call.getString("townCity", "Raniganj HQ");
            String serverUrl = call.getString("serverUrl");

            if (id != null && !id.trim().isEmpty()) {
                android.content.SharedPreferences prefs = context.getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
                android.content.SharedPreferences.Editor editor = prefs.edit();
                editor.putString("employee_id", id);
                editor.putString("employee_name", name);
                editor.putString("town_city", townCity);
                if (serverUrl != null && !serverUrl.trim().isEmpty()) {
                    editor.putString("server_url", serverUrl);
                }
                editor.apply();
                Log.i(TAG, "Native employee identity set: " + id + " (" + name + ") - Server URL: " + serverUrl);

                OfficeGeofenceHelper.registerNetworkCallbackIfNecessary(context);
                OfficeGeofenceHelper.triggerBackgroundSync(context);

                call.resolve();
            } else {
                call.reject("Invalid employee ID");
            }
        } catch (Exception e) {
            call.reject("Failed to set employee identity: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void startActiveSession(PluginCall call) {
        try {
            Context context = getContext();
            String employeeId = call.getString("employeeId");
            String employeeName = call.getString("employeeName", "");
            String townCity = call.getString("townCity", "Raniganj HQ");
            String date = call.getString("date");
            String checkInTime = call.getString("checkInTime");

            if (employeeId != null && date != null && checkInTime != null) {
                OfficeGeofenceHelper.startActiveSession(context, employeeId, employeeName, townCity, date, checkInTime);
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } else {
                call.reject("Missing required parameters: employeeId, date, checkInTime");
            }
        } catch (Exception e) {
            call.reject("Failed to start active session: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void clearActiveSession(PluginCall call) {
        try {
            Context context = getContext();
            OfficeGeofenceHelper.clearActiveSession(context);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to clear active session: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void cancelPendingExit(PluginCall call) {
        try {
            Context context = getContext();
            OfficeGeofenceHelper.cancelPendingExit(context);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to cancel pending exit: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void forceSyncPendingEvents(PluginCall call) {
        try {
            Context context = getContext();
            OfficeGeofenceHelper.triggerBackgroundSync(context);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to force sync pending events: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getActiveAttendanceState(PluginCall call) {
        try {
            Context context = getContext();
            JSONObject session = OfficeGeofenceHelper.getActiveSession(context);
            android.content.SharedPreferences prefs = context.getSharedPreferences(OfficeGeofenceHelper.PREFS_NAME, Context.MODE_PRIVATE);
            JSObject ret = new JSObject();

            if (session == null) {
                ret.put("hasActiveSession", false);
                ret.put("isGeofenceRegistered", OfficeGeofenceHelper.isGeofenceRegistered(context));
                ret.put("isLocationServiceRunning", OfficeLocationService.isRunning());
                call.resolve(ret);
                return;
            }

            java.text.SimpleDateFormat sdfDate = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
            sdfDate.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
            String todayDate = sdfDate.format(new java.util.Date());

            String sessionDate = session.optString("date", "");
            if (!todayDate.equals(sessionDate)) {
                // Session is from a previous day. Not active today.
                ret.put("hasActiveSession", false);
                ret.put("isGeofenceRegistered", OfficeGeofenceHelper.isGeofenceRegistered(context));
                ret.put("isLocationServiceRunning", OfficeLocationService.isRunning());
                call.resolve(ret);
                return;
            }

            ret.put("hasActiveSession", true);
            ret.put("attendanceId", session.optString("attendanceId", ""));
            ret.put("employeeId", session.optString("employeeId", prefs.getString("employee_id", "")));
            ret.put("employeeName", session.optString("employeeName", prefs.getString("employee_name", "")));
            ret.put("townCity", session.optString("townCity", prefs.getString("town_city", "Raniganj HQ")));
            ret.put("date", sessionDate);
            ret.put("checkInTime", session.optString("checkInTime", "09:00 AM"));
            ret.put("attendanceMode", session.optString("attendanceMode", "OFFICE"));

            String sessionState = session.optString("sessionState", "ACTIVE");
            String lastKnown = prefs.getString(OfficeGeofenceHelper.KEY_LAST_KNOWN_STATE, "INSIDE");
            boolean isInside = "INSIDE".equalsIgnoreCase(lastKnown) || "ACTIVE".equalsIgnoreCase(sessionState);

            String recExit = session.optString("recordedExitTime", null);
            if (recExit == null || "null".equalsIgnoreCase(recExit) || recExit.trim().isEmpty()) {
                recExit = null;
            } else {
                try {
                    java.text.SimpleDateFormat sdfTime = new java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US);
                    sdfTime.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
                    java.util.Date exitDate = sdfTime.parse(recExit);
                    
                    java.util.Calendar calNow = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
                    int currentMins = calNow.get(java.util.Calendar.HOUR_OF_DAY) * 60 + calNow.get(java.util.Calendar.MINUTE);
                    
                    if (exitDate != null) {
                        java.util.Calendar calExit = java.util.Calendar.getInstance();
                        calExit.setTime(exitDate);
                        int exitMins = calExit.get(java.util.Calendar.HOUR_OF_DAY) * 60 + calExit.get(java.util.Calendar.MINUTE);
                        if (exitMins > currentMins) {
                            recExit = null; // Future exit time is rejected
                        }
                    }
                } catch (Exception ignored) {}
            }

            // A valid native exit candidate for today requires:
            // 1. Employee is NOT inside
            // 2. An exit was actually recorded in today's active session
            // 3. pendingCheckoutConfirmation flag is set in the session
            boolean pendingConf = !isInside && recExit != null && session.optBoolean("pendingCheckoutConfirmation", false);

            if (pendingConf) {
                ret.put("recordedExitTime", recExit);
                ret.put("exitDetectedAt", session.optString("exitDetectedAt", null));
                ret.put("exitSource", session.optString("exitSource", "NATIVE_GEOFENCE"));
                ret.put("pendingCheckoutConfirmation", true);
                ret.put("sessionState", "PENDING_EXIT_CONFIRMATION");
                ret.put("currentState", "PENDING_AUTO_CHECKOUT");
                ret.put("checkoutStatus", "PENDING_AUTO_CHECKOUT");
                ret.put("pendingCheckoutEventId", session.optString("pendingCheckoutEventId", null));
            } else {
                ret.put("recordedExitTime", (String) null);
                ret.put("exitDetectedAt", (String) null);
                ret.put("exitSource", "NONE");
                ret.put("pendingCheckoutConfirmation", false);
                ret.put("sessionState", "ACTIVE");
                ret.put("currentState", "CHECKED_IN");
                ret.put("checkoutStatus", "ACTIVE");
                ret.put("pendingCheckoutEventId", (String) null);
            }

            ret.put("isGeofenceRegistered", OfficeGeofenceHelper.isGeofenceRegistered(context));
            ret.put("isLocationServiceRunning", OfficeLocationService.isRunning());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get active attendance state: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getDiagnosticInfo(PluginCall call) {
        try {
            Context context = getContext();
            JSONObject diag = OfficeGeofenceHelper.getDiagnosticState(context);
            JSObject ret = JSObject.fromJSONObject(diag);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get diagnostic info: " + e.getMessage(), e);
        }
    }
}
