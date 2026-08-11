import React, { useState, useEffect, useRef } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  AlertCircle, 
  AlertTriangle,
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
import { useLocationContext } from '../../context/LocationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
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
  performOutdoorAttendance,
  runAutoCheckoutFinalizer,
  calculateWorkingHours
} from '../../services/attendance/smartAttendanceEngine';
import {
  getStoredAttendanceRecords,
  getTodayAttendanceRecord,
  saveAttendanceRecord
} from '../../services/attendance/attendanceStorage';
import {
  startAutoSyncEngine,
  syncPendingAttendanceRecords
} from '../../services/attendance/syncEngine';
import { TodayAttendanceCard } from './TodayAttendanceCard';
import { AttendanceCalendar } from './AttendanceCalendar';

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
  const { attendance: syncAttendance, updateAttendanceOptimistically, triggerManualSync } = useRealtimeSync();

  const {
    liveLocation,
    distance,
    formattedDistance,
    isInsideGeofence,
    locationStatus,
    errorMessage,
    currentAddress,
    refreshLocation,
    locationState,
    setActiveAttendanceMode,
  } = useLocationContext();

  // Trigger Active Attendance Mode on Mount for high-frequency location updates
  useEffect(() => {
    setActiveAttendanceMode(true);
    return () => {
      setActiveAttendanceMode(false);
    };
  }, [setActiveAttendanceMode]);
  
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
  const [isHistoryExpanded, setIsHistoryExpanded] = useState<boolean>(false);

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
    runAutoCheckoutFinalizer();
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
    const stopSync = startAutoSyncEngine();

    const handleOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    // Periodic check for auto-checkout (at 11:59 PM) and reminders
    const periodicCheckTimer = setInterval(() => {
      if (employeeId) {
        const autoCheckedOut = checkAndTriggerAutoCheckout(employeeId, liveLocation || undefined);
        if (autoCheckedOut) {
          refreshRecords();
          setActionFeedback(`Auto System Checkout triggered (Reason: ${autoCheckedOut.reason})`);
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

  useEffect(() => {
    refreshRecords();
  }, [syncAttendance]);

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
    if (liveLocation && distance !== null) {
      const todayStr = getFormattedDateStr();
      const activeRecord = getTodayAttendanceRecord(employeeId, todayStr);
      if (activeRecord && (activeRecord.attendanceType === 'OFFICE' || !activeRecord.attendanceType)) {
        const updated = trackSmartOfficeExit(activeRecord, distance);
        setTodayRecord(updated);
      }
      handleAutoCheckInCountdown(locationState === 'INSIDE_OFFICE', liveLocation);
    }
  }, [liveLocation, distance, locationState, employeeId]);

  // Office Check-In Handler
  const handleManualCheckIn = async () => {
    if (todayRecord) {
      setActionFeedback('Attendance session already logged for today.');
      return;
    }

    setActionFeedback('Obtaining fresh GPS coordinates...');

    try {
      let freshCoords: { latitude: number; longitude: number } | null = null;
      
      try {
        if (Capacitor.isNativePlatform()) {
          const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 5000 });
          if (pos && pos.coords) {
            freshCoords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          }
        } else if (navigator.geolocation) {
          freshCoords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
              (err) => reject(err),
              { enableHighAccuracy: true, timeout: 5000 }
            );
          });
        }
      } catch (err) {
        console.warn('Failed to obtain fresh coordinates, falling back to watched location:', err);
      }

      const finalCoords = freshCoords || liveLocation;

      if (!finalCoords) {
        setActionFeedback('Office check-in is available only within 25 meters of the office.');
        return;
      }

      const finalDistance = getDistanceFromLatLonInM(
        finalCoords.latitude,
        finalCoords.longitude,
        OFFICE_LOCATION.latitude,
        OFFICE_LOCATION.longitude
      );

      if (finalDistance > 25) {
        setActionFeedback('Office check-in is available only within 25 meters of the office.');
        return;
      }

      const record = performCheckIn(
        employeeId,
        employeeName,
        finalCoords,
        currentAddress || 'Raniganj HQ',
        'MANUAL'
      );
      updateAttendanceOptimistically(record);
      refreshRecords();
      setActionFeedback(`Manual Office Check-In Successful at ${record.checkInTime}`);
    } catch (err: any) {
      setActionFeedback(err.message || 'Office check-in is available only within 25 meters of the office.');
    }
  };

  // Office Check-Out Handler
  const handleManualCheckOut = () => {
    if (!todayRecord) return;
    if (!liveLocation) {
      setActionFeedback('Live GPS location required for check-out.');
      return;
    }

    // FINAL GEOLOCATION VERIFICATION FOR RACE CONDITIONS
    const currentDistance = getDistanceFromLatLonInM(
      liveLocation.latitude,
      liveLocation.longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    if (currentDistance > 25) {
      setActionFeedback('Checkout is only available inside the office premises.');
      return;
    }

    try {
      const updated = performCheckOut(
        todayRecord,
        liveLocation,
        currentAddress || 'Raniganj HQ'
      );
      updateAttendanceOptimistically(updated);
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
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#200D4B] to-[#2A145B] text-white p-3 sm:p-6 pb-32 max-w-5xl mx-auto space-y-4 font-sans">
      
      {/* ==================================================== */}
      {/* CLEAN PAGE TITLE */}
      {/* ==================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-purple-500/20">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Attendance
          </h1>
          <p className="text-xs text-purple-200/80 font-medium mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-purple-400" />
            {getFormattedDateLong()} • <strong className="text-white">{employeeName}</strong> ({employeeId})
          </p>
        </div>
      </div>

      {/* ==================================================== */}
      {/* LIVE STATUS RIBBON */}
      {/* ==================================================== */}
      <div className={`px-4 py-2.5 rounded-2xl border flex items-center justify-between text-xs font-bold tracking-wider transition-all duration-300 shadow-sm ${ribbonInfo.style}`}>
        <div className="flex items-center gap-2.5">
          {ribbonInfo.icon}
          <span>{ribbonInfo.text}</span>
        </div>
        <span className="text-[10px] opacity-75 font-mono uppercase">LIVE STATUS</span>
      </div>

      {/* Action Feedback Banner */}
      {actionFeedback && (
        <div className="p-3.5 bg-purple-900/60 border border-purple-400/40 text-purple-100 rounded-2xl text-xs font-bold flex justify-between items-center shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-300" />
            <span>{actionFeedback}</span>
          </div>
          <button onClick={() => setActionFeedback(null)} className="text-purple-300 hover:text-white font-bold text-sm px-1">✕</button>
        </div>
      )}

      {/* ==================================================== */}
      {/* TODAY'S ATTENDANCE STATUS CARD */}
      {/* ==================================================== */}
      <TodayAttendanceCard 
        todayRecord={todayRecord} 
        isSyncing={isSyncing} 
        isOnline={isOnline} 
      />

      {/* ==================================================== */}
      {/* 1. TODAY'S ATTENDANCE ACTIONS */}
      {/* ==================================================== */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <h2 className="text-xs font-bold text-purple-300 uppercase tracking-wider">
            Select Attendance Mode
          </h2>
          {todayRecord && (
            <span className="text-[10px] bg-purple-900/60 text-purple-200 font-extrabold px-2.5 py-0.5 rounded-full border border-purple-500/30">
              Mode Locked for Today
            </span>
          )}
        </div>

        {/* ATTENDANCE MODES SELECTION GRID */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Card 1: Office */}
          <button
            type="button"
            disabled={!!todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE'}
            onClick={() => setActiveMode('OFFICE')}
            className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between h-24 relative overflow-hidden group ${
              activeMode === 'OFFICE'
                ? 'border-[#7C3AED] bg-[#381F6D] shadow-[0_0_20px_rgba(124,58,237,0.35)] ring-2 ring-[#7C3AED]'
                : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-purple-400/40 hover:bg-[#2D1B5A]'
            } ${todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xl">🏢</span>
              {activeMode === 'OFFICE' && (
                <span className="w-4 h-4 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-[10px]">
                  <Check className="w-3 h-3" />
                </span>
              )}
              {todayRecord && (todayRecord.attendanceType || 'OFFICE') !== 'OFFICE' && (
                <Lock className="w-3.5 h-3.5 text-purple-400/60" />
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-white">Office</h3>
              <p className="text-[10px] text-purple-300 font-medium leading-tight mt-0.5">25m Geofence</p>
            </div>
          </button>

          {/* Card 2: Work From Home (WFH) */}
          <button
            type="button"
            disabled={!!todayRecord && todayRecord.attendanceType !== 'WFH'}
            onClick={() => setActiveMode('WFH')}
            className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between h-24 relative overflow-hidden group ${
              activeMode === 'WFH'
                ? 'border-emerald-500 bg-[#1E3B30] shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-2 ring-emerald-500'
                : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-emerald-400/40 hover:bg-[#2D1B5A]'
            } ${todayRecord && todayRecord.attendanceType !== 'WFH' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xl">🏠</span>
              <div className="flex items-center gap-1">
                {activeMode === 'WFH' && (
                  <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                    <Check className="w-3 h-3" />
                  </span>
                )}
                <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  {currentWfhMonthCount}/2
                </span>
              </div>
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-white">Work From Home</h3>
              <p className="text-[10px] text-purple-300 font-medium leading-tight mt-0.5">Max 2 per Month</p>
            </div>
          </button>

          {/* Card 3: Client Visit */}
          <button
            type="button"
            disabled={!!todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT'}
            onClick={() => setActiveMode('CLIENT_VISIT')}
            className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between h-24 relative overflow-hidden group ${
              activeMode === 'CLIENT_VISIT'
                ? 'border-amber-500 bg-[#3B2D1E] shadow-[0_0_20px_rgba(245,158,11,0.3)] ring-2 ring-amber-500'
                : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-amber-400/40 hover:bg-[#2D1B5A]'
            } ${todayRecord && todayRecord.attendanceType !== 'CLIENT_VISIT' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xl">🤝</span>
              {activeMode === 'CLIENT_VISIT' && (
                <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px]">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-white">Client Visit</h3>
              <p className="text-[10px] text-purple-300 font-medium leading-tight mt-0.5">On-site Meetings</p>
            </div>
          </button>

          {/* Card 4: Outdoor Work */}
          <button
            type="button"
            disabled={!!todayRecord && todayRecord.attendanceType !== 'OUTDOOR'}
            onClick={() => setActiveMode('OUTDOOR')}
            className={`p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between h-24 relative overflow-hidden group ${
              activeMode === 'OUTDOOR'
                ? 'border-indigo-500 bg-[#2A234A] shadow-[0_0_20px_rgba(99,102,241,0.3)] ring-2 ring-indigo-500'
                : 'border-purple-500/20 bg-[#2D1B5A]/70 hover:border-indigo-400/40 hover:bg-[#2D1B5A]'
            } ${todayRecord && todayRecord.attendanceType !== 'OUTDOOR' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <div className="flex justify-between items-center">
              <span className="text-xl">🚗</span>
              {activeMode === 'OUTDOOR' && (
                <span className="w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center text-[10px]">
                  <Check className="w-3 h-3" />
                </span>
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-xs text-white">Outdoor Work</h3>
              <p className="text-[10px] text-purple-300 font-medium leading-tight mt-0.5">Field & Market Duty</p>
            </div>
          </button>
        </div>

        {/* ACTIVE MODE ACTIONS & SUBMISSION FORMS */}
        <div className="mt-2.5">
          {activeMode === 'OFFICE' && (
            <div className="space-y-3">
              {/* GPS status / distance indicator */}
              <div className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">📍</span>
                  <div>
                    <p className="font-extrabold text-white">Office Location Status</p>
                    <p className="text-[11px] text-purple-300/90 mt-0.5">
                      {locationStatus === 'loading' ? 'Acquiring high-accuracy GPS satellite lock...' :
                       locationStatus === 'error' ? `GPS lock error: ${errorMessage}` :
                       distance !== null && distance <= 25 ? `Inside Office HQ geofence (${formattedDistance})` :
                       `Outside Office HQ geofence (${formattedDistance})`}
                    </p>
                  </div>
                </div>

                {locationStatus === 'loading' && (
                  <div className="flex items-center gap-1.5 font-bold text-purple-300 animate-pulse">
                    <RotateCw className="w-3.5 h-3.5 animate-spin" /> Tracking...
                  </div>
                )}
                {locationStatus === 'error' && (
                  <Button onClick={() => refreshLocation()} className="bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] py-1.5 px-3.5 rounded-xl shadow">
                    Retry GPS Lock
                  </Button>
                )}
                {locationStatus === 'success' && (
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                    distance !== null && distance <= 25 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}>
                    {distance !== null && distance <= 25 ? 'Inside (Ready)' : 'Outside'}
                  </span>
                )}
              </div>

              {/* AUTO CHECK-IN countdown */}
              {!todayRecord && locationState === 'INSIDE_OFFICE' && (
                <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-400/40 p-5 shadow-[0_0_25px_rgba(124,58,237,0.3)] text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-purple-200 text-xs font-black uppercase tracking-wider">
                    <Radio className="w-4 h-4 text-[#7C3AED] animate-spin" /> Auto Check-In Active
                  </div>
                  {autoCheckInCountdown !== null ? (
                    <div className="space-y-2 py-1">
                      <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-4 border-purple-500/20 animate-ping" />
                        <div className="w-14 h-14 rounded-full bg-[#7C3AED] text-white flex items-center justify-center text-xl font-black shadow-lg">
                          {autoCheckInCountdown}
                        </div>
                      </div>
                      <p className="text-[11px] text-purple-200 font-semibold">
                        Auto Check-In in <strong className="text-white">{autoCheckInCountdown} seconds</strong>... Stay within 25m.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-purple-200 font-medium">
                      Inside Office Geofence. Auto Check-in will trigger shortly.
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              {!todayRecord ? (
                <div className="space-y-2">
                  {autoCheckInCountdown === null && (
                    <>
                      <Button 
                        onClick={handleManualCheckIn}
                        disabled={locationStatus !== 'success' || distance === null || distance > 25}
                        className={`w-full py-4 font-black text-sm rounded-2xl transition-all border ${
                          locationStatus === 'success' && distance !== null && distance <= 25
                            ? 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white border-purple-400/30 active:scale-95 shadow-lg'
                            : 'bg-[#1D123C] text-purple-300/40 border-purple-950/40 opacity-40 cursor-not-allowed pointer-events-none shadow-none transform-none'
                        }`}
                      >
                        <UserCheck className="w-5 h-5 mr-2" /> 
                        {locationStatus === 'success' && distance !== null && distance <= 25 ? 'Manual Office Check-In' : 'Check-In Unavailable'}
                      </Button>
                      {(locationStatus !== 'success' || distance === null || distance > 25) && (
                        <p className="text-[11px] text-rose-300 text-center font-bold">
                          Move within 25 meters of office HQ to check in
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {!todayRecord.checkOutTime && (
                    <>
                      <Button 
                        onClick={handleManualCheckOut} 
                        disabled={!isInsideGeofence}
                        className={`w-full py-4 font-black text-sm rounded-2xl transition-all shadow-lg ${
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
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {activeMode === 'WFH' && (
            <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-emerald-500/30 p-5 shadow-lg space-y-4">
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🏠</span>
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-wider">Work From Home (WFH)</h3>
                    <p className="text-[10px] text-purple-300">No office geofence required</p>
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                  currentWfhMonthCount >= 2 ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {currentWfhMonthCount} / 2 Used This Month
                </span>
              </div>

              {wfhFormError && (
                <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{wfhFormError}</span>
                </div>
              )}

              {!todayRecord ? (
                <form onSubmit={handleWfhSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 mb-1">
                      Reason for WFH <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={wfhReason}
                      onChange={(e) => setWfhReason(e.target.value)}
                      placeholder="e.g., Personal errand / Doctor visit / Remote task"
                      className="w-full px-4 py-2.5 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 mb-1">
                      Today's Work Plan <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={wfhWorkPlan}
                      onChange={(e) => setWfhWorkPlan(e.target.value)}
                      rows={2}
                      placeholder="Detail your planned deliverables for today..."
                      className="w-full px-4 py-2.5 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-emerald-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={currentWfhMonthCount >= 2}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow border border-emerald-400/30"
                  >
                    Submit WFH Attendance
                  </Button>
                </form>
              ) : (
                <div className="p-3 bg-purple-950/60 rounded-xl border border-purple-500/20 text-xs space-y-1">
                  <p className="font-bold text-emerald-300">WFH Session Active for Today</p>
                  <p><span className="text-purple-300 font-bold">Reason:</span> {todayRecord.wfhReason || 'N/A'}</p>
                  <p><span className="text-purple-300 font-bold">Work Plan:</span> {todayRecord.workPlan || 'N/A'}</p>
                </div>
              )}
            </div>
          )}

          {activeMode === 'CLIENT_VISIT' && (
            <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-amber-500/30 p-5 shadow-lg space-y-4">
              <div className="flex items-center gap-2.5 border-b border-purple-500/20 pb-3">
                <span className="text-xl">🤝</span>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">Client Visit</h3>
                  <p className="text-[10px] text-purple-300">Log on-site client meetings</p>
                </div>
              </div>

              {clientFormError && (
                <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{clientFormError}</span>
                </div>
              )}

              {!todayRecord ? (
                <form onSubmit={handleClientVisitSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 mb-1">
                      Client Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g., Tata Steel Ltd"
                      className="w-full px-4 py-2.5 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 mb-1">
                      Client Location / Address <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={clientLocation}
                      onChange={(e) => setClientLocation(e.target.value)}
                      placeholder="e.g., Durgapur Industrial Complex"
                      className="w-full px-4 py-2.5 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 mb-1">
                      Purpose of Visit <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={clientPurpose}
                      onChange={(e) => setClientPurpose(e.target.value)}
                      rows={2}
                      placeholder="e.g., Contract negotiation and site inspection"
                      className="w-full px-4 py-2.5 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow border border-amber-400/30"
                  >
                    Submit Client Visit Attendance
                  </Button>
                </form>
              ) : (
                <div className="p-3 bg-purple-950/60 rounded-xl border border-purple-500/20 text-xs space-y-1">
                  <p className="font-bold text-amber-300">Client Visit Active for Today</p>
                  <p><span className="text-purple-300 font-bold">Client:</span> {todayRecord.clientName || 'N/A'}</p>
                  <p><span className="text-purple-300 font-bold">Location:</span> {todayRecord.clientLocation || 'N/A'}</p>
                  <p><span className="text-purple-300 font-bold">Purpose:</span> {todayRecord.purpose || 'N/A'}</p>
                </div>
              )}
            </div>
          )}

          {activeMode === 'OUTDOOR' && (
            <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-indigo-500/30 p-5 shadow-lg space-y-4">
              <div className="flex items-center gap-2.5 border-b border-purple-500/20 pb-3">
                <span className="text-xl">🚗</span>
                <div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">Outdoor Work</h3>
                  <p className="text-[10px] text-purple-300">Field visits, surveys, market duty</p>
                </div>
              </div>

              {outdoorFormError && (
                <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{outdoorFormError}</span>
                </div>
              )}

              {!todayRecord ? (
                <form onSubmit={handleOutdoorSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 mb-1">
                      Outdoor Work Type <span className="text-rose-400">*</span>
                    </label>
                    <select
                      value={outdoorType}
                      onChange={(e) => setOutdoorType(e.target.value as OutdoorWorkTypeOption)}
                      className="w-full px-4 py-2.5 bg-purple-950 border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-400"
                    >
                      {OUTDOOR_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt} className="bg-purple-950 text-white">{opt}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-purple-300 mb-1">
                      Description <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      value={outdoorDescription}
                      onChange={(e) => setOutdoorDescription(e.target.value)}
                      rows={2}
                      placeholder="Provide details about your outdoor field assignment..."
                      className="w-full px-4 py-2.5 bg-purple-950/80 border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-indigo-400"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow border border-indigo-400/30"
                  >
                    Submit Outdoor Work Attendance
                  </Button>
                </form>
              ) : (
                <div className="p-3 bg-purple-950/60 rounded-xl border border-purple-500/20 text-xs space-y-1">
                  <p className="font-bold text-indigo-300">Outdoor Work Active for Today</p>
                  <p><span className="text-purple-300 font-bold">Type:</span> {todayRecord.outdoorType || 'N/A'}</p>
                  <p><span className="text-purple-300 font-bold">Description:</span> {todayRecord.description || 'N/A'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>


      {/* ==================================================== */}
      {/* 4 & 5 & 6. ATTENDANCE CALENDAR & MONTHLY SUMMARY */}
      {/* ==================================================== */}
      <AttendanceCalendar 
        employeeId={employeeId}
        employeeName={employeeName}
        attendanceRecords={allRecords}
        onRefreshRecords={refreshRecords}
      />

      {/* ==================================================== */}
      {/* 7. ATTENDANCE HISTORY LOGS */}
      {/* ==================================================== */}
      <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-500/30 overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.37)]">
        <div 
          onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-purple-500/10 transition select-none"
        >
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>📅</span> Attendance History Logs
            </h3>
            <p className="text-[11px] text-purple-300 mt-0.5">
              {isHistoryExpanded ? 'Search and filter local & synchronized records' : 'Click to expand historical logs'}
            </p>
          </div>
          <div className="w-7 h-7 rounded-lg bg-[#211044]/90 border border-purple-500/25 flex items-center justify-center text-[#A78BFA]">
            <span className={`transform transition-transform duration-200 ${isHistoryExpanded ? 'rotate-90' : ''}`}>
              &rarr;
            </span>
          </div>
        </div>

        {isHistoryExpanded && (
          <div className="p-6 border-t border-purple-500/15 bg-[#211044]/40 space-y-4">
            {/* Search and Filters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search date, client, location..."
                  value={historySearchTerm}
                  onChange={(e) => setHistorySearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-purple-950/80 border border-purple-500/25 rounded-xl text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-purple-400"
                />
                <span className="absolute left-2.5 top-2.5 text-purple-400/70 text-xs">🔍</span>
              </div>

              <div>
                <select
                  value={historyTypeFilter}
                  onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-purple-950/80 border border-purple-500/25 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Modes</option>
                  <option value="OFFICE">🏢 Office</option>
                  <option value="WFH">🏠 WFH</option>
                  <option value="CLIENT_VISIT">🤝 Client Visit</option>
                  <option value="OUTDOOR">🚗 Outdoor Work</option>
                </select>
              </div>

              <div>
                <select
                  value={historySyncFilter}
                  onChange={(e) => setHistorySyncFilter(e.target.value as any)}
                  className="w-full px-3 py-2 bg-purple-950/80 border border-purple-500/25 rounded-xl text-xs text-white focus:outline-none"
                >
                  <option value="ALL">All Sync States</option>
                  <option value="Synced">Synced Only</option>
                  <option value="Pending">Pending Sync</option>
                </select>
              </div>
            </div>

            {filteredHistoryRecords.length === 0 ? (
              <p className="text-xs text-purple-300/60 italic text-center py-6">No matching attendance records found.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
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
        )}
      </div>

    </div>
  );
};
