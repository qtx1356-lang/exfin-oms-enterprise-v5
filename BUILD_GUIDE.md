# Office Management System Native Android Build Guide

Since the cloud development environment does not contain the Android SDK and JDK required to compile a binary, you can build the APK locally using Android Studio.

## Prerequisites
1. **Node.js & NPM** installed on your machine.
2. **Android Studio** (Jellyfish or newer).
3. **Java 17+** (included with Android Studio).

## Step-by-Step Build Instructions

### 1. Extract and Prepare
```bash
# Install web dependencies
npm install

# Build the web assets
npm run build
```

### 2. Sync with Android
```bash
# Sync web assets to the android project
npx cap sync android
```

### 3. Build in Android Studio
1. Open **Android Studio**.
2. Select **Open** and choose the `android` folder inside the project.
3. Wait for Gradle to finish syncing.
4. Go to **Build > Generate Signed Bundle / APK**.
5. Select **APK** and click **Next**.
6. Select your keystore (or create a new one for testing).
7. Select **release** variant and click **Finish**.

### 4. Locate the APK
The generated APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

## Production Configuration
The native project is pre-configured with:
- **App Name**: `Office Management System`
- **Geofence Radius**: 25 meters
- **Background Location**: Fully implemented in Kotlin/Java
- **Firebase**: Easily configured via `.env` or `src/services/firebase/config.ts`
