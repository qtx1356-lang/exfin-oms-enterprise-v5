# Office Management System — Commercial Source Release

**Product Name:** Office Management System — Employee Management, GPS Attendance, Expenses & Admin Portal  
**Version:** 5.0.0 (Commercial Release)  
**License:** Commercial Source Code License (Codester)  

---

## Quick Start Guide

1. **Read Documentation:**  
   Open the `documentation/` (or `CODESTER_DOCUMENTATION/`) folder and read `README_FIRST.md` and `INSTALLATION.md`.

2. **Web & Backend Source Setup:**  
   ```bash
   # From project root (or inside /source if using a distribution archive)
   npm install
   cp .env.example .env
   # Add your Firebase and optional Gemini credentials to .env
   npm run dev
   ```

3. **Android Application Setup:**  
   Open the `android/` folder in Android Studio and consult `documentation/ANDROID_MEDIAN_SETUP.md`.

4. **Firebase Database Setup:**  
   Follow `documentation/FIREBASE_SETUP.md` to deploy `firestore.rules` and `storage.rules`.

---

## What is Included in this Package?

- **`/source`**: Complete React 19 + Express TypeScript full-stack web application source code.
- **`/android`**: Complete native Android Studio project with hardware-backed 25m geofencing.
- **`/documentation`**: 16 comprehensive manuals covering installation, Firebase, Android, security, architecture, and customization.
- **`firebase-applet-config.example.json`**: Firebase configuration example template.
- **`.env.example`**: Environment configuration template.
- **`LICENSE_NOTICES.md`**: Third-party open source attributions.

Deployment verification: Cloudflare Pages Production deployment trigger.
