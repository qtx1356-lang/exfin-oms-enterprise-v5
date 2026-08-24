# Office Management System — Security & Data Protection Specification

Security, data privacy, and role isolation are core design requirements of Office Management System.

---

## 1. Firebase Security Rules Strategy

### Firestore Database Security Rules (`firestore.rules`)
Firestore access is controlled via granular security rules:
- **Authentication Required:** All read/write operations require valid Firebase Auth user tokens (`request.auth != null`).
- **User Record Isolation:** Employees can only read and write their own attendance logs, expense claims, and profile details.
- **Role Enforcement:** Administrative actions (approving expenses, updating salaries, modifying roles) require verification against the user's role stored in the `registrations` or `admin_users` collection.
- **Immutable Audit Logs:** Audit records (`audit_logs`) are write-only for audit tracking and cannot be edited or deleted by users.

### Cloud Storage Security Rules (`storage.rules`)
- Receipt uploads and profile documents are restricted to authenticated users.
- Users can only upload images/PDFs up to 10MB in size.

---

## 2. API Key Protection & Full-Stack Security

- **Server-Side API Route Proxying:** Sensitive API keys (such as `GEMINI_API_KEY`) are accessed strictly on the Node.js Express server (`server.ts`). They are **never** exposed to client-side JavaScript bundles or browser DevTools.
- **Public Keys:** Web client keys (like `VITE_FIREBASE_API_KEY`) are safe public identifiers protected at the Firebase project level by domain restrictions in the Firebase Console.

---

## 3. Anti-Spoofing & Device Binding

- **Device Fingerprinting:** Every mobile user is bound to a unique hardware device ID upon initial registration (`DeviceRegistration.tsx`).
- **Device Registration Approval:** Admins must approve new mobile devices in the Admin Portal (**Pending Device Approvals** tab) before attendance logging is permitted.
- **GPS Distance Validation:** Attendance logs verify both GPS Haversine distance and native Android geofence entry/exit events to prevent mock-location spoofing.

---

## 4. Production Security Recommendations for Buyers

1. **Enable App Check:** Configure Firebase App Check with reCAPTCHA v3 or Play Integrity in the Firebase Console.
2. **Domain Authorization:** Add your production domain to authorized domains under **Firebase Console > Authentication > Settings**.
3. **Database Backups:** Enable automated Google Cloud Firestore backups via GCP Cloud Scheduler.
