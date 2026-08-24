# Office Management System — System Architecture Specification

This document details the architectural design, data flow, offline queue handling, and native Android integrations of Office Management System.

---

## High-Level System Architecture

```
                                 ┌─────────────────────────────────┐
                                 │      Google Firebase Cloud      │
                                 │  - Firebase Auth                │
                                 │  - Cloud Firestore Database     │
                                 │  - Cloud Storage                │
                                 └────────────────┬────────────────┘
                                                  │
                                       HTTPS / WSS Firebase SDK
                                                  │
                                 ┌────────────────┴────────────────┐
                                 │   Full-Stack Express App / API  │
                                 │   - Node.js Express Server      │
                                 │   - Server-Side Gemini AI API    │
                                 │   - ESBuild Bundled (dist/cjs)  │
                                 └────────────────┬────────────────┘
                                                  │
                                    REST / Static Assets / SW
                                                  │
 ┌────────────────────────────────────────────────┴─────────────────────────────────┐
 │                               Client Application Runtime                         │
 │                                                                                  │
 │  ┌───────────────────────────┐                       ┌─────────────────────────┐  │
 │  │      Web Browser / SW     │                       │     Android Container   │  │
 │  │  - React 19 Single Page   │                       │  - Capacitor / Median   │  │
 │  │  - Service Worker Cache   │                       │  - Geofence Receiver    │  │
 │  │  - IndexedDB Sync Queue   │                       │  - SharedPreferences    │  │
 │  └───────────────────────────┘                       └─────────────────────────┘  │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

---

## Attendance Data Pipeline & Hardware Geofencing Flow

1. **Geofence Exit Detection:**
   - Android Play Services Location triggers `GEOFENCE_TRANSITION_EXIT` when user crosses the 25-meter perimeter.
   - `GeofenceBroadcastReceiver.java` extracts exact GPS trigger hardware timestamp (`triggerLocation.getTime()`).
   - Event stored in Android `SharedPreferences` queue (`KEY_EVENTS`).

2. **Native-to-Web Bridge Sync:**
   - App re-open or foreground event invokes `NativeGeofencePlugin.getUnconsumedNativeEvents()`.
   - JavaScript bridge `nativeGeofenceBridge.ts` delivers exact exit time string and ISO timestamp to `AutomaticAttendanceEngine`.

3. **Attendance State Machine:**
   - State transitions to `PENDING_EXIT_CONFIRMATION` / `PENDING_FINAL_EXIT`.
   - Active record retains authoritative `geofenceExitTime` (e.g. 06:02 PM).
   - Employee sees `<CheckoutConfirmationModal />` displaying 06:02 PM.

4. **Confirmation & Cloud Sync:**
   - Employee taps "Confirm Checkout".
   - Final `checkOutTime` recorded as 06:02 PM.
   - Record committed to local IndexedDB and synced to Firestore `attendance_records` collection via `GlobalSyncEngine`.

---

## Offline-First Resiliency Stack

- **Application Shell Cache:** `public/service-worker.js` pre-caches static JS/CSS bundles and assets (`CACHE_NAME = 'exfin-oms-v5'`).
- **IndexedDB Event Queue:** `indexedDBService.ts` maintains offline store for attendance logs, expense records, leave applications, and notifications.
- **Sync Failure Recovery:** `syncFailureService.ts` retries failed network payloads exponentially upon internet reconnection without data loss.
