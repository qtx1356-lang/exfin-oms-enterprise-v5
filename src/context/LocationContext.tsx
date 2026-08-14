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
import { getTodayAttendanceRecord } from '../services/attendance/attendanceStorage';
import {
  trackResourceCreated,
  trackResourceCleaned,
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

export const formatOfficeDistance = (meters: number | null): string => {
  if (meters === null || meters === undefined || isNaN(meters)) {
    return '—';
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
};

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(() => {
    try {
      const cached = localStorage.getItem('lastKnownLocation');
      return cached ? JSON.parse(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [distance, setDistance] = useState<number | null>(() => {
    try {
      const cached = localStorage.getItem('lastKnownDistance');
      return cached ? Number(cached) : null;
    } catch (e) {
      return null;
    }
  });
  const [stableInsideOffice, setStableInsideOffice] = useState<boolean | null>(() => {
    try {
      const cachedDist = localStorage.getItem('lastKnownDistance');
      if (cachedDist !== null) {
        return Number(cachedDist) <= OFFICE_LOCATION.radius;
      }
    } catch (e) {}
    return null;
  });
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isGpsOff, setIsGpsOff] = useState<boolean>(false);
  const [isPermissionDenied, setIsPermissionDenied] = useState<boolean>(false);
  const [isLocationUnavailable, setIsLocationUnavailable] = useState<boolean>(false);

  const handleError = (err: any) => {
    console.warn('[Location Error Logged]', err);
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
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return 'Offline';
      }
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

  const isInsideGeofence = distance !== null && distance <= OFFICE_LOCATION.radius;
  const formattedDistance = formatOfficeDistance(distance);

  const getEmployeeInfo = () => {
    try {
      const raw = localStorage.getItem('cached_registration_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          id: parsed.employeeCode || parsed.uid || parsed.id || '',
          name: parsed.name || 'Employee'
        };
      }
    } catch (e) {}
    return null;
  };

  const getValidCachedAddress = (): string | null => {
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return null;
      }
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
      setCurrentAddress('Offline');
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
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setCurrentAddress('Offline');
      } else {
        const cachedAddress = getValidCachedAddress();
        if (cachedAddress) {
          setCurrentAddress(cachedAddress);
        }
      }
    }
    setLocationStatus('success');
  };

  const [backgroundPermissionGranted, setBackgroundPermissionGranted] = useState<boolean>(false);

  useEffect(() => {
    checkBackgroundPermissionStatus().then((res) => {
      setBackgroundPermissionGranted(res.isBackgroundGranted);
    });

    const cleanupBg = initializeBackgroundAttendanceManager(() => {
      try {
        const raw = localStorage.getItem('cached_registration_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            id: parsed.employeeCode || parsed.uid || parsed.id || '',
            name: parsed.name || 'Employee'
          };
        }
      } catch (e) {}
      return null;
    });

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
    const ageMs = now - fixTime;
    const ageSec = ageMs / 1000;

    // Filter out location if it is extremely old (e.g. > 60 seconds) to avoid false calculations
    if (ageSec > 60) {
      console.log(`[Location] Rejected stale fix: ${ageSec.toFixed(1)}s old`);
      return;
    }

    // Accept location if accuracy is reasonable (e.g. <= 35m) to avoid discarding good-enough fixes
    const isReliable = !accuracy || accuracy <= 35;
    if (!isReliable) {
      console.log(`[Location] Discarded low-accuracy fix: ${accuracy}m`);
      return;
    }

    setLiveLocation({ latitude, longitude });
    setLocationTimestamp(fixTime);
    locationTimestampRef.current = fixTime;

    const calculatedDistance = getDistanceFromLatLonInM(
      latitude,
      longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );
    setDistance(calculatedDistance);

    // Save to cache immediately
    try {
      localStorage.setItem('lastKnownLocation', JSON.stringify({ latitude, longitude }));
      localStorage.setItem('lastKnownDistance', String(calculatedDistance));
    } catch (e) {}

    // Dynamic state determination with Hysteresis / Border Stability
    let nextInside = stableInsideOffice;
    if (calculatedDistance <= 23) {
      nextInside = true;
    } else if (calculatedDistance >= 27) {
      nextInside = false;
    } else {
      if (stableInsideOffice === null || stableInsideOffice === undefined) {
        nextInside = calculatedDistance <= OFFICE_LOCATION.radius;
      } else {
        nextInside = stableInsideOffice;
      }
    }

    if (nextInside !== stableInsideOffice) {
      console.log(`[Location] State transition via hysteresis: distance=${calculatedDistance.toFixed(1)}m, accuracy=${accuracy || 'N/A'}m, insideOffice=${nextInside}`);
    }
    setStableInsideOffice(nextInside);

    // Evaluate automatic background geofence state transition
    try {
      const cachedRaw = localStorage.getItem('cached_registration_data');
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        const empId = parsed.employeeCode || parsed.uid || parsed.id;
        const empName = parsed.name || 'Employee';
        if (empId) {
          handleLocationUpdateForAttendance(
            latitude,
            longitude,
            empId,
            empName,
            currentAddress || 'Raniganj HQ'
          );
        }
      }
    } catch (err) {
      console.warn('Error evaluating location update for attendance:', err);
    }

    // Offline mode support: complete location state immediately without network/reverse geocoding
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCurrentAddress('Offline');
      setLocationStatus('success');
      return;
    }

    // Debounce reverse-geocoding calls: only re-geocode if moved >= 50m or >= 3 minutes elapsed
    const last = lastGeocodedCoordsRef.current;
    let shouldGeocode = false;

    if (!last) {
      shouldGeocode = true;
    } else {
      const distMoved = getDistanceFromLatLonInM(latitude, longitude, last.lat, last.lon);
      const timeElapsed = now - last.time;
      if (distMoved >= 50 || timeElapsed >= 180000) {
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
    setLocationStatus('loading');
    setErrorMessage('');

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

  // Handle active attendance mode tracking trigger
  useEffect(() => {
    if (activeAttendanceMode) {
      startTracking();
    } else {
      // Deactivate active tracking
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
      clearErrors();
      setLocationStatus('success');
    }

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
  }, [activeAttendanceMode]);

  // Fallback Location Health Monitoring Engine
  // watchPosition handles active location streaming.
  // This timer runs periodically to issue a fallback query ONLY if watchPosition hasn't received a fix for > 20s.
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

      // Only invoke fallback query if watchPosition has been silent for more than 20 seconds
      if (lastFixTime > 0 && lastFixAge > 20000) {
        console.warn(`[Location Engine] Stale location fix (${(lastFixAge / 1000).toFixed(1)}s old). Querying fallback position...`);
        try {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
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
        adaptiveTimerRef.current = setTimeout(checkLocationHealth, 20000);
      }
    };

    adaptiveTimerRef.current = setTimeout(checkLocationHealth, 20000);

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
      setCurrentAddress('Offline');
    };

    const onlineListenerId = 'location_online_listener';
    const offlineListenerId = 'location_offline_listener';
    trackResourceCreated('ONLINE_LISTENER', onlineListenerId);
    trackResourceCreated('OFFLINE_LISTENER', offlineListenerId);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCurrentAddress('Offline');
    }

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
