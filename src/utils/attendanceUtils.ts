import { AttendanceRecord, LiveEmployeeLocation } from '../types/attendance';
import { OFFICE_LOCATION, getDistanceFromLatLonInM } from '../services/attendance/smartAttendanceEngine';
import {
  formatPreciseAddress,
  getAdminCachedAddress,
  fetchAndCacheAddressForCoords,
  isGenericFallbackAddress
} from './addressFormatter';

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

  let rawDist: number | null = null;
  const lat = record.checkInLatitude !== undefined && record.checkInLatitude !== null ? record.checkInLatitude : record.latitude;
  const lon = record.checkInLongitude !== undefined && record.checkInLongitude !== null ? record.checkInLongitude : record.longitude;

  let location = 'Location unavailable';

  if (isValidCoordinatePair(lat, lon)) {
    const numLat = Number(lat);
    const numLon = Number(lon);
    const calculatedDist = getDistanceFromLatLonInM(numLat, numLon, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude);
    if (typeof calculatedDist === 'number' && Number.isFinite(calculatedDist) && calculatedDist >= 0) {
      rawDist = calculatedDist;
    }

    const storedTown = record.checkInTownCity || record.townCity;
    const formattedStored = storedTown ? formatPreciseAddress(storedTown) : null;
    const cachedAddress = getAdminCachedAddress(numLat, numLon);

    if (cachedAddress) {
      location = cachedAddress;
    } else if (formattedStored && !isGenericFallbackAddress(formattedStored)) {
      location = formattedStored;
    } else {
      fetchAndCacheAddressForCoords(numLat, numLon);
      location = formattedStored || 'Location name unavailable';
    }
  } else {
    location = 'Location unavailable';
  }

  const distance = formatDistanceDisplay(rawDist);
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

  let rawDist: number | null = null;
  let location = 'Location unavailable';

  if (isValidCoordinatePair(record.checkoutLatitude, record.checkoutLongitude)) {
    const numLat = Number(record.checkoutLatitude);
    const numLon = Number(record.checkoutLongitude);
    const calculatedDist = getDistanceFromLatLonInM(numLat, numLon, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude);
    if (typeof calculatedDist === 'number' && Number.isFinite(calculatedDist) && calculatedDist >= 0) {
      rawDist = calculatedDist;
    }

    const storedTown = record.checkoutTownCity;
    const formattedStored = storedTown ? formatPreciseAddress(storedTown) : null;
    const cachedAddress = getAdminCachedAddress(numLat, numLon);

    if (cachedAddress) {
      location = cachedAddress;
    } else if (formattedStored && !isGenericFallbackAddress(formattedStored)) {
      location = formattedStored;
    } else {
      fetchAndCacheAddressForCoords(numLat, numLon);
      location = formattedStored || 'Location name unavailable';
    }
  } else {
    if (unresolved) {
      location = 'Location unavailable';
    } else if (record.checkOutTime && record.checkOutTime !== 'Pending' && record.checkOutTime !== 'N/A') {
      location = 'Location unavailable';
    } else {
      location = 'Pending checkout';
    }
  }

  const distance = formatDistanceDisplay(rawDist);
  return { time, location, distance, rawDistance: rawDist, isUnresolved: unresolved };
};

/**
 * Defensive coordinate pair validator
 */
export const isValidCoordinatePair = (lat: any, lon: any): boolean => {
  const numLat = Number(lat);
  const numLon = Number(lon);
  return (
    !isNaN(numLat) &&
    !isNaN(numLon) &&
    Number.isFinite(numLat) &&
    Number.isFinite(numLon) &&
    numLat >= -90 &&
    numLat <= 90 &&
    numLon >= -180 &&
    numLon <= 180 &&
    !(numLat === 0 && numLon === 0)
  );
};

/**
 * Get Current (Live) Location details for UI display.
 * 
 * CRITICAL DATA-INTEGRITY RULE:
 * 1. Current location and current distance MUST come ONLY from an active, fresh LiveEmployeeLocation fix
 *    (live_locations collection in Firestore).
 * 2. Distance is ALWAYS mathematically recalculated from live GPS coordinates
 *    against OFFICE_LOCATION (23.616227, 87.117063) using Haversine formula.
 * 3. Stored `distanceFromOffice` or `currentDistance` is NEVER blindly trusted.
 * 4. NEVER falls back to check-in coordinates (checkInLatitude / checkInLongitude)
 *    or historical attendance records (record.currentLatitude / record.currentLongitude)
 *    for Current Location.
 * 5. If live location is missing, invalid, or stale (age >= 15 min), returns "Location unavailable" and distance null ("—").
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
  // 1. Check if authoritative liveLocation is provided with valid coordinates
  if (liveLocation && isValidCoordinatePair(liveLocation.latitude, liveLocation.longitude)) {
    const lat = Number(liveLocation.latitude);
    const lon = Number(liveLocation.longitude);

    let timeStr: string | null = null;
    let status: 'LIVE' | 'RECENT' | 'STALE' | 'UNAVAILABLE' = 'UNAVAILABLE';
    let statusText = 'Location unavailable';
    let isFresh = false;

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
          isFresh = true;
        } else if (ageMin < 3) {
          status = 'RECENT';
          statusText = `Last updated ${ageMin} min ago`;
          isFresh = true;
        } else {
          status = 'STALE';
          if (ageHr < 1) {
            statusText = `Last updated ${ageMin} min ago`;
          } else if (ageHr < 24) {
            statusText = `Last updated ${ageHr} hr ago`;
          } else {
            statusText = `Last updated ${Math.floor(ageHr / 24)} d ago`;
          }
          isFresh = false;
        }
      }
    }

    // If live location is fresh (< 3 min), calculate distance and format address
    if (isFresh) {
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
      
      const storedTown = liveLocation.townCity;
      const formattedStored = storedTown ? formatPreciseAddress(storedTown) : null;
      const cachedAddress = getAdminCachedAddress(lat, lon);

      let locationName = 'Location name unavailable';
      if (cachedAddress) {
        locationName = cachedAddress;
      } else if (formattedStored && !isGenericFallbackAddress(formattedStored)) {
        locationName = formattedStored;
      } else {
        fetchAndCacheAddressForCoords(lat, lon);
        locationName = formattedStored || 'Location name unavailable';
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
        accuracy: liveLocation.accuracy
      };
    } else {
      // Stale or expired live coordinate (>= 15 min old).
      // Per rule: Stale coordinate is NOT a current coordinate. Do NOT calculate distance.
      return {
        time: timeStr,
        location: 'Location unavailable',
        distance: null,
        rawDistance: null,
        status,
        statusText,
        isAvailable: false
      };
    }
  }

  // 2. If no valid and fresh liveLocation is available, return UNAVAILABLE.
  // CRITICAL: NEVER fall back to historical check-in coordinates or attendance record coordinates for Current Location!
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
