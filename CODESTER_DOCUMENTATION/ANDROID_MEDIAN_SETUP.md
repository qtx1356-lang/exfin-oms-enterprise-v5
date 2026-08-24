# Office Management System — Android & Median.co Packaging Guide

Office Management System includes a complete, pre-configured native Android Studio project with high-accuracy background geofencing and support for Median.co native webview packaging.

---

## Architecture Overview

```
Mobile Device (Android)
  ├── Native Android Geofence (Google Play Location Services)
  │     ├── GeofenceBroadcastReceiver (Captures exact exit/entry hardware timestamp)
  │     └── OfficeGeofenceHelper (Persists events in SharedPreferences)
  ├── Median.co / Capacitor Webview Container
  │     └── Loads hosted HTTPS Web Application Shell
  └── React Native-Bridge (`nativeGeofenceBridge.ts` / `medianBackgroundLocation.ts`)
        └── Reconciles hardware exit timestamps with React attendance engine
```

---

## Requirements

1. **Android Studio:** Jellyfish or newer.
2. **Hosted Web Application:** Your web app must be deployed to a public HTTPS domain (e.g. `https://oms.yourcompany.com`).
3. **Median.co Account:** Free or paid account at [Median.co](https://median.co) (optional if building directly via Capacitor).

---

## Option A — Native Android Studio Build

1. Open Android Studio.
2. Choose **Open an Existing Project** and select the `/android` folder inside the package.
3. Update `serverUrl` or `webDir` in `capacitor.config.ts` to point to your hosted web app URL:
   ```typescript
   const config = {
     appId: 'com.yourcompany.oms',
     appName: 'Your Company OMS',
     server: {
       url: 'https://oms.yourcompany.com',
       androidScheme: 'https'
     }
   };
   ```
4. Configure Android Signing Key:
   - Navigate to **Build > Generate Signed Bundle / APK**.
   - Create or select your keystore file.
   - Build signed APK / AAB for Google Play Store distribution.

---

## Option B — Median.co Packaging

1. Log into your [Median.co](https://median.co) dashboard.
2. Create a new App pointing to your hosted HTTPS domain (`https://oms.yourcompany.com`).
3. Enable Native Plugins:
   - **Background Location & Geofencing**
   - **Push Notifications (FCM)**
   - **Local Notifications**
4. Download the compiled APK or build directly via Median's cloud build system.

---

## Required Android Permissions

The included `AndroidManifest.xml` comes pre-configured with all required permissions:

- `ACCESS_FINE_LOCATION` & `ACCESS_COARSE_LOCATION` — For GPS Haversine verification.
- `ACCESS_BACKGROUND_LOCATION` — For 25m geofencing when app is closed or screen is locked.
- `RECEIVE_BOOT_COMPLETED` — Re-registers 25m office geofences automatically upon phone restart.
- `FOREGROUND_SERVICE` & `FOREGROUND_SERVICE_LOCATION` — Maintains persistent background location awareness.
- `POST_NOTIFICATIONS` — Android 13+ push and local notification delivery.
