import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  MapPin, 
  AlertCircle, 
  CheckCircle, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Wifi, 
  WifiOff, 
  RotateCw, 
  UserCheck, 
  LogOut, 
  Bell, 
  Calendar,
  Hourglass,
  Navigation
} from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { useRegistration } from '../../context/RegistrationContext';
import { AttendanceRecord } from '../../types/attendance';
import {
  OFFICE_LOCATION,
  getDistanceFromLatLonInM,
  getFormattedDateStr,
  getFormattedTimeStr,
  performCheckIn,
  performCheckOut,
  checkAndTriggerAutoCheckout,
  getCheckoutReminderStatus,
  trackSmartOfficeExit
} from '../../services/attendance/smartAttendanceEngine';
import {
  getStoredAttendanceRecords,
  getTodayAttendanceRecord
} from '../../services/attendance/attendanceStorage';
import {
  startAutoSyncEngine,
  syncPendingAttendanceRecords
} from '../../services/attendance/syncEngine';

export const AttendanceScreen: React.FC = () => {
  const { employeeData } = useRegistration();

  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [liveLocation, setLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [distance, setDistance] = useState<number | null>(null);
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean>(false);
  
  // Attendance state
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [autoCheckInCountdown, setAutoCheckInCountdown] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  
  // Debug toggle
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [rawGeocodeResponse, setRawGeocodeResponse] = useState<string>('');

  const startTrackingRef = useRef<() => void>();
  const autoCheckInTimerRef = useRef<NodeJS.Timeout | null>(null);

  const employeeId = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const employeeName = employeeData?.name || 'Employee';

  // Load attendance records from local storage
  const refreshRecords = () => {
    const records = getStoredAttendanceRecords();
    setAllRecords(records);
    const todayStr = getFormattedDateStr();
    const today = getTodayAttendanceRecord(employeeId, todayStr);
    setTodayRecord(today);
  };

  useEffect(() => {
    refreshRecords();

    // Start sync engine listener
    const stopSync = startAutoSyncEngine(20000);

    const handleOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    // Periodic check for auto-checkout (at 11:59 PM) and reminders
    const periodicCheckTimer = setInterval(() => {
      if (employeeId) {
        const autoCheckedOut = checkAndTriggerAutoCheckout(employeeId, liveLocation || undefined);
        if (autoCheckedOut) {
          refreshRecords();
          setActionFeedback('Auto System Checkout triggered at 11:59 PM (Reason: Forgot Checkout)');
        }
      }
    }, 15000);

    return () => {
      stopSync();
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      clearInterval(periodicCheckTimer);
      if (autoCheckInTimerRef.current) clearInterval(autoCheckInTimerRef.current);
    };
  }, [employeeId]);

  const getValidCachedAddress = (): string | null => {
    const cached = localStorage.getItem('lastKnownAddress');
    if (cached && !cached.toLowerCase().includes('address unavailable')) {
      return cached.trim();
    }
    return null;
  };

  /**
   * Extracts ONLY Town / City -> District -> State according to LOCATION DISPLAY specification
   */
  const extractBestLocation = (addressData: any): string | null => {
    if (!addressData) return null;

    if (typeof addressData === 'string') {
      const trimmed = addressData.trim();
      if (trimmed && !trimmed.toLowerCase().includes('address unavailable')) {
        return trimmed;
      }
      return null;
    }

    // 1. Town / City
    const townCity = addressData.locality || addressData.city || addressData.town || addressData.suburb || addressData.subLocality || addressData.village;
    if (townCity && typeof townCity === 'string' && townCity.trim()) return townCity.trim();

    // 2. District
    const district = addressData.subAdminArea || addressData.district || addressData.county;
    if (district && typeof district === 'string' && district.trim()) return district.trim();

    // 3. State
    const state = addressData.adminArea || addressData.state;
    if (state && typeof state === 'string' && state.trim()) return state.trim();

    return null;
  };

  const performReverseGeocode = async (latitude: number, longitude: number) => {
    let resolvedAddress: string | null = null;
    let geocodeSourceInfo = '';

    try {
      const win = window as any;
      if (Capacitor.isNativePlatform()) {
        if (win.AndroidGeocoder && typeof win.AndroidGeocoder.getFromLocation === 'function') {
          const raw = await win.AndroidGeocoder.getFromLocation(latitude, longitude);
          resolvedAddress = extractBestLocation(raw);
          geocodeSourceInfo = 'Native Android Geocoder';
        } else if (win.Capacitor?.Plugins?.NativeGeocoder) {
          const res = await win.Capacitor.Plugins.NativeGeocoder.reverseGeocode({ latitude, longitude });
          if (res && res.addresses && res.addresses.length > 0) {
            resolvedAddress = extractBestLocation(res.addresses[0]);
          } else if (res && res.address) {
            resolvedAddress = extractBestLocation(res.address);
          }
          geocodeSourceInfo = 'Native Android Geocoder';
        } else if (win.Capacitor?.Plugins?.Geocoder) {
          const res = await win.Capacitor.Plugins.Geocoder.reverseGeocode({ latitude, longitude });
          if (res && res.addresses && res.addresses.length > 0) {
            resolvedAddress = extractBestLocation(res.addresses[0]);
          }
          geocodeSourceInfo = 'Native Android Geocoder';
        }
      }
    } catch (e: any) {
      console.warn('Native Android Geocoder error:', e);
      geocodeSourceInfo = `Native Geocoder Error: ${e?.message || String(e)}`;
    }

    if (resolvedAddress && resolvedAddress.trim()) {
      const cleanAddress = resolvedAddress.trim();
      setCurrentAddress(cleanAddress);
      localStorage.setItem('lastKnownAddress', cleanAddress);
      setRawGeocodeResponse(`${geocodeSourceInfo}\nTown/City Result: ${cleanAddress}`);
    } else {
      const cachedAddress = getValidCachedAddress();
      if (cachedAddress) {
        setCurrentAddress(cachedAddress);
      } else {
        setCurrentAddress('Raniganj HQ');
      }
      setRawGeocodeResponse(
        `${geocodeSourceInfo || 'Offline / Native Geocoder default'}\nLocation: ${cachedAddress || 'Raniganj HQ'}`
      );
    }
    setLocationStatus('success');
  };

  // Auto Check-In timer trigger logic (10 seconds continuous inside 25m geofence)
  const handleAutoCheckInCountdown = (inside: boolean, coords: { latitude: number; longitude: number }) => {
    const todayStr = getFormattedDateStr();
    const currentToday = getTodayAttendanceRecord(employeeId, todayStr);

    if (currentToday) {
      if (autoCheckInTimerRef.current) {
        clearInterval(autoCheckInTimerRef.current);
        autoCheckInTimerRef.current = null;
      }
      setAutoCheckInCountdown(null);
      return;
    }

    if (inside) {
      if (!autoCheckInTimerRef.current && autoCheckInCountdown === null) {
        let count = 10;
        setAutoCheckInCountdown(count);

        autoCheckInTimerRef.current = setInterval(() => {
          count -= 1;
          if (count > 0) {
            setAutoCheckInCountdown(count);
          } else {
            if (autoCheckInTimerRef.current) {
              clearInterval(autoCheckInTimerRef.current);
              autoCheckInTimerRef.current = null;
            }
            setAutoCheckInCountdown(null);

            try {
              const record = performCheckIn(
                employeeId,
                employeeName,
                coords,
                currentAddress || 'Raniganj HQ',
                'AUTO'
              );
              refreshRecords();
              setActionFeedback(`Auto Check-In Successful at ${record.checkInTime}!`);
            } catch (err: any) {
              console.error('Auto Check-In failed:', err);
            }
          }
        }, 1000);
      }
    } else {
      if (autoCheckInTimerRef.current) {
        clearInterval(autoCheckInTimerRef.current);
        autoCheckInTimerRef.current = null;
      }
      setAutoCheckInCountdown(null);
    }
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
        const inside = calculatedDistance <= OFFICE_LOCATION.radius;
        setIsInsideGeofence(inside);

        // Track Smart Office Exit / Return log
        const todayStr = getFormattedDateStr();
        const activeRecord = getTodayAttendanceRecord(employeeId, todayStr);
        if (activeRecord) {
          trackSmartOfficeExit(activeRecord, calculatedDistance);
        }

        handleAutoCheckInCountdown(inside, { latitude, longitude });

        if (!navigator.onLine) {
          const cachedAddress = getValidCachedAddress();
          setCurrentAddress(cachedAddress || 'Raniganj HQ');
          setRawGeocodeResponse('Browser is offline.');
          setLocationStatus('success');
          return;
        }

        await performReverseGeocode(latitude, longitude);
      };

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
            setErrorMessage('Unable to retrieve location. Please enable GPS.');
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      }
    };

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
  }, [employeeId, employeeName]);

  const handleManualCheckIn = () => {
    if (!liveLocation) {
      setActionFeedback('Live GPS location required for check-in.');
      return;
    }
    try {
      const record = performCheckIn(
        employeeId,
        employeeName,
        liveLocation,
        currentAddress || 'Raniganj HQ',
        'MANUAL'
      );
      refreshRecords();
      setActionFeedback(`Manual Check-In Successful at ${record.checkInTime}`);
    } catch (err: any) {
      setActionFeedback(`Check-In Failed: ${err.message}`);
    }
  };

  const handleManualCheckOut = () => {
    if (!todayRecord) return;
    if (!liveLocation) {
      setActionFeedback('Live GPS location required for check-out.');
      return;
    }
    try {
      const updated = performCheckOut(
        todayRecord,
        liveLocation,
        currentAddress || 'Raniganj HQ'
      );
      refreshRecords();
      setActionFeedback(`Manual Check-Out Successful at ${updated.checkOutTime}`);
    } catch (err: any) {
      setActionFeedback(`Check-Out Error: ${err.message}`);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const result = await syncPendingAttendanceRecords();
    setIsSyncing(false);
    refreshRecords();
    setActionFeedback(`Synced ${result.syncedCount} records to cloud.`);
  };

  const reminderStatus = getCheckoutReminderStatus(todayRecord);
  const pendingCount = allRecords.filter((r) => r.syncStatus === 'Pending').length;

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Header & Connectivity Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-on-background leading-tight">EXFIN Smart Attendance</h1>
          <p className="text-xs text-on-surface-variant font-medium">Offline-First Engine v5.6.0</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
            isOnline ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
          }`}>
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Sync Status Banner */}
      {pendingCount > 0 && (
        <Card className="p-3.5 bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <RotateCw className={`w-4 h-4 text-amber-700 ${isSyncing ? 'animate-spin' : ''}`} />
            <span><strong>{pendingCount} attendance record(s)</strong> stored locally offline.</span>
          </div>
          <Button 
            size="sm" 
            variant="outlined" 
            onClick={handleSyncNow} 
            disabled={!isOnline || isSyncing}
            className="text-amber-900 border-amber-300 hover:bg-amber-100"
          >
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </Card>
      )}

      {/* Feedback Toast Banner */}
      {actionFeedback && (
        <div className="p-3 bg-primary/10 border border-primary/30 text-primary rounded-xl text-xs font-semibold flex justify-between items-center animate-fade-in">
          <span>{actionFeedback}</span>
          <button onClick={() => setActionFeedback(null)} className="text-primary font-bold">✕</button>
        </div>
      )}

      {/* Location Status Card */}
      {locationStatus === 'loading' && (
        <Card className="p-8 flex flex-col items-center justify-center gap-4 bg-surface text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-on-surface-variant font-medium">Acquiring GPS location...</p>
        </Card>
      )}

      {locationStatus === 'error' && (
        <Card className="p-6 flex flex-col items-center justify-center gap-4 bg-error-container text-on-error-container text-center border-l-4 border-l-error">
          <AlertCircle className="w-12 h-12 text-error" />
          <div>
            <h2 className="text-lg font-bold mb-1">GPS Error</h2>
            <p className="text-sm">{errorMessage}</p>
          </div>
          <Button onClick={() => startTrackingRef.current?.()} className="mt-2 bg-error text-on-error hover:bg-error/90">
            Retry GPS
          </Button>
        </Card>
      )}

      {locationStatus === 'success' && liveLocation && distance !== null && (
        <>
          {/* Geofence Status Banner */}
          <div className={`p-4 rounded-xl flex items-center justify-between shadow-sm ${
            isInsideGeofence 
              ? 'bg-green-100 text-green-900 border border-green-200' 
              : 'bg-red-100 text-red-900 border border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              {isInsideGeofence ? (
                <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
              )}
              <div>
                <h2 className="font-bold text-base leading-tight">
                  {isInsideGeofence ? 'Inside Office Geofence' : 'Outside Office Geofence'}
                </h2>
                <p className="text-xs opacity-90 mt-0.5">
                  Distance: <strong>{distance.toFixed(1)} meters</strong> (GeoFence Radius: {OFFICE_LOCATION.radius}m)
                </p>
              </div>
            </div>
          </div>

          {/* Current Location Card (Display ONLY Town/City per specification) */}
          <Card className="p-4 bg-surface shadow-sm flex items-center gap-3">
            <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-0.5">Current Location</p>
              <p className="text-sm font-bold text-on-surface">
                {currentAddress || 'Raniganj HQ'}
              </p>
            </div>
          </Card>

          {/* Auto Check-In Countdown Notification Banner */}
          {autoCheckInCountdown !== null && (
            <Card className="p-4 bg-primary text-on-primary shadow-md flex flex-col gap-2 animate-bounce">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" /> Auto Check-In
                </span>
                <span className="text-lg font-black bg-white/20 px-3 py-0.5 rounded-full">
                  {autoCheckInCountdown}s
                </span>
              </div>
              <p className="text-xs text-primary-container leading-tight">
                Remain inside 25m office radius for 10 seconds to auto check-in.
              </p>
              <div className="w-full bg-white/30 h-2 rounded-full overflow-hidden mt-1">
                <div 
                  className="bg-white h-full transition-all duration-1000 ease-linear"
                  style={{ width: `${((10 - autoCheckInCountdown) / 10) * 100}%` }}
                />
              </div>
            </Card>
          )}

          {/* Smart Reminder Engine Banner (Starting at 06:00 PM every 15 min) */}
          {reminderStatus.isReminderActive && (
            <Card className="p-4 bg-amber-500 text-white shadow-md flex items-start gap-3 border-l-4 border-l-amber-700">
              <Bell className="w-6 h-6 flex-shrink-0 mt-0.5 animate-pulse" />
              <div>
                <h3 className="font-bold text-sm">Smart Checkout Reminder</h3>
                <p className="text-xs text-amber-100 leading-relaxed mt-0.5">
                  Office Closing Time was 06:00 PM. Please perform Manual Check-Out before leaving office geofence.
                </p>
                {reminderStatus.nextReminderTimeStr && (
                  <p className="text-[11px] font-semibold text-amber-200 mt-1">
                    Next Reminder: {reminderStatus.nextReminderTimeStr} (Reminders sent: {reminderStatus.currentReminderCount})
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Action Control Panel */}
          <Card className="p-5 bg-surface shadow-sm flex flex-col gap-4">
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Today's Attendance Session
            </h2>

            {!todayRecord ? (
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-surface-variant/50 rounded-xl text-xs text-on-surface-variant">
                  <p className="font-semibold text-on-surface mb-1">Status: Not Checked In</p>
                  <p>When inside 25m geofence for 10 seconds, system triggers <strong>AUTO</strong> check-in, or tap below to manually check in.</p>
                </div>
                <Button 
                  onClick={handleManualCheckIn} 
                  className="w-full py-3 bg-primary text-on-primary font-bold text-sm rounded-xl shadow"
                >
                  <UserCheck className="w-5 h-5 mr-2" /> Manual Check-In (Mode: MANUAL)
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active Session Summary */}
                <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Check-In Time:</span>
                    <span className="font-bold text-primary text-sm">{todayRecord.checkInTime}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Check-In Mode:</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      todayRecord.checkInMode === 'AUTO' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {todayRecord.checkInMode}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant">Check-Out Status:</span>
                    {todayRecord.checkOutTime ? (
                      <span className="font-bold text-green-700 text-sm">{todayRecord.checkOutTime}</span>
                    ) : (
                      <span className="font-semibold text-amber-700">Pending</span>
                    )}
                  </div>
                  {todayRecord.workingHours && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-on-surface-variant">Working Hours:</span>
                      <span className="font-bold text-on-surface">{todayRecord.workingHours}</span>
                    </div>
                  )}
                  {todayRecord.checkOutMode !== 'N/A' && (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-on-surface-variant">Check-Out Mode:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        todayRecord.checkOutMode === 'AUTO_SYSTEM' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {todayRecord.checkOutMode}
                      </span>
                    </div>
                  )}
                  {todayRecord.exitTime && (
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-primary/10">
                      <span className="text-on-surface-variant flex items-center gap-1">
                        <Navigation className="w-3 h-3 text-amber-600" /> Office Exit Log:
                      </span>
                      <span className="font-medium text-amber-800">
                        Exit: {todayRecord.exitTime} {todayRecord.returnTime ? `| Return: ${todayRecord.returnTime}` : '(Out)'}
                      </span>
                    </div>
                  )}
                  {todayRecord.reason && (
                    <div className="flex justify-between items-center text-xs text-red-700 pt-1 border-t border-primary/10">
                      <span>Reason:</span>
                      <span className="font-medium">{todayRecord.reason}</span>
                    </div>
                  )}
                </div>

                {!todayRecord.checkOutTime && (
                  <div className="space-y-2">
                    <Button 
                      onClick={handleManualCheckOut} 
                      disabled={!isInsideGeofence}
                      className={`w-full py-3 font-bold text-sm rounded-xl ${
                        isInsideGeofence 
                          ? 'bg-red-600 text-white hover:bg-red-700 shadow' 
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      <LogOut className="w-5 h-5 mr-2" /> Manual Check-Out (Requires 25m Geofence)
                    </Button>
                    {!isInsideGeofence && (
                      <p className="text-[11px] text-red-600 text-center font-medium">
                        Manual Check-Out is allowed ONLY inside the 25m office geofence.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Employee Attendance History */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Employee History
            </h2>

            {allRecords.length === 0 ? (
              <Card className="p-6 text-center text-on-surface-variant text-xs">
                No attendance logs found stored on this device.
              </Card>
            ) : (
              <div className="space-y-3">
                {allRecords.slice(0, 10).map((rec) => (
                  <Card key={rec.id} className="p-4 bg-surface shadow-sm space-y-2.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-sm text-on-surface">{rec.date}</h3>
                        <p className="text-[11px] text-on-surface-variant font-medium">{rec.townCity}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          rec.syncStatus === 'Synced' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {rec.syncStatus === 'Synced' ? 'Synced' : 'Offline Pending'}
                        </span>
                        <span className="text-[10px] text-outline">
                          {rec.isOffline ? 'Recorded Offline' : 'Recorded Online'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-outline/10">
                      <div className="bg-surface-variant/30 p-2 rounded">
                        <p className="text-[10px] text-outline">Check-In</p>
                        <p className="font-bold text-on-surface">{rec.checkInTime}</p>
                        <span className="text-[9px] font-semibold text-primary">{rec.checkInMode}</span>
                      </div>
                      <div className="bg-surface-variant/30 p-2 rounded">
                        <p className="text-[10px] text-outline">Check-Out</p>
                        <p className="font-bold text-on-surface">{rec.checkOutTime || '--:--'}</p>
                        <span className={`text-[9px] font-semibold ${
                          rec.checkOutMode === 'AUTO_SYSTEM' ? 'text-red-600' : 'text-green-600'
                        }`}>
                          {rec.checkOutMode}
                        </span>
                      </div>
                      <div className="bg-surface-variant/30 p-2 rounded">
                        <p className="text-[10px] text-outline">Working Hrs</p>
                        <p className="font-bold text-on-surface">{rec.workingHours || '--'}</p>
                      </div>
                    </div>

                    {(rec.exitTime || rec.returnTime) && (
                      <div className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded font-medium flex justify-between">
                        <span>Office Exit Log:</span>
                        <span>Exit: {rec.exitTime || '--'} | Return: {rec.returnTime || '--'}</span>
                      </div>
                    )}

                    {rec.reason && (
                      <p className="text-[11px] text-red-600 bg-red-50 p-2 rounded font-medium">
                        Auto Checkout Reason: {rec.reason}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Debug Mode Panel */}
          <div className="mt-6 border border-outline-variant rounded-xl overflow-hidden bg-surface-variant/30">
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="w-full flex items-center justify-between p-3.5 bg-surface-variant text-on-surface-variant font-medium text-xs hover:bg-surface-variant/80 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Debug Mode
              </div>
              {showDebug ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showDebug && (
              <div className="p-4 space-y-3 text-[11px] font-mono text-on-surface-variant overflow-x-auto">
                <div>
                  <strong className="text-primary block mb-0.5">Office Target GPS:</strong>
                  Lat: {OFFICE_LOCATION.latitude}, Lon: {OFFICE_LOCATION.longitude} (Radius: {OFFICE_LOCATION.radius}m)
                </div>
                <div>
                  <strong className="text-primary block mb-0.5">Live GPS:</strong>
                  Lat: {liveLocation.latitude}, Lon: {liveLocation.longitude} (Distance: {distance.toFixed(2)}m)
                </div>
                <div>
                  <strong className="text-primary block mb-0.5">Geocode Debug Output:</strong>
                  <pre className="whitespace-pre-wrap bg-surface p-2 rounded border border-outline-variant mt-1 text-[10px]">
                    {rawGeocodeResponse}
                  </pre>
                </div>
                <div>
                  <strong className="text-primary block mb-0.5">Employee Metadata:</strong>
                  ID: {employeeId} | Name: {employeeName}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
