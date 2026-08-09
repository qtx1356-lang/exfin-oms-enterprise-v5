import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { OFFICE_LOCATION, getDistanceFromLatLonInM } from '../services/attendance/smartAttendanceEngine';

export interface LocationContextType {
  liveLocation: { latitude: number; longitude: number } | null;
  distance: number | null; // Distance in meters from OFFICE_LOCATION
  formattedDistance: string; // e.g., "20.34 km", "476 m", "25 m", or "—"
  isInsideGeofence: boolean; // distance !== null && distance <= OFFICE_LOCATION.radius
  locationStatus: 'loading' | 'success' | 'error';
  errorMessage: string;
  currentAddress: string;
  refreshLocation: () => Promise<void>;
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
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const watchIdRef = useRef<string | number | null>(null);

  const isInsideGeofence = distance !== null && distance <= OFFICE_LOCATION.radius;
  const formattedDistance = formatOfficeDistance(distance);

  const getValidCachedAddress = (): string | null => {
    const cached = localStorage.getItem('lastKnownAddress');
    if (cached && !cached.toLowerCase().includes('address unavailable')) {
      return cached.trim();
    }
    return null;
  };

  const extractBestLocation = (addressData: any): string | null => {
    if (!addressData) return null;
    if (typeof addressData === 'string') {
      const trimmed = addressData.trim();
      if (trimmed && !trimmed.toLowerCase().includes('address unavailable')) {
        return trimmed;
      }
      return null;
    }
    const townCity = addressData.locality || addressData.city || addressData.town || addressData.suburb || addressData.subLocality || addressData.village;
    if (townCity && typeof townCity === 'string' && townCity.trim()) return townCity.trim();
    const district = addressData.subAdminArea || addressData.district || addressData.county;
    if (district && typeof district === 'string' && district.trim()) return district.trim();
    const state = addressData.adminArea || addressData.state;
    if (state && typeof state === 'string' && state.trim()) return state.trim();
    return null;
  };

  const performReverseGeocode = async (latitude: number, longitude: number) => {
    let resolvedAddress: string | null = null;
    try {
      const win = window as any;
      if (Capacitor.isNativePlatform()) {
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
    } catch (e: any) {
      console.warn('Native Android Geocoder error:', e);
    }

    if (resolvedAddress && resolvedAddress.trim()) {
      const cleanAddress = resolvedAddress.trim();
      setCurrentAddress(cleanAddress);
      localStorage.setItem('lastKnownAddress', cleanAddress);
    } else {
      const cachedAddress = getValidCachedAddress();
      if (cachedAddress) {
        setCurrentAddress(cachedAddress);
      } else {
        setCurrentAddress('Raniganj HQ');
      }
    }
    setLocationStatus('success');
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

    if (!navigator.onLine) {
      const cachedAddress = getValidCachedAddress();
      setCurrentAddress(cachedAddress || 'Raniganj HQ');
      setLocationStatus('success');
      return;
    }

    await performReverseGeocode(latitude, longitude);
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
    startTracking();

    return () => {
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
