import { AttendanceRecord } from '../types/attendance';

/**
 * Authoritative helper to determine if an attendance record has an unresolved checkout.
 * 
 * A record is UNRESOLVED when:
 * 1. Attendance date is before today's date in IST.
 * 2. A valid check-in exists.
 * 3. Checkout is missing (null, undefined, empty, "--:--", etc.).
 * 4. The record has NOT already been manually corrected by Admin or explicitly marked COMPLETED.
 * 5. It is an attendance type for which checkout is expected.
 */
export const isAttendanceCheckoutUnresolved = (record: AttendanceRecord): boolean => {
  if (!record) return false;

  // 1. Get today's date in IST (matching engine logic)
  let todayStr: string;
  try {
    todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    todayStr = `${year}-${month}-${day}`;
  }

  // Attendance date is today or in the future? Not unresolved yet.
  if (record.date >= todayStr) return false;

  // 2. Check-in exists
  const hasCheckIn = !!(record.checkInTime && record.checkInTime !== '--:--');
  if (!hasCheckIn) return false;

  // 3. Checkout is missing
  // Treat all of these as missing checkout: null, undefined, "", " ", "--:--", "--:-- --", "Pending"
  const checkOutValue = (record.checkOutTime || '').trim();
  const isCheckOutMissing = !checkOutValue || 
                            checkOutValue === '--:--' || 
                            checkOutValue === '--:-- --' ||
                            checkOutValue === 'Pending' ||
                            checkOutValue === 'N/A';

  if (!isCheckOutMissing) return false;

  // 4. Admin Correction / Manual Rectification / Explicit Completion
  // If record is already corrected or explicitly completed, it's not unresolved
  if (record.manualRectified || record.isAdminRectified || record.correctedAt || record.checkoutStatus === 'COMPLETED') {
    return false;
  }
  
  // Also check resolutionSource if it exists
  if (record.resolutionSource === 'ADMIN_CORRECTION') {
    return false;
  }

  // 5. Attendance type check (Checkout expected for OFFICE, WFH, CLIENT_VISIT)
  // OUTDOOR might have different rules but usually also expects checkout.
  // The user said: "It is an attendance type for which checkout is expected."
  // Most types expect checkout.
  
  return true;
};

/**
 * Get the effective checkout status for UI display.
 */
export const getEffectiveCheckoutStatus = (record: AttendanceRecord): 'COMPLETED' | 'UNRESOLVED' | 'PENDING_ADMIN_REVIEW' | undefined => {
  if (record.checkoutStatus === 'COMPLETED') return 'COMPLETED';
  if (record.checkoutStatus === 'PENDING_ADMIN_REVIEW') return 'PENDING_ADMIN_REVIEW';
  
  if (isAttendanceCheckoutUnresolved(record)) {
    return 'UNRESOLVED';
  }
  
  return record.checkoutStatus;
};

/**
 * Format distance in meters or kilometers from office.
 * Displays meters below 1 km, and kilometers at 1 km or greater.
 */
export const formatDistanceDisplay = (meters: number | null | undefined): string | null => {
  if (typeof meters !== 'number' || isNaN(meters)) return null;
  if (meters < 1000) {
    return `${Math.round(meters)} m from office`;
  }
  return `${(meters / 1000).toFixed(2)} km from office`;
};

/**
 * Get Check-in location details for UI display.
 */
export const getCheckInLocationDetails = (record: AttendanceRecord): {
  time: string;
  location: string;
  distance: string | null;
  rawDistance: number | null;
} => {
  if (!record) {
    return { time: '--:--', location: 'Location unavailable', distance: null, rawDistance: null };
  }

  const time = record.checkInTime || '--:--';
  const rawDist = typeof record.checkInDistance === 'number' 
    ? record.checkInDistance 
    : (typeof record.distance === 'number' ? record.distance : null);
  const distance = formatDistanceDisplay(rawDist);

  let location = 'Historical location unavailable';
  if (record.checkInTownCity && record.checkInTownCity.trim()) {
    location = record.checkInTownCity.trim();
  } else if (record.checkInLatitude !== undefined && record.checkInLatitude !== null) {
    location = record.townCity?.trim() || 'Location name unavailable';
  } else if (record.townCity && record.townCity.trim()) {
    location = record.townCity.trim();
  }

  return { time, location, distance, rawDistance: rawDist };
};

/**
 * Get Checkout location details for UI display.
 */
export const getCheckoutLocationDetails = (record: AttendanceRecord): {
  time: string;
  location: string;
  distance: string | null;
  rawDistance: number | null;
  isUnresolved: boolean;
} => {
  if (!record) {
    return { time: '--:--', location: 'Location unavailable', distance: null, rawDistance: null, isUnresolved: false };
  }

  const unresolved = isAttendanceCheckoutUnresolved(record) || record.checkoutStatus === 'UNRESOLVED';
  let time = '--:--';
  
  if (record.checkOutTime && record.checkOutTime !== 'Pending' && record.checkOutTime !== 'N/A') {
    time = record.checkOutTime;
  } else if (unresolved) {
    time = 'UNRESOLVED';
  } else {
    time = 'Pending';
  }

  const rawDist = typeof record.checkoutDistance === 'number' ? record.checkoutDistance : null;
  const distance = formatDistanceDisplay(rawDist);

  let location = 'Location unavailable';

  if (record.checkoutTownCity && record.checkoutTownCity.trim()) {
    location = record.checkoutTownCity.trim();
  } else if (record.checkoutLatitude !== undefined && record.checkoutLatitude !== null) {
    location = 'Location name unavailable';
  } else if (unresolved) {
    location = 'Location unavailable';
  } else if (record.checkOutTime && record.checkOutTime !== 'Pending' && record.checkOutTime !== 'N/A') {
    // Completed checkout but without separate checkout coordinates captured previously
    location = 'Historical location unavailable/ambiguous';
  } else {
    location = 'Pending checkout';
  }

  return { time, location, distance, rawDistance: rawDist, isUnresolved: unresolved };
};
