package com.exfin.oms.geofence;

import android.content.Context;
import android.util.Log;

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

    public static void notifyNativeTransition(String transition, double lat, double lng) {
        notifyNativeTransition(transition, lat, lng, System.currentTimeMillis());
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
                ret.put("latitude", lat);
                ret.put("longitude", lng);
                ret.put("timestamp", eventTimestamp);
                ret.put("exitTimestamp", eventTimestamp);

                instance.notifyListeners("geofenceTransition", ret, true);
            } catch (Exception e) {
                Log.e(TAG, "Error notifying JS listeners: " + e.getMessage(), e);
            }
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
            ret.put("radius", OfficeGeofenceHelper.GEOFENCE_RADIUS_METERS);
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
            ret.put("radius", OfficeGeofenceHelper.GEOFENCE_RADIUS_METERS);
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
                JSObject item = new JSObject();
                item.put("eventId", obj.optString("eventId"));
                item.put("employeeId", obj.optString("employeeId"));
                item.put("eventType", obj.optString("eventType", obj.optString("transition")));
                item.put("transition", obj.optString("transition"));
                item.put("time", obj.optString("time"));
                item.put("date", obj.optString("date"));
                item.put("latitude", obj.optDouble("latitude"));
                item.put("longitude", obj.optDouble("longitude"));
                item.put("timestamp", obj.optLong("timestamp"));
                item.put("exitTimestamp", obj.optLong("exitTimestamp", obj.optLong("timestamp")));
                item.put("createdAt", obj.optLong("createdAt", obj.optLong("timestamp")));
                item.put("distance", obj.optDouble("distance", 25.0));
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
                android.content.SharedPreferences prefs = context.getSharedPreferences("exfin_native_geofence_prefs", Context.MODE_PRIVATE);
                android.content.SharedPreferences.Editor editor = prefs.edit();
                editor.putString("employee_id", id);
                editor.putString("employee_name", name);
                editor.putString("town_city", townCity);
                if (serverUrl != null && !serverUrl.trim().isEmpty()) {
                    editor.putString("server_url", serverUrl);
                }
                editor.apply();
                Log.i(TAG, "Native employee identity set: " + id + " (" + name + ") - Server URL: " + serverUrl);
                
                // Immediately trigger background sync check on connectivity in case we have failed queued events
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
    public void getActiveAttendanceState(PluginCall call) {
        try {
            Context context = getContext();
            JSONObject session = OfficeGeofenceHelper.getActiveSession(context);
            JSObject ret = new JSObject();
            if (session != null) {
                ret.put("hasActiveSession", true);
                ret.put("attendanceId", session.optString("attendanceId"));
                ret.put("employeeId", session.optString("employeeId"));
                ret.put("employeeName", session.optString("employeeName"));
                ret.put("townCity", session.optString("townCity"));
                ret.put("date", session.optString("date"));
                ret.put("checkInTime", session.optString("checkInTime"));
                ret.put("attendanceMode", session.optString("attendanceMode", "OFFICE"));
                ret.put("sessionState", session.optString("sessionState", "ACTIVE"));
                ret.put("checkoutStatus", session.optString("checkoutStatus", "ACTIVE"));
                
                String recExit = session.optString("recordedExitTime", null);
                if (recExit != null && !"null".equalsIgnoreCase(recExit)) {
                    ret.put("recordedExitTime", recExit);
                } else {
                    ret.put("recordedExitTime", null);
                }

                String exitDetAt = session.optString("exitDetectedAt", null);
                if (exitDetAt != null && !"null".equalsIgnoreCase(exitDetAt)) {
                    ret.put("exitDetectedAt", exitDetAt);
                } else {
                    ret.put("exitDetectedAt", null);
                }

                ret.put("exitSource", session.optString("exitSource", "NONE"));
            } else {
                ret.put("hasActiveSession", false);
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
