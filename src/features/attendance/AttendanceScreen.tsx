import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import { LocationGate } from '../../components/common/LocationGate';
import { AttendanceRecord, AttendanceType, OutdoorWorkTypeOption, LiveEmployeeLocation } from '../../types/attendance';
import { isAttendanceCheckoutUnresolved, getCheckInLocationDetails, getCheckoutLocationDetails, getCurrentLocationDetails } from '../../utils/attendanceUtils';
import { getStoredLeaves } from '../../services/leave/leaveStorage';
import { createNotification } from '../../services/notification/notificationService';
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
  calculateWorkingHours,
  parseAttendanceTimeToMinutes
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
import {
  trackResourceCreated,
  trackResourceCleaned,
} from '../../services/monitoring/performanceDiagnostics';
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
    isGpsOff,
    isPermissionDenied,
    isLocationUnavailable,
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

  // Unresolved Checkout Resolution State
  const [proposedTimeInput, setProposedTimeInput] = useState<string>('');
  const [resolutionRemarks, setResolutionRemarks] = useState<string>('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState<boolean>(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState<boolean>(false);

  const employeeId = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const employeeName = employeeData?.name || 'Employee';

  const todayStr = getFormattedDateStr();

  // Find unresolved records from past days (strictly before today)
  const unresolvedPastRecords = useMemo(() => {
    return allRecords
      .filter((r) => {
        const empCode = r.employeeId || r.employeeCode;
        if (empCode !== employeeId) return false;
        
        // Use authoritative helper
        return isAttendanceCheckoutUnresolved(r) || r.checkoutStatus === 'PENDING_ADMIN_REVIEW';
      })
      .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first
  }, [allRecords, employeeId]);

  const activeUnresolvedRecord = unresolvedPastRecords.length > 0 ? unresolvedPastRecords[0] : null;

  // Handle employee submitting or updating proposed checkout time
  const handleSubmitProposedTime = async () => {
    if (!activeUnresolvedRecord) return;
    setProposalError(null);

    const rawTime = proposedTimeInput.trim();
    if (!rawTime) {
      setProposalError('Please enter or select your actual checkout time.');
      return;
    }

    // Standardize to "hh:mm AM/PM" format
    let formattedTime = rawTime;
    if (/^\d{1,2}:\d{2}$/.test(formattedTime)) {
      const [hStr, mStr] = formattedTime.split(':');
      let h = parseInt(hStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      formattedTime = `${String(h).padStart(2, '0')}:${mStr} ${ampm}`;
    }

    setIsSubmittingProposal(true);
    try {
      const updatedRecord: AttendanceRecord = {
        ...activeUnresolvedRecord,
        checkoutStatus: 'PENDING_ADMIN_REVIEW',
        employeeProposedCheckoutTime: formattedTime,
        status: 'PENDING_ADMIN_REVIEW',
        syncStatus: 'Pending',
        updatedAt: new Date().toISOString(),
        version: (activeUnresolvedRecord.version || 1) + 1,
      };

      saveAttendanceRecord(updatedRecord);
      updateAttendanceOptimistically(updatedRecord);
      refreshRecords();
      setIsEditingProposal(false);
      setActionFeedback(`Proposed checkout (${formattedTime}) submitted for Admin verification.`);

      // Send actionable notification to Admin
      createNotification({
        recipientEmployeeCode: 'ADMIN',
        type: 'ATTENDANCE_UNRESOLVED',
        category: 'ATTENDANCE',
        priority: 'HIGH',
        title: 'Checkout Resolution Proposed',
        message: `${employeeName} (${employeeId}) proposed checkout ${formattedTime} for ${activeUnresolvedRecord.date}.`,
        entityId: updatedRecord.id,
        entityType: 'ATTENDANCE',
        idempotencyKey: `proposal_${employeeId}_${activeUnresolvedRecord.date}_${Date.now()}`
      }).catch((e) => console.warn('Admin notification error:', e));

      if (navigator.onLine) {
        syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on proposal:', e));
      }
    } catch (err: any) {
      setProposalError(err.message || 'Failed to submit proposed checkout time.');
    } finally {
      setIsSubmittingProposal(false);
    }
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

  const liveLocationRef = useRef(liveLocation);
  useEffect(() => {
    liveLocationRef.current = liveLocation;
  }, [liveLocation]);

  useEffect(() => {
    refreshRecords();

    // Start sync engine listener
    const stopSync = startAutoSyncEngine();

    const handleOnlineStatus = () => setIsOnline(navigator.onLine);
    const onlineListenerId = 'attendance_screen_online';
    const offlineListenerId = 'attendance_screen_offline';
    const timerId = `attendance_auto_checkout_${Date.now()}`;

    trackResourceCreated('ONLINE_LISTENER', onlineListenerId);
    trackResourceCreated('OFFLINE_LISTENER', offlineListenerId);
    trackResourceCreated('SYNC_TIMER', timerId, 'attendance_screen_auto_checkout');

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    // Periodic check for auto-checkout (at 11:59 PM) and reminders
    const periodicCheckTimer = setInterval(() => {
      if (employeeId) {
        const autoCheckedOut = checkAndTriggerAutoCheckout(employeeId, liveLocationRef.current || undefined);
        if (autoCheckedOut) {
          refreshRecords();
          setActionFeedback(`Auto System Checkout triggered (Reason: ${autoCheckedOut.reason})`);
        }
      }
    }, 60000);

    return () => {
      stopSync();
      trackResourceCleaned('ONLINE_LISTENER', onlineListenerId);
      trackResourceCleaned('OFFLINE_LISTENER', offlineListenerId);
      trackResourceCleaned('SYNC_TIMER', timerId);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      clearInterval(periodicCheckTimer);
    };
  }, [employeeId]);

  useEffect(() => {
    refreshRecords();
  }, [syncAttendance]);

  // Immediate Auto Check-In logic (OFFICE Mode ONLY)
  const handleImmediateAutoCheckIn = (inside: boolean, coords: { latitude: number; longitude: number }) => {
    const todayStr = getFormattedDateStr();
    const currentToday = getTodayAttendanceRecord(employeeId, todayStr);

    if (currentToday) {
      return;
    }

    if (inside && activeMode === 'OFFICE') {
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
  };

  useEffect(() => {
    if (liveLocation && distance !== null) {
      const todayStr = getFormattedDateStr();
      const activeRecord = getTodayAttendanceRecord(employeeId, todayStr);
      if (activeRecord && (activeRecord.attendanceType === 'OFFICE' || !activeRecord.attendanceType)) {
        const updated = trackSmartOfficeExit(activeRecord, distance, liveLocation, currentAddress);
        setTodayRecord(updated);
      }
      handleImmediateAutoCheckIn(locationState === 'INSIDE_OFFICE', liveLocation);
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

  // Compute monthly stats for summary
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    const todayStr = new Date().toISOString().split('T')[0];

    let officeCount = 0;
    let wfhCount = 0;
    let clientVisitCount = 0;
    let outdoorCount = 0;
    let leaveCount = 0;
    let absentCount = 0;

    // Filter records for this month
    const monthRecords = allRecords.filter(r => r.date && r.date.startsWith(currentMonthPrefix) && r.employeeId === employeeId);

    // Filter leaves for this month
    const allLeaves = getStoredLeaves();
    const monthLeaves = allLeaves.filter(l => {
      if (l.employeeId !== employeeId && l.employeeCode !== employeeId) return false;
      if (l.status !== 'APPROVED') return false;
      const startPrefix = l.startDate ? l.startDate.slice(0, 7) : '';
      const endPrefix = l.endDate ? l.endDate.slice(0, 7) : '';
      return startPrefix === currentMonthPrefix || endPrefix === currentMonthPrefix;
    });

    // Working days elapsed & total in month
    let totalWorkingDaysInMonth = 0;
    let workingDaysElapsed = 0;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(currentYear, currentMonth, day);
      const isSunday = d.getDay() === 0;
      if (!isSunday) {
        totalWorkingDaysInMonth++;
        const mStr = String(currentMonth + 1).padStart(2, '0');
        const dStr = String(day).padStart(2, '0');
        const dateStr = `${currentYear}-${mStr}-${dStr}`;
        if (dateStr <= todayStr) {
          workingDaysElapsed++;
        }
      }
    }

    // Helper to determine status for each day
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(currentMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${currentYear}-${mStr}-${dStr}`;

      if (dateStr > todayStr) continue;

      const rec = monthRecords.find(r => r.date === dateStr);
      if (rec) {
        if (rec.attendanceType === 'WFH') wfhCount++;
        else if (rec.attendanceType === 'CLIENT_VISIT') clientVisitCount++;
        else if (rec.attendanceType === 'OUTDOOR') outdoorCount++;
        else officeCount++;
      } else {
        const targetTime = new Date(dateStr).getTime();
        const hasLeave = monthLeaves.some(l => {
          const s = new Date(l.startDate).getTime();
          const e = new Date(l.endDate).getTime();
          return targetTime >= s && targetTime <= e;
        });

        if (hasLeave) {
          leaveCount++;
        } else {
          // If past today and not weekend, count as absent
          const dObj = new Date(currentYear, currentMonth, day);
          const dayOfWeek = dObj.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            absentCount++;
          }
        }
      }
    }

    const presentCount = officeCount + wfhCount + clientVisitCount + outdoorCount;
    const totalValidDays = presentCount + leaveCount;
    const rate = workingDaysElapsed > 0 ? Math.min(100, Math.round((totalValidDays / workingDaysElapsed) * 100)) : 100;

    // Calculate Average Working Time
    let totalMins = 0;
    let daysWithHours = 0;
    
    monthRecords.forEach(rec => {
      if (isAttendanceCheckoutUnresolved(rec) || rec.checkoutStatus === 'UNRESOLVED' || rec.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
        return;
      }
      if (rec.checkInTime && rec.checkOutTime && rec.checkOutTime !== '--:--' && rec.checkOutTime !== 'Pending' && rec.checkOutTime !== 'N/A' && rec.checkOutTime !== 'UNRESOLVED') {
        const inMins = parseAttendanceTimeToMinutes(rec.checkInTime);
        const outMins = parseAttendanceTimeToMinutes(rec.checkOutTime);
        if (inMins !== null && outMins !== null && outMins >= inMins) {
          totalMins += (outMins - inMins);
          daysWithHours++;
        }
      }
    });

    let avgWorkingTimeStr = '0h 0m';
    if (daysWithHours > 0) {
      const avgMins = Math.round(totalMins / daysWithHours);
      const h = Math.floor(avgMins / 60);
      const m = avgMins % 60;
      avgWorkingTimeStr = `${h}h ${m}m`;
    }

    return {
      present: presentCount,
      office: officeCount,
      wfh: wfhCount,
      clientVisit: clientVisitCount,
      outdoor: outdoorCount,
      leave: leaveCount,
      absent: absentCount,
      attendanceRate: isNaN(rate) ? 0 : rate,
      avgWorkingTime: avgWorkingTimeStr,
      workingDaysElapsed,
      workingDaysTotal: totalWorkingDaysInMonth
    };
  }, [allRecords, employeeId]);

  if (isPermissionDenied || isGpsOff || (locationStatus === 'error' && isLocationUnavailable)) {
    return <LocationGate />;
  }

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
    <div className="min-h-screen bg-[#120722] text-white p-3 sm:p-6 pb-32 max-w-5xl mx-auto space-y-5 font-sans">
      
      {/* ==================================================== */}
      {/* CLEAN PAGE TITLE */}
      {/* ==================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-teal-500/20">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <Clock className="w-7 h-7 text-teal-400" /> Attendance
          </h1>
          <p className="text-xs text-teal-200/80 font-medium mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-teal-400" />
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
      {/* MANDATORY UNRESOLVED CHECKOUT ACCESS LOCK & RESOLUTION */}
      {/* ==================================================== */}
      {activeUnresolvedRecord ? (
        <div className="space-y-5 animate-fade-in">
          <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#2D1B5A] via-[#1E113E] to-[#120722] border-2 border-amber-500/40 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-amber-500/20">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 flex-shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      ⚠️ CHECKOUT REQUIRES RESOLUTION
                    </span>
                    {unresolvedPastRecords.length > 1 && (
                      <span className="text-[10px] font-bold text-amber-400">
                        ({unresolvedPastRecords.length} sessions need resolution)
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-black text-white mt-1">
                    CHECKOUT REQUIRES RESOLUTION
                  </h2>
                </div>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-purple-200/90 leading-relaxed font-medium">
              {activeUnresolvedRecord.date === new Date(Date.now() - 86400000).toISOString().split('T')[0]
                ? "Yesterday's checkout time could not be reliably determined."
                : `Previous checkout time for ${activeUnresolvedRecord.date} could not be reliably determined.`}
              {' '}Attendance section controls are temporarily locked until your actual checkout time is submitted and verified by an Administrator.
            </p>

            {/* Session Details */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-black/40 rounded-2xl border border-purple-500/20 text-xs">
              <div>
                <span className="text-[10px] text-purple-400 font-bold uppercase block tracking-wider">Date</span>
                <span className="text-white font-extrabold text-sm">{activeUnresolvedRecord.date}</span>
              </div>
              <div>
                <span className="text-[10px] text-purple-400 font-bold uppercase block tracking-wider">Check-in</span>
                <span className="text-emerald-400 font-mono font-extrabold text-sm">{activeUnresolvedRecord.checkInTime || '--:--'}</span>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[10px] text-purple-400 font-bold uppercase block tracking-wider">Checkout</span>
                <span className={`font-extrabold text-sm ${activeUnresolvedRecord.checkoutStatus === 'PENDING_ADMIN_REVIEW' ? 'text-amber-400' : 'text-rose-400'}`}>
                  {activeUnresolvedRecord.checkoutStatus === 'PENDING_ADMIN_REVIEW' ? 'PENDING ADMIN REVIEW' : 'UNRESOLVED'}
                </span>
              </div>
            </div>

            {/* Resolution Form / Pending State */}
            {activeUnresolvedRecord.checkoutStatus === 'PENDING_ADMIN_REVIEW' && !isEditingProposal ? (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-amber-300 text-xs font-black">
                    <Clock className="w-4 h-4" />
                    <span>Proposed Checkout: {activeUnresolvedRecord.employeeProposedCheckoutTime || 'Submitted'}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    PENDING ADMIN REVIEW
                  </span>
                </div>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  Your proposed checkout time has been submitted to Admin for verification. The Admin will review your attendance logs and finalize the record. Once finalized, full attendance access will be automatically unlocked.
                </p>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingProposal(true);
                      setProposedTimeInput(activeUnresolvedRecord.employeeProposedCheckoutTime || '');
                    }}
                    className="px-3 py-1.5 bg-black/40 hover:bg-black/60 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/30 transition-all"
                  >
                    Edit Proposed Time
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-4 rounded-2xl bg-black/30 border border-purple-500/20">
                <label className="text-xs font-bold text-white block">
                  Select or enter your actual checkout time for {activeUnresolvedRecord.date}:
                </label>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="time"
                    value={proposedTimeInput}
                    onChange={(e) => setProposedTimeInput(e.target.value)}
                    className="flex-1 px-3.5 py-2.5 bg-purple-950/40 border border-purple-500/30 text-white rounded-xl text-xs focus:ring-2 focus:ring-teal-400 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {['17:30', '18:00', '18:10', '18:30', '19:00', '19:30'].map((preset) => {
                      const [hStr, mStr] = preset.split(':');
                      const h = parseInt(hStr, 10);
                      const label = `${h > 12 ? h - 12 : h}:${mStr} ${h >= 12 ? 'PM' : 'AM'}`;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setProposedTimeInput(preset)}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                            proposedTimeInput === preset
                              ? 'bg-teal-500 text-black border-teal-400'
                              : 'bg-purple-950/40 text-purple-200 border-purple-500/20 hover:bg-purple-900/40'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {proposalError && (
                  <div className="text-xs text-rose-400 font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{proposalError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  {isEditingProposal && (
                    <button
                      type="button"
                      onClick={() => setIsEditingProposal(false)}
                      className="px-4 py-2 bg-black/40 hover:bg-black/60 text-purple-300 text-xs font-bold rounded-xl border border-purple-500/20 transition-all"
                    >
                      Cancel
                    </button>
                  )}
                  <Button
                    onClick={handleSubmitProposedTime}
                    disabled={isSubmittingProposal}
                    className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-black px-6 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {isSubmittingProposal ? 'SUBMITTING...' : 'RESOLVE CHECKOUT'}
                  </Button>
                </div>
              </div>
            )}

            {/* Continuous Tracking Notice */}
            <div className="flex items-center gap-2 p-3 bg-purple-950/30 rounded-xl border border-purple-500/15 text-[11px] text-purple-300/80">
              <Activity className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
              <span>
                <strong>Independent Daily Engine:</strong> Today&apos;s automatic check-in & geofence tracking continues working normally in the background.
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
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
                      {distance === null
                        ? (locationStatus === 'error' ? `GPS lock error: ${errorMessage}` : 'Acquiring high-accuracy GPS satellite lock...')
                        : distance <= 25
                          ? `Inside Office HQ geofence (${formattedDistance})`
                          : `Outside Office HQ geofence (${formattedDistance})`}
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

              {/* AUTO CHECK-IN active status */}
              {!todayRecord && locationState === 'INSIDE_OFFICE' && (
                <div className="bg-[#2D1B5A]/90 backdrop-blur-xl rounded-[22px] border border-purple-400/40 p-5 shadow-[0_0_25px_rgba(124,58,237,0.3)] text-center space-y-3">
                  <div className="flex items-center justify-center gap-2 text-purple-200 text-xs font-black uppercase tracking-wider">
                    <Radio className="w-4 h-4 text-[#7C3AED] animate-spin" /> Auto Check-In Active
                  </div>
                  <p className="text-[11px] text-purple-200 font-medium">
                    Inside Office Geofence. Auto Check-in is executing immediately.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              {!todayRecord ? (
                <div className="space-y-2">
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
      {/* 2. CURRENT ATTENDANCE STATUS */}
      {/* ==================================================== */}
      {(() => {
        const liveLocationData: LiveEmployeeLocation | null = liveLocation ? {
          employeeId: employeeData?.employeeCode || employeeData?.uid || '',
          employeeName: employeeData?.name || '',
          latitude: liveLocation.latitude,
          longitude: liveLocation.longitude,
          accuracy: (liveLocation as any).accuracy,
          distanceFromOffice: distance ?? 0,
          townCity: currentAddress || 'Raniganj HQ',
          timestamp: (liveLocation as any).timestamp ? new Date((liveLocation as any).timestamp).toISOString() : new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } : null;

        return (
          <TodayAttendanceCard 
            todayRecord={todayRecord} 
            isSyncing={isSyncing} 
            isOnline={isOnline}
            liveLocationData={liveLocationData}
          />
        );
      })()}

      {/* ==================================================== */}
      {/* 3. TODAY'S DETAILS */}
      {/* ==================================================== */}
      {todayRecord && ['WFH', 'CLIENT_VISIT', 'OUTDOOR'].includes(todayRecord.attendanceType || '') && (
        <Card className="p-5 bg-purple-950/40 border border-purple-500/20 text-xs rounded-2xl space-y-3">
          <h3 className="text-xs font-extrabold text-purple-300 uppercase tracking-widest border-b border-purple-500/15 pb-2">
            📝 Today's Details
          </h3>
          {todayRecord.attendanceType === 'WFH' && (
            <div className="space-y-1.5">
              <p className="font-bold text-emerald-300">Work From Home (WFH)</p>
              <p><span className="text-purple-300 font-bold">Reason:</span> {todayRecord.wfhReason || 'N/A'}</p>
              <p><span className="text-purple-300 font-bold">Work Plan:</span> {todayRecord.workPlan || 'N/A'}</p>
            </div>
          )}
          {todayRecord.attendanceType === 'CLIENT_VISIT' && (
            <div className="space-y-1.5">
              <p className="font-bold text-amber-300">Client Visit</p>
              <p><span className="text-purple-300 font-bold">Client:</span> {todayRecord.clientName || 'N/A'}</p>
              <p><span className="text-purple-300 font-bold">Location:</span> {todayRecord.clientLocation || 'N/A'}</p>
              <p><span className="text-purple-300 font-bold">Purpose:</span> {todayRecord.purpose || 'N/A'}</p>
            </div>
          )}
          {todayRecord.attendanceType === 'OUTDOOR' && (
            <div className="space-y-1.5">
              <p className="font-bold text-indigo-300">Outdoor Work</p>
              <p><span className="text-purple-300 font-bold">Type:</span> {todayRecord.outdoorType || 'N/A'}</p>
              <p><span className="text-purple-300 font-bold">Description:</span> {todayRecord.description || 'N/A'}</p>
            </div>
          )}
        </Card>
      )}

      {/* ==================================================== */}
      {/* 4 & 5. ATTENDANCE CALENDAR & DAY DETAILS */}
      {/* ==================================================== */}
      <AttendanceCalendar 
        employeeId={employeeId}
        employeeName={employeeName}
        attendanceRecords={allRecords}
        onRefreshRecords={refreshRecords}
      />

      {/* ==================================================== */}
      {/* 6. MONTHLY SUMMARY */}
      {/* ==================================================== */}
      <Card className="p-5 bg-gradient-to-br from-[#2D1B5A]/90 to-[#211044]/90 border border-purple-500/30 shadow-xl rounded-2xl">
        <h3 className="text-xs font-extrabold text-purple-300 uppercase tracking-widest border-b border-purple-500/20 pb-2 mb-4 flex items-center justify-between">
          <span>📊 THIS MONTH</span>
          <span className="text-[10px] text-purple-300/60 font-mono font-bold uppercase">SUMMARY</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          {/* Left: Compact Stats Table */}
          <div className="space-y-2 border-b md:border-b-0 md:border-r border-purple-500/10 pb-4 md:pb-0 md:pr-6 text-xs">
            <div className="flex justify-between font-semibold">
              <span className="text-purple-300">Present</span>
              <span className="text-white font-black">{monthlyStats.present}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-purple-300 ml-3">🏢 Office</span>
              <span className="text-white font-bold">{monthlyStats.office}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-purple-300 ml-3">🏠 WFH</span>
              <span className="text-emerald-300 font-bold">{monthlyStats.wfh}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-purple-300 ml-3">🤝 Client Visit</span>
              <span className="text-amber-300 font-bold">{monthlyStats.clientVisit}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-purple-300 ml-3">🚗 Outdoor Work</span>
              <span className="text-indigo-300 font-bold">{monthlyStats.outdoor}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-purple-300">🏖 Leave</span>
              <span className="text-cyan-300 font-black">{monthlyStats.leave}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span className="text-purple-300">○ Absent</span>
              <span className="text-rose-300 font-black">{monthlyStats.absent}</span>
            </div>
          </div>

          {/* Middle: Attendance Rate Circle/Indicator */}
          <div className="flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-purple-500/10 pb-4 md:pb-0 md:px-6">
            <span className="text-[10px] text-purple-300 uppercase tracking-wider font-extrabold mb-2 text-center">
              Attendance Rate
            </span>
            <div className="relative w-20 h-20 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-purple-950/60"
                  strokeWidth="3"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-purple-400"
                  strokeDasharray={`${monthlyStats.attendanceRate}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-black font-mono text-white">{monthlyStats.attendanceRate}%</span>
              </div>
            </div>
            <span className="text-[10px] text-purple-300/60 mt-1.5 font-bold font-mono">
              {monthlyStats.workingDaysElapsed} / {monthlyStats.workingDaysTotal} Days
            </span>
          </div>

          {/* Right: Average Working Time */}
          <div className="flex flex-col items-center md:items-end justify-center text-center md:text-right">
            <span className="text-[10px] text-purple-300 uppercase tracking-wider font-extrabold mb-1">
              Average Working Time
            </span>
            <span className="text-2xl font-black font-mono text-white tracking-tight">
              {monthlyStats.avgWorkingTime}
            </span>
            <span className="text-[10px] text-purple-300/60 mt-1 font-bold">
              Based on active sessions
            </span>
          </div>
        </div>
      </Card>


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
                {filteredHistoryRecords.map((rec) => {
                  const checkInLoc = getCheckInLocationDetails(rec);
                  const checkoutLoc = getCheckoutLocationDetails(rec);
                  const currentLoc = getCurrentLocationDetails(rec);

                  return (
                    <div 
                      key={rec.id} 
                      className="p-4 bg-purple-950/60 rounded-2xl border border-purple-500/20 text-xs flex flex-col gap-3 hover:border-purple-400/40 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                          {(() => {
                            if (rec.checkInTime && rec.checkOutTime && rec.checkOutTime !== '--:--' && rec.checkOutTime !== 'Pending' && rec.checkOutTime !== 'N/A' && rec.checkOutTime !== 'UNRESOLVED') {
                              const calculated = calculateWorkingHours(rec.checkInTime, rec.checkOutTime);
                              if (calculated) {
                                return (
                                  <span className="text-[11px] text-purple-200/90 font-mono font-bold bg-purple-900/50 px-2 py-0.5 rounded-md border border-purple-500/20">
                                    ⏱️ {calculated}
                                  </span>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            rec.syncStatus === 'Synced' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}>
                            {rec.syncStatus}
                          </span>
                        </div>
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

                      {/* Separate Check-in, Checkout & Current Location */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1 pt-2 border-t border-purple-500/15">
                        {/* Check-In Block */}
                        <div className="bg-purple-950/80 p-2.5 rounded-xl border border-purple-500/20 space-y-0.5">
                          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
                            <span>Check-in Location</span>
                            <span className="font-mono text-emerald-300">{checkInLoc.time}</span>
                          </div>
                          <div className="text-white font-medium truncate flex items-center gap-1" title={checkInLoc.location}>
                            <span className="text-emerald-400">📍</span> {checkInLoc.location}
                          </div>
                          {checkInLoc.distance && (
                            <div className="text-[10px] text-purple-300/80 font-mono">
                              Distance: {checkInLoc.distance}
                            </div>
                          )}
                        </div>

                        {/* Checkout Block */}
                        <div className="bg-purple-950/80 p-2.5 rounded-xl border border-purple-500/20 space-y-0.5">
                          <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider flex items-center justify-between">
                            <span>Checkout Location</span>
                            <span className="font-mono text-rose-300">{checkoutLoc.time}</span>
                          </div>
                          <div className={`font-medium truncate flex items-center gap-1 ${checkoutLoc.isUnresolved ? 'text-amber-300 font-bold' : 'text-white'}`} title={checkoutLoc.location}>
                            <span className={checkoutLoc.isUnresolved ? 'text-amber-400' : 'text-rose-400'}>📍</span> {checkoutLoc.location}
                          </div>
                          {checkoutLoc.distance && (
                            <div className="text-[10px] text-purple-300/80 font-mono">
                              Distance: {checkoutLoc.distance}
                            </div>
                          )}
                        </div>

                        {/* Current Location Block */}
                        <div className="bg-purple-950/80 p-2.5 rounded-xl border border-purple-500/20 space-y-0.5">
                          <div className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between">
                            <span>Current Location</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                              currentLoc.status === 'LIVE' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse' :
                              currentLoc.status === 'RECENT' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                              currentLoc.status === 'STALE' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}>
                              {currentLoc.status}
                            </span>
                          </div>
                          <div className="text-white font-medium truncate flex items-center gap-1" title={currentLoc.location}>
                            <span className="text-cyan-400">📍</span> {currentLoc.location}
                          </div>
                          {currentLoc.distance && (
                            <div className="text-[10px] text-purple-300/80 font-mono">
                              Distance: {currentLoc.distance}
                            </div>
                          )}
                          {currentLoc.statusText && (
                            <div className="text-[9px] text-cyan-200/80 font-mono flex items-center gap-1">
                              <span>⏱</span> {currentLoc.statusText}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

    </div>
  );
};
