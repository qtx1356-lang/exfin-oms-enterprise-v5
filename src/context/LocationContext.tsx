import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { logStartupTag } from '../services/startup/startupPerformanceLogger';
import { OFFICE_LOCATION, getDistanceFromLatLonInM, getFormattedDateStr } from '../services/attendance/smartAttendanceEngine';
import { 
  handleLocationUpdateForAttendance, 
  initializeBackgroundAttendanceManager, 
  checkBackgroundPermissionStatus, 
  requestBackgroundLocationPermission 
} from '../services/attendance/backgroundAttendanceManager';
import { updateLiveEmployeeLocation } from '../services/location/liveLocationService';
import { getTodayAttendanceRecord } from '../services/attendance/attendanceStorage';
import { isAdminContextActive } from '../utils/attendanceUtils';
import {
  trackResourceCreated,
  trackResourceCleaned,
  getResourceSnapshot
} from '../services/monitoring/performanceDiagnostics';

export interface LocationContextType {
  liveLocation: { latitude: number; longitude: number } | null;
  distance: number | null; // Distance in meters from OFFICE_LOCATION
  formattedDistance: string; // e.g., "20.34 km", "476 m", "25 m", or "—"
  isInsideGeofence: boolean; // distance !== null && distance <= OFFICE_LOCATION.radius
  locationStatus: 'loading' | 'success' | 'error';
  errorMessage: string;
  currentAddress: string;
  refreshLocation: () => Promise<void>;
  requestBackgroundPermission: () => Promise<boolean>;
  backgroundPermissionGranted: boolean;
  locationState: 'UNKNOWN' | 'LOCATING' | 'INSIDE_OFFICE' | 'OUTSIDE_OFFICE' | 'STALE_LOCATION';
  activeAttendanceMode: boolean;
  setActiveAttendanceMode: (active: boolean) => void;
  isGpsOff: boolean;
  isPermissionDenied: boolean;
  isLocationUnavailable: boolean;
}


const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const formatOfficeDistance = (meters: number | null, isStaleOrUpdating: boolean = false): string => {
  if (isStaleOrUpdating || meters === null || meters === undefined || isNaN(meters)) {
    return 'Location updating…';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
};

const getInitialCachedDistance = (): number | null => {
  try {
    const cached = localStorage.getItem('lastKnownDistance');
    if (!cached) return null;

    const value = Number(cached);

    return Number.isFinite(value) && value >= 0
      ? value
      : null;
  } catch {
    return null;
  }
};

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(getInitialCachedDistance);
  const [isFreshFixReceived, setIsFreshFixReceived] = useState<boolean>(false);
  const [stableInsideOffice, setStableInsideOffice] = useState<boolean | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'error'>(() => {
    if (getInitialCachedDistance() !== null) return 'success';
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'error';
    return 'loading';
  });
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isGpsOff, setIsGpsOff] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine && getInitialCachedDistance() === null
  );
  const [isPermissionDenied, setIsPermissionDenied] = useState<boolean>(false);
  const [isLocationUnavailable, setIsLocationUnavailable] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine && getInitialCachedDistance() === null
  );

  const handleError = (err: any) => {
    console.warn('[Location Error Logged]', err);
    if (typeof navigator !== 'undefined' && !navigator.onLine && (distance !== null || getInitialCachedDistance() !== null)) {
      setLocationStatus('success');
      clearErrors();
      return;
    }
    setLocationStatus('error');
    
    const message = err?.message || err || '';
    const code = err?.code;

    // Check Case 1: Permission Denied
    if (code === 1 || /permission|denied/i.test(String(message))) {
      setIsPermissionDenied(true);
      setIsGpsOff(false);
      setIsLocationUnavailable(false);
      setErrorMessage('Location permission is required.');
    }
    // Check Case 2: Location Services/GPS OFF
    else if (code === 2 || /disabled|settings|satisfied|provider/i.test(String(message))) {
      setIsGpsOff(true);
      setIsPermissionDenied(false);
      setIsLocationUnavailable(false);
      setErrorMessage('Location Services are OFF.');
    }
    // Check Case 3: Location Unavailable
    else {
      setIsLocationUnavailable(true);
      setIsPermissionDenied(false);
      setIsGpsOff(false);
      setErrorMessage(String(message) || 'Unable to obtain your current location.');
    }

    // Set today_unavail cached tracking to flag End-Of-Day Location Unavailable later
    try {
      const cachedRaw = localStorage.getItem('cached_registration_data');
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        const empId = parsed.employeeCode || parsed.uid || parsed.id;
        if (empId) {
          const todayStr = getFormattedDateStr();
          localStorage.setItem(`loc_unavail_${empId}_${todayStr}`, 'true');
        }
      }
    } catch (e) {}
  };

  const clearErrors = () => {
    setIsPermissionDenied(false);
    setIsGpsOff(false);
    setIsLocationUnavailable(false);
    setErrorMessage('');
  };
  const [currentAddress, setCurrentAddress] = useState<string>(() => {
    try {
      const cached = localStorage.getItem('lastKnownAddress');
      if (cached && typeof cached === 'string' && !cached.toLowerCase().includes('unavailable') && !cached.toLowerCase().includes('offline')) {
        return cached.trim();
      }
    } catch (e) {}
    return '';
  });
  const [locationState, setLocationState] = useState<'UNKNOWN' | 'LOCATING' | 'INSIDE_OFFICE' | 'OUTSIDE_OFFICE' | 'STALE_LOCATION'>('UNKNOWN');
  const [activeAttendanceMode, setActiveAttendanceMode] = useState<boolean>(false);
  const [locationTimestamp, setLocationTimestamp] = useState<number | null>(null);
  const locationTimestampRef = useRef<number | null>(null);

  const watchIdRef = useRef<string | number | null>(null);
  const lastGeocodedCoordsRef = useRef<{ lat: number; lon: number; time: number } | null>(null);
  const adaptiveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUiUpdateRef = useRef<number>(0);
  const rawLocationRef = useRef<{ latitude: number; longitude: number; accuracy?: number; timestamp: number } | null>(null);
  const latestDistanceRef = useRef<number | null>(null);

  const isStale = React.useMemo(() => {
    if (!isFreshFixReceived || !locationTimestamp) return false;
    const ageMs = Date.now() - locationTimestamp;
    return ageMs > 45000;
  }, [isFreshFixReceived, locationTimestamp]);

  const formattedDistance = React.useMemo(() => {
    if (distance !== null) {
      if (isStale) {
        return 'Updating…';
      }
      return formatOfficeDistance(distance, false);
    }
    if (locationStatus === 'loading') {
      return 'Locating…';
    }
    if (isGpsOff || isPermissionDenied) {
      return 'GPS unavailable';
    }
    return 'Location unavailable';
  }, [distance, isStale, locationStatus, isGpsOff, isPermissionDenied]);

  const isInsideGeofence = React.useMemo(() => {
    return distance !== null && !isStale && distance <= OFFICE_LOCATION.radius;
  }, [distance, isStale]);

  const getEmployeeInfo = React.useCallback(() => {
    try {
      const raw = localStorage.getItem('cached_registration_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Security requirement: Only approved employees are permitted to record attendance
        if (parsed.status !== 'Approved') {
          return null;
        }
        return {
          id: parsed.employeeCode || parsed.uid || parsed.id || parsed.employeeId || '',
          name: parsed.name || parsed.employeeName || 'Employee',
          townCity: parsed.townCity || parsed.city || 'Raniganj HQ'
        };
      }
    } catch (e) {}
    return null;
  }, []);

  const getValidCachedAddress = (): string | null => {
    try {
      const cached = localStorage.getItem('lastKnownAddress');
      if (cached && typeof cached === 'string' && !cached.toLowerCase().includes('unavailable') && !cached.toLowerCase().includes('offline')) {
        return cached.trim();
      }
    } catch (e) {}
    return null;
  };

  const formatCleanAddressParts = (parts: (string | null | undefined)[]): string | null => {
    const seen = new Set<string>();
    const validParts: string[] = [];

    for (const p of parts) {
      if (!p || typeof p !== 'string') continue;
      let trimmed = p.trim();
      // Remove postal/zip codes (5-6 digit numbers)
      trimmed = trimmed.replace(/\b\d{5,6}\b/g, '').trim();
      if (!trimmed) continue;

      const lower = trimmed.toLowerCase();
      // Filter out raw country names, plus codes, or lat/lon strings
      if (
        lower === 'india' ||
        lower === 'in' ||
        lower === 'united states' ||
        lower.includes('plus code') ||
        /^[a-z0-9]{4}\+[a-z0-9]{2,}/i.test(trimmed) ||
        /^[-+]?\d+\.\d+/.test(trimmed) ||
        lower.includes('unavailable') ||
        lower === 'offline'
      ) {
        continue;
      }

      if (!seen.has(lower)) {
        seen.add(lower);
        validParts.push(trimmed);
      }
    }

    return validParts.length > 0 ? validParts.join(', ') : null;
  };

  const extractBestLocation = (addressData: any): string | null => {
    try {
      if (!addressData) return null;

      if (typeof addressData === 'string') {
        const rawString = addressData.trim();
        if (!rawString || rawString.toLowerCase().includes('unavailable') || rawString.toLowerCase() === 'offline') return null;
        const splitParts = rawString.split(',');
        return formatCleanAddressParts(splitParts);
      }

      if (typeof addressData !== 'object') return null;

      // Build hierarchical address components from most specific to broader area
      const houseBuildingStreet = 
        addressData.subThoroughfare ||
        addressData.house_number ||
        addressData.houseNumber ||
        addressData.building ||
        addressData.thoroughfare ||
        addressData.street ||
        addressData.road ||
        addressData.featureName ||
        (addressData.localityInfo?.informative?.[0]?.name) ||
        (Array.isArray(addressData.lines) && addressData.lines[0]);

      const subLocalityArea = 
        addressData.subLocality ||
        addressData.suburb ||
        addressData.neighbourhood ||
        addressData.residential ||
        addressData.city_district ||
        addressData.quarter ||
        (addressData.localityInfo?.administrative?.find((a: any) => a.order === 4 || a.order === 5)?.name);

      const localityCity = 
        addressData.locality ||
        addressData.city ||
        addressData.town ||
        addressData.village ||
        addressData.municipality ||
        (addressData.localityInfo?.administrative?.find((a: any) => a.order === 3 || a.order === 2)?.name);

      const districtSubAdmin = 
        addressData.subAdminArea ||
        addressData.district ||
        addressData.state_district ||
        addressData.county;

      const stateAdmin = 
        addressData.adminArea ||
        addressData.state ||
        addressData.principalSubdivision;

      const constructed = formatCleanAddressParts([
        houseBuildingStreet,
        subLocalityArea,
        localityCity,
        districtSubAdmin,
        stateAdmin,
      ]);

      if (constructed) return constructed;

      // Fallback for formatted address fields
      if (addressData.formattedAddress || addressData.formatted_address || addressData.display_name) {
        const fmt = addressData.formattedAddress || addressData.formatted_address || addressData.display_name;
        if (typeof fmt === 'string') {
          return formatCleanAddressParts(fmt.split(','));
        }
      }
    } catch (e) {
      console.warn('extractBestLocation error:', e);
    }
    return null;
  };

  const performReverseGeocode = async (latitude: number, longitude: number) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = getValidCachedAddress();
      if (cached) {
        setCurrentAddress(cached);
      }
      setLocationStatus('success');
      return;
    }

    let resolvedAddress: string | null = null;
    try {
      const win = window as any;
      if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
        if (win.AndroidGeocoder && typeof win.AndroidGeocoder.getFromLocation === 'function') {
          const raw = await win.AndroidGeocoder.getFromLocation(latitude, longitude);
          resolvedAddress = extractBestLocation(raw);
        } else if (win.Capacitor?.Plugins?.NativeGeocoder) {
          const res = await win.Capacitor.Plugins.NativeGeocoder.reverseGeocode({ latitude, longitude });
          if (res && res.addresses && res.addresses.length > 0) {
            resolvedAddress = extractBestLocation(res.addresses[0]);
          } else if (res && res.address) {
            resolvedAddress = extractBestLocation(res.address);
          }
        } else if (win.Capacitor?.Plugins?.Geocoder) {
          const res = await win.Capacitor.Plugins.Geocoder.reverseGeocode({ latitude, longitude });
          if (res && res.addresses && res.addresses.length > 0) {
            resolvedAddress = extractBestLocation(res.addresses[0]);
          }
        }
      }

      if (!resolvedAddress && typeof navigator !== 'undefined' && navigator.onLine) {
        // Try OpenStreetMap Nominatim first for high-precision address
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.address) {
              resolvedAddress = extractBestLocation(data.address);
            } else if (data && data.display_name) {
              resolvedAddress = extractBestLocation(data.display_name);
            }
          }
        } catch (e) {
          console.warn('OSM Nominatim reverse geocode error:', e);
        }

        // Fallback to BigDataCloud
        if (!resolvedAddress) {
          try {
            const resp = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            );
            if (resp.ok) {
              const data = await resp.json();
              resolvedAddress = extractBestLocation(data);
            }
          } catch (e) {
            console.warn('BigDataCloud reverse geocode error:', e);
          }
        }
      }
    } catch (e: any) {
      console.warn('Geocoder error:', e);
    }

    if (resolvedAddress && typeof resolvedAddress === 'string' && resolvedAddress.trim()) {
      const cleanAddress = resolvedAddress.trim();
      setCurrentAddress(cleanAddress);
      try {
        localStorage.setItem('lastKnownAddress', cleanAddress);
      } catch (e) {}
    } else {
      const cachedAddress = getValidCachedAddress();
      if (cachedAddress) {
        setCurrentAddress(cachedAddress);
      }
    }
    setLocationStatus('success');
  };

  const [backgroundPermissionGranted, setBackgroundPermissionGranted] = useState<boolean>(false);

  useEffect(() => {
    checkBackgroundPermissionStatus().then((res) => {
      setBackgroundPermissionGranted(res.isBackgroundGranted);
    });

    const cleanupBg = initializeBackgroundAttendanceManager(getEmployeeInfo);

    return () => {
      cleanupBg();
    };
  }, []);

  const handleRequestBgPermission = React.useCallback(async (): Promise<boolean> => {
    const granted = await requestBackgroundLocationPermission();
    setBackgroundPermissionGranted(granted);
    return granted;
  }, []);

  const processPosition = async (latitude: number, longitude: number, accuracy?: number, timestamp?: number) => {
    const now = Date.now();
    const fixTime = timestamp || now;

    // Requirement 7: Prevent stale-location overwrite by rejecting older asynchronous updates
    if (locationTimestampRef.current && fixTime < locationTimestampRef.current) {
      console.log(`[Location] Rejected older out-of-order fix: ${fixTime} < ${locationTimestampRef.current}`);
      return;
    }

    // Requirement 3: Reject fixes older than 60 seconds
    const ageMs = Math.max(0, now - fixTime);
    const ageSec = ageMs / 1000;
    if (ageSec > 60) {
      console.log(`[Location] Rejected stale fix: ${ageSec.toFixed(1)}s old`);
      return;
    }

    // Requirement 4: Discard extremely poor accuracy fixes (> 150m) for distance display
    if (accuracy && accuracy > 150) {
      console.log(`[Location] Discarded low-accuracy fix: ${accuracy}m`);
      return;
    }

    // Requirement 1 & 5: Haversine distance calculated directly from authoritative GPS latitude & longitude against OFFICE_LOCATION
    const calculatedDistance = getDistanceFromLatLonInM(
      latitude,
      longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    // Always keep latest raw coordinate and distance in refs for non-UI workers & adaptive polling
    rawLocationRef.current = { latitude, longitude, accuracy, timestamp: fixTime };
    locationTimestampRef.current = fixTime;
    latestDistanceRef.current = calculatedDistance;

    // Boundary comparison: strictly <= 25.0 meters (OFFICE_LOCATION.radius)
    const isHighAccuracyForGeofence = !accuracy || accuracy <= 35;
    const isWithinBoundary = calculatedDistance <= OFFICE_LOCATION.radius;
    const nextInside = isWithinBoundary && isHighAccuracyForGeofence;

    // Bypass UI Throttle: Update React UI state immediately on geofence transition or initial load, or every 1 second maximum
    const geofenceStateChanged = (stableInsideOffice !== nextInside);
    const timeSinceLastUiUpdate = now - lastUiUpdateRef.current;
    const shouldUpdateUi = lastUiUpdateRef.current === 0 || geofenceStateChanged || timeSinceLastUiUpdate >= 1000;

    if (shouldUpdateUi) {
      lastUiUpdateRef.current = now;
      setLiveLocation({ latitude, longitude });
      setDistance(calculatedDistance);
      setLocationTimestamp(fixTime);
      setIsFreshFixReceived(true);
      setLocationStatus('success');
      setStableInsideOffice(nextInside);
    }

    // Save to cache for offline backup
    try {
      localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude, longitude }));
      localStorage.setItem('lastKnownDistance', String(calculatedDistance));
    } catch (e) {}

    // Evaluate automatic background geofence state transition & live location write
    // Direct execution: process check-in immediately upon valid coordinate arrival without waiting for UI state
    if (!isAdminContextActive()) {
      try {
        const cachedRaw = localStorage.getItem('cached_registration_data');
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          const empId = parsed.employeeCode || parsed.uid || parsed.id;
          const empName = parsed.name || 'Employee';
          if (empId) {
            updateLiveEmployeeLocation({
              employeeId: empId,
              employeeName: empName,
              latitude,
              longitude,
              accuracy,
              distanceFromOffice: calculatedDistance,
              townCity: currentAddress || 'Raniganj HQ',
              timestamp: new Date(fixTime).toISOString()
            }).catch((err) => console.warn('Error updating live_locations:', err));

            const startTime = Date.now();
            handleLocationUpdateForAttendance(
              latitude,
              longitude,
              empId,
              empName,
              currentAddress || 'Raniganj HQ',
              accuracy
            );

            if (calculatedDistance <= OFFICE_LOCATION.radius) {
              console.log('[AUTO_CHECKIN_TIMING]', {
                locationReceivedTime: new Date(fixTime).toISOString(),
                locationAccuracy: accuracy || 'N/A',
                distanceFromOffice: Math.round(calculatedDistance * 100) / 100,
                geofenceEvaluationTimeMs: Date.now() - startTime,
                status: 'EVALUATED_INSIDE_25M'
              });
            }
          }
        }
      } catch (err) {
        console.warn('Error evaluating location update for attendance / live location:', err);
      }
    }

    // Offline mode support
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const cached = getValidCachedAddress();
      if (cached) {
        setCurrentAddress((prev) => (prev && !prev.toLowerCase().includes('unavailable') && !prev.toLowerCase().includes('offline') ? prev : cached));
      }
      setLocationStatus('success');
      return;
    }

    // Debounce reverse-geocoding calls: only re-geocode if moved >= 200m or >= 10 minutes elapsed
    const last = lastGeocodedCoordsRef.current;
    let shouldGeocode = false;

    if (!last) {
      shouldGeocode = true;
    } else {
      const distMoved = getDistanceFromLatLonInM(latitude, longitude, last.lat, last.lon);
      const timeElapsed = now - last.time;
      if (distMoved >= 200 || timeElapsed >= 600000) {
        shouldGeocode = true;
      }
    }

    if (shouldGeocode) {
      lastGeocodedCoordsRef.current = { lat: latitude, lon: longitude, time: now };
      await performReverseGeocode(latitude, longitude);
    }
  };

  const startTracking = async () => {
    logStartupTag('LOCATION_INIT_START', 'Starting Geolocation tracking & adaptive polling');
    if (distance === null && (typeof navigator === 'undefined' || navigator.onLine)) {
      setLocationStatus('loading');
    }
    setErrorMessage('');
    setIsFreshFixReceived(false);

    if (watchIdRef.current !== null) {
      const oldId = String(watchIdRef.current);
      console.log('LOCATION_WATCH_STOPPED', oldId);
      trackResourceCleaned('LOCATION_WATCH', oldId);
      if (typeof watchIdRef.current === 'string') {
        Geolocation.clearWatch({ id: watchIdRef.current });
      } else {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
    }

    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await Geolocation.requestPermissions();
        if (perm.location !== 'granted') {
          handleError({ code: 1, message: 'Location permission is required.' });
          return;
        }
      }

      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        (position, err) => {
          if (err || !position || !position.coords) {
            if (err) {
              handleError(err);
            }
            return;
          }
          clearErrors();
          processPosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp);
        }
      );
      watchIdRef.current = id;
      const watchStr = String(id);
      console.log('LOCATION_WATCH_STARTED', watchStr);
      trackResourceCreated('LOCATION_WATCH', watchStr, 'capacitor_geolocation');
    } catch (err) {
      if (!navigator.geolocation) {
        handleError({ code: 2, message: 'Geolocation is not supported.' });
        return;
      }

      const navId = navigator.geolocation.watchPosition(
        (position) => {
          clearErrors();
          processPosition(position.coords.latitude, position.coords.longitude, position.coords.accuracy, position.timestamp);
        },
        (error) => {
          handleError(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
      watchIdRef.current = navId;
      const navStr = String(navId);
      console.log('LOCATION_WATCH_STARTED', navStr);
      trackResourceCreated('LOCATION_WATCH', navStr, 'navigator_geolocation');
    }
  };

  // Keep track of active attendance mode via Ref to avoid event listener recreation
  const activeAttendanceModeRef = useRef(activeAttendanceMode);
  useEffect(() => {
    activeAttendanceModeRef.current = activeAttendanceMode;
  }, [activeAttendanceMode]);

  // Periodic 30-second performance diagnostics auditor
  useEffect(() => {
    const diagInterval = setInterval(() => {
      const snap = getResourceSnapshot();
      console.log(`[EXFIN PERFORMANCE]
ACTIVE GPS WATCHERS: ${snap.locationWatchers}
ACTIVE FIRESTORE LISTENERS: ${snap.firestoreListeners}
ACTIVE TIMERS: ${snap.syncTimers}
SYNC IN PROGRESS: ${snap.isSyncEngineLocked ? 'YES' : 'NO'}`);
    }, 30000);

    return () => clearInterval(diagInterval);
  }, []);

  // Auto-start single authoritative location stream on Provider mount
  useEffect(() => {
    startTracking();

    return () => {
      if (watchIdRef.current !== null) {
        const watchStr = String(watchIdRef.current);
        console.log('LOCATION_WATCH_STOPPED', watchStr);
        trackResourceCleaned('LOCATION_WATCH', watchStr);
        if (typeof watchIdRef.current === 'string') {
          try { Geolocation.clearWatch({ id: watchIdRef.current }); } catch (e) {}
        } else {
          try { navigator.geolocation.clearWatch(watchIdRef.current); } catch (e) {}
        }
        watchIdRef.current = null;
      }
    };
  }, []);

  // Two-Stage Location Strategy: Fallback Location Health Monitoring Engine
  // Stage A — Approaching Office (dist <= 500m): Query fresh GPS fixes every 3s if watchPosition pauses
  // Stage B — Inside/Near Office (dist <= 25m): Fast 3s active monitoring & immediate evaluation
  // Stage C — Far from Office (> 500m): Relaxed 20s polling to conserve battery
  useEffect(() => {
    if (!activeAttendanceMode) return;

    if (adaptiveTimerRef.current) {
      clearTimeout(adaptiveTimerRef.current);
      adaptiveTimerRef.current = null;
    }

    let isRunning = true;
    const timerId = `loc_health_${Date.now()}`;
    trackResourceCreated('SYNC_TIMER', timerId, 'location_health_monitor');

    const checkLocationHealth = async () => {
      if (!isRunning) return;

      const now = Date.now();
      const lastFixTime = locationTimestampRef.current || 0;
      const lastFixAge = now - lastFixTime;
      const currentDist = latestDistanceRef.current;

      // Stage A/B vs Far detection
      const isApproachingOrNear = currentDist !== null && currentDist <= 500;
      const maxAllowedAgeMs = isApproachingOrNear ? 3000 : 20000;
      const nextDelayMs = isApproachingOrNear ? 3000 : 20000;

      if (lastFixTime > 0 && lastFixAge > maxAllowedAgeMs) {
        console.warn(`[Location Engine - Stage ${isApproachingOrNear ? 'A/B (Fast)' : 'Normal'}] Fix is ${(lastFixAge / 1000).toFixed(1)}s old. Requesting fresh position...`);
        try {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: isApproachingOrNear ? 3000 : 5000,
            maximumAge: 0
          });
          if (pos && pos.coords && isRunning) {
            processPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp);
          }
        } catch (err) {
          console.warn('[Location Engine] Fallback position query error:', err);
        }
      }

      if (isRunning) {
        adaptiveTimerRef.current = setTimeout(checkLocationHealth, nextDelayMs);
      }
    };

    const initialDelay = (latestDistanceRef.current !== null && latestDistanceRef.current <= 500) ? 3000 : 20000;
    adaptiveTimerRef.current = setTimeout(checkLocationHealth, initialDelay);

    return () => {
      isRunning = false;
      trackResourceCleaned('SYNC_TIMER', timerId);
      if (adaptiveTimerRef.current) {
        clearTimeout(adaptiveTimerRef.current);
        adaptiveTimerRef.current = null;
      }
    };
  }, [activeAttendanceMode]);

  useEffect(() => {
    const handleOnline = () => {
      if (liveLocation) {
        performReverseGeocode(liveLocation.latitude, liveLocation.longitude);
      } else {
        if (activeAttendanceModeRef.current) {
          startTracking();
        }
      }
    };

    const handleOffline = () => {
      // Retain last known cached address rather than setting 'Offline'
    };

    const onlineListenerId = 'location_online_listener';
    const offlineListenerId = 'location_offline_listener';
    trackResourceCreated('ONLINE_LISTENER', onlineListenerId);
    trackResourceCreated('OFFLINE_LISTENER', offlineListenerId);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Register Capacitor App Active State Change Listener
    let appStateListener: any = null;
    if (Capacitor.isNativePlatform()) {
      try {
        appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
          console.log('[Capacitor App State Change] Is Active?', isActive);
          if (isActive && activeAttendanceModeRef.current) {
            console.log('[Lifecycle] App resumed. Re-validating Location Services...');
            forceRefreshLocation();
          }
        });
      } catch (err) {
        console.warn('Failed to add Capacitor app state listener:', err);
      }
    }

    return () => {
      trackResourceCleaned('ONLINE_LISTENER', onlineListenerId);
      trackResourceCleaned('OFFLINE_LISTENER', offlineListenerId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (appStateListener && typeof appStateListener.remove === 'function') {
        appStateListener.remove();
      }
    };
  }, []);

  // Update dynamic locationState on state changes
  useEffect(() => {
    if (locationStatus === 'loading') {
      setLocationState('LOCATING');
    } else if (locationStatus === 'error') {
      setLocationState('UNKNOWN');
    } else if (locationStatus === 'success') {
      const now = Date.now();
      const ageMs = now - (locationTimestamp || now);
      const ageSec = ageMs / 1000;

      if (ageSec > 45) {
        setLocationState('STALE_LOCATION');
      } else if (stableInsideOffice) {
        setLocationState('INSIDE_OFFICE');
      } else {
        setLocationState('OUTSIDE_OFFICE');
      }
    }
  }, [locationStatus, stableInsideOffice, locationTimestamp]);

  const forceRefreshLocation = React.useCallback(async () => {
    setLocationStatus('loading');
    setIsFreshFixReceived(false);
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      });
      if (pos && pos.coords) {
        clearErrors();
        await processPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy, pos.timestamp);
      }
    } catch (err: any) {
      handleError(err);
    }
  }, []);

  const contextValue = React.useMemo(
    () => ({
      liveLocation,
      distance,
      formattedDistance,
      isInsideGeofence,
      locationStatus,
      errorMessage,
      currentAddress,
      refreshLocation: forceRefreshLocation,
      requestBackgroundPermission: handleRequestBgPermission,
      backgroundPermissionGranted,
      locationState,
      activeAttendanceMode,
      setActiveAttendanceMode,
      isGpsOff,
      isPermissionDenied,
      isLocationUnavailable
    }),
    [
      liveLocation,
      distance,
      formattedDistance,
      isInsideGeofence,
      locationStatus,
      errorMessage,
      currentAddress,
      forceRefreshLocation,
      handleRequestBgPermission,
      backgroundPermissionGranted,
      locationState,
      activeAttendanceMode,
      setActiveAttendanceMode,
      isGpsOff,
      isPermissionDenied,
      isLocationUnavailable
    ]
  );

  return (
    <LocationContext.Provider value={contextValue}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocationContext = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocationContext must be used within a LocationProvider');
  }
  return context;
};
