import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MapPin, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

const OFFICE_LOCATION = {
  latitude: 23.616227,
  longitude: 87.117063,
  radius: 25 // meters
};

function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d * 1000; // Distance in m
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export const AttendanceScreen: React.FC = () => {
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [distance, setDistance] = useState<number | null>(null);
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean>(false);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [rawGeocodeResponse, setRawGeocodeResponse] = useState<string>('');
  const startTrackingRef = useRef<() => void>();

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

    // Check full address constructed from fields or formatted address properties
    const fullAddress = addressData.addressLine0 || 
                        addressData.formattedAddress || 
                        addressData.formatted_address || 
                        addressData.address ||
                        [
                          addressData.subThoroughfare,
                          addressData.thoroughfare,
                          addressData.subLocality || addressData.village || addressData.suburb,
                          addressData.locality || addressData.city || addressData.town,
                          addressData.subAdminArea || addressData.district || addressData.county,
                          addressData.adminArea || addressData.state,
                          addressData.postalCode,
                          addressData.countryName
                        ].filter(Boolean).join(', ');

    if (fullAddress && fullAddress.trim() && !fullAddress.toLowerCase().includes('address unavailable')) {
      return fullAddress.trim();
    }

    // Priority list if full address is not available:
    // 1. Town/City: locality, city, town
    const townCity = addressData.locality || addressData.city || addressData.town;
    if (townCity && typeof townCity === 'string' && townCity.trim()) return townCity.trim();

    // 2. Village: village
    const village = addressData.village;
    if (village && typeof village === 'string' && village.trim()) return village.trim();

    // 3. Suburb: suburb, subLocality
    const suburb = addressData.suburb || addressData.subLocality;
    if (suburb && typeof suburb === 'string' && suburb.trim()) return suburb.trim();

    // 4. District: subAdminArea, district, county
    const district = addressData.subAdminArea || addressData.district || addressData.county;
    if (district && typeof district === 'string' && district.trim()) return district.trim();

    // 5. State: adminArea, state
    const state = addressData.adminArea || addressData.state;
    if (state && typeof state === 'string' && state.trim()) return state.trim();

    return null;
  };

  const performReverseGeocode = async (latitude: number, longitude: number) => {
    let resolvedAddress: string | null = null;
    let geocodeSourceInfo = '';

    // Native Android Geocoder via Capacitor / Android Bridge
    try {
      const win = window as any;
      if (Capacitor.isNativePlatform()) {
        if (win.AndroidGeocoder && typeof win.AndroidGeocoder.getFromLocation === 'function') {
          const raw = await win.AndroidGeocoder.getFromLocation(latitude, longitude);
          resolvedAddress = extractBestLocation(raw);
          geocodeSourceInfo = 'Native Android Geocoder (AndroidGeocoder bridge)';
        } else if (win.Capacitor?.Plugins?.NativeGeocoder) {
          const res = await win.Capacitor.Plugins.NativeGeocoder.reverseGeocode({ latitude, longitude });
          if (res && res.addresses && res.addresses.length > 0) {
            resolvedAddress = extractBestLocation(res.addresses[0]);
          } else if (res && res.address) {
            resolvedAddress = extractBestLocation(res.address);
          }
          geocodeSourceInfo = 'Native Android Geocoder (Capacitor NativeGeocoder plugin)';
        } else if (win.Capacitor?.Plugins?.Geocoder) {
          const res = await win.Capacitor.Plugins.Geocoder.reverseGeocode({ latitude, longitude });
          if (res && res.addresses && res.addresses.length > 0) {
            resolvedAddress = extractBestLocation(res.addresses[0]);
          }
          geocodeSourceInfo = 'Native Android Geocoder (Capacitor Geocoder plugin)';
        }
      }
    } catch (e: any) {
      console.warn('Native Android Geocoder error:', e);
      geocodeSourceInfo = `Native Android Geocoder Error: ${e?.message || String(e)}`;
    }

    if (resolvedAddress && resolvedAddress.trim()) {
      const cleanAddress = resolvedAddress.trim();
      setCurrentAddress(cleanAddress);
      localStorage.setItem('lastKnownAddress', cleanAddress);
      setRawGeocodeResponse(`${geocodeSourceInfo}\nResult: ${cleanAddress}`);
    } else {
      const cachedAddress = getValidCachedAddress();
      if (cachedAddress) {
        setCurrentAddress(`${cachedAddress} (Last known location)`);
      } else {
        setCurrentAddress('Current Location');
      }
      setRawGeocodeResponse(
        `${geocodeSourceInfo || 'Android Geocoder unavailable on this platform'}\nStatus: Fallback to ${cachedAddress ? 'cached address' : 'Current Location'}`
      );
    }
    setLocationStatus('success');
  };

  useEffect(() => {
    let watchId: string | number | null = null;

    startTrackingRef.current = async () => {
      setLocationStatus('loading');
      setErrorMessage('');
      setLiveLocation(null);
      setCurrentAddress('');
      setDistance(null);
      setIsInsideGeofence(false);
      setRawGeocodeResponse('');

      if (watchId !== null) {
        if (typeof watchId === 'string') {
          Geolocation.clearWatch({ id: watchId });
        } else {
          navigator.geolocation.clearWatch(watchId);
        }
        watchId = null;
      }

      const processPosition = async (latitude: number, longitude: number) => {
        setLiveLocation({ latitude, longitude });

        const calculatedDistance = getDistanceFromLatLonInM(
          latitude,
          longitude,
          OFFICE_LOCATION.latitude,
          OFFICE_LOCATION.longitude
        );
        setDistance(calculatedDistance);
        setIsInsideGeofence(calculatedDistance <= OFFICE_LOCATION.radius);

        if (!navigator.onLine) {
          const cachedAddress = getValidCachedAddress();
          if (cachedAddress) {
            setCurrentAddress(`${cachedAddress} (Last known location)`);
          } else {
            setCurrentAddress('Current Location');
          }
          setRawGeocodeResponse('Browser is offline.');
          setLocationStatus('success');
          return;
        }

        await performReverseGeocode(latitude, longitude);
      };

      // Try Capacitor Geolocation first
      try {
        if (Capacitor.isNativePlatform()) {
          const perm = await Geolocation.requestPermissions();
          if (perm.location !== 'granted') {
            setLocationStatus('error');
            setErrorMessage('Location permission is required for attendance.');
            return;
          }
        }

        watchId = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
          (position, err) => {
            if (err || !position || !position.coords) {
              if (err) {
                setLocationStatus('error');
                setErrorMessage(err.message || 'Location information is unavailable.');
              }
              return;
            }
            processPosition(position.coords.latitude, position.coords.longitude);
          }
        );
      } catch (err) {
        // Web fallback using browser geolocation API
        if (!navigator.geolocation) {
          setLocationStatus('error');
          setErrorMessage('Geolocation is not supported by your browser.');
          return;
        }

        watchId = navigator.geolocation.watchPosition(
          (position) => {
            processPosition(position.coords.latitude, position.coords.longitude);
          },
          (error) => {
            setLocationStatus('error');
            switch (error.code) {
              case error.PERMISSION_DENIED:
                setErrorMessage('Location permission is required for attendance.');
                break;
              case error.POSITION_UNAVAILABLE:
                setErrorMessage('Location information is unavailable.');
                break;
              case error.TIMEOUT:
                setErrorMessage('The request to get user location timed out.');
                break;
              default:
                setErrorMessage('An unknown error occurred.');
                break;
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      }
    };

    // Automatically fetch location when opened
    startTrackingRef.current();

    return () => {
      if (watchId !== null) {
        if (typeof watchId === 'string') {
          Geolocation.clearWatch({ id: watchId });
        } else {
          navigator.geolocation.clearWatch(watchId);
        }
      }
    };
  }, []);

  try {
    return (
      <div className="flex flex-col gap-6 pb-20">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-on-background">Attendance</h1>
        </div>

        {locationStatus === 'loading' && (
          <Card className="p-8 flex flex-col items-center justify-center gap-4 bg-surface text-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-on-surface-variant font-medium">Acquiring live location...</p>
          </Card>
        )}

        {locationStatus === 'error' && (
          <Card className="p-6 flex flex-col items-center justify-center gap-4 bg-error-container text-on-error-container text-center border-l-4 border-l-error">
            <AlertCircle className="w-12 h-12 text-error" />
            <div>
              <h2 className="text-lg font-bold mb-1">Permission Denied</h2>
              <p className="text-sm">{errorMessage}</p>
            </div>
            <Button onClick={() => startTrackingRef.current?.()} className="mt-2 bg-error text-on-error hover:bg-error/90">
              Retry
            </Button>
          </Card>
        )}

        {locationStatus === 'success' && liveLocation && distance !== null && (
          <>
            {/* Status Banner */}
            <div className={`p-4 rounded-xl flex items-center gap-3 shadow-sm ${
              isInsideGeofence 
                ? 'bg-green-100 text-green-900 border border-green-200' 
                : 'bg-red-100 text-red-900 border border-red-200'
            }`}>
              {isInsideGeofence ? (
                <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
              )}
              <div>
                <h2 className="font-bold text-lg leading-tight">
                  {isInsideGeofence ? 'Inside Office Geofence' : 'Outside Office Geofence'}
                </h2>
                <p className="text-sm opacity-90">
                  You are {distance.toFixed(1)} meters away from the office.
                </p>
              </div>
            </div>

            {/* Location Details Card */}
            <Card className="p-5 flex flex-col gap-4 bg-surface shadow-sm">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <MapPin className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">Current Address</p>
                  <p className="text-sm text-on-surface leading-relaxed">
                    {currentAddress || 'Fetching address...'}
                  </p>
                </div>
              </div>
            </Card>

            {/* Debug Panel */}
            <div className="mt-8 border border-outline-variant rounded-xl overflow-hidden bg-surface-variant/30">
              <button 
                onClick={() => setShowDebug(!showDebug)}
                className="w-full flex items-center justify-between p-4 bg-surface-variant text-on-surface-variant font-medium hover:bg-surface-variant/80 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Debug Mode
                </div>
                {showDebug ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </button>
              
              {showDebug && (
                <div className="p-4 space-y-4 text-xs font-mono text-on-surface-variant overflow-x-auto">
                  <div>
                    <strong className="text-primary block mb-1">Office GPS (Target):</strong>
                    Lat: {OFFICE_LOCATION.latitude}, Lon: {OFFICE_LOCATION.longitude}<br/>
                    Radius: {OFFICE_LOCATION.radius}m
                  </div>
                  
                  <div>
                    <strong className="text-primary block mb-1">Live GPS (Current):</strong>
                    Lat: {liveLocation.latitude}, Lon: {liveLocation.longitude}
                  </div>

                  <div>
                    <strong className="text-primary block mb-1">Calculated Distance:</strong>
                    {distance.toFixed(2)} meters
                  </div>

                  <div>
                    <strong className="text-primary block mb-1">GPS coordinates sent to reverse geocoder:</strong>
                    Latitude: {liveLocation.latitude}, Longitude: {liveLocation.longitude}
                  </div>

                  <div>
                    <strong className="text-primary block mb-1">Reverse geocoder response:</strong>
                    <pre className="whitespace-pre-wrap bg-surface p-2 rounded border border-outline-variant mt-1 text-[10px]">
                      {rawGeocodeResponse}
                    </pre>
                  </div>

                  <div>
                    <strong className="text-primary block mb-1">Final displayed address:</strong>
                    {currentAddress}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  } catch (err: any) {
    return (
      <Card className="p-6 m-4 flex flex-col items-center justify-center gap-4 bg-error-container text-on-error-container text-center border-l-4 border-l-error">
        <AlertCircle className="w-12 h-12 text-error" />
        <div>
          <h2 className="text-lg font-bold mb-1">Rendering Error</h2>
          <p className="text-sm">{err?.message || 'An unexpected error occurred while rendering attendance.'}</p>
        </div>
      </Card>
    );
  }
};
