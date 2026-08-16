import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { OFFICE_LOCATION, getDistanceFromLatLonInM } from '../attendance/smartAttendanceEngine';
import { LiveEmployeeLocation } from '../../types/attendance';

export interface UpdateLiveLocationParams {
  employeeId: string;
  employeeName?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  distanceFromOffice?: number | null;
  townCity?: string | null;
  timestamp?: string | Date | number;
  force?: boolean;
}

/**
 * Defensive coordinate validation
 */
export const isValidGpsCoordinate = (lat: any, lon: any): boolean => {
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
 * Format live distance from office in meters (<1000m) or kilometers (>=1000m).
 */
export const formatLiveDistance = (meters: number | null | undefined): string | null => {
  if (typeof meters !== 'number' || isNaN(meters) || !Number.isFinite(meters) || meters < 0) {
    return null;
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m from office`;
  }
  return `${(meters / 1000).toFixed(2)} km from office`;
};

/**
 * Determine location freshness based on timestamp age.
 * Rules:
 * < 2 minutes: LIVE
 * 2–15 minutes: RECENT
 * > 15 minutes: STALE
 * No live location: UNAVAILABLE
 */
export const getLiveLocationFreshness = (timestampIso?: string | null): {
  status: 'LIVE' | 'RECENT' | 'STALE' | 'UNAVAILABLE';
  statusText: string;
  ageMinutes: number | null;
} => {
  if (!timestampIso) {
    return { status: 'UNAVAILABLE', statusText: 'Location unavailable', ageMinutes: null };
  }

  const dateObj = new Date(timestampIso);
  if (isNaN(dateObj.getTime())) {
    return { status: 'UNAVAILABLE', statusText: 'Location unavailable', ageMinutes: null };
  }

  const ageMs = Math.max(0, Date.now() - dateObj.getTime());
  const ageSec = Math.floor(ageMs / 1000);
  const ageMin = Math.floor(ageMs / 60000);
  const ageHr = Math.floor(ageMs / 3600000);

  if (ageMin < 2) {
    const text = ageSec < 15 ? 'Live · Updated just now' : `Live · Updated ${ageSec} sec ago`;
    return { status: 'LIVE', statusText: text, ageMinutes: ageMin };
  }

  if (ageMin < 15) {
    return { status: 'RECENT', statusText: `Last updated ${ageMin} min ago`, ageMinutes: ageMin };
  }

  let text = `Last updated ${ageMin} min ago`;
  if (ageHr >= 24) {
    text = `Last updated ${Math.floor(ageHr / 24)} d ago`;
  } else if (ageHr >= 1) {
    text = `Last updated ${ageHr} hr ago`;
  }

  return { status: 'STALE', statusText: text, ageMinutes: ageMin };
};

/**
 * Recalculate distance and extract live location details for an employee.
 * Authoritatively computes distance from liveLocation coordinates against OFFICE_LOCATION (23.616227, 87.117063).
 * DOES NOT blindly trust stored distanceFromOffice.
 * NEVER falls back to check-in coordinates.
 */
export const extractLiveEmployeeDetails = (liveLoc?: LiveEmployeeLocation | null): {
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
  if (!liveLoc || !isValidGpsCoordinate(liveLoc.latitude, liveLoc.longitude)) {
    return {
      time: null,
      location: 'Location unavailable',
      distance: null,
      rawDistance: null,
      status: 'UNAVAILABLE',
      statusText: 'Location unavailable',
      isAvailable: false,
    };
  }

  // Recalculate distance dynamically using Haversine against authoritative office coordinates
  const recalculatedDistance = getDistanceFromLatLonInM(
    liveLoc.latitude,
    liveLoc.longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  const formattedDistance = formatLiveDistance(recalculatedDistance);
  const freshness = getLiveLocationFreshness(liveLoc.timestamp);

  let timeStr: string | null = null;
  if (liveLoc.timestamp) {
    const d = new Date(liveLoc.timestamp);
    if (!isNaN(d.getTime())) {
      timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  }

  return {
    time: timeStr,
    location: (liveLoc.townCity && liveLoc.townCity.trim()) ? liveLoc.townCity.trim() : 'Location name unavailable',
    distance: formattedDistance,
    rawDistance: recalculatedDistance,
    status: freshness.status,
    statusText: freshness.statusText,
    isAvailable: true,
    latitude: liveLoc.latitude,
    longitude: liveLoc.longitude,
    accuracy: liveLoc.accuracy,
  };
};

// In-memory cache & throttle state for Firestore live location writes
interface LiveWriteState {
  lastPersistedTime: number;
  lastPersistedLat: number;
  lastPersistedLon: number;
  pendingParams: UpdateLiveLocationParams | null;
  timer: any | null;
}

const liveWriteCache = new Map<string, LiveWriteState>();

const executeLiveLocationWrite = async (params: UpdateLiveLocationParams): Promise<boolean> => {
  const { employeeId, employeeName, latitude, longitude, accuracy, townCity, timestamp } = params;

  // Authoritative Haversine distance calculation from OFFICE_LOCATION
  const calculatedDistance = getDistanceFromLatLonInM(
    latitude,
    longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  let fixTimestampIso: string;
  if (timestamp instanceof Date) {
    fixTimestampIso = timestamp.toISOString();
  } else if (typeof timestamp === 'number') {
    fixTimestampIso = new Date(timestamp).toISOString();
  } else if (typeof timestamp === 'string' && timestamp.trim()) {
    fixTimestampIso = new Date(timestamp).toISOString();
  } else {
    fixTimestampIso = new Date().toISOString();
  }

  const cleanTownCity = (townCity && townCity.trim()) ? townCity.trim() : 'Raniganj HQ';

  const liveDocPayload: LiveEmployeeLocation = {
    employeeId: employeeId.trim(),
    employeeName: (employeeName && employeeName.trim()) ? employeeName.trim() : '',
    latitude,
    longitude,
    accuracy: (typeof accuracy === 'number' && Number.isFinite(accuracy)) ? accuracy : null,
    distanceFromOffice: calculatedDistance,
    townCity: cleanTownCity,
    timestamp: fixTimestampIso,
    updatedAt: new Date().toISOString(),
    source: 'watchPosition'
  };

  try {
    const docRef = doc(db, 'live_locations', employeeId.trim());
    await setDoc(docRef, liveDocPayload, { merge: true });

    console.log('[LIVE_LOCATION_PERSISTED]', {
      employeeId,
      latitude,
      longitude,
      distanceFromOffice: calculatedDistance,
      townCity: cleanTownCity,
      timestamp: fixTimestampIso
    });
    return true;
  } catch (err) {
    console.warn('[updateLiveEmployeeLocation] Error saving live location:', err);
    return false;
  }
};

/**
 * Writes or updates the employee's live location document in Firestore:
 * live_locations/{employeeId}
 * 
 * Throttles writes to at most once per 30 seconds unless force is true or user moved >=20m.
 */
export const updateLiveEmployeeLocation = async (params: UpdateLiveLocationParams): Promise<boolean> => {
  const { employeeId, latitude, longitude, force } = params;

  if (!employeeId || !employeeId.trim()) {
    return false;
  }

  const empId = employeeId.trim();

  // 1. Validate coordinates
  if (!isValidGpsCoordinate(latitude, longitude)) {
    console.warn('[updateLiveEmployeeLocation] Ignored invalid GPS coordinates:', { employeeId: empId, latitude, longitude });
    return false;
  }

  let state = liveWriteCache.get(empId);
  if (!state) {
    state = {
      lastPersistedTime: 0,
      lastPersistedLat: 0,
      lastPersistedLon: 0,
      pendingParams: null,
      timer: null
    };
    liveWriteCache.set(empId, state);
  }

  const now = Date.now();
  const timeSinceLastWrite = now - state.lastPersistedTime;
  const distMoved = getDistanceFromLatLonInM(latitude, longitude, state.lastPersistedLat, state.lastPersistedLon);

  const shouldWriteNow = force || state.lastPersistedTime === 0 || timeSinceLastWrite >= 30000 || distMoved >= 20;

  if (shouldWriteNow) {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    state.pendingParams = null;
    state.lastPersistedTime = now;
    state.lastPersistedLat = latitude;
    state.lastPersistedLon = longitude;

    return executeLiveLocationWrite(params);
  } else {
    // Coalesce into pending write
    state.pendingParams = params;
    if (!state.timer) {
      const delay = Math.max(1000, 30000 - timeSinceLastWrite);
      state.timer = setTimeout(() => {
        if (state && state.pendingParams) {
          const p = state.pendingParams;
          state.pendingParams = null;
          state.timer = null;
          state.lastPersistedTime = Date.now();
          state.lastPersistedLat = p.latitude;
          state.lastPersistedLon = p.longitude;
          executeLiveLocationWrite(p);
        }
      }, delay);
    }
    return true;
  }
};
