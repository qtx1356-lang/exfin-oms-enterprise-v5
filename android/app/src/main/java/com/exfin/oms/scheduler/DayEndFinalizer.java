package com.exfin.oms.scheduler;

import android.content.Context;
import android.util.Log;

import com.exfin.oms.geofence.OfficeGeofenceHelper;
import com.exfin.oms.location.BackgroundLocationService;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class DayEndFinalizer {
    public static final String TAG = "DayEndFinalizer";
    private static final ExecutorService executor = Executors.newSingleThreadExecutor();

    public static void finalizeAttendance(Context context, String employeeId, String timeStr) {
        if (employeeId == null || employeeId.trim().isEmpty()) {
            return;
        }

        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                // Determine today's date in IST
                SimpleDateFormat dateSdf = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
                dateSdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
                String dateStr = dateSdf.format(new Date());

                String docId = employeeId + "_" + dateStr;
                String firebaseUrl = "https://firestore.googleapis.com/v1/projects/" + BackgroundLocationService.FIREBASE_PROJECT_ID
                        + "/databases/(default)/documents/attendance/" + docId
                        + "?key=" + BackgroundLocationService.FIREBASE_API_KEY;

                // 1. GET current attendance record
                URL url = new URL(firebaseUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                int responseCode = conn.getResponseCode();
                if (responseCode != 200) {
                    Log.w(TAG, "Failed to fetch attendance record. Code: " + responseCode);
                    return;
                }

                BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                String inputLine;
                StringBuilder response = new StringBuilder();
                while ((inputLine = in.readLine()) != null) {
                    response.append(inputLine);
                }
                in.close();

                JSONObject doc = new JSONObject(response.toString());
                JSONObject fields = doc.optJSONObject("fields");
                if (fields == null) {
                    return;
                }

                String checkoutStatus = "";
                if (fields.has("checkoutStatus") && fields.getJSONObject("checkoutStatus").has("stringValue")) {
                    checkoutStatus = fields.getJSONObject("checkoutStatus").getString("stringValue");
                }

                // If already completed or unresolved, don't touch it
                if ("COMPLETED".equals(checkoutStatus) || "UNRESOLVED".equals(checkoutStatus)) {
                    Log.i(TAG, "Attendance already resolved: " + checkoutStatus);
                    return;
                }

                String attendanceType = "OFFICE";
                if (fields.has("attendanceType") && fields.getJSONObject("attendanceType").has("stringValue")) {
                    attendanceType = fields.getJSONObject("attendanceType").getString("stringValue");
                }

                String checkoutTimeStr = "06:00 PM";
                boolean hasValidExit = true;

                if ("OFFICE".equals(attendanceType) || attendanceType.isEmpty()) {
                    boolean hasExitEvent = false;
                    String lastExitTime = "";

                    if (fields.has("lastExitTime") && fields.getJSONObject("lastExitTime").has("stringValue")) {
                        lastExitTime = fields.getJSONObject("lastExitTime").getString("stringValue");
                        hasExitEvent = !lastExitTime.isEmpty();
                    }
                    if (!hasExitEvent && fields.has("exitTime") && fields.getJSONObject("exitTime").has("stringValue")) {
                        lastExitTime = fields.getJSONObject("exitTime").getString("stringValue");
                        hasExitEvent = !lastExitTime.isEmpty();
                    }

                    if (!hasExitEvent && OfficeGeofenceHelper.hasUnresolvedExit(context)) {
                        String nativeExitDate = OfficeGeofenceHelper.getLastExitDate(context);
                        if (dateStr.equals(nativeExitDate)) {
                            hasExitEvent = true;
                            lastExitTime = OfficeGeofenceHelper.getLastExitTime(context);
                            OfficeGeofenceHelper.clearUnresolvedExit(context);
                            Log.i(TAG, "Using recovered native exit event: " + lastExitTime);
                        }
                    }

                    if (hasExitEvent) {
                        checkoutTimeStr = lastExitTime;
                    } else {
                        hasValidExit = false;
                    }
                }

                // 2. PATCH attendance record
                String patchUrlStr = firebaseUrl
                        + "&updateMask.fieldPaths=checkOutTime"
                        + "&updateMask.fieldPaths=checkoutStatus"
                        + "&updateMask.fieldPaths=checkOutMode"
                        + "&updateMask.fieldPaths=currentState"
                        + "&updateMask.fieldPaths=checkoutType"
                        + "&updateMask.fieldPaths=resolutionSource";
                
                URL patchUrl = new URL(patchUrlStr);
                HttpURLConnection patchConn = (HttpURLConnection) patchUrl.openConnection();
                patchConn.setRequestMethod("POST");
                patchConn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
                patchConn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                patchConn.setRequestProperty("Accept", "application/json");
                patchConn.setConnectTimeout(10000);
                patchConn.setReadTimeout(10000);
                patchConn.setDoOutput(true);

                JSONObject patchFields = new JSONObject();
                
                if (hasValidExit) {
                    patchFields.put("checkOutTime", new JSONObject().put("stringValue", checkoutTimeStr));
                    patchFields.put("checkoutStatus", new JSONObject().put("stringValue", "COMPLETED"));
                    patchFields.put("checkOutMode", new JSONObject().put("stringValue", "AUTO_SYSTEM"));
                    patchFields.put("checkoutType", new JSONObject().put("stringValue", "AUTO_CHECKOUT"));
                    patchFields.put("currentState", new JSONObject().put("stringValue", "FINALIZED_CHECKOUT"));
                    patchFields.put("resolutionSource", new JSONObject().put("stringValue", "AUTO_GEOFENCE"));
                } else {
                    Log.i(TAG, "Employee still in office (no valid exit). Keeping session active for tracking.");
                    
                    // Do NOT mark as UNRESOLVED for today. Just return and do nothing.
                    if (conn != null) {
                        conn.disconnect();
                    }
                    return;
                }

                JSONObject payload = new JSONObject();
                payload.put("fields", patchFields);

                OutputStream os = patchConn.getOutputStream();
                os.write(payload.toString().getBytes("UTF-8"));
                os.close();

                int patchResponseCode = patchConn.getResponseCode();
                Log.i(TAG, "Finalized attendance natively. Status code: " + patchResponseCode);
                patchConn.disconnect();

            } catch (Exception e) {
                Log.e(TAG, "Error finalizing attendance natively", e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }
}
