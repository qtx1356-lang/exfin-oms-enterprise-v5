# Office Management System — Troubleshooting & FAQ Guide

This guide addresses common questions, build errors, and operational scenarios when deploying Office Management System.

---

## 1. Firebase & Database Issues

### Symptom: `Firebase: Error (auth/invalid-api-key)`
- **Cause:** Your `.env` or `firebase-applet-config.json` file contains placeholder keys.
- **Solution:** Verify that `VITE_FIREBASE_API_KEY` in `.env` matches your actual Web App credentials from the Firebase Console. Restart the development server (`npm run dev`).

### Symptom: `Missing or insufficient permissions` when writing to Firestore
- **Cause:** Firestore security rules are either uninitialized or blocking the request.
- **Solution:** Ensure you published `firestore.rules` in your Firebase Console. Confirm that the user is properly signed in.

---

## 2. Build & Server Compilation Issues

### Symptom: `esbuild: command not found` or `vite: command not found`
- **Cause:** Dependencies are missing or npm packages were not installed.
- **Solution:** Run `npm install` inside the `source/` folder.

### Symptom: Server crashes on startup with `GEMINI_API_KEY is missing`
- **Cause:** Gemini API key environment variable is missing.
- **Solution:** Add `GEMINI_API_KEY="your_key"` to your `.env` file. The Gemini client uses lazy initialization and will throw a clear error if invoked without a key.

---

## 3. Android & Geofencing Issues

### Symptom: Automatic check-in does not trigger when arriving at office
- **Cause:** Background location permissions are disabled or location services are turned off on the device.
- **Solution:**
  1. Open Android Device Settings > Apps > Office Management System > Permissions > Location.
  2. Select **"Allow all the time"** (required for background geofence detection).
  3. Ensure GPS High Accuracy is enabled.

### Symptom: Exit timestamp is delayed or displays app open time
- **Cause:** Device battery saver mode delayed background execution.
- **Solution:** The native engine automatically records the exact hardware exit timestamp (`triggerLocation.getTime()`) in `SharedPreferences` as soon as the perimeter is crossed. When the app is opened, this exact physical time (e.g. 06:02 PM) is reconciled and displayed in the confirmation modal.

---

## 4. Service Worker & Offline Shell Issues

### Symptom: Stale application bundle displayed after updating source code
- **Cause:** Service Worker browser caching.
- **Solution:** Click **Clear Cache & Reload** inside the application footer, or unregister the Service Worker in Chrome DevTools under **Application > Service Workers**.
