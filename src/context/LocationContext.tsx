import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { OFFICE_LOCATION, getDistanceFromLatLonInM } from '../services/attendance/smartAttendanceEngine';
import { 
  handleLocationUpdateForAttendance, 
  initializeBackgroundAttendanceManager, 
  checkBackgroundPermissionStatus, 
  requestBackgroundLocationPermission 
} from '../services/attendance/backgroundAttendanceManager';

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
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
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
  const watchIdRef = useRef<string | number | null>(null);

  const lastGeocodedCoordsRef = useRef<{ lat: number; lon: number; time: number } | null>(null);

  const isInsideGeofence = distance !== null && distance <= OFFICE_LOCATION.radius;
  const formattedDistance = formatOfficeDistance(distance);

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

  const handleRequestBgPermission = async (): Promise<boolean> => {
    const granted = await requestBackgroundLocationPermission();
    setBackgroundPermissionGranted(granted);
    return granted;
  };

  const processPosition = async (latitude: number, longitude: number) => {
    setLiveLocation({ latitude, longitude });
    const calculatedDistance = getDistanceFromLatLonInM(
      latitude,
      longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );
    setDistance(calculatedDistance);

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

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCurrentAddress('Offline');
      setLocationStatus('success');
      return;
    }

    // Debounce reverse-geocoding calls: only re-geocode if moved >= 50m or >= 3 minutes elapsed
    const now = Date.now();
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
    setLocationStatus('loading');
    setErrorMessage('');

    if (watchIdRef.current !== null) {
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
          setLocationStatus('error');
          setErrorMessage('Location permission is required.');
          return;
        }
      }

      watchIdRef.current = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        (position, err) => {
          if (err || !position || !position.coords) {
            if (err) {
              setLocationStatus('error');
              setErrorMessage(err.message || 'Location unavailable.');
            }
            return;
          }
          processPosition(position.coords.latitude, position.coords.longitude);
        }
      );
    } catch (err) {
      if (!navigator.geolocation) {
        setLocationStatus('error');
        setErrorMessage('Geolocation is not supported.');
        return;
      }

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          processPosition(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          setLocationStatus('error');
          setErrorMessage('Unable to retrieve location.');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  useEffect(() => {
    const handleOnline = () => {
      if (liveLocation) {
        performReverseGeocode(liveLocation.latitude, liveLocation.longitude);
      } else {
        startTracking();
      }
    };

    const handleOffline = () => {
      setCurrentAddress('Offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCurrentAddress('Offline');
    }

    startTracking();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (watchIdRef.current !== null) {
        if (typeof watchIdRef.current === 'string') {
          Geolocation.clearWatch({ id: watchIdRef.current });
        } else {
          navigator.geolocation.clearWatch(watchIdRef.current);
        }
      }
    };
  }, []);

  return (
    <LocationContext.Provider
      value={{
        liveLocation,
        distance,
        formattedDistance,
        isInsideGeofence,
        locationStatus,
        errorMessage,
        currentAddress,
        refreshLocation: startTracking,
        requestBackgroundPermission: handleRequestBgPermission,
        backgroundPermissionGranted
      }}
    >
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
