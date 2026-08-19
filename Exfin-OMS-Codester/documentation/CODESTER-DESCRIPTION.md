# Exfin OMS — Office Management System (Codester Listing)

**Title**: Exfin OMS — Office Management System with GPS Attendance, Expenses, Leave & Task Planner
**Short Description**: Complete enterprise office management web & mobile app featuring 25m GPS geofencing, exit detection, attendance corrections, expense claims, leave workflows, task planner, and employee efficiency metrics.

---

## Product Overview

Exfin OMS is a full-featured, commercial-ready Office Management System engineered for enterprise workforce coordination. Built on React 19, TypeScript, Vite 6, Express Node.js, and Firebase Firestore, it provides real-time location verification, strict 25-meter office geofencing, expense claim management, leave workflows, reassignable task planning, and administrative reporting.

---

## Key Features

- **GPS & Geofenced Attendance**:
  - Strict 25-meter radius office boundary check-in validation.
  - Support for Office, Work From Home (WFH), Client Visit, and Outdoor Work.
  - Automatic background office exit detection (`PENDING_FINAL_EXIT` state).
  - Interactive exit checkout confirmation modal.
  - Standardized coordinate-keyed reverse geocoding with race condition protection.

- **Administration & Security**:
  - Multi-tier Role-Based Access Control (Super Admin, Admin, HR, Team Leader, Employee).
  - Hardware device binding & admin device approval queue.
  - Admin attendance correction tool with auto payload sanitization.
  - Immutable audit trail logging all administrative actions.

- **Workforce Modules**:
  - Expense Management with receipt uploads and approval tracking.
  - Leave Management with configurable policies and entitlement balances.
  - Work Planner with task reassignment, revisions, and priority flags.
  - Employee Efficiency scoring and daily performance snapshots.
  - In-app messaging, group announcements, and targeted alerts.

- **Cross-Platform**:
  - Responsive Web / Desktop Admin Panel.
  - Android mobile app source with native Capacitor plugins for background geofencing.
  - Offline-first operational capability with automatic event queuing and sync.

---

## What Is Included in Package

- Full Web Application Source Code (React 19 + TypeScript + Vite 6)
- Express Node.js Backend Server (`server.ts`)
- Native Android Project (Capacitor 8 + Kotlin plugins)
- Firebase Firestore Security Rules (`firestore.rules`)
- Environment & Firebase Template Files (`.env.example`)
- Complete Documentation (Setup, Admin, Employee, Features, GPS Architecture)
- Demo Credentials & Sample Data Templates

---

## Technical Requirements

- Node.js v18+
- npm or bun
- Firebase Account (Free tier compatible)
- Android Studio (For compiling mobile APK/AAB)
