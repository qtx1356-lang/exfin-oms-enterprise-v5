# Welcome to Office Management System

Thank you for purchasing **Office Management System** — the complete, production-ready Workforce Management, GPS Attendance, Expense Tracking & Payroll Platform with Native Android & Web Support.

---

## What is Office Management System?

Office Management System is a full-stack, enterprise-grade Operations Management System (OMS) engineered specifically for businesses requiring precise employee tracking, automated attendance verification, expense management, leave administration, and real-time workforce analytics.

### Core System Pillars
1. **Automated GPS & Geofenced Attendance:**
   - 25-meter office radius enforcement using high-accuracy native Android geofencing and GPS Haversine verification.
   - Dual-engine automatic check-in on entry and physical exit-timestamp capture on exit with interactive employee checkout confirmation.
2. **Offline-First Resilience:**
   - Instant cached application shell boot via Service Worker.
   - Local IndexedDB / LocalStorage queuing for all attendance events, expenses, and leave requests when network connection is unavailable.
   - Automatic background background-sync queue when connection resumes.
3. **Comprehensive Admin Operations Portal:**
   - Single-screen and tabbed Admin Dashboard for real-time Office Pulse monitoring.
   - Role-Based Access Control (RBAC), HR employee profiles, salary/payslip generation, work hours analytics, leave approvals, device registration authorization, and audit trail logging.
4. **Native Android Container & Median.co Integration:**
   - Full Android Studio project (`/android`) with Geofence Broadcast Receiver, Boot Receiver, and Median.co native location bridge.

---

## Technology Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Framer Motion
- **Backend / API:** Node.js, Express, ESBuild CJS bundler, TSX engine
- **Database & Auth:** Firebase Firestore, Firebase Authentication, Firebase Storage
- **Mobile Container:** Android Studio (Java/Kotlin), Capacitor 8, Median.co Native Bridge
- **AI Integration:** Google Gemini AI (@google/genai SDK) for Smart Daily Briefs, Attendance Intelligence, and Expense Receipt OCR scanning

---

## Package Directory Structure

```
Office Management System/
├── source/                      # Full React + Express TypeScript source code
│   ├── src/                     # Application logic, components, features, services
│   ├── public/                  # Static assets, Service Worker, web manifest, sounds
│   ├── server.ts                # Express backend entry point
│   ├── vite.config.ts           # Vite build configuration
│   └── package.json             # NPM dependencies & scripts
├── android/                     # Full native Android Studio project
│   ├── app/src/main/java/...    # Native Java Geofence & Location receivers
│   └── build.gradle             # Android build setup
├── documentation/               # Comprehensive buyer setup & technical guides
├── firebase-applet-config.example.json # Firebase configuration template
├── .env.example                 # Environment variables template
├── README.md                    # Release root guide
└── LICENSE_NOTICES.md           # Third-party open source licenses
```

---

## Where to Start?

1. **Step 1:** Read `INSTALLATION.md` to set up your Node.js environment and launch local development.
2. **Step 2:** Read `FIREBASE_SETUP.md` to provision your own Firebase Firestore database and Authentication.
3. **Step 3:** Read `ANDROID_MEDIAN_SETUP.md` to build and package your native Android APK or Google Play release.
4. **Step 4:** Review `DEMO_DATA.md` to create safe test accounts for Admin and Employee roles.
