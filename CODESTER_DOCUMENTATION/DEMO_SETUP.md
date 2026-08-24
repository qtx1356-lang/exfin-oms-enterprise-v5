# DEMO ENVIRONMENT SETUP GUIDE

---

## Overview

This guide explains how to deploy a safe, isolated demo environment for **Office Management System**.

> **CRITICAL SECURITY REQUIREMENT:**
> Always use a dedicated, isolated Firebase project for public demos or seller showcases. NEVER use production credentials or real employee data in demo environments.

---

## Step 1: Create a Demo Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/).
2. Create a new project named `office-mgmt-system-demo`.
3. Enable **Firebase Authentication** (Email/Password sign-in method).
4. Enable **Cloud Firestore** in production mode.
5. Deploy security rules from `firestore.rules` provided in the source download.

---

## Step 2: Seed Fictional Data

1. Open `demo/DEMO_DATA_SEED.json` from the download package.
2. Use the **Admin Portal > User Management** or import scripts to populate sample departments, designations, and sample accounts.
3. Configure office geofence coordinates in **Admin Settings** to match your demo office coordinates or test coordinates.

---

## Step 3: Deploy Live Web Demo

1. Build production assets:
   ```bash
   npm run build
   ```
2. Deploy to Cloud Run, Firebase Hosting, Vercel, or Netlify:
   ```bash
   firebase deploy --only hosting
   ```
3. Set environment variables using `.env.example` as a template with demo Firebase credentials.
