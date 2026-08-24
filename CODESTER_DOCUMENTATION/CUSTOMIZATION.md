# Office Management System — Customization Guide

Office Management System is designed for easy customization, re-branding, and configuration by buyers and developers.

---

## 1. Re-Branding & UI Customization

### App Name & Metadata
- **Web Title & Manifest:** Edit `public/manifest.json` and `index.html` to update the application name, short name, theme color, and icons.
- **Header & Sidebar Logos:** Update `/src/components/layout/Layout.tsx` or replace branding assets in `/public/`.

### Color Palette & Styling
- Tailwind CSS v4 handles visual styling. Primary brand colors (purple `#7C3AED` and slate dark modes) can be customized in `/src/index.css` or by adjusting utility classes across component templates.

---

## 2. Office Geofence & Location Settings

### Default Office Coordinates
To change the default office location coordinates:
1. **Frontend / Engine Defaults:**
   Update `OFFICE_LOCATION` in:
   - `/src/services/attendance/automaticAttendanceEngine.ts`
   - `/src/services/attendance/smartAttendanceEngine.ts`
   - `/src/utils/attendanceUtils.ts`
   - `/server.ts`
2. **Android Native Default:**
   Update `OFFICE_LAT` and `OFFICE_LNG` in `/android/app/src/main/java/com/exfin/oms/geofence/OfficeGeofenceHelper.java`.

### Dynamic Multi-Office Configuration
Admins can also configure multiple office locations dynamically directly through the Admin Portal under **Organization Settings**.

---

## 3. Work Hours & Attendance Policy Customization

Edit policy defaults in `/src/config/featureRegistry.ts` or `/src/services/attendance/automaticAttendanceEngine.ts`:
- **Grace Period:** Default late threshold (e.g. 15 mins).
- **Target Work Hours:** Default full-day requirement (e.g. 8.0 hours).
- **Auto-Checkout Timeout:** Unconfirmed checkout auto-finalization window.

---

## 4. Customizing Employee & Admin Navigation

Modify tab lists and router endpoints in:
- `/src/app/Router.tsx` — Navigation routes and route protections.
- `/src/components/layout/BottomNav.tsx` — Employee mobile navigation items.
- `/src/features/admin/AdminDashboard.tsx` — Admin Portal tabs.
