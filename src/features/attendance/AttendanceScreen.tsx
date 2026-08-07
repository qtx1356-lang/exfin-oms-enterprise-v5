import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { MapPin, AlertCircle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

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

  useEffect(() => {
    let watchId: number;

    startTrackingRef.current = () => {
      setLocationStatus('loading');
      setErrorMessage('');
      setLiveLocation(null);
      setCurrentAddress('');
      setDistance(null);
      setIsInsideGeofence(false);
      setRawGeocodeResponse('');

      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
      }

      if (!navigator.geolocation) {
        setLocationStatus('error');
        setErrorMessage('Geolocation is not supported by your browser.');
        return;
      }

      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
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
            const cachedAddress = localStorage.getItem('lastKnownAddress');
            if (cachedAddress) {
              setCurrentAddress(`${cachedAddress} (Last known location)`);
            } else {
              setCurrentAddress('Address unavailable (Offline)');
            }
            setRawGeocodeResponse('Browser is offline.');
            setLocationStatus('success');
            return;
          }

          try {
            // Using Google Maps Geocoding API
            const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
            );
            if (!response.ok) {
              throw new Error('Failed to fetch address');
            }
            const data = await response.json();
            setRawGeocodeResponse(JSON.stringify(data, null, 2));
            
            if (data.results && data.results.length > 0) {
              const formattedAddress = data.results[0].formatted_address;
              setCurrentAddress(formattedAddress);
              localStorage.setItem('lastKnownAddress', formattedAddress);
            } else {
              setCurrentAddress(data.error_message || 'Current address unavailable');
            }
            
            setLocationStatus('success');
          } catch (error: any) {
            console.error('Reverse geocoding error:', error);
            setCurrentAddress('Current address unavailable');
            setRawGeocodeResponse(error?.message || String(error));
            setLocationStatus('success'); // still success because we got GPS
          }
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
    };

    // Automatically fetch location when opened
    startTrackingRef.current();

    return () => {
      if (watchId !== undefined) {
        navigator.geolocation.clearWatch(watchId);
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
