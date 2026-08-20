import { formatInTimeZone } from 'date-fns-tz';

export interface LocationDetail {
  time: string;
  location: string;
  distance: string;
  isUnresolved?: boolean;
}

export interface CurrentLocationDetail {
  status: 'LIVE' | 'RECENT' | 'STALE' | 'Location unavailable';
  location: string;
  distance: string;
  updatedAt?: string;
}

export const AUTHORIZED_OFFICE = {
  latitude: 23.616227,
  longitude: 87.117063,
  radius: 25 // meters
};

/**
 * Calculates Haversine distance in meters between two coordinates.
 */
export function getDistanceFromLatLonInM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Radius of the Earth in m
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

/**
 * Utility to convert raw dates to Asia/Kolkata ISO string.
 */
export function toKolkataString(date: Date | string | number): string {
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '';
    return formatInTimeZone(d, 'Asia/Kolkata', "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
  } catch {
    return '';
  }
}

/**
 * Formats check-in location forensics
 */
export function getCheckInLocationDetails(record: any): LocationDetail {
  if (!record) {
    return { time: 'Pending', location: 'Location unavailable', distance: '—' };
  }
  const time = record.checkInTime || 'Pending';
  const lat = record.checkInLatitude ?? record.latitude;
  const lon = record.checkInLongitude ?? record.longitude;

  if (lat === undefined || lon === undefined || lat === 0 || lon === 0) {
    return { time, location: record.townCity || 'Location unavailable', distance: '—' };
  }

  const dist = getDistanceFromLatLonInM(
    lat,
    lon,
    AUTHORIZED_OFFICE.latitude,
    AUTHORIZED_OFFICE.longitude
  );

  return {
    time,
    location: record.townCity || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    distance: dist <= AUTHORIZED_OFFICE.radius ? 'Within office radius' : `${Math.round(dist)}m from office`
  };
}

/**
 * Formats check-out location forensics
 */
export function getCheckoutLocationDetails(record: any): LocationDetail {
  if (!record) {
    return { time: 'Pending', location: 'Location unavailable', distance: '—' };
  }

  const isUnresolved =
    record.checkoutStatus === 'UNRESOLVED' ||
    record.checkOutTime === 'UNRESOLVED';

  const time = isUnresolved
    ? 'UNRESOLVED'
    : record.checkOutTime || record.lastExitTime || record.exitTime || 'Pending';

  const lat = record.checkoutLatitude;
  const lon = record.checkoutLongitude;

  if (lat === undefined || lon === undefined || lat === 0 || lon === 0) {
    return {
      time,
      location: record.checkoutTownCity || 'Location unavailable',
      distance: '—',
      isUnresolved
    };
  }

  const dist = getDistanceFromLatLonInM(
    lat,
    lon,
    AUTHORIZED_OFFICE.latitude,
    AUTHORIZED_OFFICE.longitude
  );

  return {
    time,
    location: record.checkoutTownCity || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    distance: dist <= AUTHORIZED_OFFICE.radius ? 'Within office radius' : `${Math.round(dist)}m from office`,
    isUnresolved
  };
}

/**
 * Formats and evaluates the active live background coordinate update status
 */
export function getCurrentLocationDetails(record: any, liveLocDoc: any): CurrentLocationDetail {
  if (!record) {
    return { status: 'Location unavailable', location: 'Location unavailable', distance: '—' };
  }

  // Attendance completed or resolved: no longer live-tracked
  const isCompleted =
    record.checkoutStatus === 'COMPLETED' ||
    (!!record.checkOutTime &&
      record.checkOutTime !== 'Pending' &&
      record.checkOutTime !== 'N/A' &&
      record.checkOutTime !== 'UNRESOLVED');

  if (isCompleted) {
    return { status: 'Location unavailable', location: 'Session completed', distance: '—' };
  }

  const targetDoc = liveLocDoc || record;
  const lat = targetDoc.latitude ?? targetDoc.currentLatitude;
  const lon = targetDoc.longitude ?? targetDoc.currentLongitude;

  if (lat === undefined || lon === undefined || lat === 0 || lon === 0) {
    return { status: 'Location unavailable', location: 'No GPS signal received', distance: '—' };
  }

  const updateTime = targetDoc.updatedAt || targetDoc.timestamp;
  let status: 'LIVE' | 'RECENT' | 'STALE' | 'Location unavailable' = 'STALE';
  let statusText = 'STALE';
  let isFresh = false;

  if (updateTime) {
    try {
      const now = new Date();
      const lastUpdate = new Date(updateTime);
      const diffMs = now.getTime() - lastUpdate.getTime();
      const ageSec = Math.floor(diffMs / 1000);
      const ageMin = Math.floor(diffMs / 60000);

      if (diffMs > 0) {
        if (ageSec < 60) {
          status = 'LIVE';
          statusText = ageSec < 15 ? 'Live · Updated just now' : `Live · Updated ${ageSec} sec ago`;
          isFresh = true;
        } else if (ageMin < 3) {
          status = 'RECENT';
          statusText = `Last updated ${ageMin} min ago`;
          isFresh = true;
        } else {
          status = 'STALE';
          statusText = `Stale · Last seen ${ageMin} min ago`;
        }
      }
    } catch {
      status = 'STALE';
      statusText = 'Stale';
    }
  }

  // Only calculate current distance and geocode name if state is fresh (< 3 mins)
  if (isFresh) {
    const calculatedMeters = getDistanceFromLatLonInM(
      lat,
      lon,
      AUTHORIZED_OFFICE.latitude,
      AUTHORIZED_OFFICE.longitude
    );

    return {
      status,
      location: targetDoc.townCity || `${lat.toFixed(5)}, ${lon.toFixed(5)} (${statusText})`,
      distance: calculatedMeters <= AUTHORIZED_OFFICE.radius ? 'Within office radius' : `${Math.round(calculatedMeters)}m from office`,
      updatedAt: updateTime
    };
  }

  return {
    status: 'STALE',
    location: targetDoc.townCity || `${lat.toFixed(5)}, ${lon.toFixed(5)} (Stale)`,
    distance: '—',
    updatedAt: updateTime
  };
}

export function isValidCoordinatePair(lat: any, lon: any): boolean {
  if (lat === undefined || lon === undefined || lat === null || lon === null) return false;
  const numLat = Number(lat);
  const numLon = Number(lon);
  if (isNaN(numLat) || isNaN(numLon)) return false;
  return numLat >= -90 && numLat <= 90 && numLon >= -180 && numLon <= 180 && !(numLat === 0 && numLon === 0);
}

export function isAttendanceCheckoutUnresolved(record: any): boolean {
  if (!record) return false;
  return (
    record.checkoutStatus === 'UNRESOLVED' ||
    record.checkOutTime === 'UNRESOLVED'
  );
}

export function getEffectiveCheckoutStatus(record: any): string {
  if (!record) return 'PENDING';
  if (record.checkoutStatus) return record.checkoutStatus;
  if (record.checkOutTime && record.checkOutTime !== 'Pending' && record.checkOutTime !== 'N/A' && record.checkOutTime !== 'UNRESOLVED') {
    return 'COMPLETED';
  }
  return 'PENDING';
}

export function calculateWorkingHours(checkIn: string, checkOut: string): string | null {
  if (!checkIn || !checkOut || checkOut === 'Pending' || checkOut === 'N/A' || checkOut === 'UNRESOLVED') return null;
  try {
    const parseTime = (tStr: string) => {
      const parts = tStr.split(':');
      if (parts.length < 2) return null;
      let hh = parseInt(parts[0], 10);
      let mm = parseInt(parts[1], 10);
      const isPm = tStr.toLowerCase().includes('pm');
      const isAm = tStr.toLowerCase().includes('am');
      if (isPm && hh < 12) hh += 12;
      if (isAm && hh === 12) hh = 0;
      return hh * 60 + mm;
    };

    const inMins = parseTime(checkIn);
    const outMins = parseTime(checkOut);
    if (inMins === null || outMins === null) return null;

    let diff = outMins - inMins;
    if (diff < 0) diff += 24 * 60; // Next-day boundary handling

    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    return `${hrs}h ${mins}m`;
  } catch {
    return null;
  }
}
