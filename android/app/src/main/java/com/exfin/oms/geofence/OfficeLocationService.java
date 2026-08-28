package com.exfin.oms.geofence;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

public class OfficeLocationService extends Service {
    public static final String TAG = "OfficeLocationService";
    public static final String CHANNEL_ID = "exfin_oms_location_channel";
    public static final int NOTIFICATION_ID = 2502;

    private static boolean isServiceRunning = false;
    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private int consecutiveOutsideCount = 0;
    private int consecutiveInsideCount = 0;

    public static boolean isRunning() {
        return isServiceRunning;
    }

    public static void start(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, OfficeLocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to start OfficeLocationService: " + e.getMessage(), e);
        }
    }

    public static void stop(Context context) {
        if (context == null) return;
        try {
            Intent intent = new Intent(context, OfficeLocationService.class);
            context.stopService(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop OfficeLocationService: " + e.getMessage(), e);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isServiceRunning = true;
        Log.i(TAG, "OfficeLocationService created. Starting foreground monitoring.");
        createNotificationChannel();
        Notification notification = buildNotification("Active Office Attendance Monitoring");
        try {
            startForeground(NOTIFICATION_ID, notification);
        } catch (Exception e) {
            Log.e(TAG, "Failed to startForeground: " + e.getMessage(), e);
        }

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        startLocationUpdates();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        isServiceRunning = true;
        Log.i(TAG, "OfficeLocationService onStartCommand executed.");
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "EXFIN Office Location Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Monitors office attendance location in background");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String contentText) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("EXFIN Office Attendance")
                .setContentText(contentText)
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true);
        return builder.build();
    }

    private void startLocationUpdates() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Location permissions missing. Stopping OfficeLocationService.");
            stopSelf();
            return;
        }

        LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 30000)
                .setMinUpdateIntervalMillis(15000)
                .setWaitForAccurateLocation(false)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                for (Location location : locationResult.getLocations()) {
                    if (location != null) {
                        processLocationUpdate(location);
                    }
                }
            }
        };

        try {
            fusedLocationClient.requestLocationUpdates(locationRequest, locationCallback, Looper.getMainLooper());
            Log.i(TAG, "Fused location updates requested every 30s.");
        } catch (SecurityException se) {
            Log.e(TAG, "SecurityException starting location updates: " + se.getMessage(), se);
        } catch (Exception e) {
            Log.e(TAG, "Error starting location updates: " + e.getMessage(), e);
        }
    }

    private void processLocationUpdate(Location location) {
        if (location == null) return;

        double lat = location.getLatitude();
        double lng = location.getLongitude();
        float accuracy = location.getAccuracy();
        long time = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        double distance = OfficeGeofenceHelper.calculateDistance(lat, lng, OfficeGeofenceHelper.OFFICE_LAT, OfficeGeofenceHelper.OFFICE_LNG);

        // Update native diagnostic state
        OfficeGeofenceHelper.saveLastLocationDiagnostic(this, lat, lng, accuracy, time, distance);

        // Validate accuracy to reject wild GPS jumps
        if (accuracy > 50.0f) {
            Log.d(TAG, "Ignoring location update due to low accuracy: " + accuracy + "m");
            return;
        }

        JSONObject activeSession = OfficeGeofenceHelper.getActiveSession(this);
        if (activeSession == null) {
            Log.i(TAG, "No active office session found in native storage. Stopping location service.");
            stopSelf();
            return;
        }

        String sessionState = activeSession.optString("sessionState", "ACTIVE");
        String recordedExitTime = activeSession.optString("recordedExitTime", "");

        if ("ACTIVE".equalsIgnoreCase(sessionState)) {
            if (distance > 25.0) {
                consecutiveOutsideCount++;
                consecutiveInsideCount = 0;
                Log.i(TAG, "Outside 25m boundary: " + Math.round(distance) + "m (count: " + consecutiveOutsideCount + "/2)");

                if (consecutiveOutsideCount >= 2) {
                    consecutiveOutsideCount = 0;
                    Log.i(TAG, "=== NATIVE SECONDARY FUSED LOCATION EXIT DETECTED ===");
                    OfficeGeofenceHelper.recordExitEvent(this, location, "NATIVE_FUSED_LOCATION");
                    GeofencePlugin.notifyNativeTransition("EXIT", lat, lng, time);
                }
            } else {
                consecutiveOutsideCount = 0;
                consecutiveInsideCount++;
            }
        } else if ("PENDING_EXIT_CONFIRMATION".equalsIgnoreCase(sessionState)) {
            // Check return hysteresis: if employee returns within 23m of office
            if (distance <= 23.0) {
                consecutiveInsideCount++;
                consecutiveOutsideCount = 0;
                Log.i(TAG, "Returned inside 23m office boundary: " + Math.round(distance) + "m (count: " + consecutiveInsideCount + "/2)");

                if (consecutiveInsideCount >= 2) {
                    consecutiveInsideCount = 0;
                    Log.i(TAG, "=== NATIVE GEOFENCE RETURN TO OFFICE DETECTED ===");
                    OfficeGeofenceHelper.cancelPendingExit(this);
                    GeofencePlugin.notifyNativeTransition("ENTER", lat, lng, time);
                }
            } else {
                consecutiveInsideCount = 0;
            }
        } else if ("CHECKED_OUT".equalsIgnoreCase(sessionState) || "FINALIZED".equalsIgnoreCase(sessionState)) {
            Log.i(TAG, "Session is finalized. Stopping OfficeLocationService.");
            stopSelf();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isServiceRunning = false;
        Log.i(TAG, "OfficeLocationService destroyed.");
        if (fusedLocationClient != null && locationCallback != null) {
            try {
                fusedLocationClient.removeLocationUpdates(locationCallback);
            } catch (Exception e) {
                Log.w(TAG, "Error removing location updates: " + e.getMessage());
            }
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
