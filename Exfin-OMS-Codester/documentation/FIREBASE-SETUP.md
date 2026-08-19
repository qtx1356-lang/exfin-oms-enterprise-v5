# Exfin OMS — Firebase Setup Guide

This guide details the exact steps required to create and configure a new Firebase project for Exfin OMS.

---

## 1. Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Enter a project name (e.g., `my-company-oms`).
4. (Optional) Enable or disable Google Analytics.
5. Click **Create project** and wait for provisioning to complete.

---

## 2. Register Web Application

1. In your Firebase Project Overview page, click the **Web icon** (`</>`) to add a Web App.
2. Enter an app nickname (e.g., `Exfin OMS Web`).
3. Click **Register app**.
4. Firebase will display your `firebaseConfig` object containing:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`
5. Copy these values into `source-code/.env` and `source-code/firebase-applet-config.json`.

---

## 3. Register Android Application (For Mobile App)

1. In Project Settings, click **Add app** and select **Android**.
2. Enter Package Name: `com.exfin.oms`.
3. Enter App Nickname: `Exfin OMS Android`.
4. (Optional) Enter SHA-1 certificate fingerprint for production Google Sign-In or App Check.
5. Download `google-services.json` and place it in `android/app/google-services.json`.

---

## 4. Enable Firebase Authentication

1. In the left sidebar, navigate to **Build > Authentication**.
2. Click **Get started**.
3. Under **Sign-in method**, select **Email/Password**.
4. Enable **Email/Password** sign-in provider.
5. Save changes.

---

## 5. Enable Firestore Database

1. Navigate to **Build > Firestore Database**.
2. Click **Create database**.
3. Select a location close to your primary workforce (e.g., `us-central1` or `asia-south1`).
4. Start in **Production mode**.
5. Click **Create**.

---

## 6. Deploy Firestore Security Rules

1. In Firebase Console, open **Firestore Database > Rules**.
2. Replace all content with the rules from `database/firestore.rules` included in this package.
3. Click **Publish**.

*(Alternatively, deploy via Firebase CLI: `firebase deploy --only firestore:rules`).*

---

## 7. Enable Firebase Storage (For Profile Photos, Expense Receipts, Chat)

1. Navigate to **Build > Storage**.
2. Click **Get started**.
3. Select default bucket permissions and location.
4. Set bucket rules to allow authorized uploads:
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## 8. Create Initial Super Admin Account

To access the Admin Dashboard for the first time:

1. Open Firebase Console **Authentication > Users** tab.
2. Click **Add user**.
3. Enter an admin email (e.g., `admin@mycompany.com`) and password.
4. Copy the newly generated **User UID**.
5. Go to **Firestore Database > Data**.
6. Create a collection named `admin_users`.
7. Add a document with ID set to the **User UID**:
```json
{
  "uid": "YOUR_ADMIN_USER_UID",
  "email": "admin@mycompany.com",
  "role": "SUPER_ADMIN",
  "active": true,
  "displayName": "Super Admin",
  "loginId": "admin",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```
8. Also create a document in collection `registrations` with document ID set to **User UID**:
```json
{
  "uid": "YOUR_ADMIN_USER_UID",
  "employeeCode": "ADMIN001",
  "name": "Super Admin",
  "email": "admin@mycompany.com",
  "role": "SUPER_ADMIN",
  "status": "Approved",
  "office": "ALL",
  "approved": true
}
```

You can now log in to the Admin Dashboard at `/admin/dashboard` using `admin` / your password!
