import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
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
  Activity,
  Compass,
  Radio
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

  const startTrackingRef = useRef<() => void>();
  const autoCheckInTimerRef = useRef<NodeJS.Timeout | null>(null);

  const employeeId = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const employeeName = employeeData?.name || 'Employee';

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

  // Derive Ribbon Status Text & Style
  const getRibbonInfo = () => {
    if (isSyncing) {
      return {
        text: 'SYNCING ATTENDANCE...',
        style: 'bg-blue-600/30 text-blue-200 border-blue-500/40 animate-pulse',
        icon: <RotateCw className="w-4 h-4 animate-spin text-blue-400" />
      };
    }
    if (todayRecord) {
      if (todayRecord.checkOutTime) {
        return {
          text: 'CHECKED OUT',
          style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          icon: <CheckCircle className="w-4 h-4 text-emerald-400" />
        };
      }
      return {
        text: 'CHECKED IN SUCCESSFULLY',
        style: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        icon: <CheckCircle className="w-4 h-4 text-emerald-400" />
      };
    }
    if (pendingCount > 0) {
      return {
        text: 'OFFLINE ATTENDANCE SAVED – SYNC PENDING',
        style: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        icon: <Clock className="w-4 h-4 text-amber-400" />
      };
    }
    if (activeMode === 'OFFICE') {
      if (autoCheckInCountdown !== null) {
        return {
          text: `AUTO CHECK-IN IN ${autoCheckInCountdown} SEC...`,
          style: 'bg-purple-600/40 text-purple-200 border-purple-400/60 animate-pulse',
          icon: <Radio className="w-4 h-4 text-purple-300 animate-spin" />
        };
      }
      if (isInsideGeofence) {
        return {
          text: 'ENTERING OFFICE... READY FOR AUTO CHECK-IN',
          style: 'bg-purple-500/25 text-purple-200 border-purple-400/40',
          icon: <Compass className="w-4 h-4 text-purple-300 animate-bounce" />
        };
      }
      return {
        text: 'OUTSIDE OFFICE GEOFENCE',
        style: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        icon: <AlertCircle className="w-4 h-4 text-rose-400" />
      };
    }
    return {
      text: 'READY FOR ATTENDANCE SUBMISSION',
      style: 'bg-purple-600/30 text-purple-200 border-purple-500/40',
      icon: <Sparkles className="w-4 h-4 text-purple-300" />
    };
  };

  const ribbonInfo = getRibbonInfo();

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
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#200D4B] to-[#2A145B] text-white p-3 sm:p-6 pb-32 max-w-5xl mx-auto space-y-5 font-sans">
      
      {/* ==================================================== */}
      {/* HEADER – DEEP PURPLE ENTERPRISE */}
      {/* ==================================================== */}
      <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.37)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-[#7C3AED] animate-ping" />
            <span className="text-xs font-bold text-purple-300 uppercase tracking-widest">
              Enterprise Engine v6.0
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            EXFIN Smart Attendance
          </h1>
          <p className="text-xs text-purple-200/80 font-medium mt-1 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            {getFormattedDateLong()} • <strong className="text-white">{employeeName}</strong> ({employeeId})
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          {/* Network Status Badge */}
          <div className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-2 border transition-all ${
            isSyncing
              ? 'bg-blue-500/20 text-blue-300 border-blue-400/50'
              : isOnline
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
              : 'bg-amber-500/20 text-amber-300 border-amber-400/50'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              isSyncing ? 'bg-blue-400 animate-spin' : isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`} />
            {isSyncing ? 'SYNCING' : isOnline ? 'ONLINE' : 'OFFLINE'}
          </div>

          {/* Sync Trigger Button */}
          <button
            onClick={handleSyncNow}
            disabled={!isOnline || isSyncing}
            className={`p-2.5 rounded-2xl border transition-all flex items-center justify-center relative ${
              pendingCount > 0 
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30' 
                : 'bg-purple-950/60 text-purple-300 border-purple-500/30 hover:bg-purple-900/60'
            }`}
            title={pendingCount > 0 ? `${pendingCount} records pending sync` : 'All records synced'}
          >
            <RotateCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-purple-300' : ''}`} />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black flex items-center justify-center shadow">
                {pendingCount}
              </span>
            )}
          </button>

          {/* Employee Avatar Badge */}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7C3AED] to-[#4C1D95] text-white font-black text-sm flex items-center justify-center shadow-lg ring-2 ring-purple-400/30">
            {getEmployeeInitials(employeeName)}
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* LIVE STATUS RIBBON */}
      {/* ==================================================== */}
      <div className={`px-5 py-3 rounded-[22px] border flex items-center justify-between text-xs font-black tracking-wider transition-all duration-300 shadow-md ${ribbonInfo.style}`}>
        <div className="flex items-center gap-3">
          {ribbonInfo.icon}
          <span>{ribbonInfo.text}</span>
        </div>
        <span className="text-[10px] opacity-75 font-mono uppercase">LIVE STATUS</span>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className="p-4 bg-purple-900/60 border border-purple-400/40 text-purple-100 rounded-[22px] text-xs font-bold flex justify-between items-center shadow-md animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-300" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-purple-300 hover:text-white font-bold text-sm px-1">✕</button>
        </div>
      )}

      {/* Location Status Card - Loading State */}
      {locationStatus === 'loading' && (
        <div className="p-8 rounded-[22px] bg-[#2D1B5A]/80 border border-purple-500/20 shadow-md flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-10 h-10 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-purple-200">Acquiring Enterprise GPS Lock...</p>
        </div>
      )}

      {/* Location Status Card - Error State */}
      {locationStatus === 'error' && (
        <div className="p-6 rounded-[22px] bg-rose-950/60 border border-rose-500/40 text-rose-200 shadow-md flex flex-col items-center justify-center gap-3 text-center">
          <AlertCircle className="w-10 h-10 text-rose-400" />
          <div>
            <h2 className="text-sm font-bold">GPS Location Unavailable</h2>
            <p className="text-xs text-rose-300 mt-0.5">{errorMessage}</p>
          </div>
          <Button onClick={() => startTrackingRef.current?.()} className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow">
            Retry GPS Lock
          </Button>
        </div>
      )}

      {/* Location Status Success State */}
      {locationStatus === 'success' && distance !== null && (
        <>
          {/* ==================================================== */}
          {/* OFFICE STATUS CARD (NO COORDINATES, DISTANCE ONLY) */}
          {/* ==================================================== */}
          <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.37)] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-purple-950/80 text-purple-300 border border-purple-500/30 flex items-center justify-center flex-shrink-0 font-bold shadow-inner">
                <Building2 className="w-5 h-5 text-[#7C3AED]" />
              </div>
              <div>
                <p className="text-[10px] font-black text-purple-300 uppercase tracking-widest mb-0.5">
                  OFFICE STATUS
                </p>
                <h3 className="text-base font-black text-white leading-tight">
                  Distance from Office: <span className="text-purple-200">{formatDistanceDisplay(distance)}</span>
                </h3>
                <p className="text-[11px] text-purple-300/80 font-medium mt-0.5">
                  Office Geofence Radius: {OFFICE_LOCATION.radius}m
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <span className={`px-3.5 py-1.5 rounded-full text-xs font-black inline-flex items-center gap-2 border ${
                isInsideGeofence 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full ${isInsideGeofence ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                {isInsideGeofence ? 'INSIDE OFFICE' : 'OUTSIDE OFFICE'}
              </span>
            </div>
          </div>

          {/* ==================================================== */}
          {/* ATTENDANCE MODES SELECTION GRID */}
          {/* ==================================================== */}
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                Select Attendance Mode
              </h2>
              {todayRecord && (
                <span className="text-[10px] bg-purple-900/60 text-purple-200 font-extrabold px-3 py-1 rounded-full border border-purple-500/30">
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
                className={`p-4 rounded-[22px] border text-left transition-all duration-300 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'OFFICE'
                    ? 'border-[#7C3AED] bg-[#381F6D] shadow-[0_0_25px_rgba(124,58,237,0.4)] ring-2 ring-[#7C3AED]'
                    : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-purple-400/40 hover:bg-[#2D1B5A]'
                } ${todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'OFFICE' ? 'bg-[#7C3AED] text-white shadow-lg' : 'bg-purple-950/80 text-purple-300'
                  }`}>
                    🏢
                  </div>
                  {activeMode === 'OFFICE' && (
                    <span className="w-5 h-5 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-xs shadow-md">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                  {todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE' && (
                    <Lock className="w-4 h-4 text-purple-400/60" />
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Office</h3>
                  <p className="text-[11px] text-purple-300 font-medium leading-tight mt-0.5">25m Office Geofence</p>
                </div>
              </button>

              {/* Card 2: Work From Home (WFH) */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'WFH'}
                onClick={() => setActiveMode('WFH')}
                className={`p-4 rounded-[22px] border text-left transition-all duration-300 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'WFH'
                    ? 'border-emerald-500 bg-[#1E3B30] shadow-[0_0_25px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500'
                    : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-emerald-400/40 hover:bg-[#2D1B5A]'
                } ${todayRecord && todayRecord.attendanceType !== 'WFH' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'WFH' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-emerald-950/80 text-emerald-300'
                  }`}>
                    🏠
                  </div>
                  <div className="flex items-center gap-1">
                    {activeMode === 'WFH' && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs shadow-md">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-500/30">
                      {currentWfhMonthCount}/2 Used
                    </span>
                  </div>
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Work From Home</h3>
                  <p className="text-[11px] text-purple-300 font-medium leading-tight mt-0.5">Max 2 per Month</p>
                </div>
              </button>

              {/* Card 3: Client Visit */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT'}
                onClick={() => setActiveMode('CLIENT_VISIT')}
                className={`p-4 rounded-[22px] border text-left transition-all duration-300 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'CLIENT_VISIT'
                    ? 'border-amber-500 bg-[#3B2D1E] shadow-[0_0_25px_rgba(245,158,11,0.3)] ring-2 ring-amber-500'
                    : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-amber-400/40 hover:bg-[#2D1B5A]'
                } ${todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'CLIENT_VISIT' ? 'bg-amber-600 text-white shadow-lg' : 'bg-amber-950/80 text-amber-300'
                  }`}>
                    🤝
                  </div>
                  {activeMode === 'CLIENT_VISIT' && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs shadow-md">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Client Visit</h3>
                  <p className="text-[11px] text-purple-300 font-medium leading-tight mt-0.5">On-site Meetings</p>
                </div>
              </button>

              {/* Card 4: Outdoor Work */}
              <button
                type="button"
                disabled={!!todayRecord && todayRecord.attendanceType !== 'OUTDOOR'}
                onClick={() => setActiveMode('OUTDOOR')}
                className={`p-4 rounded-[22px] border text-left transition-all duration-300 flex flex-col justify-between h-32 relative overflow-hidden group ${
                  activeMode === 'OUTDOOR'
                    ? 'border-indigo-500 bg-[#2A234A] shadow-[0_0_25px_rgba(99,102,241,0.3)] ring-2 ring-indigo-500'
                    : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-indigo-400/40 hover:bg-[#2D1B5A]'
                } ${todayRecord && todayRecord.attendanceType !== 'OUTDOOR' ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex justify-between items-start">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl font-bold transition-transform group-hover:scale-105 ${
                    activeMode === 'OUTDOOR' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-950/80 text-indigo-300'
                  }`}>
                    🚗
                  </div>
                  {activeMode === 'OUTDOOR' && (
                    <span className="w-5 h-5 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs shadow-md">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-white">Outdoor Work</h3>
                  <p className="text-[11px] text-purple-300 font-medium leading-tight mt-0.5">Field & Market Visit</p>
                </div>
              </button>
            </div>
          </div>

          {/* ==================================================== */}
          {/* TODAY STATUS CARD */}
          {/* ==================================================== */}
          {todayRecord && (
            <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-4">
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">
                    {todayRecord.attendanceType === 'WFH' ? '🏠' : todayRecord.attendanceType === 'CLIENT_VISIT' ? '🤝' : todayRecord.attendanceType === 'OUTDOOR' ? '🚗' : '🏢'}
                  </span>
                  <div>
                    <p className="text-[10px] text-purple-300 font-bold uppercase tracking-widest">Today's Active Attendance</p>
                    <h3 className="font-black text-lg text-white">{todayRecord.attendanceType || 'OFFICE'}</h3>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Logged {todayRecord.checkInTime}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-purple-950/60 p-3.5 rounded-2xl border border-purple-500/20">
                  <p className="text-[10px] text-purple-300 font-bold mb-0.5">Check-In Time</p>
                  <p className="font-black text-base text-white">{todayRecord.checkInTime}</p>
                  <p className="text-[9px] text-purple-300/80 mt-0.5">Source: {todayRecord.checkInMode}</p>
                </div>

                <div className="bg-purple-950/60 p-3.5 rounded-2xl border border-purple-500/20">
                  <p className="text-[10px] text-purple-300 font-bold mb-0.5">Check-Out Time</p>
                  <p className="font-black text-base text-white">{todayRecord.checkOutTime || 'Pending'}</p>
                  <p className="text-[9px] text-purple-300/80 mt-0.5">{todayRecord.checkOutMode !== 'N/A' ? `Source: ${todayRecord.checkOutMode}` : 'In Progress'}</p>
                </div>

                <div className="bg-purple-950/60 p-3.5 rounded-2xl border border-purple-500/20">
                  <p className="text-[10px] text-purple-300 font-bold mb-0.5">Working Hours</p>
                  <p className="font-black text-base text-white">{todayRecord.workingHours || '--:--'}</p>
                  <p className="text-[9px] text-purple-300/80 mt-0.5">Session Total</p>
                </div>

                <div className="bg-purple-950/60 p-3.5 rounded-2xl border border-purple-500/20">
                  <p className="text-[10px] text-purple-300 font-bold mb-0.5">Cloud Sync Status</p>
                  <p className="font-black text-sm text-white">{todayRecord.syncStatus}</p>
                  <p className="text-[9px] text-purple-300/80 mt-0.5">{todayRecord.isOffline ? 'Offline Stored' : 'Direct Cloud'}</p>
                </div>
              </div>
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 1: OFFICE MODE */}
          {/* ==================================================== */}
          {activeMode === 'OFFICE' && (
            <div className="space-y-4">
              {/* AUTO CHECK-IN CARD */}
              {!todayRecord && (
                <div className="space-y-3">
                  {isInsideGeofence ? (
                    <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-400/40 p-6 shadow-[0_0_25px_rgba(124,58,237,0.3)] text-center space-y-4">
                      <div className="flex items-center justify-center gap-2 text-purple-200 text-xs font-black uppercase tracking-wider">
                        <Radio className="w-4 h-4 text-[#7C3AED] animate-spin" /> Auto Check-In Active
                      </div>
                      
                      {autoCheckInCountdown !== null ? (
                        <div className="space-y-3 py-2">
                          <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 animate-ping" />
                            <div className="w-20 h-20 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-3xl font-black shadow-lg">
                              {autoCheckInCountdown}
                            </div>
                          </div>
                          <p className="text-xs text-purple-200 font-semibold">
                            Auto Check-In in <strong className="text-white">{autoCheckInCountdown} seconds</strong>... Stay within 25m.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-xs text-purple-200 font-medium">
                            Inside Office Geofence (25m). Auto Check-in will start shortly, or click manual check-in.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-rose-950/50 rounded-[22px] border border-rose-500/30 p-5 shadow-md flex items-center gap-3">
                      <AlertCircle className="w-6 h-6 text-rose-400 flex-shrink-0" />
                      <div>
                        <h3 className="font-extrabold text-sm text-white">Outside Office Geofence</h3>
                        <p className="text-xs text-rose-300/80 mt-0.5">
                          Auto check-in requires being within 25 meters of office HQ.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Smart Checkout Reminder Banner */}
              {reminderStatus.isReminderActive && (
                <div className="p-4 rounded-[22px] bg-amber-500/20 border border-amber-500/40 text-amber-200 shadow-md flex items-start gap-3">
                  <Bell className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <h3 className="font-extrabold text-sm text-white">Smart Checkout Reminder</h3>
                    <p className="text-xs text-amber-200/80 mt-0.5">
                      Office hours ended (06:00 PM). Please perform manual checkout before exiting office geofence.
                    </p>
                  </div>
                </div>
              )}

              {/* MANUAL CHECK-IN & CHECK-OUT ACTION BUTTONS */}
              <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-4">
                <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
                  <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#7C3AED]" /> Office Attendance Control
                  </h3>
                  <span className="text-[11px] font-semibold text-purple-300">Raniganj HQ</span>
                </div>

                {!todayRecord ? (
                  <div className="space-y-3">
                    {/* Hide Manual Check-In button during active countdown */}
                    {autoCheckInCountdown === null && (
                      <Button 
                        onClick={handleManualCheckIn} 
                        className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-sm rounded-2xl shadow-lg transition-all border border-purple-400/30 active:scale-95"
                      >
                        <UserCheck className="w-5 h-5 mr-2" /> Manual Office Check-In
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {!todayRecord.checkOutTime && (
                      <div className="space-y-2">
                        <Button 
                          onClick={handleManualCheckOut} 
                          disabled={!isInsideGeofence}
                          className={`w-full py-4 font-extrabold text-sm rounded-2xl transition-all shadow-lg ${
                            isInsideGeofence 
                              ? 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-400/30 active:scale-95' 
                              : 'bg-purple-950/60 text-purple-400 border border-purple-500/20 cursor-not-allowed'
                          }`}
                        >
                          <LogOut className="w-5 h-5 mr-2" /> Manual Check-Out (Inside Geofence Only)
                        </Button>
                        {!isInsideGeofence && (
                          <p className="text-[11px] text-rose-300 text-center font-bold">
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
          {/* MODE 2: WORK FROM HOME (WFH) */}
          {/* ==================================================== */}
          {activeMode === 'WFH' && (
            <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-emerald-500/30 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-5">
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 flex items-center justify-center font-black text-lg">
                    🏠
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Work From Home (WFH)</h3>
                    <p className="text-xs text-purple-300">No office geofence required</p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-black border ${
                  currentWfhMonthCount >= 2 ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {currentWfhMonthCount} / 2 Used This Month
                </span>
              </div>

              {wfhFormError && (
                <div className="p-3.5 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{wfhFormError}</span>
                </div>
              )}

              {!todayRecord ? (
                <form onSubmit={handleWfhSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-purple-300 mb-1">
                      Reason for WFH <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={wfhReason}
                      onChange={(e) => setWfhReason(e.target.value)}
                      placeholder="e.g., Personal errand / Doctor visit / Remote task"
                      className="w-full px-4 py-3 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-purple-300 mb-1">
                      Today's Work Plan <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={wfhWorkPlan}
                      onChange={(e) => setWfhWorkPlan(e.target.value)}
                      rows={3}
                      placeholder="Detail your planned deliverables for today..."
                      className="w-full px-4 py-3 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={currentWfhMonthCount >= 2}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-lg border border-emerald-400/30"
                  >
                    Submit WFH Attendance
                  </Button>
                </form>
              ) : (
                <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 text-xs space-y-2">
                  <p className="font-bold text-emerald-300">WFH Session Active for Today</p>
                  <p><span className="text-purple-300">Reason:</span> {todayRecord.wfhReason || 'N/A'}</p>
                  <p><span className="text-purple-300">Work Plan:</span> {todayRecord.workPlan || 'N/A'}</p>
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 3: CLIENT VISIT */}
          {/* ==================================================== */}
          {activeMode === 'CLIENT_VISIT' && (
            <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-amber-500/30 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-5">
              <div className="flex items-center gap-3 border-b border-purple-500/20 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-amber-950/80 text-amber-300 border border-amber-500/30 flex items-center justify-center font-black text-lg">
                  🤝
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Client Visit</h3>
                  <p className="text-xs text-purple-300">Log on-site client meetings</p>
                </div>
              </div>

              {clientFormError && (
                <div className="p-3.5 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{clientFormError}</span>
                </div>
              )}

              {!todayRecord ? (
                <form onSubmit={handleClientVisitSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-purple-300 mb-1">
                      Client Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g., Tata Steel Ltd"
                      className="w-full px-4 py-3 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-purple-300 mb-1">
                      Client Location / Address <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientLocation}
                      onChange={(e) => setClientLocation(e.target.value)}
                      placeholder="e.g., Durgapur Industrial Complex"
                      className="w-full px-4 py-3 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-purple-300 mb-1">
                      Purpose of Visit <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={clientPurpose}
                      onChange={(e) => setClientPurpose(e.target.value)}
                      rows={2}
                      placeholder="e.g., Contract negotiation and site inspection"
                      className="w-full px-4 py-3 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-sm rounded-2xl shadow-lg border border-amber-400/30"
                  >
                    Submit Client Visit Attendance
                  </Button>
                </form>
              ) : (
                <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 text-xs space-y-2">
                  <p className="font-bold text-amber-300">Client Visit Active for Today</p>
                  <p><span className="text-purple-300">Client:</span> {todayRecord.clientName || 'N/A'}</p>
                  <p><span className="text-purple-300">Location:</span> {todayRecord.clientLocation || 'N/A'}</p>
                  <p><span className="text-purple-300">Purpose:</span> {todayRecord.purpose || 'N/A'}</p>
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* MODE 4: OUTDOOR WORK */}
          {/* ==================================================== */}
          {activeMode === 'OUTDOOR' && (
            <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-indigo-500/30 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-5">
              <div className="flex items-center gap-3 border-b border-purple-500/20 pb-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-black text-lg">
                  🚗
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Outdoor Work</h3>
                  <p className="text-xs text-purple-300">Field visits, surveys, market duty</p>
                </div>
              </div>

              {outdoorFormError && (
                <div className="p-3.5 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{outdoorFormError}</span>
                </div>
              )}

              {!todayRecord ? (
                <form onSubmit={handleOutdoorSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-purple-300 mb-1">
                      Outdoor Work Type <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={outdoorType}
                      onChange={(e) => setOutdoorType(e.target.value as OutdoorWorkTypeOption)}
                      className="w-full px-4 py-3 bg-purple-950 border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                    >
                      {OUTDOOR_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt} className="bg-purple-950 text-white">{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-purple-300 mb-1">
                      Description <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={outdoorDescription}
                      onChange={(e) => setOutdoorDescription(e.target.value)}
                      rows={3}
                      placeholder="Provide details about your outdoor field assignment..."
                      className="w-full px-4 py-3 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg border border-indigo-400/30"
                  >
                    Submit Outdoor Work Attendance
                  </Button>
                </form>
              ) : (
                <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 text-xs space-y-2">
                  <p className="font-bold text-indigo-300">Outdoor Work Active for Today</p>
                  <p><span className="text-purple-300">Type:</span> {todayRecord.outdoorType || 'N/A'}</p>
                  <p><span className="text-purple-300">Description:</span> {todayRecord.description || 'N/A'}</p>
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* TODAY'S VERTICAL TIMELINE */}
          {/* ==================================================== */}
          <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-4">
            <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#7C3AED]" /> Today's Activity Timeline
            </h3>

            {todayRecord ? (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-purple-500/30">
                {/* Check-In Event */}
                <div className="relative flex items-start gap-3">
                  <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-[10px] font-black shadow ring-4 ring-[#2D1B5A]">
                    <Check className="w-3 h-3" />
                  </span>
                  <div>
                    <p className="text-xs font-black text-white">{todayRecord.checkInTime} • {todayRecord.checkInMode} Check-In</p>
                    <p className="text-[11px] text-purple-300/80 mt-0.5">
                      Mode: <strong className="text-purple-200">{todayRecord.attendanceType || 'OFFICE'}</strong>
                    </p>
                  </div>
                </div>

                {/* Specific Mode Details Event */}
                {todayRecord.attendanceType === 'WFH' && todayRecord.wfhReason && (
                  <div className="relative flex items-start gap-3">
                    <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black shadow ring-4 ring-[#2D1B5A]">
                      🏠
                    </span>
                    <div>
                      <p className="text-xs font-black text-emerald-300">Work From Home Logged</p>
                      <p className="text-[11px] text-purple-200 mt-0.5">Plan: {todayRecord.workPlan}</p>
                    </div>
                  </div>
                )}

                {todayRecord.attendanceType === 'CLIENT_VISIT' && todayRecord.clientName && (
                  <div className="relative flex items-start gap-3">
                    <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center text-[10px] font-black shadow ring-4 ring-[#2D1B5A]">
                      🤝
                    </span>
                    <div>
                      <p className="text-xs font-black text-amber-300">Client Meeting • {todayRecord.clientName}</p>
                      <p className="text-[11px] text-purple-200 mt-0.5">Location: {todayRecord.clientLocation}</p>
                    </div>
                  </div>
                )}

                {/* Check-Out Event */}
                {todayRecord.checkOutTime && (
                  <div className="relative flex items-start gap-3">
                    <span className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-black shadow ring-4 ring-[#2D1B5A]">
                      <LogOut className="w-3 h-3" />
                    </span>
                    <div>
                      <p className="text-xs font-black text-white">{todayRecord.checkOutTime} • {todayRecord.checkOutMode} Check-Out</p>
                      <p className="text-[11px] text-purple-300/80 mt-0.5">
                        Total Session: <strong className="text-purple-200">{todayRecord.workingHours}</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-purple-300/60 italic">No activity logged for today yet.</p>
            )}
          </div>

          {/* ==================================================== */}
          {/* OFFLINE STATUS CARD */}
          {/* ==================================================== */}
          <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${pendingCount > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                  {pendingCount > 0 ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-white">
                    {pendingCount > 0 ? 'Offline Records Saved Locally' : 'Cloud Sync Engine Active'}
                  </h3>
                  <p className="text-[11px] text-purple-300">
                    {pendingCount > 0 ? `${pendingCount} record(s) pending background upload.` : 'All attendance logs fully synchronized with Firebase.'}
                  </p>
                </div>
              </div>

              {pendingCount > 0 && (
                <Button 
                  onClick={handleSyncNow} 
                  disabled={!isOnline || isSyncing}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-3.5 py-2 rounded-xl shadow-md border border-amber-400/30"
                >
                  {isSyncing ? 'Syncing...' : 'Sync Cloud'}
                </Button>
              )}
            </div>
          </div>

          {/* ==================================================== */}
          {/* ATTENDANCE HISTORY & RECORDS LIST */}
          {/* ==================================================== */}
          <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)] space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-purple-500/20 pb-4">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Attendance History Logs</h3>
                <p className="text-xs text-purple-300">View local & synchronized attendance history</p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={historyTypeFilter}
                  onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-purple-950 border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Modes</option>
                  <option value="OFFICE">Office</option>
                  <option value="WFH">WFH</option>
                  <option value="CLIENT_VISIT">Client Visit</option>
                  <option value="OUTDOOR">Outdoor</option>
                </select>

                <select
                  value={historySyncFilter}
                  onChange={(e) => setHistorySyncFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-purple-950 border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="Synced">Synced</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>
            </div>

            {filteredHistoryRecords.length === 0 ? (
              <p className="text-xs text-purple-300/60 italic text-center py-4">No matching attendance records found.</p>
            ) : (
              <div className="space-y-3">
                {filteredHistoryRecords.map((rec) => (
                  <div 
                    key={rec.id} 
                    className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-purple-400/40 transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          (rec.attendanceType || 'OFFICE') === 'WFH'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : (rec.attendanceType || 'OFFICE') === 'CLIENT_VISIT'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : (rec.attendanceType || 'OFFICE') === 'OUTDOOR'
                            ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                        }`}>
                          {(rec.attendanceType || 'OFFICE') === 'WFH' ? '🏠 WFH' : (rec.attendanceType || 'OFFICE') === 'CLIENT_VISIT' ? '🤝 Client Visit' : (rec.attendanceType || 'OFFICE') === 'OUTDOOR' ? '🚗 Outdoor Work' : '🏢 Office'}
                        </span>
                        <span className="font-bold text-white">{rec.date}</span>
                      </div>

                      <div className="text-purple-300/80 text-[11px] flex flex-wrap gap-x-3">
                        <span>Check-In: <strong className="text-emerald-300">{rec.checkInTime}</strong> ({rec.checkInMode})</span>
                        <span>Check-Out: <strong className="text-rose-300">{rec.checkOutTime || 'Pending'}</strong></span>
                        {rec.workingHours && <span>Hours: <strong className="text-purple-200">{rec.workingHours}</strong></span>}
                      </div>

                      {rec.clientName && (
                        <p className="text-[11px] text-amber-300">Client: {rec.clientName} ({rec.clientLocation})</p>
                      )}
                      {rec.wfhReason && (
                        <p className="text-[11px] text-emerald-300">WFH Reason: {rec.wfhReason}</p>
                      )}
                      {rec.outdoorType && (
                        <p className="text-[11px] text-indigo-300">Outdoor: {rec.outdoorType} - {rec.description}</p>
                      )}
                    </div>

                    <div className="self-end sm:self-center flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        rec.syncStatus === 'Synced' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}>
                        {rec.syncStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
