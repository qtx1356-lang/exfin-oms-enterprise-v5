# Office Management System — Firebase Provisioning & Setup Guide

Office Management System utilizes Google Firebase for Authentication, Cloud Firestore (database), and Cloud Storage (receipts, avatars, profile documents).

---

## Step 1 — Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Click **Add Project** and name your project (e.g., `my-company-oms`).
3. Enable Google Analytics (optional).
4. Click **Create Project**.

---

## Step 2 — Enable Firebase Authentication

1. In the left menu, navigate to **Build > Authentication**.
2. Click **Get Started**.
3. Under **Sign-in method**, enable:
   - **Email/Password**
   - **Anonymous** (required for instant mobile device registration)
4. Save changes.

---

## Step 3 — Provision Cloud Firestore Database

1. Navigate to **Build > Firestore Database**.
2. Click **Create Database**.
3. Select a location geographically close to your organization.
4. Choose **Start in production mode**.
5. Deploy security rules:
   Copy the contents of `firestore.rules` from the application source root into the **Firestore Rules** tab in the Firebase Console and click **Publish**.

---

## Step 4 — Provision Firebase Cloud Storage

1. Navigate to **Build > Storage**.
2. Click **Get Started**.
3. Deploy storage security rules:
   Copy the contents of `storage.rules` from the application source root into the **Storage Rules** tab in the Firebase Console and click **Publish**.

---

## Step 5 — Register Web App & Retrieve Credentials

1. In Project Overview, click the **Web icon (`</>`)** to add a Web App.
2. Register app name (e.g., `Office Management System Web`).
3. Copy the `firebaseConfig` values into:
   - Your local `.env` file (`VITE_FIREBASE_*` variables).
   - `firebase-applet-config.json` in your project root.

---

## Step 6 — Initial Administrator Setup

1. Launch your application at `http://localhost:3000`.
2. Navigate to `/admin/login` or `/admin-portal/login`.
3. Use the initial admin onboarding screen to create your Super Admin credentials.
4. Future admins can be created directly from the Admin Portal's **User Management** and **RBAC** tabs.
