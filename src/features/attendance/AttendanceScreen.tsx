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
  Navigation,
  Building2,
  Home,
  Users,
  Car,
  Search,
  Filter,
  Check,
  FileText,
  Briefcase
} from 'lucide-react';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { useRegistration } from '../../context/RegistrationContext';
import { AttendanceRecord, AttendanceType, OutdoorWorkTypeOption } from '../../types/attendance';
import {
  OFFICE_LOCATION,
  getDistanceFromLatLonInM,
  getFormattedDateStr,
  getFormattedTimeStr,
  performCheckIn,
  performCheckOut,
  checkAndTriggerAutoCheckout,
  getCheckoutReminderStatus,
  trackSmartOfficeExit,
  getMonthlyWfhCount,
  performWFHAttendance,
  performClientVisitAttendance,
  performOutdoorAttendance
} from '../../services/attendance/smartAttendanceEngine';
import {
  getStoredAttendanceRecords,
  getTodayAttendanceRecord
} from '../../services/attendance/attendanceStorage';
import {
  startAutoSyncEngine,
  syncPendingAttendanceRecords
} from '../../services/attendance/syncEngine';

const OUTDOOR_TYPE_OPTIONS: OutdoorWorkTypeOption[] = [
  'Market Visit',
  'Site Visit',
  'Field Work',
  'Survey',
  'Installation',
  'Collection',
  'Delivery',
  'Inspection'
];

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

  // Selected Mode State ('OFFICE' | 'WFH' | 'CLIENT_VISIT' | 'OUTDOOR')
  const [activeMode, setActiveMode] = useState<AttendanceType>('OFFICE');

  // WFH Form State
  const [wfhReason, setWfhReason] = useState<string>('');
  const [wfhWorkPlan, setWfhWorkPlan] = useState<string>('');
  const [wfhFormError, setWfhFormError] = useState<string | null>(null);

  // Client Visit Form State
  const [clientName, setClientName] = useState<string>('');
  const [clientLocation, setClientLocation] = useState<string>('');
  const [clientPurpose, setClientPurpose] = useState<string>('');
  const [clientFormError, setClientFormError] = useState<string | null>(null);

  // Outdoor Work Form State
  const [outdoorType, setOutdoorType] = useState<OutdoorWorkTypeOption>('Market Visit');
  const [outdoorDescription, setOutdoorDescription] = useState<string>('');
  const [outdoorFormError, setOutdoorFormError] = useState<string | null>(null);

  // History Filter State
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | AttendanceType>('ALL');
  const [historySearchTerm, setHistorySearchTerm] = useState<string>('');
  const [historySyncFilter, setHistorySyncFilter] = useState<'ALL' | 'Synced' | 'Pending'>('ALL');

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
    if (today && today.attendanceType) {
      setActiveMode(today.attendanceType);
    }
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

  // Auto Check-In timer trigger logic (OFFICE Mode ONLY)
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

    if (inside && activeMode === 'OFFICE') {
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

        const todayStr = getFormattedDateStr();
        const activeRecord = getTodayAttendanceRecord(employeeId, todayStr);
        if (activeRecord && (activeRecord.attendanceType === 'OFFICE' || !activeRecord.attendanceType)) {
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

  // Office Check-In Handler
  const handleManualCheckIn = () => {
    if (todayRecord) {
      setActionFeedback('Attendance session already logged for today.');
      return;
    }
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
      setActionFeedback(`Manual Office Check-In Successful at ${record.checkInTime}`);
    } catch (err: any) {
      setActionFeedback(`Check-In Failed: ${err.message}`);
    }
  };

  // Office Check-Out Handler
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

  // WFH Submit Handler
  const handleWfhSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWfhFormError(null);

    if (todayRecord) {
      setWfhFormError('Attendance session already logged for today.');
      return;
    }

    if (!wfhReason.trim()) {
      setWfhFormError('Reason is mandatory for WFH.');
      return;
    }
    if (!wfhWorkPlan.trim()) {
      setWfhFormError("Today's Work Plan is mandatory for WFH.");
      return;
    }

    const currentWfhCount = getMonthlyWfhCount(employeeId);
    if (currentWfhCount >= 2) {
      setWfhFormError('Monthly WFH limit exceeded.');
      return;
    }

    try {
      const record = performWFHAttendance(
        employeeId,
        employeeName,
        liveLocation,
        currentAddress || 'Home',
        wfhReason.trim(),
        wfhWorkPlan.trim()
      );
      refreshRecords();
      setActionFeedback(`WFH Attendance Submitted at ${record.checkInTime}!`);
      setWfhReason('');
      setWfhWorkPlan('');
    } catch (err: any) {
      setWfhFormError(err.message || 'Failed to submit WFH attendance.');
    }
  };

  // Client Visit Submit Handler
  const handleClientVisitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientFormError(null);

    if (todayRecord) {
      setClientFormError('Attendance session already logged for today.');
      return;
    }

    if (!clientName.trim()) {
      setClientFormError('Client Name is mandatory.');
      return;
    }
    if (!clientLocation.trim()) {
      setClientFormError('Client Address / Location is mandatory.');
      return;
    }
    if (!clientPurpose.trim()) {
      setClientFormError('Purpose of Visit is mandatory.');
      return;
    }

    try {
      const record = performClientVisitAttendance(
        employeeId,
        employeeName,
        liveLocation,
        currentAddress || clientLocation.trim(),
        clientName.trim(),
        clientLocation.trim(),
        clientPurpose.trim()
      );
      refreshRecords();
      setActionFeedback(`Client Visit Attendance Submitted at ${record.checkInTime}!`);
      setClientName('');
      setClientLocation('');
      setClientPurpose('');
    } catch (err: any) {
      setClientFormError(err.message || 'Failed to submit Client Visit attendance.');
    }
  };

  // Outdoor Work Submit Handler
  const handleOutdoorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOutdoorFormError(null);

    if (todayRecord) {
      setOutdoorFormError('Attendance session already logged for today.');
      return;
    }

    if (!outdoorDescription.trim()) {
      setOutdoorFormError('Description is mandatory.');
      return;
    }

    try {
      const record = performOutdoorAttendance(
        employeeId,
        employeeName,
        liveLocation,
        currentAddress || 'Field',
        outdoorType,
        outdoorDescription.trim()
      );
      refreshRecords();
      setActionFeedback(`Outdoor Work Attendance Submitted at ${record.checkInTime}!`);
      setOutdoorDescription('');
    } catch (err: any) {
      setOutdoorFormError(err.message || 'Failed to submit Outdoor Work attendance.');
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    const result = await syncPendingAttendanceRecords();
    setIsSyncing(false);
    refreshRecords();
    setActionFeedback(`Synced ${result.syncedCount} records to cloud.`);
  };

  const currentWfhMonthCount = getMonthlyWfhCount(employeeId);
  const reminderStatus = getCheckoutReminderStatus(todayRecord);
  const pendingCount = allRecords.filter((r) => r.syncStatus === 'Pending').length;

  // History filtering
  const filteredHistoryRecords = allRecords.filter((rec) => {
    const typeMatch = historyTypeFilter === 'ALL' || (rec.attendanceType || 'OFFICE') === historyTypeFilter;
    const syncMatch = historySyncFilter === 'ALL' || rec.syncStatus === historySyncFilter;
    const searchLower = historySearchTerm.toLowerCase().trim();
    const searchMatch = !searchLower || (
      rec.date.includes(searchLower) ||
      rec.townCity.toLowerCase().includes(searchLower) ||
      (rec.attendanceType || 'OFFICE').toLowerCase().includes(searchLower) ||
      (rec.clientName && rec.clientName.toLowerCase().includes(searchLower)) ||
      (rec.outdoorType && rec.outdoorType.toLowerCase().includes(searchLower))
    );
    return typeMatch && syncMatch && searchMatch;
  });

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Header & Connectivity Status */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-on-background leading-tight">EXFIN Smart Attendance</h1>
          <p className="text-xs text-on-surface-variant font-medium">Multi-Mode Offline Engine v6.0</p>
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
          {/* Current Location Card */}
          <Card className="p-4 bg-surface shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider mb-0.5">Current Location</p>
                <p className="text-sm font-bold text-on-surface">
                  {currentAddress || 'Raniganj HQ'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isInsideGeofence ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
              }`}>
                {distance.toFixed(0)}m from Office
              </span>
            </div>
          </Card>

          {/* ==================================================== */}
          {/* ATTENDANCE MODES SELECTION GRID (Material Design 3) */}
          {/* ==================================================== */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">
                Select Today's Attendance Mode
              </h2>
              {todayRecord && (
                <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                  Locked for Today
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: Office */}
              <button
                type="button"
                disabled={!!todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE'}
                onClick={() => setActiveMode('OFFICE')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 relative overflow-hidden ${
                  activeMode === 'OFFICE'
                    ? 'border-primary bg-primary/10 shadow-md ring-2 ring-primary'
                    : 'border-outline/20 bg-surface hover:border-primary/50'
                } ${todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                    🏢
                  </div>
                  {activeMode === 'OFFICE' && (
                    <span className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center text-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Office</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium">25m Office Geofence</p>
                </div>
              </button>

              {/* Option 2: Work From Home (WFH) */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'WFH'}
                onClick={() => setActiveMode('WFH')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 relative overflow-hidden ${
                  activeMode === 'WFH'
                    ? 'border-emerald-600 bg-emerald-50 shadow-md ring-2 ring-emerald-600'
                    : 'border-outline/20 bg-surface hover:border-emerald-500/50'
                } ${todayRecord && todayRecord.attendanceType !== 'WFH' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                    🏠
                  </div>
                  {activeMode === 'WFH' && (
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                    {currentWfhMonthCount}/2
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Work From Home</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium">Max 2 per Month</p>
                </div>
              </button>

              {/* Option 3: Client Visit */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT'}
                onClick={() => setActiveMode('CLIENT_VISIT')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 relative overflow-hidden ${
                  activeMode === 'CLIENT_VISIT'
                    ? 'border-amber-600 bg-amber-50 shadow-md ring-2 ring-amber-600'
                    : 'border-outline/20 bg-surface hover:border-amber-500/50'
                } ${todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    🤝
                  </div>
                  {activeMode === 'CLIENT_VISIT' && (
                    <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Client Visit</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium">On-site Meetings</p>
                </div>
              </button>

              {/* Option 4: Outdoor Work */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'OUTDOOR'}
                onClick={() => setActiveMode('OUTDOOR')}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-28 relative overflow-hidden ${
                  activeMode === 'OUTDOOR'
                    ? 'border-indigo-600 bg-indigo-50 shadow-md ring-2 ring-indigo-600'
                    : 'border-outline/20 bg-surface hover:border-indigo-500/50'
                } ${todayRecord && todayRecord.attendanceType !== 'OUTDOOR' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                    🚗
                  </div>
                  {activeMode === 'OUTDOOR' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Outdoor Work</h3>
                  <p className="text-[10px] text-on-surface-variant font-medium">Field & Market Visit</p>
                </div>
              </button>
            </div>
          </div>

          {/* Locked Mode Banner if session already active */}
          {todayRecord && (
            <Card className="p-3.5 bg-surface border border-primary/20 flex items-center justify-between text-xs text-on-surface">
              <div className="flex items-center gap-2">
                <span className="text-base">
                  {todayRecord.attendanceType === 'WFH' ? '🏠' : todayRecord.attendanceType === 'CLIENT_VISIT' ? '🤝' : todayRecord.attendanceType === 'OUTDOOR' ? '🚗' : '🏢'}
                </span>
                <div>
                  <span className="font-bold">Active Today: {todayRecord.attendanceType || 'OFFICE'}</span>
                  <p className="text-[10px] text-on-surface-variant">Only 1 attendance mode allowed per day. Other modes are locked.</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-[10px] font-bold">Logged {todayRecord.checkInTime}</span>
            </Card>
          )}

          {/* ==================================================== */}
          {/* MODE 1: OFFICE MODE CONTENT */}
          {/* ==================================================== */}
          {activeMode === 'OFFICE' && (
            <div className="space-y-4">
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

              {/* Auto Check-In Countdown Notification Banner */}
              {autoCheckInCountdown !== null && (
                <Card className="p-4 bg-primary text-on-primary shadow-md flex flex-col gap-2 animate-bounce">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4" /> Auto Check-In Countdown
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

              {/* Smart Reminder Engine Banner */}
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

              {/* Office Action Control Panel */}
              <Card className="p-5 bg-surface shadow-sm flex flex-col gap-4">
                <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" /> Office Attendance Session
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
                      <UserCheck className="w-5 h-5 mr-2" /> Manual Check-In (Office)
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
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 2: WORK FROM HOME (WFH) CONTENT */}
          {/* ==================================================== */}
          {activeMode === 'WFH' && (
            <Card className="p-5 bg-surface shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-outline/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🏠</span>
                  <div>
                    <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">Work From Home (WFH)</h2>
                    <p className="text-xs text-on-surface-variant">No office geofence required</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  currentWfhMonthCount >= 2 ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {currentWfhMonthCount} / 2 Used This Month
                </span>
              </div>

              {currentWfhMonthCount >= 2 && !todayRecord && (
                <div className="p-3 bg-red-100 border border-red-300 text-red-900 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-700 flex-shrink-0" />
                  <span>Monthly WFH limit exceeded. (Max 2 requests per calendar month)</span>
                </div>
              )}

              {todayRecord && todayRecord.attendanceType === 'WFH' ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 text-xs text-emerald-950">
                  <div className="flex justify-between font-bold text-sm text-emerald-900">
                    <span>WFH Session Active</span>
                    <span>Check-In: {todayRecord.checkInTime}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-emerald-800">Reason:</p>
                    <p className="bg-white/80 p-2 rounded border border-emerald-200">{todayRecord.wfhReason}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold text-emerald-800">Today's Work Plan:</p>
                    <p className="bg-white/80 p-2 rounded border border-emerald-200">{todayRecord.workPlan}</p>
                  </div>
                  <p className="text-[11px] text-emerald-700 italic">No Check-Out required for WFH mode.</p>
                </div>
              ) : (
                <form onSubmit={handleWfhSubmit} className="space-y-4">
                  {wfhFormError && (
                    <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-medium">
                      {wfhFormError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                      Reason <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={wfhReason}
                      onChange={(e) => setWfhReason(e.target.value)}
                      placeholder="Specify reason for working from home..."
                      disabled={currentWfhMonthCount >= 2 || !!todayRecord}
                      className="w-full p-3 text-xs rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-emerald-600 text-on-surface"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                      Today's Work Plan <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={wfhWorkPlan}
                      onChange={(e) => setWfhWorkPlan(e.target.value)}
                      placeholder="Outline key deliverables planned for today..."
                      disabled={currentWfhMonthCount >= 2 || !!todayRecord}
                      className="w-full p-3 text-xs rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-emerald-600 text-on-surface"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={currentWfhMonthCount >= 2 || !!todayRecord}
                    className={`w-full py-3 font-bold text-sm rounded-xl text-white ${
                      currentWfhMonthCount >= 2 || !!todayRecord
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow'
                    }`}
                  >
                    Submit WFH
                  </Button>
                </form>
              )}
            </Card>
          )}

          {/* ==================================================== */}
          {/* MODE 3: CLIENT VISIT CONTENT */}
          {/* ==================================================== */}
          {activeMode === 'CLIENT_VISIT' && (
            <Card className="p-5 bg-surface shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-outline/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤝</span>
                  <div>
                    <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">Client Visit</h2>
                    <p className="text-xs text-on-surface-variant">On-site client meetings & calls</p>
                  </div>
                </div>
              </div>

              {todayRecord && todayRecord.attendanceType === 'CLIENT_VISIT' ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs text-amber-950">
                  <div className="flex justify-between font-bold text-sm text-amber-900">
                    <span>Client Visit Logged</span>
                    <span>Check-In: {todayRecord.checkInTime}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-amber-800 font-semibold">Client Name</p>
                      <p className="font-bold">{todayRecord.clientName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-amber-800 font-semibold">Location / Address</p>
                      <p className="font-bold">{todayRecord.clientLocation}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-800 font-semibold">Purpose of Visit</p>
                    <p className="bg-white/80 p-2 rounded border border-amber-200">{todayRecord.purpose}</p>
                  </div>
                  <p className="text-[11px] text-amber-800 italic">No Check-Out required for Client Visit.</p>
                </div>
              ) : (
                <form onSubmit={handleClientVisitSubmit} className="space-y-4">
                  {clientFormError && (
                    <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-medium">
                      {clientFormError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                      Client Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="E.g., Tata Steel Ltd"
                      disabled={!!todayRecord}
                      className="w-full p-3 text-xs rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-amber-600 text-on-surface"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                      Client Address / Location <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientLocation}
                      onChange={(e) => setClientLocation(e.target.value)}
                      placeholder="E.g., Asansol Industrial Estate, Plot 14"
                      disabled={!!todayRecord}
                      className="w-full p-3 text-xs rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-amber-600 text-on-surface"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                      Purpose of Visit <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={clientPurpose}
                      onChange={(e) => setClientPurpose(e.target.value)}
                      placeholder="E.g., Requirements gathering and project review meeting"
                      disabled={!!todayRecord}
                      className="w-full p-3 text-xs rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-amber-600 text-on-surface"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!!todayRecord}
                    className={`w-full py-3 font-bold text-sm rounded-xl text-white ${
                      !!todayRecord
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-amber-600 hover:bg-amber-700 shadow'
                    }`}
                  >
                    Submit Client Visit
                  </Button>
                </form>
              )}
            </Card>
          )}

          {/* ==================================================== */}
          {/* MODE 4: OUTDOOR WORK CONTENT */}
          {/* ==================================================== */}
          {activeMode === 'OUTDOOR' && (
            <Card className="p-5 bg-surface shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b border-outline/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚗</span>
                  <div>
                    <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider">Outdoor Work</h2>
                    <p className="text-xs text-on-surface-variant">Field duties, site work & deliveries</p>
                  </div>
                </div>
              </div>

              {todayRecord && todayRecord.attendanceType === 'OUTDOOR' ? (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-xl space-y-3 text-xs text-indigo-950">
                  <div className="flex justify-between font-bold text-sm text-indigo-900">
                    <span>Outdoor Work Logged</span>
                    <span>Check-In: {todayRecord.checkInTime}</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-indigo-800 font-semibold">Outdoor Work Type</p>
                    <p className="font-bold text-sm text-indigo-900">{todayRecord.outdoorType}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-indigo-800 font-semibold">Description</p>
                    <p className="bg-white/80 p-2 rounded border border-indigo-200">{todayRecord.description}</p>
                  </div>
                  <p className="text-[11px] text-indigo-800 italic">No Check-Out required for Outdoor Work.</p>
                </div>
              ) : (
                <form onSubmit={handleOutdoorSubmit} className="space-y-4">
                  {outdoorFormError && (
                    <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-xl text-xs font-medium">
                      {outdoorFormError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                      Outdoor Work Type <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={outdoorType}
                      onChange={(e) => setOutdoorType(e.target.value as OutdoorWorkTypeOption)}
                      disabled={!!todayRecord}
                      className="w-full p-3 text-xs rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-indigo-600 text-on-surface font-semibold"
                    >
                      {OUTDOOR_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1">
                      Description <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={outdoorDescription}
                      onChange={(e) => setOutdoorDescription(e.target.value)}
                      placeholder="Describe field activity, site location or assignment details..."
                      disabled={!!todayRecord}
                      className="w-full p-3 text-xs rounded-xl border border-outline/30 bg-surface focus:ring-2 focus:ring-indigo-600 text-on-surface"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!!todayRecord}
                    className={`w-full py-3 font-bold text-sm rounded-xl text-white ${
                      !!todayRecord
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 shadow'
                    }`}
                  >
                    Submit Outdoor Work
                  </Button>
                </form>
              )}
            </Card>
          )}

          {/* ==================================================== */}
          {/* EMPLOYEE ATTENDANCE HISTORY SECTION */}
          {/* ==================================================== */}
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-on-surface uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" /> Employee History
              </h2>
              <span className="text-xs text-on-surface-variant font-semibold">
                {filteredHistoryRecords.length} record(s)
              </span>
            </div>

            {/* Filter & Search Bar */}
            <Card className="p-3 bg-surface shadow-sm space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-outline absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search date, location, client, mode..."
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-outline/30 bg-surface focus:ring-2 focus:ring-primary text-on-surface"
                />
              </div>

              {/* Attendance Type Badges Filter */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] font-semibold">
                <button
                  onClick={() => setHistoryTypeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                    historyTypeFilter === 'ALL'
                      ? 'bg-primary text-on-primary font-bold'
                      : 'bg-surface-variant text-on-surface-variant hover:bg-surface-variant/80'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('OFFICE')}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1 transition-colors ${
                    historyTypeFilter === 'OFFICE'
                      ? 'bg-purple-700 text-white font-bold'
                      : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                  }`}
                >
                  🏢 Office
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('WFH')}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1 transition-colors ${
                    historyTypeFilter === 'WFH'
                      ? 'bg-emerald-700 text-white font-bold'
                      : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                  }`}
                >
                  🏠 WFH
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('CLIENT_VISIT')}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1 transition-colors ${
                    historyTypeFilter === 'CLIENT_VISIT'
                      ? 'bg-amber-700 text-white font-bold'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  }`}
                >
                  🤝 Client Visit
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('OUTDOOR')}
                  className={`px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1 transition-colors ${
                    historyTypeFilter === 'OUTDOOR'
                      ? 'bg-indigo-700 text-white font-bold'
                      : 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                  }`}
                >
                  🚗 Outdoor Work
                </button>
              </div>
            </Card>

            {filteredHistoryRecords.length === 0 ? (
              <Card className="p-6 text-center text-on-surface-variant text-xs">
                No attendance logs found matching filters.
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredHistoryRecords.slice(0, 15).map((rec) => {
                  const modeType = rec.attendanceType || 'OFFICE';
                  return (
                    <Card key={rec.id} className="p-4 bg-surface shadow-sm space-y-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-on-surface">{rec.date}</h3>
                            {/* Mode Badge */}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                              modeType === 'WFH'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : modeType === 'CLIENT_VISIT'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : modeType === 'OUTDOOR'
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                                : 'bg-purple-100 text-purple-800 border border-purple-300'
                            }`}>
                              {modeType === 'WFH' ? '🏠 WFH' : modeType === 'CLIENT_VISIT' ? '🤝 Client Visit' : modeType === 'OUTDOOR' ? '🚗 Outdoor Work' : '🏢 Office'}
                            </span>
                          </div>
                          <p className="text-[11px] text-on-surface-variant font-medium mt-0.5">{rec.townCity}</p>
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

                      {/* Mode-Specific Details Card */}
                      {modeType === 'WFH' && (
                        <div className="bg-emerald-50/70 p-2.5 rounded-lg border border-emerald-200/60 text-xs space-y-1">
                          <p className="text-[10px] font-bold text-emerald-900">Reason: <span className="font-normal text-emerald-950">{rec.wfhReason || 'N/A'}</span></p>
                          <p className="text-[10px] font-bold text-emerald-900">Work Plan: <span className="font-normal text-emerald-950">{rec.workPlan || 'N/A'}</span></p>
                        </div>
                      )}

                      {modeType === 'CLIENT_VISIT' && (
                        <div className="bg-amber-50/70 p-2.5 rounded-lg border border-amber-200/60 text-xs space-y-1">
                          <p className="text-[10px] font-bold text-amber-900">Client: <span className="font-normal text-amber-950">{rec.clientName}</span> | Location: <span className="font-normal text-amber-950">{rec.clientLocation}</span></p>
                          <p className="text-[10px] font-bold text-amber-900">Purpose: <span className="font-normal text-amber-950">{rec.purpose}</span></p>
                        </div>
                      )}

                      {modeType === 'OUTDOOR' && (
                        <div className="bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-200/60 text-xs space-y-1">
                          <p className="text-[10px] font-bold text-indigo-900">Outdoor Type: <span className="font-extrabold text-indigo-950">{rec.outdoorType}</span></p>
                          <p className="text-[10px] font-bold text-indigo-900">Description: <span className="font-normal text-indigo-950">{rec.description}</span></p>
                        </div>
                      )}

                      {/* Timing metrics */}
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
                  );
                })}
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
                  <strong className="text-primary block mb-0.5">Active Attendance Mode:</strong>
                  {activeMode}
                </div>
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
