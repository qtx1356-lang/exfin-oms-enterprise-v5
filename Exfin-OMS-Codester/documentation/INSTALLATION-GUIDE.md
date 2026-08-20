# Exfin OMS — Complete Installation Guide

This guide provides step-by-step instructions for installing, configuring, running, and building Exfin OMS locally and in production environments.

---

## Prerequisites

Before starting, ensure you have installed:
1. **Node.js**: v18.0.0 or higher (v20+ recommended).
2. **npm** (comes with Node) or **bun**.
3. **Android Studio**: (Only required if building the native Android mobile app).
4. **Firebase Account**: A free or paid Google Firebase account.

---

## 1. Extract Package Contents

Extract the purchased `Exfin-OMS-Codester.zip` archive into your workspace folder. You will see:
- `source-code/` — Web application & Express server source code.
- `android/` — Native Android application project.
- `configuration/` — Environment and template configuration files.
- `database/` — Production-grade `firestore.rules`.
- `documentation/` — System guides and operational manuals.

---

## 2. Configure Firebase Credentials

1. Follow `FIREBASE-SETUP.md` to create your Firebase project, activate Authentication (Email/Password), initialize Firestore Database, and set up Storage.
2. Copy the configuration templates into `source-code/`:

```bash
# Navigate to source-code folder
cd source-code

# Create .env from template
cp ../configuration/.env.example .env

# Create firebase-applet-config.json from template
cp ../configuration/firebase-applet-config.example.json firebase-applet-config.json
```

3. Open `.env` and `firebase-applet-config.json` in your code editor and enter your Firebase API Key, Project ID, App ID, Auth Domain, and Storage Bucket.

---

## 3. Install Node Dependencies

Inside the `source-code/` directory, run:

```bash
npm install
```

This installs all required dependencies defined in `package.json`:
- React 19 & React Router
- Vite 6 & Tailwind CSS 4
- Express 4
- Firebase Web SDK
- Capacitor Core & Plugins
- Lucide React icons & Motion React animations

---

## 4. Run Development Server

To launch the local development server:

```bash
npm run dev
```

The server boots using `tsx server.ts` on port `3000`. Open your browser and navigate to:
```
http://localhost:3000
```

---

## 5. Build for Production

To create a production-ready bundle:

```bash
npm run build
```

This command executes two steps:
1. `vite build` — Compiles client assets into static files in `dist/`.
2. `esbuild server.ts ...` — Bundles the Express server into `dist/server.cjs`.

To launch the production server:

```bash
npm start
```

---

## 6. Android Mobile Build (Optional)

If you wish to compile the Android app APK or AAB bundle:

1. Copy `google-services.json` into `android/app/`:
```bash
cp ../configuration/google-services.example.json android/app/google-services.json
```
*(Replace `google-services.json` with the file downloaded from your Firebase Console for package `com.exfin.oms`).*

2. Open Android Studio:
   - Select **Open an existing project**.
   - Select the `android/` directory.
   - Wait for Gradle sync to complete.

3. Sync web assets to Capacitor:
```bash
npx cap sync android
```

4. Build Signed APK/AAB in Android Studio via **Build > Generate Signed Bundle / APK**.
