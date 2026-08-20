# Exfin OMS — Office Management System

Exfin OMS is a complete, enterprise-grade Office Management System designed for modern workforce management. It combines real-time GPS location verification, attendance tracking, office geofence monitoring, expense approvals, leave management, work planning, employee performance tracking, and administrative reporting into a unified web and mobile application.

---

## Key Features

- **GPS & Geofenced Attendance**: Real-time 25-meter office geofence check-in and checkout enforcement, with automatic exit detection and exit checkout prompts.
- **Multiple Attendance Modes**: Supports Office Attendance, Work From Home (WFH), Client Visit, and Outdoor Field Work with GPS verification.
- **Precise GPS Address Engine**: Standardized coordinate-keyed reverse geocoding with race protection and address caching.
- **Attendance Correction & Audit**: Administrator attendance correction workflow with automatic payload sanitization and complete audit trails.
- **Employee & Device Approval**: Multi-tier role management (Super Admin, Admin, HR, Team Leader, Employee) with device binding and device approval workflows.
- **Expense Management**: Digital expense submission, category tracking, receipt attachment, and multi-stage administrative approval workflow.
- **Leave Management**: Leave requests, allowance configurations, balance tracking, and approval history.
- **Work Planner & Tasks**: Reassignable task management, due dates, priority tracking, status reviews, and revision requests.
- **Employee Efficiency**: Automated activity metrics, performance scoring, and daily efficiency snapshots.
- **Salary & Advances**: Salary configuration, advance tracking, attendance audit integration, and automated calculations.
- **Real-Time Communication**: In-app team messaging, group announcements, and targeted notifications.
- **Offline-First Architecture**: Cached local application shell with queued offline event synchronization upon internet reconnection.

---

## Technology Stack

- **Frontend Framework**: React 19, TypeScript, Vite 6, Tailwind CSS 4, Motion React
- **Mobile Runtime**: Capacitor 8 (Geolocation, Push Notifications, Local Notifications, Device, App)
- **Backend Architecture**: Express Node.js Server (`server.ts`), Firebase Firestore, Firebase Authentication, Firebase Storage
- **Native Android**: Native Kotlin / Java Capacitor plugins (Geofence Broadcast Receiver & Boot Receiver)

---

## Directory Overview

```
Exfin-OMS-Codester/
├── source-code/         # Full Web and Server TypeScript source code
├── android/             # Complete Native Android Capacitor project
├── documentation/       # Comprehensive guides (Setup, Admin, Employee, Features, GPS)
├── configuration/       # Environment & Firebase configuration templates
├── database/            # Production-grade firestore.rules
├── demo-data/           # Instructions & data structures for fictional demo data
├── assets/              # Placeholders for marketplace screenshots & preview images
├── README.md            # Main project documentation
├── CHANGELOG.txt        # Version history
└── LICENSE.txt          # Marketplace license agreement
```

---

## Quick Start (Local Development)

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or bun

### 1. Configure Environment
Copy the example configuration from the `configuration/` folder into `source-code/`:
```bash
cp configuration/.env.example source-code/.env
cp configuration/firebase-applet-config.example.json source-code/firebase-applet-config.json
```
Fill in your Firebase credentials inside `.env` or `firebase-applet-config.json`.

### 2. Install & Run
```bash
cd source-code
npm install
npm run dev
```
Open `http://localhost:3000` in your web browser.

---

## Production Build

To compile the application for production:
```bash
cd source-code
npm run build
npm start
```

---

## Comprehensive Guides

Please refer to the detailed documentation inside the `documentation/` directory:
- **`INSTALLATION-GUIDE.md`**: Complete step-by-step setup guide.
- **`FIREBASE-SETUP.md`**: Firebase project provisioning & configuration.
- **`FIRESTORE-STRUCTURE.md`**: Complete schema documentation for all collections.
- **`DEPLOYMENT-GUIDE.md`**: Cloud Run, Node server, and static hosting deployment.
- **`ADMIN-GUIDE.md`**: Administrator operations and dashboard usage.
- **`EMPLOYEE-GUIDE.md`**: Employee mobile/web app usage guide.
- **`GPS-ATTENDANCE.md`**: Technical overview of GPS & geofencing engine.
- **`ATTENDANCE-CORRECTION.md`**: Admin attendance correction workflow.
- **`TROUBLESHOOTING.md`**: Common issues and resolution steps.

---

## Support & License

Distributed under the standard Codester Commercial License. Source code is fully customizable for your organization.
