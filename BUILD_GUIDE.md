# Exfin OMS Native Android Build Guide

Since the cloud development environment does not contain the Android SDK and JDK required to compile a binary, you must build the APK locally.

## Prerequisites
1. **Node.js & NPM** installed on your machine.
2. **Android Studio** (Jellyfish or newer).
3. **Java 17+** (included with Android Studio).

## Step-by-Step Build Instructions

### 1. Download the Source Bundle
Download the `EXFIN_OMS_ANDROID_BUILD_PROJECT.tar.gz` file from the file explorer.

### 2. Extract and Prepare
```bash
# Extract the archive
tar -xzf EXFIN_OMS_ANDROID_BUILD_PROJECT.tar.gz
cd EXFIN_OMS_ANDROID_BUILD_PROJECT

# Install web dependencies
npm install

# Build the web assets
npm run build
```

### 3. Sync with Android
```bash
# Sync web assets to the android project
npx cap sync android
```

### 4. Build in Android Studio
1. Open **Android Studio**.
2. Select **Open** and choose the `android` folder inside the extracted project.
3. Wait for Gradle to finish syncing.
4. Go to **Build > Generate Signed Bundle / APK**.
5. Select **APK** and click **Next**.
6. Select your production keystore (or create a new one for testing).
7. Select **release** variant and click **Finish**.

### 5. Locate the APK
The generated APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

## Production Configuration
The native project is already configured with:
- **Package ID**: `com.exfin.oms`
- **Geofence Radius**: 25 meters
- **Background Location**: Fully implemented in Kotlin
- **Firebase**: Connected to your production configuration
