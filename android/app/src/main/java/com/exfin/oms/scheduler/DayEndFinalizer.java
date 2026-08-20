package com.exfin.oms.scheduler;

import android.content.Context;
import android.content.SharedPreferences;
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

                // 1. Try GET current attendance record
                URL url = new URL(firebaseUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                int responseCode = conn.getResponseCode();
                boolean documentExists = (responseCode == 200);
                JSONObject fields = null;

                if (documentExists) {
                    BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    String inputLine;
                    StringBuilder response = new StringBuilder();
                    while ((inputLine = in.readLine()) != null) {
                        response.append(inputLine);
                    }
                    in.close();

                    JSONObject doc = new JSONObject(response.toString());
                    fields = doc.optJSONObject("fields");
                }

                // If document exists, check if already resolved
                if (documentExists && fields != null) {
                    String checkoutStatus = "";
                    if (fields.has("checkoutStatus") && fields.getJSONObject("checkoutStatus").has("stringValue")) {
                        checkoutStatus = fields.getJSONObject("checkoutStatus").getString("stringValue");
                    }

                    if ("COMPLETED".equals(checkoutStatus) || "UNRESOLVED".equals(checkoutStatus)) {
                        Log.i(TAG, "Attendance already resolved: " + checkoutStatus);
                        return;
                    }
                }

                // Determine attendanceType and checkInTime
                String attendanceType = "OFFICE";
                String checkInTime = "10:00 AM";
                String empName = "Employee";

                if (documentExists && fields != null) {
                    if (fields.has("attendanceType") && fields.getJSONObject("attendanceType").has("stringValue")) {
                        attendanceType = fields.getJSONObject("attendanceType").getString("stringValue");
                    }
                    if (fields.has("checkInTime") && fields.getJSONObject("checkInTime").has("stringValue")) {
                        checkInTime = fields.getJSONObject("checkInTime").getString("stringValue");
                    }
                    if (fields.has("employeeName") && fields.getJSONObject("employeeName").has("stringValue")) {
                        empName = fields.getJSONObject("employeeName").getString("stringValue");
                    }
                } else {
                    SharedPreferences locPrefs = context.getSharedPreferences(BackgroundLocationService.PREFS_NAME, Context.MODE_PRIVATE);
                    empName = locPrefs.getString(BackgroundLocationService.KEY_EMPLOYEE_NAME, "Employee");
                }

                String checkoutTimeStr = "06:00 PM";
                boolean hasValidExit = true;

                if ("OFFICE".equalsIgnoreCase(attendanceType) || attendanceType.isEmpty()) {
                    boolean hasExitEvent = false;
                    String lastExitTime = "";

                    if (documentExists && fields != null) {
                        if (fields.has("lastExitTime") && fields.getJSONObject("lastExitTime").has("stringValue")) {
                            lastExitTime = fields.getJSONObject("lastExitTime").getString("stringValue");
                            hasExitEvent = !lastExitTime.trim().isEmpty();
                        }
                        if (!hasExitEvent && fields.has("exitTime") && fields.getJSONObject("exitTime").has("stringValue")) {
                            lastExitTime = fields.getJSONObject("exitTime").getString("stringValue");
                            hasExitEvent = !lastExitTime.trim().isEmpty();
                        }
                    }

                    if (!hasExitEvent && OfficeGeofenceHelper.hasUnresolvedExit(context)) {
                        String nativeExitDate = OfficeGeofenceHelper.getLastExitDate(context);
                        if (dateStr.equals(nativeExitDate)) {
                            lastExitTime = OfficeGeofenceHelper.getLastExitTime(context);
                            if (lastExitTime != null && !lastExitTime.trim().isEmpty()) {
                                hasExitEvent = true;
                                OfficeGeofenceHelper.clearUnresolvedExit(context);
                                Log.i(TAG, "Using recovered native exit event: " + lastExitTime);
                            }
                        }
                    } else if (!hasExitEvent) {
                        String nativeExit = OfficeGeofenceHelper.getLastExitTime(context);
                        String nativeExitDate = OfficeGeofenceHelper.getLastExitDate(context);
                        if (dateStr.equals(nativeExitDate) && nativeExit != null && !nativeExit.trim().isEmpty()) {
                            hasExitEvent = true;
                            lastExitTime = nativeExit;
                            Log.i(TAG, "Using native exit time from preferences: " + lastExitTime);
                        }
                    }

                    if (hasExitEvent) {
                        checkoutTimeStr = lastExitTime;
                    } else {
                        hasValidExit = false;
                    }
                } else {
                    // WFH or CLIENT_VISIT
                    checkoutTimeStr = "06:00 PM";
                    hasValidExit = true;
                }

                if (!hasValidExit) {
                    Log.i(TAG, "Employee still in office (no valid exit). Keeping session active for tracking.");
                    return;
                }

                // Calculate working hours
                String workingHours = calculateWorkingHours(checkInTime, checkoutTimeStr);

                SimpleDateFormat isoSdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                isoSdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                String isoTimestamp = isoSdf.format(new Date());

                // Build PATCH URL and Payload
                JSONObject patchFields = new JSONObject();
                StringBuilder patchUrlBuilder = new StringBuilder(firebaseUrl);

                if (documentExists) {
                    // Update only checkout settlement fields to preserve existing check-in data
                    patchFields.put("checkOutTime", new JSONObject().put("stringValue", checkoutTimeStr));
                    patchFields.put("checkoutStatus", new JSONObject().put("stringValue", "COMPLETED"));
                    patchFields.put("status", new JSONObject().put("stringValue", "completed"));
                    patchFields.put("checkOutMode", new JSONObject().put("stringValue", "AUTO_SYSTEM"));
                    patchFields.put("checkoutType", new JSONObject().put("stringValue", "AUTO_CHECKOUT"));
                    patchFields.put("currentState", new JSONObject().put("stringValue", "FINALIZED_CHECKOUT"));
                    patchFields.put("resolutionSource", new JSONObject().put("stringValue", "OFFICE".equalsIgnoreCase(attendanceType) ? "AUTO_GEOFENCE" : "AUTO_SYSTEM"));
                    patchFields.put("workingHours", new JSONObject().put("stringValue", workingHours));
                    patchFields.put("checkoutFinalizedAt", new JSONObject().put("stringValue", isoTimestamp));

                    patchUrlBuilder.append("&updateMask.fieldPaths=checkOutTime")
                            .append("&updateMask.fieldPaths=checkoutStatus")
                            .append("&updateMask.fieldPaths=status")
                            .append("&updateMask.fieldPaths=checkOutMode")
                            .append("&updateMask.fieldPaths=checkoutType")
                            .append("&updateMask.fieldPaths=currentState")
                            .append("&updateMask.fieldPaths=resolutionSource")
                            .append("&updateMask.fieldPaths=workingHours")
                            .append("&updateMask.fieldPaths=checkoutFinalizedAt");
                } else {
                    // Document does not exist (404 upsert) -> build complete initial attendance record
                    patchFields.put("id", new JSONObject().put("stringValue", "att_" + docId));
                    patchFields.put("docId", new JSONObject().put("stringValue", docId));
                    patchFields.put("employeeId", new JSONObject().put("stringValue", employeeId));
                    patchFields.put("employeeName", new JSONObject().put("stringValue", empName));
                    patchFields.put("date", new JSONObject().put("stringValue", dateStr));
                    patchFields.put("attendanceType", new JSONObject().put("stringValue", attendanceType));
                    patchFields.put("checkInTime", new JSONObject().put("stringValue", checkInTime));
                    patchFields.put("checkInMode", new JSONObject().put("stringValue", "OFFICE".equalsIgnoreCase(attendanceType) ? "AUTO" : "MANUAL"));
                    patchFields.put("checkInLatitude", new JSONObject().put("doubleValue", BackgroundLocationService.OFFICE_LAT));
                    patchFields.put("checkInLongitude", new JSONObject().put("doubleValue", BackgroundLocationService.OFFICE_LNG));
                    patchFields.put("checkInTownCity", new JSONObject().put("stringValue", "Raniganj HQ"));
                    if ("OFFICE".equalsIgnoreCase(attendanceType)) {
                        patchFields.put("lastExitTime", new JSONObject().put("stringValue", checkoutTimeStr));
                        patchFields.put("exitTime", new JSONObject().put("stringValue", checkoutTimeStr));
                    }
                    patchFields.put("checkOutTime", new JSONObject().put("stringValue", checkoutTimeStr));
                    patchFields.put("checkOutMode", new JSONObject().put("stringValue", "AUTO_SYSTEM"));
                    patchFields.put("checkoutType", new JSONObject().put("stringValue", "AUTO_CHECKOUT"));
                    patchFields.put("checkoutStatus", new JSONObject().put("stringValue", "COMPLETED"));
                    patchFields.put("status", new JSONObject().put("stringValue", "completed"));
                    patchFields.put("currentState", new JSONObject().put("stringValue", "FINALIZED_CHECKOUT"));
                    patchFields.put("resolutionSource", new JSONObject().put("stringValue", "OFFICE".equalsIgnoreCase(attendanceType) ? "AUTO_GEOFENCE" : "AUTO_SYSTEM"));
                    patchFields.put("workingHours", new JSONObject().put("stringValue", workingHours));
                    patchFields.put("checkoutFinalizedAt", new JSONObject().put("stringValue", isoTimestamp));

                    patchUrlBuilder.append("&updateMask.fieldPaths=id")
                            .append("&updateMask.fieldPaths=docId")
                            .append("&updateMask.fieldPaths=employeeId")
                            .append("&updateMask.fieldPaths=employeeName")
                            .append("&updateMask.fieldPaths=date")
                            .append("&updateMask.fieldPaths=attendanceType")
                            .append("&updateMask.fieldPaths=checkInTime")
                            .append("&updateMask.fieldPaths=checkInMode")
                            .append("&updateMask.fieldPaths=checkInLatitude")
                            .append("&updateMask.fieldPaths=checkInLongitude")
                            .append("&updateMask.fieldPaths=checkInTownCity");
                    if ("OFFICE".equalsIgnoreCase(attendanceType)) {
                        patchUrlBuilder.append("&updateMask.fieldPaths=lastExitTime")
                                .append("&updateMask.fieldPaths=exitTime");
                    }
                    patchUrlBuilder.append("&updateMask.fieldPaths=checkOutTime")
                            .append("&updateMask.fieldPaths=checkOutMode")
                            .append("&updateMask.fieldPaths=checkoutType")
                            .append("&updateMask.fieldPaths=checkoutStatus")
                            .append("&updateMask.fieldPaths=status")
                            .append("&updateMask.fieldPaths=currentState")
                            .append("&updateMask.fieldPaths=resolutionSource")
                            .append("&updateMask.fieldPaths=workingHours")
                            .append("&updateMask.fieldPaths=checkoutFinalizedAt");
                }

                // 2. Execute PATCH request
                URL patchUrl = new URL(patchUrlBuilder.toString());
                HttpURLConnection patchConn = (HttpURLConnection) patchUrl.openConnection();
                patchConn.setRequestMethod("POST");
                patchConn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
                patchConn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                patchConn.setRequestProperty("Accept", "application/json");
                patchConn.setConnectTimeout(10000);
                patchConn.setReadTimeout(10000);
                patchConn.setDoOutput(true);

                JSONObject payload = new JSONObject();
                payload.put("fields", patchFields);

                byte[] payloadBytes = payload.toString().getBytes("UTF-8");
                patchConn.setFixedLengthStreamingMode(payloadBytes.length);

                try (OutputStream os = patchConn.getOutputStream()) {
                    os.write(payloadBytes);
                    os.flush();
                }

                int patchResponseCode = patchConn.getResponseCode();
                Log.i(TAG, "Finalized attendance natively (docExists=" + documentExists + "). Status code: " + patchResponseCode);
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

    private static String calculateWorkingHours(String checkInTimeStr, String checkOutTimeStr) {
        if (checkInTimeStr == null || checkOutTimeStr == null) {
            return "8h 00m";
        }
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("hh:mm a", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("Asia/Kolkata"));
            Date d1 = sdf.parse(checkInTimeStr.trim());
            Date d2 = sdf.parse(checkOutTimeStr.trim());
            if (d1 != null && d2 != null) {
                long diffMs = d2.getTime() - d1.getTime();
                if (diffMs > 0) {
                    long totalMinutes = diffMs / (1000 * 60);
                    long hours = totalMinutes / 60;
                    long minutes = totalMinutes % 60;
                    return hours + "h " + minutes + "m";
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Error calculating working hours: " + e.getMessage());
        }
        return "8h 00m";
    }
}
