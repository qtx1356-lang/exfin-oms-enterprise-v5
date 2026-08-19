package com.exfin.oms.location;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.exfin.oms.MainActivity;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BackgroundLocationService extends Service {
    public static final String TAG = "ExfinBgLocation";
    public static final String ACTION_START = "com.exfin.oms.location.START_TRACKING";
    public static final String ACTION_STOP = "com.exfin.oms.location.STOP_TRACKING";
    public static final String EXTRA_EMPLOYEE_ID = "extra_employee_id";
    public static final String EXTRA_EMPLOYEE_NAME = "extra_employee_name";

    public static final String CHANNEL_ID = "exfin_location_service_channel";
    public static final int NOTIFICATION_ID = 2502;

    public static final double OFFICE_LAT = 23.616227;
    public static final double OFFICE_LNG = 87.117063;

    public static final String FIREBASE_PROJECT_ID = "exfin-oms-production";
    public static final String FIREBASE_API_KEY = "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM";

    public static final String PREFS_NAME = "exfin_native_location_prefs";
    public static final String KEY_IS_TRACKING = "is_tracking_active";
    public static final String KEY_EMPLOYEE_ID = "tracking_employee_id";
    public static final String KEY_EMPLOYEE_NAME = "tracking_employee_name";

    private static final long UPDATE_INTERVAL_MS = 30000L; // 30 seconds
    private static final long FASTEST_INTERVAL_MS = 15000L; // 15 seconds

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private String currentEmployeeId = "";
    private String currentEmployeeName = "";
    private double lastGeocodedLat = 0.0;
    private double lastGeocodedLng = 0.0;
    private long lastGeocodedTimeMs = 0L;
    private String cachedTownCity = "Location name unavailable";

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        setupLocationCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            Log.i(TAG, "Received STOP_TRACKING action. Stopping service.");
            stopTrackingAndSelf();
            return START_NOT_STICKY;
        }

        // Extract employee info
        String empId = intent != null ? intent.getStringExtra(EXTRA_EMPLOYEE_ID) : null;
        String empName = intent != null ? intent.getStringExtra(EXTRA_EMPLOYEE_NAME) : null;

        if (empId == null || empId.trim().isEmpty()) {
            // Check SharedPreferences for active tracking state
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean isTracking = prefs.getBoolean(KEY_IS_TRACKING, false);
            if (isTracking) {
                empId = prefs.getString(KEY_EMPLOYEE_ID, "");
                empName = prefs.getString(KEY_EMPLOYEE_NAME, "");
            }
        }

        if (empId == null || empId.trim().isEmpty()) {
            Log.w(TAG, "No employeeId provided and no active tracking session in prefs. Stopping.");
            stopTrackingAndSelf();
            return START_NOT_STICKY;
        }

        this.currentEmployeeId = empId.trim();
        this.currentEmployeeName = (empName != null && !empName.trim().isEmpty()) ? empName.trim() : "Employee";

        // Save active session
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean(KEY_IS_TRACKING, true)
                .putString(KEY_EMPLOYEE_ID, this.currentEmployeeId)
                .putString(KEY_EMPLOYEE_NAME, this.currentEmployeeName)
                .apply();

        // Start Foreground Notification
        Notification notification = createNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        startLocationUpdates();
        return START_STICKY;
    }

    private void setupLocationCallback() {
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null || locationResult.getLastLocation() == null) {
                    return;
                }
                Location location = locationResult.getLastLocation();
                handleNewLocation(location);
            }
        };
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "ACCESS_FINE_LOCATION not granted. Cannot request background location updates.");
            return;
        }

        try {
            LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
                    .setMinUpdateIntervalMillis(FASTEST_INTERVAL_MS)
                    .setMinUpdateDistanceMeters(0f)
                    .build();

            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper())
                    .addOnSuccessListener(aVoid -> Log.i(TAG, "Native FusedLocationProvider started updates (30s interval) for " + currentEmployeeId))
                    .addOnFailureListener(e -> Log.e(TAG, "Failed to start location updates: " + e.getMessage(), e));
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException requesting location updates: " + se.getMessage(), se);
        } catch (Exception e) {
            Log.e(TAG, "Error starting location updates: " + e.getMessage(), e);
        }
    }

    private void handleNewLocation(Location location) {
        if (location == null) return;
        double lat = location.getLatitude();
        double lng = location.getLongitude();
        float accuracy = location.hasAccuracy() ? location.getAccuracy() : 0f;

        // Defensive validation
        if (lat == 0.0 && lng == 0.0) return;
        if (lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0) return;

        // Authoritative Haversine calculation
        double distanceFromOffice = calculateDistanceMeters(lat, lng, OFFICE_LAT, OFFICE_LNG);

        // ISO Timestamp in UTC
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        String isoTimestamp = sdf.format(new Date());

        // Resolve reverse geocode town/city asynchronously
        String townCity = resolveTownCity(lat, lng);

        Log.i(TAG, "Native background GPS fix: (" + lat + ", " + lng + ") dist: " + Math.round(distanceFromOffice) + "m for " + currentEmployeeId);

        // Write directly to Firestore live_locations/{employeeId}
        writeLiveLocationToFirestore(currentEmployeeId, currentEmployeeName, lat, lng, accuracy, distanceFromOffice, townCity, isoTimestamp);
    }

    private String resolveTownCity(double lat, double lng) {
        long now = System.currentTimeMillis();
        double distMoved = calculateDistanceMeters(lat, lng, lastGeocodedLat, lastGeocodedLng);

        // Reuse cached geocoded address if moved < 25m and < 60s
        if (distMoved < 25.0 && (now - lastGeocodedTimeMs < 60000L)) {
            return cachedTownCity;
        }

        try {
            if (Geocoder.isPresent()) {
                Geocoder geocoder = new Geocoder(this, Locale.getDefault());
                List<Address> addresses = geocoder.getFromLocation(lat, lng, 1);
                if (addresses != null && !addresses.isEmpty()) {
                    Address addr = addresses.get(0);
                    String locality = addr.getLocality();
                    String subLocality = addr.getSubLocality();
                    String subAdmin = addr.getSubAdminArea();
                    String admin = addr.getAdminArea();

                    StringBuilder sb = new StringBuilder();
                    if (subLocality != null && !subLocality.trim().isEmpty()) {
                        sb.append(subLocality.trim());
                    }
                    if (locality != null && !locality.trim().isEmpty()) {
                        if (sb.length() > 0) sb.append(", ");
                        sb.append(locality.trim());
                    } else if (subAdmin != null && !subAdmin.trim().isEmpty()) {
                        if (sb.length() > 0) sb.append(", ");
                        sb.append(subAdmin.trim());
                    }
                    if (sb.length() == 0 && admin != null) {
                        sb.append(admin.trim());
                    }

                    if (sb.length() > 0) {
                        cachedTownCity = sb.toString();
                        lastGeocodedLat = lat;
                        lastGeocodedLng = lng;
                        lastGeocodedTimeMs = now;
                        return cachedTownCity;
                    }
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Geocoder error: " + e.getMessage());
        }

        return cachedTownCity;
    }

    private void writeLiveLocationToFirestore(
            String empId,
            String empName,
            double latitude,
            double longitude,
            float accuracy,
            double distanceFromOffice,
            String townCity,
            String isoTimestamp
    ) {
        executor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                String encodedEmpId = URLEncoder.encode(empId, "UTF-8");
                String urlStr = "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID
                        + "/databases/(default)/documents/live_locations/" + encodedEmpId
                        + "?updateMask.fieldPaths=employeeId"
                        + "&updateMask.fieldPaths=employeeName"
                        + "&updateMask.fieldPaths=latitude"
                        + "&updateMask.fieldPaths=longitude"
                        + "&updateMask.fieldPaths=accuracy"
                        + "&updateMask.fieldPaths=distanceFromOffice"
                        + "&updateMask.fieldPaths=townCity"
                        + "&updateMask.fieldPaths=timestamp"
                        + "&updateMask.fieldPaths=updatedAt"
                        + "&updateMask.fieldPaths=source"
                        + "&key=" + FIREBASE_API_KEY;

                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST"); // Use X-HTTP-Method-Override PATCH for widest HttpURLConnection compatibility
                conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setRequestProperty("Accept", "application/json");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setDoOutput(true);

                // Construct Firestore fields JSON
                JSONObject fields = new JSONObject();

                JSONObject empIdVal = new JSONObject();
                empIdVal.put("stringValue", empId);
                fields.put("employeeId", empIdVal);

                JSONObject empNameVal = new JSONObject();
                empNameVal.put("stringValue", empName != null ? empName : "");
                fields.put("employeeName", empNameVal);

                JSONObject latVal = new JSONObject();
                latVal.put("doubleValue", latitude);
                fields.put("latitude", latVal);

                JSONObject lngVal = new JSONObject();
                lngVal.put("doubleValue", longitude);
                fields.put("longitude", lngVal);

                if (accuracy > 0) {
                    JSONObject accVal = new JSONObject();
                    accVal.put("doubleValue", (double) accuracy);
                    fields.put("accuracy", accVal);
                } else {
                    JSONObject nullVal = new JSONObject();
                    nullVal.put("nullValue", JSONObject.NULL);
                    fields.put("accuracy", nullVal);
                }

                JSONObject distVal = new JSONObject();
                distVal.put("doubleValue", distanceFromOffice);
                fields.put("distanceFromOffice", distVal);

                JSONObject townVal = new JSONObject();
                townVal.put("stringValue", townCity != null && !townCity.trim().isEmpty() ? townCity.trim() : "Location name unavailable");
                fields.put("townCity", townVal);

                JSONObject timeVal = new JSONObject();
                timeVal.put("stringValue", isoTimestamp);
                fields.put("timestamp", timeVal);

                JSONObject updatedVal = new JSONObject();
                updatedVal.put("stringValue", isoTimestamp);
                fields.put("updatedAt", updatedVal);

                JSONObject sourceVal = new JSONObject();
                sourceVal.put("stringValue", "nativeBackground");
                fields.put("source", sourceVal);

                JSONObject body = new JSONObject();
                body.put("fields", fields);

                byte[] jsonBytes = body.toString().getBytes("UTF-8");
                conn.setFixedLengthStreamingMode(jsonBytes.length);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(jsonBytes);
                    os.flush();
                }

                int responseCode = conn.getResponseCode();
                if (responseCode >= 200 && responseCode < 300) {
                    Log.i(TAG, "Firestore live location updated for " + empId + " at (" + latitude + ", " + longitude + ")");
                } else {
                    Log.w(TAG, "Firestore update returned HTTP " + responseCode + " for " + empId);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error writing native background location to Firestore: " + e.getMessage());
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        });
    }

    public static double calculateDistanceMeters(double lat1, double lon1, double lat2, double lon2) {
        final double R = 6371000.0; // Earth radius in meters
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);
        double c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        return R * c;
    }

    private Notification createNotification() {
        createNotificationChannel();

        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setAction(Intent.ACTION_MAIN);
        notificationIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 2503, notificationIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Exfin OMS")
                .setContentText("Attendance location is active")
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Exfin OMS Attendance Tracking",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows active attendance location tracking status");
            channel.setShowBadge(false);
            channel.enableLights(false);
            channel.enableVibration(false);
            channel.setSound(null, null);

            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void stopTrackingAndSelf() {
        if (fusedLocationClient != null && locationCallback != null) {
            try {
                fusedLocationClient.removeLocationUpdates(locationCallback);
                Log.i(TAG, "Removed location updates callback.");
            } catch (Exception e) {
                Log.e(TAG, "Error removing location updates: " + e.getMessage());
            }
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean(KEY_IS_TRACKING, false)
                .remove(KEY_EMPLOYEE_ID)
                .remove(KEY_EMPLOYEE_NAME)
                .apply();

        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        stopTrackingAndSelf();
        executor.shutdown();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
