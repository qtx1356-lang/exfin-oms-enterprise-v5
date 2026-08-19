# Exfin OMS — GPS Attendance & Geofencing Architecture

This document explains the technical architecture, mathematical models, and workflows governing GPS location acquisition, geofence verification, and reverse geocoding in Exfin OMS.

---

## 1. Geofence Boundary & Coordinates

Exfin OMS enforces a strict **25-meter radius** office geofence.

### Mathematical Distance Model (Haversine Formula)
The distance between the employee's current GPS position $(\text{lat}_1, \text{lng}_1)$ and the designated office location $(\text{lat}_2, \text{lng}_2)$ is computed using the spherical Haversine formula:

$$a = \sin^2\left(\frac{\Delta \text{lat}}{2}\right) + \cos(\text{lat}_1) \cdot \cos(\text{lat}_2) \cdot \sin^2\left(\frac{\Delta \text{lng}}{2}\right)$$

$$c = 2 \cdot \text{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$

$$d = R \cdot c \quad \text{where } R = 6,371,000 \text{ meters}$$

If $d \le 25.0 \text{ meters}$, the employee is classified as **Inside Office Geofence**.
If $d > 25.0 \text{ meters}$, the employee is classified as **Outside Office Geofence**.

### Configuring Office Coordinates
By default, office coordinates are configured in `src/services/location/locationService.ts` and `android/app/src/main/java/com/exfin/oms/geofence/OfficeGeofenceHelper.java`:

```typescript
export const OFFICE_COORDINATES = {
  latitude: 23.616227, // Replace with your office latitude
  longitude: 87.117063 // Replace with your office longitude
};
```

---

## 2. Office Exit Detection & Checkout Flow

```
+------------------------+
| Employee Checks In     |
| (Distance <= 25m)      |
+-----------+------------+
            |
            v
+------------------------+
| Employee Moves Outside |
| (Distance > 25m)       |
+-----------+------------+
            |
            v
+------------------------+
| Exit Event Recorded    |
| - exitTime recorded    |
| - State =              |
|   PENDING_FINAL_EXIT   |
+-----------+------------+
            |
            v
+------------------------+
| Exit Checkout Prompt   |
| "Confirm Checkout?"    |
+-----+------------+-----+
      |            |
  Confirm        Cancel
      |            |
      v            v
+-----------+  +----------------------+
| CHECKOUT  |  | Active session kept; |
| COMPLETED |  | clears if re-enters  |
+-----------+  +----------------------+
```

1. **Check-In**: Employee checks in inside 25m. Status: `CHECKED_IN`.
2. **Geofence Exit**: GPS updates detect movement $> 25\text{m}$.
   - System records `exitTime` and `lastExitTime`.
   - Record transitions to `PENDING_FINAL_EXIT`.
3. **Exit Checkout Confirmation**:
   - An interactive prompt displays on screen: *"You have moved outside the 25m office boundary. Confirm checkout now?"*
   - If confirmed, checkout coordinates are stored and record transitions to `FINALIZED_CHECKOUT`.
   - If cancelled or if employee steps back inside 25m, the exit status resets.

---

## 3. Precise GPS Address Engine & Reverse Geocoding

1. **Single Formatter**: `formatPreciseAddress()` standardizes reverse-geocoded addresses across the entire application.
2. **Strict Coordinate Isolation**:
   - Check-in address is derived *only* from `checkInLatitude` / `checkInLongitude`.
   - Checkout address is derived *only* from `checkoutLatitude` / `checkoutLongitude`.
   - Live position address is derived *only* from current live GPS coordinates.
3. **Race Condition Protection**: Asynchronous requests are sequence-tracked so older responses never overwrite newer coordinates.
4. **Coordinate-Keyed Cache**: Addresses are cached by rounded coordinate keys (`lat_lng`) in memory and localStorage to prevent unnecessary API calls and stale display bugs.
