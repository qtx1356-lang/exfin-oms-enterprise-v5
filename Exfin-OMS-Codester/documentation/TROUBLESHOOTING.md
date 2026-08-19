# Exfin OMS — Troubleshooting & FAQ Guide

Common issues, error messages, and resolution steps for administrators and developers.

---

## 1. Firebase & Authentication Issues

### Issue: "Firebase: Error (auth/invalid-api-key)"
- **Cause**: The API Key in `.env` or `firebase-applet-config.json` is missing or invalid.
- **Solution**: Open Firebase Console > Project Settings. Copy the Web API Key and update `VITE_FIREBASE_API_KEY` in `.env` and `apiKey` in `firebase-applet-config.json`.

### Issue: "Missing or insufficient permissions" (Firestore Error)
- **Cause**: Firestore security rules are blocking access or the user is not authenticated.
- **Solution**: Publish the rules provided in `database/firestore.rules`. Verify the user's UID is present in `admin_users` or `registrations`.

---

## 2. GPS & Location Issues

### Issue: "Location permission denied" or "Geolocation position unavailable"
- **Cause**: Browser or mobile device location permissions are disabled, or app is served over HTTP instead of HTTPS.
- **Solution**: Ensure application is hosted over HTTPS. On mobile, navigate to Settings > Apps > Exfin OMS > Permissions > Location > Allow always / while using app.

### Issue: "Outside 25m Office Geofence"
- **Cause**: GPS inaccuracy or office coordinates mismatch.
- **Solution**: Verify office latitude and longitude in `locationService.ts` match your physical office location. Ensure high-accuracy GPS mode is enabled on the device.

---

## 3. Attendance Correction Issues

### Issue: "Function updateDoc() called with invalid data. Unsupported field value: undefined"
- **Cause**: An update payload contains `undefined` values.
- **Solution**: Ensure all Firestore updates pass through `sanitizeFirestorePayload()`. This issue was resolved in Exfin OMS v1.0.0.

---

## 4. Mobile App / Android Build Issues

### Issue: "google-services.json missing"
- **Cause**: Android build requires `google-services.json` for Firebase notifications.
- **Solution**: Download `google-services.json` from Firebase Console and place it inside `android/app/google-services.json`.

### Issue: "Capacitor plugin not found"
- **Cause**: Web build assets were not synced to Android project.
- **Solution**: Run `npx cap sync android` inside the `source-code/` directory.
