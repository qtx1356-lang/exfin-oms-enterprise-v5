# Office Management System — Installation & Setup Guide

This guide provides step-by-step instructions for installing, configuring, building, and deploying Office Management System.

---

## System Requirements

- **Node.js:** v18.0.0 or higher (v20+ recommended)
- **NPM:** v9.0.0 or higher
- **Android Studio:** Jellyfish / Ladybug or newer (for building Android APK)
- **Firebase Account:** Free or Blaze Tier on Google Firebase Console
- **Gemini API Key:** Free key from Google AI Studio (optional, for AI features)

---

## Step 1 — Local Installation

1. **Extract Package:**
   Extract the downloaded `Office Management System_CODESTER.zip` archive into your workspace.

2. **Navigate to Source Directory:**
   ```bash
   cd Office Management System/source
   ```

3. **Install Dependencies:**
   ```bash
   npm install
   ```

---

## Step 2 — Environment Configuration

1. **Copy Environment Template:**
   ```bash
   cp .env.example .env
   ```

2. **Configure `.env` Variables:**
   Open `.env` in your text editor and fill in your keys:
   ```env
   GEMINI_API_KEY="YOUR_ACTUAL_GEMINI_API_KEY"
   APP_URL="http://localhost:3000"

   VITE_FIREBASE_API_KEY="YOUR_FIREBASE_API_KEY"
   VITE_FIREBASE_AUTH_DOMAIN="YOUR_PROJECT_ID.firebaseapp.com"
   VITE_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
   VITE_FIREBASE_STORAGE_BUCKET="YOUR_PROJECT_ID.firebasestorage.app"
   VITE_FIREBASE_MESSAGING_SENDER_ID="YOUR_SENDER_ID"
   VITE_FIREBASE_APP_ID="YOUR_WEB_APP_ID"
   ```

3. **Create Firebase Web Configuration File:**
   Copy `firebase-applet-config.example.json` to `firebase-applet-config.json` inside the root directory and update it with your Firebase project details.

---

## Step 3 — Run Development Server

Start the full-stack development server (Express server on port 3000 with Vite middleware):

```bash
npm run dev
```

Open your browser at `http://localhost:3000`.

---

## Step 4 — Build for Production

To create a self-contained production bundle:

```bash
npm run build
```

This command executes:
1. `vite build` — Compiles React frontend assets into `dist/`.
2. `esbuild server.ts` — Bundles the Node Express server into a standalone CommonJS executable at `dist/server.cjs`.

---

## Step 5 — Production Execution & Deployment

To launch the compiled production server:

```bash
npm run start
```

### Cloud Run / Docker Deployment
The application includes a production-ready Express server (`server.ts`) listening on host `0.0.0.0` and port `3000`. You can deploy it directly to Google Cloud Run, AWS Elastic Beanstalk, DigitalOcean App Platform, or any VPS running Node.js.
