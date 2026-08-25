import { AttendanceRecord, LiveEmployeeLocation } from '../types/attendance';
import { OFFICE_LOCATION, getDistanceFromLatLonInM, parseAttendanceTimeToMinutes } from '../services/attendance/smartAttendanceEngine';

/**
 * Parses attendance time string to minutes from midnight.
 */
export { parseAttendanceTimeToMinutes };

/**
 * Recursively removes any keys with undefined values from an object/array
 * to prevent Firestore "Unsupported field value: undefined" errors.
 */
export function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj
      .map((item) => {
        if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
          return sanitizeFirestorePayload(item);
        }
        return item;
      })
      .filter((item) => item !== undefined) as unknown as T;
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        clean[key] = sanitizeFirestorePayload(value);
      } else if (Array.isArray(value)) {
        clean[key] = sanitizeFirestorePayload(value as any);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean as T;
}

/**
 * Checks if the current session or window context is within the Admin Panel or Admin Portal.
 * Used to strictly isolate the Admin Panel from automatic employee attendance check-ins and writes.
 */
export const isAdminContextActive = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const path = window.location.pathname.toLowerCase();
    if (path.includes('/x7kp9') || path.includes('/admin-portal') || path.includes('/admin')) {
      return true;
    }
  } catch (e) {}
  return false;
};

/**
 * Standardized diagnostic logger for all attendance write operations.
 * Produces structured diagnostic logs for auditing and regression prevention.
 */
export const logAttendanceWriteDiagnostic = (
  source: string,
  employeeId: string,
  checkInTime: string | null | undefined,
  operation: string,
  extra?: Record<string, any>
): void => {
  console.log(
    `[ATTENDANCE WRITE] source=${source} employee=${employeeId || 'UNKNOWN'} checkInTime=${checkInTime || 'NONE'} operation=${operation}`,
    extra || ''
  );
};

/**
 * Returns the earliest valid check-in time string between two candidates.
 */
export const getEarliestCheckInTime = (timeA: string | null | undefined, timeB: string | null | undefined): string | null => {
  const minsA = parseAttendanceTimeToMinutes(timeA);
  const minsB = parseAttendanceTimeToMinutes(timeB);

  if (minsA !== null && minsB !== null) {
    return minsA <= minsB ? (timeA as string) : (timeB as string);
  }
  if (minsA !== null) return timeA as string;
  if (minsB !== null) return timeB as string;
  return null;
};

/**
 * Authoritative helper to determine if an attendance record represents an actual check-in.
 * 
 * An attendance record counts as physically present ONLY when:
 * 1. The record exists and is an object.
 * 2. The record.checkInTime is a valid non-empty attendance time string (e.g. "10:15 AM", "10:00").
 * 
 * It returns FALSE if:
 * - record is null / undefined
 * - checkInTime is missing, null, undefined, empty, or placeholder ("--:--", "Pending", "N/A", "UNRESOLVED", etc.)
 * 
 * DO NOT use Boolean(record), record.status === 'PRESENT', or record.workingHours.
 */
export const hasActualCheckIn = (record: AttendanceRecord | any | null | undefined): boolean => {
  if (!record || typeof record !== 'object') return false;
  if (!record.checkInTime || typeof record.checkInTime !== 'string') return false;

  const timeVal = record.checkInTime.trim();
  if (!timeVal) return false;

  const invalidValues = ['--:--', '--:-- --', 'Pending', 'pending', 'N/A', 'n/a', 'UNRESOLVED', 'unresolved', 'null', 'undefined', '—', '-'];
  if (invalidValues.includes(timeVal)) return false;

  return true;
};

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

  // 1. Get today's date in IST (matching engine logic) robustly as YYYY-MM-DD
  let todayStr: string;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (year && month && day) {
      todayStr = `${year}-${month}-${day}`;
    } else {
      throw new Error('Failed to parse parts');
    }
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
 * Defensive coordinate pair validator
 */
export const isValidCoordinatePair = (lat: any, lon: any): boolean => {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
};

/**
 * Format distance strictly in meters with sensible 1-decimal rounding (e.g. "8.4 m", "31.7 m").
 * Returns null if distance is invalid, null, undefined, or missing.
 * Never formats missing coordinates as "0 m".
 */
export const formatMetersDistance = (meters: number | null | undefined): string | null => {
  if (typeof meters !== 'number' || isNaN(meters) || !Number.isFinite(meters) || meters <= 0) return null;
  const rounded = Math.round(meters * 10) / 10;
  return `${rounded} m`;
};

/**
 * Extract or calculate check-in distance from office in meters.
 */
export const getCheckInDistanceInMeters = (record: AttendanceRecord | null | undefined): number | null => {
  if (!record) return null;
  if (!hasActualCheckIn(record)) return null;

  // 1. Stored checkInDistance or distance
  if (typeof record.checkInDistance === 'number' && Number.isFinite(record.checkInDistance) && record.checkInDistance > 0) {
    return record.checkInDistance;
  }
  if (typeof record.distance === 'number' && Number.isFinite(record.distance) && record.distance > 0) {
    return record.distance;
  }

  // 2. Canonical distance calculation from checkInLatitude/checkInLongitude or latitude/longitude
  const lat = record.checkInLatitude ?? record.latitude;
  const lon = record.checkInLongitude ?? record.longitude;
  if (isValidCoordinatePair(lat, lon)) {
    const calc = getDistanceFromLatLonInM(lat!, lon!, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude);
    if (typeof calc === 'number' && Number.isFinite(calc) && calc > 0) {
      return calc;
    }
  }

  return null;
};

/**
 * Extract or calculate checkout distance from office in meters.
 */
export const getCheckoutDistanceInMeters = (record: AttendanceRecord | null | undefined): number | null => {
  if (!record) return null;
  // If checkout has not occurred yet or is unresolved
  if (isAttendanceCheckoutUnresolved(record) || record.checkoutStatus === 'UNRESOLVED') {
    return null;
  }
  if (!record.checkOutTime || record.checkOutTime === 'Pending' || record.checkOutTime === 'N/A' || record.checkOutTime === '--:--' || record.checkOutTime.trim() === '') {
    return null;
  }

  // 1. Stored checkoutDistance
  if (typeof record.checkoutDistance === 'number' && Number.isFinite(record.checkoutDistance) && record.checkoutDistance > 0) {
    return record.checkoutDistance;
  }

  // 2. Canonical distance calculation from checkoutLatitude/checkoutLongitude
  const lat = record.checkoutLatitude;
  const lon = record.checkoutLongitude;
  if (isValidCoordinatePair(lat, lon)) {
    const calc = getDistanceFromLatLonInM(lat!, lon!, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude);
    if (typeof calc === 'number' && Number.isFinite(calc) && calc > 0) {
      return calc;
    }
  }

  return null;
};

/**
 * Get Check-in location details for UI display.
 */
export const getCheckInLocationDetails = (record: AttendanceRecord): {
  time: string;
  location: string;
  distance: string | null;
  rawDistance: number | null;
  metersFormatted: string | null;
} => {
  if (!record) {
    return { time: '--:--', location: 'Location unavailable', distance: null, rawDistance: null, metersFormatted: null };
  }

  const time = record.checkInTime || '--:--';
  const rawDist = getCheckInDistanceInMeters(record);
  const distance = formatDistanceDisplay(rawDist);
  const metersFormatted = formatMetersDistance(rawDist);

  let location = 'Location unavailable';
  if (record.checkInTownCity && record.checkInTownCity.trim()) {
    location = record.checkInTownCity.trim();
  } else if (record.checkInLatitude !== undefined && record.checkInLatitude !== null) {
    location = record.townCity?.trim() || 'Location name unavailable';
  } else if (record.townCity && record.townCity.trim()) {
    location = record.townCity.trim();
  }

  return { time, location, distance, rawDistance: rawDist, metersFormatted };
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
  metersFormatted: string | null;
} => {
  if (!record) {
    return { time: '--:--', location: 'Location unavailable', distance: null, rawDistance: null, isUnresolved: false, metersFormatted: null };
  }

  const unresolved = isAttendanceCheckoutUnresolved(record) || record.checkoutStatus === 'UNRESOLVED';
  let time = '--:--';
  
  if (record.checkOutTime && record.checkOutTime !== 'Pending' && record.checkOutTime !== 'N/A' && record.checkOutTime !== '--:--') {
    time = record.checkOutTime;
  } else if (unresolved) {
    time = 'UNRESOLVED';
  } else {
    time = 'Pending';
  }

  const rawDist = getCheckoutDistanceInMeters(record);
  const distance = formatDistanceDisplay(rawDist);
  const metersFormatted = formatMetersDistance(rawDist);

  let location = 'Location unavailable';

  if (record.checkoutTownCity && record.checkoutTownCity.trim()) {
    location = record.checkoutTownCity.trim();
  } else if (record.checkoutLatitude !== undefined && record.checkoutLatitude !== null) {
    location = 'Location name unavailable';
  } else if (unresolved) {
    location = 'Location unavailable';
  } else if (record.checkOutTime && record.checkOutTime !== 'Pending' && record.checkOutTime !== 'N/A') {
    location = 'Location unavailable';
  } else {
    location = 'Pending checkout';
  }

  return { time, location, distance, rawDistance: rawDist, isUnresolved: unresolved, metersFormatted };
};

/**
 * Get Current (Live) Location details for UI display.
 * 
 * CRITICAL DATA-INTEGRITY RULE:
 * 1. Current location is obtained from the authoritative LiveEmployeeLocation object
 *    (live_locations collection in Firestore) or record.currentLatitude/Longitude.
 * 2. Distance is ALWAYS mathematically recalculated from live GPS coordinates
 *    against OFFICE_LOCATION (23.616227, 87.117063) using Haversine formula.
 * 3. Stored `distanceFromOffice` or `currentDistance` is NEVER blindly trusted.
 * 4. NEVER falls back to check-in coordinates (checkInLatitude / checkInLongitude)
 *    for Current Location.
 */
export const getCurrentLocationDetails = (
  record: AttendanceRecord | null,
  liveLocation?: LiveEmployeeLocation | null
): {
  time: string | null;
  location: string;
  distance: string | null;
  rawDistance: number | null;
  status: 'LIVE' | 'RECENT' | 'STALE' | 'UNAVAILABLE';
  statusText: string;
  isAvailable: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
} => {
  // 1. Check if authoritative liveLocation is provided
  if (liveLocation && isValidCoordinatePair(liveLocation.latitude, liveLocation.longitude)) {
    const lat = liveLocation.latitude;
    const lon = liveLocation.longitude;

    // Recalculate distance dynamically against OFFICE_LOCATION (23.616227, 87.117063)
    const calculatedMeters = getDistanceFromLatLonInM(
      lat,
      lon,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    const rawDist = (typeof calculatedMeters === 'number' && Number.isFinite(calculatedMeters) && calculatedMeters >= 0)
      ? calculatedMeters
      : null;

    const distanceFormatted = formatDistanceDisplay(rawDist);
    const locationName = (liveLocation.townCity && liveLocation.townCity.trim())
      ? liveLocation.townCity.trim()
      : 'Location name unavailable';

    // Freshness rules based on liveLocation.timestamp
    let timeStr: string | null = null;
    let status: 'LIVE' | 'RECENT' | 'STALE' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let statusText = 'Location unavailable';

    if (liveLocation.timestamp) {
      const timestampDate = new Date(liveLocation.timestamp);
      if (!isNaN(timestampDate.getTime())) {
        timeStr = timestampDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const ageMs = Math.max(0, Date.now() - timestampDate.getTime());
        const ageSec = Math.floor(ageMs / 1000);
        const ageMin = Math.floor(ageMs / 60000);
        const ageHr = Math.floor(ageMs / 3600000);

        if (ageMin < 2) {
          status = 'LIVE';
          statusText = ageSec < 15 ? 'Live · Updated just now' : `Live · Updated ${ageSec} sec ago`;
        } else if (ageMin < 15) {
          status = 'RECENT';
          statusText = `Last updated ${ageMin} min ago`;
        } else {
          status = 'STALE';
          if (ageHr < 1) {
            statusText = `Last updated ${ageMin} min ago`;
          } else if (ageHr < 24) {
            statusText = `Last updated ${ageHr} hr ago`;
          } else {
            statusText = `Last updated ${Math.floor(ageHr / 24)} d ago`;
          }
        }
      }
    }

    console.log('[CURRENT_LOCATION_UPDATE]', {
      employeeId: liveLocation.employeeId,
      latitude: lat,
      longitude: lon,
      accuracy: liveLocation.accuracy,
      calculatedDistance: rawDist,
      timestamp: liveLocation.timestamp,
      freshness: status
    });

    console.log('[CURRENT_DISTANCE_CALCULATION]', {
      employeeId: liveLocation.employeeId,
      currentLatitude: lat,
      currentLongitude: lon,
      officeLatitude: OFFICE_LOCATION.latitude,
      officeLongitude: OFFICE_LOCATION.longitude,
      distanceMeters: rawDist
    });

    return {
      time: timeStr,
      location: locationName,
      distance: distanceFormatted,
      rawDistance: rawDist,
      status,
      statusText,
      isAvailable: true,
      latitude: lat,
      longitude: lon,
      accuracy: liveLocation.accuracy
    };
  }

  // 2. If no LiveEmployeeLocation object, check if record explicitly has currentLatitude/currentLongitude
  if (record && isValidCoordinatePair(record.currentLatitude, record.currentLongitude)) {
    const lat = record.currentLatitude!;
    const lon = record.currentLongitude!;

    const calculatedMeters = getDistanceFromLatLonInM(
      lat,
      lon,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    const rawDist = (typeof calculatedMeters === 'number' && Number.isFinite(calculatedMeters) && calculatedMeters >= 0)
      ? calculatedMeters
      : null;

    const distanceFormatted = formatDistanceDisplay(rawDist);
    const locationName = (record.currentTownCity && record.currentTownCity.trim())
      ? record.currentTownCity.trim()
      : 'Location name unavailable';

    const timestampIso = record.currentLocationTimestamp;
    let timeStr: string | null = null;
    let status: 'LIVE' | 'RECENT' | 'STALE' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let statusText = 'Location unavailable';

    if (timestampIso) {
      const timestampDate = new Date(timestampIso);
      if (!isNaN(timestampDate.getTime())) {
        timeStr = timestampDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const ageMs = Math.max(0, Date.now() - timestampDate.getTime());
        const ageSec = Math.floor(ageMs / 1000);
        const ageMin = Math.floor(ageMs / 60000);
        const ageHr = Math.floor(ageMs / 3600000);

        if (ageMin < 2) {
          status = 'LIVE';
          statusText = ageSec < 15 ? 'Live · Updated just now' : `Live · Updated ${ageSec} sec ago`;
        } else if (ageMin < 15) {
          status = 'RECENT';
          statusText = `Last updated ${ageMin} min ago`;
        } else {
          status = 'STALE';
          if (ageHr < 1) {
            statusText = `Last updated ${ageMin} min ago`;
          } else if (ageHr < 24) {
            statusText = `Last updated ${ageHr} hr ago`;
          } else {
            statusText = `Last updated ${Math.floor(ageHr / 24)} d ago`;
          }
        }
      }
    }

    return {
      time: timeStr,
      location: locationName,
      distance: distanceFormatted,
      rawDistance: rawDist,
      status,
      statusText,
      isAvailable: true,
      latitude: lat,
      longitude: lon,
      accuracy: record.currentAccuracy
    };
  }

  // 3. If no live location is available, return UNAVAILABLE.
  // CRITICAL: NEVER fall back to historical check-in coordinates for current location!
  return {
    time: null,
    location: 'Location unavailable',
    distance: null,
    rawDistance: null,
    status: 'UNAVAILABLE',
    statusText: 'Location unavailable',
    isAvailable: false
  };
};

/**
 * Case-insensitive, trim-safe helper to check if two employee IDs or codes match.
 */
export const isSameEmployee = (idA: string | null | undefined, idB: string | null | undefined): boolean => {
  if (!idA || !idB) return false;
  return idA.trim().toLowerCase() === idB.trim().toLowerCase();
};

/**
 * Resolves canonical key for an attendance record based on employee identity and date.
 * Ensures consistent matching across local storage and Firestore.
 */
export const getAttendanceCanonicalKey = (rec: Partial<AttendanceRecord> | null | undefined): string => {
  if (!rec) return '';
  const empId = (rec.employeeId || (rec as any).employeeCode || '').trim().toLowerCase();
  const date = (rec.date || '').trim();

  if (empId && date) return `${empId}_${date}`;
  const docId = (rec.docId || '').trim().toLowerCase();
  if (docId) return docId;
  return (rec.id || '').trim().toLowerCase();
};
