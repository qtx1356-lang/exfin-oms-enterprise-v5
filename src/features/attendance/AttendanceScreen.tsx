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
  Briefcase,
  Lock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Activity
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

  // Helper greetings & formatting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning,';
    if (hour < 17) return 'Good Afternoon,';
    return 'Good Evening,';
  };

  const getFormattedDateLong = () => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const getEmployeeInitials = (name: string) => {
    if (!name) return 'EX';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getDisplayCity = (addressStr: string) => {
    if (!addressStr || addressStr.toLowerCase().includes('address unavailable')) {
      return 'Raniganj';
    }
    const parts = addressStr.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
    return 'Raniganj';
  };

  const formatDistanceDisplay = (meters: number | null) => {
    if (meters === null) return 'Calculating...';
    if (meters >= 1000) {
      return `${(meters / 1000).toFixed(2)} km`;
    }
    return `${meters.toFixed(0)} meters`;
  };

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
    <div className="min-h-screen bg-[#F7F9FC] text-slate-900 pb-28 pt-2 px-3 sm:px-6 max-w-5xl mx-auto space-y-6">
      {/* ==================================================== */}
      {/* ENTERPRISE EXECUTIVE HEADER */}
      {/* ==================================================== */}
      <div className="bg-white rounded-[24px] border border-slate-200/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{getGreeting()}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#2563EB]">EXFIN OMS</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">{employeeName}</h1>
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-1">
            <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
            {getFormattedDateLong()}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-center">
          {/* Connectivity Status Badge */}
          <span className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
            isOnline ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-amber-50 text-amber-700 border border-amber-200/60'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {isOnline ? 'Online' : 'Offline'}
          </span>

          {/* Sync Trigger Badge */}
          <button
            onClick={handleSyncNow}
            disabled={!isOnline || isSyncing}
            className={`p-2 rounded-full border transition-all flex items-center justify-center relative ${
              pendingCount > 0 
                ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' 
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title={pendingCount > 0 ? `${pendingCount} offline records pending sync` : 'All records synced'}
          >
            <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#2563EB]' : ''}`} />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-extrabold flex items-center justify-center shadow">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Notification Bell Badge */}
          <div className="p-2 rounded-full bg-slate-50 border border-slate-200 text-slate-600 relative">
            <Bell className="w-4 h-4" />
            {reminderStatus.isReminderActive && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
            )}
          </div>

          {/* Profile Avatar with Initials */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#1E3A8A] to-[#2563EB] text-white font-extrabold text-sm flex items-center justify-center shadow-md ring-2 ring-blue-500/20">
            {getEmployeeInitials(employeeName)}
          </div>
        </div>
      </div>

      {/* Sync Status Alert Banner if Offline Pending */}
      {pendingCount > 0 && (
        <div className="p-4 bg-amber-50/90 border border-amber-200/80 rounded-[20px] flex items-center justify-between text-xs text-amber-900 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <p className="font-bold text-sm">Offline Synchronization Pending</p>
              <p className="text-amber-800/80 text-[11px]">{pendingCount} attendance record(s) saved locally on device.</p>
            </div>
          </div>
          <Button 
            size="sm" 
            onClick={handleSyncNow} 
            disabled={!isOnline || isSyncing}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm"
          >
            {isSyncing ? 'Syncing...' : 'Sync Cloud'}
          </Button>
        </div>
      )}

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className="p-4 bg-blue-50 border border-blue-200 text-[#1E3A8A] rounded-[20px] text-xs font-bold flex justify-between items-center shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#2563EB]" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-slate-500 hover:text-slate-900 font-bold text-sm px-1">✕</button>
        </div>
      )}

      {/* Location Status Card - Loading State */}
      {locationStatus === 'loading' && (
        <div className="p-8 rounded-[24px] bg-white border border-slate-200/80 shadow-sm flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-10 h-10 border-4 border-[#2563EB] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-600">Acquiring Enterprise GPS Lock...</p>
        </div>
      )}

      {/* Location Status Card - Error State */}
      {locationStatus === 'error' && (
        <div className="p-6 rounded-[24px] bg-red-50 border border-red-200 text-red-900 shadow-sm flex flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="w-10 h-10 text-red-600" />
          <div>
            <h2 className="text-sm font-bold">GPS Location Unavailable</h2>
            <p className="text-xs opacity-80 mt-0.5">{errorMessage}</p>
          </div>
          <Button onClick={() => startTrackingRef.current?.()} className="bg-red-600 text-white font-bold text-xs py-2 px-4 rounded-xl shadow">
            Retry GPS
          </Button>
        </div>
      )}

      {/* Location Status Card - Success State */}
      {locationStatus === 'success' && liveLocation && distance !== null && (
        <>
          {/* ==================================================== */}
          {/* CURRENT LOCATION CARD (ENTERPRISE REDESIGN) */}
          {/* ==================================================== */}
          <div className="bg-white rounded-[24px] border border-slate-200/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#2563EB] flex items-center justify-center flex-shrink-0 font-bold shadow-sm">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Current City / Location</p>
                <h3 className="text-base font-black text-slate-900 leading-tight">
                  📍 {getDisplayCity(currentAddress)}
                </h3>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Distance: <strong className="text-slate-800">{formatDistanceDisplay(distance)}</strong>
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <span className={`px-3 py-1.5 rounded-full text-xs font-black inline-flex items-center gap-1.5 border ${
                isInsideGeofence 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isInsideGeofence ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {isInsideGeofence ? 'Inside Office' : 'Outside Office'}
              </span>
            </div>
          </div>

          {/* ==================================================== */}
          {/* ATTENDANCE MODES SELECTION GRID (4 CARDS REDESIGN) */}
          {/* ==================================================== */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Select Today's Attendance Mode
              </h2>
              {todayRecord && (
                <span className="text-[10px] bg-blue-50 text-[#2563EB] font-extrabold px-2.5 py-1 rounded-full border border-blue-200">
                  Mode Locked for Today
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: Office */}
              <button
                type="button"
                disabled={!!todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE'}
                onClick={() => setActiveMode('OFFICE')}
                className={`p-4 rounded-[24px] border text-left transition-all duration-200 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'OFFICE'
                    ? 'border-[#2563EB] bg-blue-50/40 shadow-md ring-4 ring-blue-500/10'
                    : 'border-slate-200/80 bg-white hover:border-blue-400/50 hover:shadow-sm'
                } ${todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE' ? 'opacity-40 cursor-not-allowed bg-slate-50' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'OFFICE' ? 'bg-[#2563EB] text-white shadow-sm' : 'bg-purple-50 text-purple-700'
                  }`}>
                    🏢
                  </div>
                  {activeMode === 'OFFICE' && (
                    <span className="w-5 h-5 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs shadow">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE' && (
                    <Lock className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Office</h3>
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">25m Office Geofence</p>
                </div>
              </button>

              {/* Card 2: Work From Home (WFH) */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'WFH'}
                onClick={() => setActiveMode('WFH')}
                className={`p-4 rounded-[24px] border text-left transition-all duration-200 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'WFH'
                    ? 'border-emerald-600 bg-emerald-50/40 shadow-md ring-4 ring-emerald-500/10'
                    : 'border-slate-200/80 bg-white hover:border-emerald-400/50 hover:shadow-sm'
                } ${todayRecord && todayRecord.attendanceType !== 'WFH' ? 'opacity-40 cursor-not-allowed bg-slate-50' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'WFH' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 text-emerald-700'
                  }`}>
                    🏠
                  </div>
                  <div className="flex items-center gap-1">
                    {activeMode === 'WFH' && (
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs shadow">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                      {currentWfhMonthCount}/2 Used
                    </span>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Work From Home</h3>
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">Max 2 per Month</p>
                </div>
              </button>

              {/* Card 3: Client Visit */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT'}
                onClick={() => setActiveMode('CLIENT_VISIT')}
                className={`p-4 rounded-[24px] border text-left transition-all duration-200 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'CLIENT_VISIT'
                    ? 'border-amber-600 bg-amber-50/40 shadow-md ring-4 ring-amber-500/10'
                    : 'border-slate-200/80 bg-white hover:border-amber-400/50 hover:shadow-sm'
                } ${todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT' ? 'opacity-40 cursor-not-allowed bg-slate-50' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'CLIENT_VISIT' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-700'
                  }`}>
                    🤝
                  </div>
                  {activeMode === 'CLIENT_VISIT' && (
                    <span className="w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs shadow">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Client Visit</h3>
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">On-site Meetings</p>
                </div>
              </button>

              {/* Card 4: Outdoor Work */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'OUTDOOR'}
                onClick={() => setActiveMode('OUTDOOR')}
                className={`p-4 rounded-[24px] border text-left transition-all duration-200 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'OUTDOOR'
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-md ring-4 ring-indigo-500/10'
                    : 'border-slate-200/80 bg-white hover:border-indigo-400/50 hover:shadow-sm'
                } ${todayRecord && todayRecord.attendanceType !== 'OUTDOOR' ? 'opacity-40 cursor-not-allowed bg-slate-50' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'OUTDOOR' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-indigo-50 text-indigo-700'
                  }`}>
                    🚗
                  </div>
                  {activeMode === 'OUTDOOR' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs shadow">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Outdoor Work</h3>
                  <p className="text-[11px] text-slate-500 font-medium leading-tight">Field & Market Visit</p>
                </div>
              </button>
            </div>
          </div>

          {/* ==================================================== */}
          {/* TODAY'S ATTENDANCE SUMMARY CARD (IF ACTIVE) */}
          {/* ==================================================== */}
          {todayRecord && (
            <div className="bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] text-white rounded-[24px] p-6 shadow-md space-y-4">
              <div className="flex justify-between items-center border-b border-white/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">
                    {todayRecord.attendanceType === 'WFH' ? '🏠' : todayRecord.attendanceType === 'CLIENT_VISIT' ? '🤝' : todayRecord.attendanceType === 'OUTDOOR' ? '🚗' : '🏢'}
                  </span>
                  <div>
                    <p className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">Today's Active Attendance</p>
                    <h3 className="font-black text-lg text-white">{todayRecord.attendanceType || 'OFFICE'}</h3>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Logged {todayRecord.checkInTime}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
                  <p className="text-[10px] text-blue-200 font-semibold mb-0.5">Check-In Time</p>
                  <p className="font-extrabold text-base text-white">{todayRecord.checkInTime}</p>
                  <p className="text-[9px] text-blue-200 mt-0.5">{todayRecord.checkInMode} Mode</p>
                </div>

                <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
                  <p className="text-[10px] text-blue-200 font-semibold mb-0.5">Check-Out Time</p>
                  <p className="font-extrabold text-base text-white">{todayRecord.checkOutTime || 'Pending'}</p>
                  <p className="text-[9px] text-blue-200 mt-0.5">{todayRecord.checkOutMode !== 'N/A' ? todayRecord.checkOutMode : 'In Progress'}</p>
                </div>

                <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
                  <p className="text-[10px] text-blue-200 font-semibold mb-0.5">Working Hours</p>
                  <p className="font-extrabold text-base text-white">{todayRecord.workingHours || '--:--'}</p>
                  <p className="text-[9px] text-blue-200 mt-0.5">Today Session</p>
                </div>

                <div className="bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
                  <p className="text-[10px] text-blue-200 font-semibold mb-0.5">Cloud Sync</p>
                  <p className="font-extrabold text-sm text-white">{todayRecord.syncStatus}</p>
                  <p className="text-[9px] text-blue-200 mt-0.5">{todayRecord.isOffline ? 'Saved Offline' : 'Cloud Direct'}</p>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 1: OFFICE MODE REDESIGN */}
          {/* ==================================================== */}
          {activeMode === 'OFFICE' && (
            <div className="space-y-4">
              {/* Geofence Banner */}
              <div className={`p-4 rounded-[24px] flex items-center justify-between shadow-sm border transition-all ${
                isInsideGeofence 
                  ? 'bg-emerald-50 text-emerald-950 border-emerald-200/80' 
                  : 'bg-amber-50 text-amber-950 border-amber-200/80'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold ${
                    isInsideGeofence ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {isInsideGeofence ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm leading-tight">
                      {isInsideGeofence ? 'Inside Office Geofence (25m Radius)' : 'Outside Office Geofence'}
                    </h3>
                    <p className="text-xs opacity-80 mt-0.5">
                      Distance to Office HQ: <strong>{formatDistanceDisplay(distance)}</strong> (Geofence: {OFFICE_LOCATION.radius}m)
                    </p>
                  </div>
                </div>
              </div>

              {/* Auto Check-In Countdown Notification Banner */}
              {autoCheckInCountdown !== null && (
                <div className="p-5 rounded-[24px] bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] text-white shadow-md space-y-2 animate-bounce">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4" /> Auto Check-In Countdown
                    </span>
                    <span className="text-xl font-black bg-white/20 px-3.5 py-0.5 rounded-full">
                      {autoCheckInCountdown}s
                    </span>
                  </div>
                  <p className="text-xs text-blue-100 leading-tight">
                    Remain inside 25m office geofence for 10 seconds to complete automatic check-in.
                  </p>
                  <div className="w-full bg-white/20 h-2.5 rounded-full overflow-hidden mt-1">
                    <div 
                      className="bg-white h-full transition-all duration-1000 ease-linear"
                      style={{ width: `${((10 - autoCheckInCountdown) / 10) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Smart Checkout Reminder Banner */}
              {reminderStatus.isReminderActive && (
                <div className="p-4 rounded-[24px] bg-amber-500 text-white shadow-md flex items-start gap-3 border-l-4 border-l-amber-700">
                  <Bell className="w-5 h-5 flex-shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h3 className="font-bold text-sm">Smart Checkout Reminder</h3>
                    <p className="text-xs text-amber-100 mt-0.5">
                      Office closing time passed (06:00 PM). Please perform manual checkout before exiting geofence.
                    </p>
                  </div>
                </div>
              )}

              {/* Office Action Panel */}
              <div className="bg-white rounded-[24px] border border-slate-200/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#2563EB]" /> Office Attendance Control
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-400">Raniganj HQ</span>
                </div>

                {!todayRecord ? (
                  <div className="space-y-3">
                    <div className="p-3.5 bg-slate-50 rounded-2xl text-xs text-slate-600 border border-slate-200/60">
                      <p className="font-bold text-slate-800 mb-0.5">Status: Not Checked In</p>
                      <p>Stay inside 25m radius for 10s for <strong>Auto Check-In</strong>, or click below to check in manually.</p>
                    </div>
                    <Button 
                      onClick={handleManualCheckIn} 
                      className="w-full py-3.5 bg-[#2563EB] hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-md transition-all"
                    >
                      <UserCheck className="w-5 h-5 mr-2" /> Manual Office Check-In
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!todayRecord.checkOutTime && (
                      <div className="space-y-2">
                        <Button 
                          onClick={handleManualCheckOut} 
                          disabled={!isInsideGeofence}
                          className={`w-full py-3.5 font-bold text-sm rounded-2xl transition-all shadow-md ${
                            isInsideGeofence 
                              ? 'bg-red-600 hover:bg-red-700 text-white' 
                              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <LogOut className="w-5 h-5 mr-2" /> Manual Check-Out (Inside Geofence Only)
                        </Button>
                        {!isInsideGeofence && (
                          <p className="text-[11px] text-red-600 text-center font-semibold">
                            Manual Check-Out is allowed ONLY inside the 25m office geofence.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 2: WORK FROM HOME (WFH) REDESIGN */}
          {/* ==================================================== */}
          {activeMode === 'WFH' && (
            <div className="bg-white rounded-[24px] border border-slate-200/80 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-lg">
                    🏠
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Work From Home (WFH)</h3>
                    <p className="text-xs text-slate-500">No office geofence required</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-black border ${
                  currentWfhMonthCount >= 2 ? 'bg-red-50 text-red-800 border-red-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  {currentWfhMonthCount} / 2 Used This Month
                </span>
              </div>

              {currentWfhMonthCount >= 2 && !todayRecord && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-900 rounded-2xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                  <span>Monthly WFH limit exceeded. (Maximum 2 requests permitted per calendar month)</span>
                </div>
              )}

              {todayRecord && todayRecord.attendanceType === 'WFH' ? (
                <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-2xl space-y-3 text-xs text-emerald-950">
                  <div className="flex justify-between font-bold text-sm text-emerald-900 border-b border-emerald-200/60 pb-2">
                    <span>WFH Attendance Active</span>
                    <span>Logged at {todayRecord.checkInTime}</span>
                  </div>
                  <div>
                    <p className="font-bold text-emerald-900">Reason:</p>
                    <p className="bg-white p-2.5 rounded-xl border border-emerald-200 mt-1">{todayRecord.wfhReason}</p>
                  </div>
                  <div>
                    <p className="font-bold text-emerald-900">Today's Work Plan:</p>
                    <p className="bg-white p-2.5 rounded-xl border border-emerald-200 mt-1">{todayRecord.workPlan}</p>
                  </div>
                  <p className="text-[11px] text-emerald-700 font-medium italic">No Check-Out required for Work From Home sessions.</p>
                </div>
              ) : (
                <form onSubmit={handleWfhSubmit} className="space-y-4">
                  {wfhFormError && (
                    <div className="p-3.5 bg-red-50 text-red-800 border border-red-200 rounded-2xl text-xs font-medium">
                      {wfhFormError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      Reason for WFH <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={wfhReason}
                      onChange={(e) => setWfhReason(e.target.value)}
                      placeholder="Specify detailed reason for working from home..."
                      disabled={currentWfhMonthCount >= 2 || !!todayRecord}
                      className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      Today's Work Plan <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={wfhWorkPlan}
                      onChange={(e) => setWfhWorkPlan(e.target.value)}
                      placeholder="Outline key deliverables planned for today..."
                      disabled={currentWfhMonthCount >= 2 || !!todayRecord}
                      className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-medium"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={currentWfhMonthCount >= 2 || !!todayRecord}
                    className={`w-full py-3.5 font-bold text-sm rounded-2xl text-white transition-all shadow-md ${
                      currentWfhMonthCount >= 2 || !!todayRecord
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-[#2563EB] hover:bg-blue-700'
                    }`}
                  >
                    Submit WFH
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 3: CLIENT VISIT REDESIGN */}
          {/* ==================================================== */}
          {activeMode === 'CLIENT_VISIT' && (
            <div className="bg-white rounded-[24px] border border-slate-200/80 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-lg">
                    🤝
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Client Visit</h3>
                    <p className="text-xs text-slate-500">On-site client meetings & calls</p>
                  </div>
                </div>
              </div>

              {todayRecord && todayRecord.attendanceType === 'CLIENT_VISIT' ? (
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-3 text-xs text-amber-950">
                  <div className="flex justify-between font-bold text-sm text-amber-900 border-b border-amber-200/60 pb-2">
                    <span>Client Visit Logged</span>
                    <span>Logged at {todayRecord.checkInTime}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-amber-800 font-bold uppercase">Client Name</p>
                      <p className="font-extrabold text-slate-900 text-sm">{todayRecord.clientName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-amber-800 font-bold uppercase">Location / Address</p>
                      <p className="font-extrabold text-slate-900 text-sm">{todayRecord.clientLocation}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-amber-800 font-bold uppercase">Purpose of Visit</p>
                    <p className="bg-white p-2.5 rounded-xl border border-amber-200 mt-1">{todayRecord.purpose}</p>
                  </div>
                  <p className="text-[11px] text-amber-800 font-medium italic">No Check-Out required for Client Visit.</p>
                </div>
              ) : (
                <form onSubmit={handleClientVisitSubmit} className="space-y-4">
                  {clientFormError && (
                    <div className="p-3.5 bg-red-50 text-red-800 border border-red-200 rounded-2xl text-xs font-medium">
                      {clientFormError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      Client Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="E.g., Tata Steel Ltd"
                      disabled={!!todayRecord}
                      className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      Client Address / Location <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientLocation}
                      onChange={(e) => setClientLocation(e.target.value)}
                      placeholder="E.g., Asansol Industrial Estate, Plot 14"
                      disabled={!!todayRecord}
                      className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      Purpose of Visit <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={2}
                      value={clientPurpose}
                      onChange={(e) => setClientPurpose(e.target.value)}
                      placeholder="E.g., Requirements gathering and project review meeting"
                      disabled={!!todayRecord}
                      className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-medium"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!!todayRecord}
                    className={`w-full py-3.5 font-bold text-sm rounded-2xl text-white transition-all shadow-md ${
                      !!todayRecord
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-[#2563EB] hover:bg-blue-700'
                    }`}
                  >
                    Submit Client Visit
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 4: OUTDOOR WORK REDESIGN */}
          {/* ==================================================== */}
          {activeMode === 'OUTDOOR' && (
            <div className="bg-white rounded-[24px] border border-slate-200/80 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-lg">
                    🚗
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Outdoor Work</h3>
                    <p className="text-xs text-slate-500">Field duties, site work & deliveries</p>
                  </div>
                </div>
              </div>

              {todayRecord && todayRecord.attendanceType === 'OUTDOOR' ? (
                <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-2xl space-y-3 text-xs text-indigo-950">
                  <div className="flex justify-between font-bold text-sm text-indigo-900 border-b border-indigo-200/60 pb-2">
                    <span>Outdoor Work Logged</span>
                    <span>Logged at {todayRecord.checkInTime}</span>
                  </div>
                  <div>
                    <p className="text-[10px] text-indigo-800 font-bold uppercase">Outdoor Work Type</p>
                    <p className="font-extrabold text-slate-900 text-sm mt-0.5">{todayRecord.outdoorType}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-indigo-800 font-bold uppercase">Description</p>
                    <p className="bg-white p-2.5 rounded-xl border border-indigo-200 mt-1">{todayRecord.description}</p>
                  </div>
                  <p className="text-[11px] text-indigo-800 font-medium italic">No Check-Out required for Outdoor Work.</p>
                </div>
              ) : (
                <form onSubmit={handleOutdoorSubmit} className="space-y-4">
                  {outdoorFormError && (
                    <div className="p-3.5 bg-red-50 text-red-800 border border-red-200 rounded-2xl text-xs font-medium">
                      {outdoorFormError}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      Outdoor Work Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={outdoorType}
                      onChange={(e) => setOutdoorType(e.target.value as OutdoorWorkTypeOption)}
                      disabled={!!todayRecord}
                      className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-bold"
                    >
                      {OUTDOOR_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      value={outdoorDescription}
                      onChange={(e) => setOutdoorDescription(e.target.value)}
                      placeholder="Describe field activity, site location or assignment details..."
                      disabled={!!todayRecord}
                      className="w-full p-3.5 text-xs rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-medium"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={!!todayRecord}
                    className={`w-full py-3.5 font-bold text-sm rounded-2xl text-white transition-all shadow-md ${
                      !!todayRecord
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-[#2563EB] hover:bg-blue-700'
                    }`}
                  >
                    Submit Outdoor Work
                  </Button>
                </form>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* TODAY'S TIMELINE (VISUAL STEP TIMELINE REDESIGN) */}
          {/* ==================================================== */}
          {todayRecord && (
            <div className="bg-white rounded-[24px] border border-slate-200/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#2563EB]" /> Today's Timeline
              </h3>

              <div className="relative pl-6 border-l-2 border-slate-200 space-y-4 ml-2 my-2">
                {/* Event 1: Check In */}
                <div className="relative">
                  <span className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-[#2563EB] ring-4 ring-blue-100 flex items-center justify-center text-white text-[9px]">
                    ✓
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">{todayRecord.checkInTime}</span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#2563EB] text-[10px] font-bold">
                        {todayRecord.checkInMode} Check-In
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                      Mode: <strong>{todayRecord.attendanceType || 'OFFICE'}</strong> | Location: {todayRecord.townCity}
                    </p>
                  </div>
                </div>

                {/* Event 2: Exit Log if any */}
                {todayRecord.exitTime && (
                  <div className="relative">
                    <span className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-amber-500 ring-4 ring-amber-100 flex items-center justify-center text-white text-[9px]">
                      !
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">{todayRecord.exitTime}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold">
                          Office Exit Recorded
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-medium">
                        Return: {todayRecord.returnTime || 'Out of Office'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Event 3: Check Out */}
                <div className="relative">
                  <span className={`absolute -left-[31px] top-0.5 w-4 h-4 rounded-full ring-4 flex items-center justify-center text-white text-[9px] ${
                    todayRecord.checkOutTime ? 'bg-emerald-600 ring-emerald-100' : 'bg-slate-300 ring-slate-100'
                  }`}>
                    {todayRecord.checkOutTime ? '✓' : '•'}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">
                        {todayRecord.checkOutTime || 'Session In Progress'}
                      </span>
                      {todayRecord.checkOutTime && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          todayRecord.checkOutMode === 'AUTO_SYSTEM' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {todayRecord.checkOutMode} Check-Out
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                      {todayRecord.workingHours ? `Total Working Hours: ${todayRecord.workingHours}` : 'Awaiting checkout at end of shift'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* EMPLOYEE ATTENDANCE HISTORY SECTION */}
          {/* ==================================================== */}
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#2563EB]" /> Employee History
              </h2>
              <span className="text-xs text-slate-500 font-bold">
                {filteredHistoryRecords.length} record(s)
              </span>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white rounded-[24px] border border-slate-200/80 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search date, location, client, mode..."
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-[#2563EB] text-slate-900 font-medium"
                />
              </div>

              {/* Attendance Type Badges Filter */}
              <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-bold">
                <button
                  onClick={() => setHistoryTypeFilter('ALL')}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-all ${
                    historyTypeFilter === 'ALL'
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Types
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('OFFICE')}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1 transition-all ${
                    historyTypeFilter === 'OFFICE'
                      ? 'bg-purple-700 text-white shadow-sm'
                      : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                  }`}
                >
                  🏢 Office
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('WFH')}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1 transition-all ${
                    historyTypeFilter === 'WFH'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  🏠 WFH
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('CLIENT_VISIT')}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1 transition-all ${
                    historyTypeFilter === 'CLIENT_VISIT'
                      ? 'bg-amber-700 text-white shadow-sm'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  🤝 Client Visit
                </button>
                <button
                  onClick={() => setHistoryTypeFilter('OUTDOOR')}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap flex items-center gap-1 transition-all ${
                    historyTypeFilter === 'OUTDOOR'
                      ? 'bg-indigo-700 text-white shadow-sm'
                      : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                  }`}
                >
                  🚗 Outdoor Work
                </button>
              </div>
            </div>

            {filteredHistoryRecords.length === 0 ? (
              <div className="bg-white rounded-[24px] border border-slate-200/80 p-8 text-center text-slate-500 text-xs font-medium">
                No attendance logs found matching filters.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredHistoryRecords.slice(0, 15).map((rec) => {
                  const modeType = rec.attendanceType || 'OFFICE';
                  return (
                    <div key={rec.id} className="bg-white rounded-[24px] border border-slate-200/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-sm text-slate-900">{rec.date}</h3>
                            {/* Mode Badge */}
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black flex items-center gap-1 ${
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
                          <p className="text-xs text-slate-500 font-medium mt-0.5">{rec.townCity}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            rec.syncStatus === 'Synced' 
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {rec.syncStatus === 'Synced' ? 'Synced' : 'Offline Pending'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {rec.isOffline ? 'Recorded Offline' : 'Recorded Online'}
                          </span>
                        </div>
                      </div>

                      {/* Mode-Specific Details Box */}
                      {modeType === 'WFH' && (
                        <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200/60 text-xs space-y-1 text-emerald-950">
                          <p className="text-[11px] font-bold text-emerald-900">Reason: <span className="font-normal text-emerald-950">{rec.wfhReason || 'N/A'}</span></p>
                          <p className="text-[11px] font-bold text-emerald-900">Work Plan: <span className="font-normal text-emerald-950">{rec.workPlan || 'N/A'}</span></p>
                        </div>
                      )}

                      {modeType === 'CLIENT_VISIT' && (
                        <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/60 text-xs space-y-1 text-amber-950">
                          <p className="text-[11px] font-bold text-amber-900">Client: <span className="font-extrabold text-amber-950">{rec.clientName}</span> | Location: <span className="font-medium text-amber-950">{rec.clientLocation}</span></p>
                          <p className="text-[11px] font-bold text-amber-900">Purpose: <span className="font-normal text-amber-950">{rec.purpose}</span></p>
                        </div>
                      )}

                      {modeType === 'OUTDOOR' && (
                        <div className="bg-indigo-50/70 p-3 rounded-2xl border border-indigo-200/60 text-xs space-y-1 text-indigo-950">
                          <p className="text-[11px] font-bold text-indigo-900">Outdoor Type: <span className="font-extrabold text-indigo-950">{rec.outdoorType}</span></p>
                          <p className="text-[11px] font-bold text-indigo-900">Description: <span className="font-normal text-indigo-950">{rec.description}</span></p>
                        </div>
                      )}

                      {/* Timing Metrics */}
                      <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-slate-100">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                          <p className="text-[10px] text-slate-400 font-semibold">Check-In</p>
                          <p className="font-extrabold text-slate-900">{rec.checkInTime}</p>
                          <span className="text-[9px] font-bold text-[#2563EB]">{rec.checkInMode}</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                          <p className="text-[10px] text-slate-400 font-semibold">Check-Out</p>
                          <p className="font-extrabold text-slate-900">{rec.checkOutTime || '--:--'}</p>
                          <span className={`text-[9px] font-bold ${
                            rec.checkOutMode === 'AUTO_SYSTEM' ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                            {rec.checkOutMode}
                          </span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                          <p className="text-[10px] text-slate-400 font-semibold">Working Hrs</p>
                          <p className="font-extrabold text-slate-900">{rec.workingHours || '--'}</p>
                        </div>
                      </div>

                      {(rec.exitTime || rec.returnTime) && (
                        <div className="text-[11px] text-amber-900 bg-amber-50 p-2.5 rounded-xl font-medium flex justify-between border border-amber-200/60">
                          <span>Office Exit Log:</span>
                          <span>Exit: {rec.exitTime || '--'} | Return: {rec.returnTime || '--'}</span>
                        </div>
                      )}

                      {rec.reason && (
                        <p className="text-[11px] text-red-600 bg-red-50 p-2.5 rounded-xl font-medium border border-red-200/60">
                          Auto Checkout Reason: {rec.reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Debug Mode Toggle */}
          <div className="mt-6 border border-slate-200 rounded-[20px] overflow-hidden bg-white shadow-sm">
            <button 
              onClick={() => setShowDebug(!showDebug)}
              className="w-full flex items-center justify-between p-4 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#2563EB]" />
                Developer Debug Mode
              </div>
              {showDebug ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showDebug && (
              <div className="p-4 space-y-3 text-[11px] font-mono text-slate-600 border-t border-slate-100 overflow-x-auto bg-slate-50/50">
                <div>
                  <strong className="text-[#2563EB] block mb-0.5">Active Attendance Mode:</strong>
                  {activeMode}
                </div>
                <div>
                  <strong className="text-[#2563EB] block mb-0.5">Office Target GPS:</strong>
                  Lat: {OFFICE_LOCATION.latitude}, Lon: {OFFICE_LOCATION.longitude} (Radius: {OFFICE_LOCATION.radius}m)
                </div>
                <div>
                  <strong className="text-[#2563EB] block mb-0.5">Live GPS:</strong>
                  Lat: {liveLocation.latitude}, Lon: {liveLocation.longitude} (Distance: {distance.toFixed(2)}m)
                </div>
                <div>
                  <strong className="text-[#2563EB] block mb-0.5">Geocode Output:</strong>
                  <pre className="whitespace-pre-wrap bg-white p-2.5 rounded-xl border border-slate-200 mt-1 text-[10px]">
                    {rawGeocodeResponse}
                  </pre>
                </div>
                <div>
                  <strong className="text-[#2563EB] block mb-0.5">Employee Metadata:</strong>
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
