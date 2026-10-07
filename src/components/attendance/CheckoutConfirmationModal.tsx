import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, Building2, AlertTriangle, Clock, MapPin, CheckCircle2, X, Send, Calendar, Sparkles } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { getTodayAttendanceRecord, saveAttendanceRecord, getStoredAttendanceRecords } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { AutomaticAttendanceEngine } from '../../services/attendance/automaticAttendanceEngine';
import { getNativeAttendanceState, clearNativeActiveSession } from '../../services/attendance/nativeGeofenceBridge';
import { AttendanceRecord, AttendanceHistoryEvent } from '../../types/attendance';
import { isServerAttendanceAuthoritative, parseAttendanceTimeToMinutes } from '../../utils/attendanceUtils';
import { getUnresolvedPastAttendanceRecords, getAuthoritativeExitForCheckout } from '../../utils/forensicAuditUtils';
import { calculateWorkingHours } from '../../services/attendance/smartAttendanceEngine';
import { syncPendingAttendanceRecords } from '../../services/attendance/syncEngine';

interface ParsedTimeResult {
  isValid: boolean;
  error?: string;
  formatted12?: string;
  hours24?: number;
  minutes?: number;
}

const parseAndValidateTime = (rawInput: string): ParsedTimeResult => {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return { isValid: false, error: 'Please enter a checkout time.' };
  }

  const match = trimmed.match(/^(\d{1,2})[:.](\d{1,2})(?:\s*(AM|PM|am|pm|A\.M\.|P\.M\.))?$/i);
  if (!match) {
    return {
      isValid: false,
      error: 'Invalid time format. Please enter time as HH:MM AM/PM (e.g. 06:17 PM).'
    };
  }

  const rawHour = parseInt(match[1], 10);
  const rawMin = parseInt(match[2], 10);
  const rawAmPm = match[3] ? match[3].replace(/\./g, '').toUpperCase() : null;

  if (isNaN(rawHour) || isNaN(rawMin)) {
    return { isValid: false, error: 'Hours and minutes must be numbers.' };
  }

  if (rawMin < 0 || rawMin > 59) {
    return { isValid: false, error: 'Minutes must be between 00 and 59.' };
  }

  let hours24: number;
  let ampm: 'AM' | 'PM';

  if (rawAmPm) {
    if (rawHour < 1 || rawHour > 12) {
      return { isValid: false, error: 'Hour must be between 1 and 12 when AM/PM is specified.' };
    }
    ampm = rawAmPm === 'PM' ? 'PM' : 'AM';
    if (ampm === 'PM') {
      hours24 = rawHour === 12 ? 12 : rawHour + 12;
    } else {
      hours24 = rawHour === 12 ? 0 : rawHour;
    }
  } else {
    if (rawHour < 0 || rawHour > 23) {
      return { isValid: false, error: 'Hour must be between 00 and 23.' };
    }
    hours24 = rawHour;
    ampm = hours24 >= 12 ? 'PM' : 'AM';
  }

  let displayH = hours24 % 12;
  if (displayH === 0) displayH = 12;
  const formatted12 = `${String(displayH).padStart(2, '0')}:${String(rawMin).padStart(2, '0')} ${ampm}`;

  return {
    isValid: true,
    formatted12,
    hours24,
    minutes: rawMin
  };
};

const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  } catch {}
  return dateStr;
};

export const CheckoutConfirmationModal: React.FC = () => {
  const { employeeData } = useRegistration();
  const { liveLocation, currentAddress } = useLocationContext();

  const [activeRecord, setActiveRecord] = useState<AttendanceRecord | null>(null);
  const [isPreviousDay, setIsPreviousDay] = useState(false);
  const [suggestedExitTime, setSuggestedExitTime] = useState<string | null>(null);
  const [timeInput24, setTimeInput24] = useState('18:00');
  const [timeInput12, setTimeInput12] = useState('06:00 PM');
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  // In-flight guard to prevent multiple concurrent queries
  const isCheckingRef = useRef<boolean>(false);
  const lastAsyncCheckTimestampRef = useRef<number>(0);

  // Session-level dismissal memory: prevents continuous re-prompts within the same app session
  // if the user chose "Decide Later", while ensuring it prompts again on cold restart.
  const [dismissedRecordIds, setDismissedRecordIds] = useState<Set<string>>(() => new Set<string>());

  const candidateIds = useMemo(() => {
    const ids: string[] = [];
    if (employeeData?.employeeCode) ids.push(employeeData.employeeCode);
    if (employeeData?.employeeId) ids.push(employeeData.employeeId);
    if ((employeeData as any)?.uid) ids.push((employeeData as any).uid);
    if ((employeeData as any)?.id) ids.push((employeeData as any).id);

    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('cached_registration_data') : null;
      if (raw) {
        const p = JSON.parse(raw);
        if (p.employeeCode && !ids.includes(p.employeeCode)) ids.push(p.employeeCode);
        if (p.employeeId && !ids.includes(p.employeeId)) ids.push(p.employeeId);
        if (p.uid && !ids.includes(p.uid)) ids.push(p.uid);
        if (p.id && !ids.includes(p.id)) ids.push(p.id);
      }
    } catch {}

    try {
      const lastKnown = typeof localStorage !== 'undefined' ? localStorage.getItem('exfin_last_known_employee_id') : null;
      if (lastKnown && !ids.includes(lastKnown)) ids.push(lastKnown);
    } catch {}

    return ids.filter(Boolean);
  }, [employeeData]);

  const resolvedEmployeeId = candidateIds[0] || undefined;
  const employeeId = resolvedEmployeeId;

  const evaluateAndOpenRecord = useCallback((record: AttendanceRecord, isPast: boolean): boolean => {
    if (!record || !record.date) return false;

    // Check if dismissed in this app session
    const recKey = record.id || `${record.employeeId}_${record.date}`;
    if (dismissedRecordIds.has(recKey)) {
      return false;
    }

    // CORE ACCEPTANCE RULE:
    // If employee is currently CHECKED_IN, they are inside the office premises.
    // NEVER show checkout confirmation popup when currentState is CHECKED_IN.
    if (!isPast && record.currentState === 'CHECKED_IN') {
      setActiveRecord((curr) => (curr && (curr.id === record.id || curr.date === record.date) ? null : curr));
      return false;
    }

    // Check authoritative exit
    const exitAnalysis = getAuthoritativeExitForCheckout(record, record.eventHistory || []);
    
    // CORE ACCEPTANCE RULE:
    // A checkout confirmation popup may ONLY appear when there is reliable evidence that:
    // 1. The employee was checked in;
    // 2. A valid EXIT event actually occurred;
    // 3. That EXIT belongs to the current attendance session/day;
    // 4. No subsequent RETURN event closed that EXIT;
    // 5. The checkout/final exitTime is genuinely unresolved.
    // IF THERE IS NO VALID UNPAIRED EXIT EVENT: DO NOT SHOW POPUP.
    if (!exitAnalysis.isUnpairedExit || !exitAnalysis.authoritativeExitTime) {
      setActiveRecord((curr) => (curr && (curr.id === record.id || curr.date === record.date) ? null : curr));
      return false;
    }

    // Scoping Rule: Verify exit timestamp belongs to this exact record date
    if (exitAnalysis.authoritativeExitTimestamp && exitAnalysis.authoritativeExitTimestamp.includes('-')) {
      const exitDatePart = exitAnalysis.authoritativeExitTimestamp.substring(0, 10);
      if (exitDatePart !== record.date) {
        // Exit timestamp belongs to another day (e.g. yesterday). Discard!
        setActiveRecord((curr) => (curr && (curr.id === record.id || curr.date === record.date) ? null : curr));
        return false;
      }
    }

    // Scoping Rule: Verify exit time is after check-in time of this session
    if (record.checkInTime) {
      const inMins = parseAttendanceTimeToMinutes(record.checkInTime);
      const outMins = parseAttendanceTimeToMinutes(exitAnalysis.authoritativeExitTime);
      if (inMins !== null && outMins !== null && outMins <= inMins) {
        setActiveRecord((curr) => (curr && (curr.id === record.id || curr.date === record.date) ? null : curr));
        return false;
      }
    }

    const authoritativeExit = exitAnalysis.authoritativeExitTime;

    let initialTime12 = '06:00 PM';
    let initialTime24 = '18:00';
    let suggested: string | null = null;

    if (authoritativeExit) {
      suggested = authoritativeExit;
      const parsed = parseAndValidateTime(authoritativeExit);
      if (parsed.isValid && parsed.formatted12 && parsed.hours24 !== undefined && parsed.minutes !== undefined) {
        initialTime12 = parsed.formatted12;
        initialTime24 = `${String(parsed.hours24).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
      }
    } else if (record.checkInTime) {
      // If check-in was at 09:55 AM, set default to 9 hours later (~06:55 PM) or 06:00 PM
      const inMins = parseAttendanceTimeToMinutes(record.checkInTime);
      if (inMins !== null) {
        const targetMins = Math.min(23 * 60 + 59, inMins + 9 * 60);
        const h = Math.floor(targetMins / 60);
        const m = targetMins % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        initialTime12 = `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
        initialTime24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }

    setSuggestedExitTime(suggested);
    setTimeInput12(initialTime12);
    setTimeInput24(initialTime24);
    setIsPreviousDay(isPast);
    setManualError(null);
    setActiveRecord(record);
    return true;
  }, [dismissedRecordIds]);

  const checkPendingConfirmation = useCallback(async (passedRecord?: AttendanceRecord | null, forceAsync: boolean = false) => {
    // 1. Direct record evaluation from event detail
    if (passedRecord) {
      const today = getFormattedDateStr();
      const isPast = Boolean(passedRecord.date && passedRecord.date < today);
      if (evaluateAndOpenRecord(passedRecord, isPast)) {
        return;
      }
    }

    const todayStr = getFormattedDateStr();
    const allStored = getStoredAttendanceRecords();

    // 2. SAME-DAY CHECK (Scenario A): Check today's active session / exit candidate
    let todayRecord: AttendanceRecord | null = null;
    for (const id of candidateIds) {
      todayRecord = getTodayAttendanceRecord(id, todayStr);
      if (todayRecord) break;
    }

    if (!todayRecord && Array.isArray(allStored)) {
      const cleanCandidates = candidateIds.map(c => c.trim().toLowerCase());
      todayRecord = allStored.find(r => {
        if (!r || r.date !== todayStr) return false;
        const rDocId = (r.docId || '').trim().toLowerCase();
        const rEmpId = (r.employeeId || (r as any).employeeCode || r.id || '').trim().toLowerCase();
        return cleanCandidates.length === 0 || cleanCandidates.some(cid => rDocId.includes(cid) || rEmpId === cid);
      }) || null;
    }

    if (todayRecord) {
      if (todayRecord.currentState === 'CHECKED_IN') {
        // Employee is inside! Suppress popup and clear any false pending checkout flag
        if (todayRecord.pendingCheckoutConfirmation) {
          todayRecord.pendingCheckoutConfirmation = false;
          saveAttendanceRecord(todayRecord);
        }
        setActiveRecord((curr) => (curr && curr.date === todayStr ? null : curr));
      } else {
        const exitAnalysis = getAuthoritativeExitForCheckout(todayRecord, todayRecord.eventHistory || []);
        if (!exitAnalysis.isUnpairedExit) {
          // Employee is inside or no unpaired exit -> dismiss any popup for today
          setActiveRecord((curr) => (curr && curr.date === todayStr ? null : curr));
        } else {
          const coVal = (todayRecord.checkOutTime || '').trim();
          const isCheckOutMissing = !coVal || coVal === '--:--' || coVal === 'Pending' || coVal === 'N/A' || coVal === 'UNRESOLVED';
          const isResolvedOutside = todayRecord.exitPromptResolvedOutside === true || todayRecord.returningToOffice === true;

          if (!isResolvedOutside && !todayRecord.checkoutFinalized && isCheckOutMissing) {
            if (evaluateAndOpenRecord(todayRecord, false)) {
              return;
            }
          }
        }
      }
    }

    // 3. NEXT-DAY / PREVIOUS-DAY CHECK (Scenario B): Check unresolved records from previous days
    const unresolvedPast = getUnresolvedPastAttendanceRecords(allStored, candidateIds, todayStr);
    if (unresolvedPast.length > 0) {
      const oldestUnresolved = unresolvedPast[0];
      if (evaluateAndOpenRecord(oldestUnresolved, true)) {
        return;
      }
    }

    // 4. Rate-limited native IPC check for cold-start exit recovery
    const nowMs = Date.now();
    if (isCheckingRef.current) return;
    if (!forceAsync && nowMs - lastAsyncCheckTimestampRef.current < 15000) {
      return;
    }

    isCheckingRef.current = true;
    lastAsyncCheckTimestampRef.current = nowMs;

    try {
      const nativeState = await getNativeAttendanceState();
      if (nativeState?.hasActiveSession && nativeState.date === todayStr) {
        // If employee is already checked in and inside, native IPC must never revert state to pending exit
        const primaryEmp = candidateIds[0] || nativeState.employeeId || '';
        const curLocalToday = primaryEmp ? getTodayAttendanceRecord(primaryEmp, todayStr) : null;
        if (curLocalToday && curLocalToday.currentState === 'CHECKED_IN') {
          return;
        }

        const isNativeInside = nativeState.sessionState === 'ACTIVE' || nativeState.currentState === 'CHECKED_IN';
        if (isNativeInside) {
          return;
        }

        const hasNativeExit = !!(nativeState.recordedExitTime && nativeState.recordedExitTime !== 'null' && nativeState.recordedExitTime.trim() !== '');
        const isPendingNativeExit = (nativeState.pendingCheckoutConfirmation ||
          nativeState.sessionState === 'PENDING_EXIT_CONFIRMATION' ||
          nativeState.currentState === 'PENDING_AUTO_CHECKOUT') && hasNativeExit;

        // Date scoping safeguard for native exit timestamp
        if (nativeState.exitDetectedAt && nativeState.exitDetectedAt.includes('-')) {
          const exitDate = nativeState.exitDetectedAt.substring(0, 10);
          if (exitDate !== todayStr) {
            return;
          }
        }

        if (hasNativeExit && isPendingNativeExit) {
          const empCode = nativeState.employeeId || candidateIds[0] || '';
          if (empCode) {
            let rec = getTodayAttendanceRecord(empCode, todayStr);
            if (!rec) {
              rec = {
                id: `att_${empCode}_${todayStr}`,
                docId: `${empCode}_${todayStr}`,
                employeeId: empCode,
                employeeName: nativeState.employeeName || 'Employee',
                date: todayStr,
                attendanceType: 'OFFICE',
                checkInTime: nativeState.checkInTime || '09:00 AM',
                checkOutTime: null,
                workingHours: null,
                latitude: 23.616227,
                longitude: 87.117063,
                distance: 25,
                townCity: nativeState.townCity || 'Raniganj HQ',
                checkInMode: 'AUTO',
                checkOutMode: 'N/A',
                exitTime: nativeState.recordedExitTime || null,
                returnTime: null,
                reason: null,
                reminderCount: 0,
                createdAtDeviceTime: new Date().toISOString(),
                syncStatus: 'Pending',
                serverSyncTime: null,
                isOffline: !navigator.onLine,
                currentState: 'PENDING_AUTO_CHECKOUT',
                pendingCheckoutConfirmation: true,
                recordedExitTime: nativeState.recordedExitTime || null,
                geofenceExitTime: nativeState.recordedExitTime || null,
                pendingCheckoutEventId: nativeState.pendingCheckoutEventId || `evt_native_${empCode}_${todayStr}_${nativeState.recordedExitTime || 'exit'}`
              };
            } else if (rec.currentState !== 'CHECKED_IN') {
              rec.pendingCheckoutConfirmation = true;
              rec.currentState = 'PENDING_AUTO_CHECKOUT';
              if (nativeState.recordedExitTime && !rec.recordedExitTime) {
                rec.recordedExitTime = nativeState.recordedExitTime;
                rec.geofenceExitTime = rec.geofenceExitTime || nativeState.recordedExitTime;
              }
            }
            if (rec.currentState !== 'CHECKED_IN') {
              saveAttendanceRecord(rec);
              evaluateAndOpenRecord(rec, false);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[CheckoutConfirmationModal] Native check notice:', e);
    } finally {
      isCheckingRef.current = false;
    }
  }, [candidateIds, evaluateAndOpenRecord]);

  useEffect(() => {
    checkPendingConfirmation(null, true);

    const handleAttendanceUpdated = (e?: Event) => {
      const customEvt = e as CustomEvent;
      const detailRec = customEvt?.detail?.record as AttendanceRecord | undefined;
      checkPendingConfirmation(detailRec || null, false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkPendingConfirmation(null, false);
      }
    };

    window.addEventListener('exfin-attendance-updated', handleAttendanceUpdated);
    window.addEventListener('exfin-checkout-confirmation-needed', handleAttendanceUpdated);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('exfin-attendance-updated', handleAttendanceUpdated);
      window.removeEventListener('exfin-checkout-confirmation-needed', handleAttendanceUpdated);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkPendingConfirmation]);

  // Prevent background scrolling
  useEffect(() => {
    if (activeRecord) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [activeRecord]);

  const handleTime24Change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "HH:MM"
    setTimeInput24(val);
    if (val) {
      const parsed = parseAndValidateTime(val);
      if (parsed.isValid && parsed.formatted12) {
        setTimeInput12(parsed.formatted12);
        setManualError(null);
      }
    }
  };

  const handleConfirmCheckout = async () => {
    if (!activeRecord || isProcessing) return;

    setManualError(null);

    const validation = parseAndValidateTime(timeInput12);
    if (!validation.isValid || !validation.formatted12) {
      setManualError(validation.error || 'Please enter a valid checkout time (e.g. 06:17 PM).');
      return;
    }

    const confirmedTimeStr = validation.formatted12;

    // Check-in validation: checkout must not be earlier than check-in time
    if (activeRecord.checkInTime && activeRecord.checkInTime !== '--:--') {
      const inMins = parseAttendanceTimeToMinutes(activeRecord.checkInTime);
      const outMins = parseAttendanceTimeToMinutes(confirmedTimeStr);
      if (inMins !== null && outMins !== null && outMins < inMins) {
        setManualError(`Checkout time (${confirmedTimeStr}) cannot be earlier than check-in time (${activeRecord.checkInTime}).`);
        return;
      }
    }

    setIsProcessing(true);
    setFeedback(`Confirming checkout for ${formatDisplayDate(activeRecord.date)} at ${confirmedTimeStr}...`);

    try {
      const nowIso = new Date().toISOString();
      const workingHours = activeRecord.checkInTime
        ? calculateWorkingHours(activeRecord.checkInTime, confirmedTimeStr)
        : null;

      const empId = activeRecord.employeeId || employeeId || 'emp';
      const eventId = `evt_manual_confirm_${empId}_${activeRecord.date}_${confirmedTimeStr.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Update the record deterministically for its authoritative date
      activeRecord.checkOutTime = confirmedTimeStr;
      activeRecord.workingHours = workingHours;
      activeRecord.checkoutStatus = 'FINALIZED';
      activeRecord.checkoutFinalized = true;
      activeRecord.checkoutConfirmed = true;
      activeRecord.attendanceStatus = 'RESOLVED';
      activeRecord.status = 'completed';
      activeRecord.currentState = 'FINALIZED_CHECKOUT';
      activeRecord.checkOutMode = 'MANUAL';
      activeRecord.checkoutType = suggestedExitTime ? 'AUTO_CHECKOUT' : 'MANUAL_CONFIRMED';
      activeRecord.checkoutSource = suggestedExitTime ? 'CONFIRMED_NATIVE_EXIT' : 'EMPLOYEE_REPORTED';
      activeRecord.resolutionSource = 'EMPLOYEE_CONFIRMED';
      activeRecord.pendingCheckoutConfirmation = false;
      activeRecord.pendingCheckoutEventId = null;
      activeRecord.returningToOffice = false;
      activeRecord.exitPromptResolvedOutside = false;
      activeRecord.confirmationCompletedAt = nowIso;
      activeRecord.syncStatus = 'Pending';
      activeRecord.updatedAt = nowIso;

      const manualEvent: AttendanceHistoryEvent = {
        eventId,
        employeeId: empId,
        eventType: 'CHECK_OUT',
        eventTime: confirmedTimeStr,
        timestamp: nowIso,
        source: 'MANUAL_CONFIRMATION',
        action: 'CONFIRM_CHECKOUT'
      };

      const history = Array.isArray(activeRecord.eventHistory) ? [...activeRecord.eventHistory] : [];
      history.push(manualEvent);
      activeRecord.eventHistory = history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      saveAttendanceRecord(activeRecord);

      // Clean up native session if same day
      const todayStr = getFormattedDateStr();
      if (activeRecord.date === todayStr) {
        clearNativeActiveSession().catch(() => {});
      }

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        syncPendingAttendanceRecords().catch(() => {});
      }

      setFeedback(`✓ Checkout confirmed at ${confirmedTimeStr}`);

      setTimeout(() => {
        setIsProcessing(false);
        setFeedback(null);
        setActiveRecord(null);
        // Automatically check if another unresolved previous day exists
        checkPendingConfirmation(null, false);
      }, 600);
    } catch (err: any) {
      console.error('Failed to confirm checkout:', err);
      setIsProcessing(false);
      setManualError(err?.message || 'Failed to save checkout confirmation. Please try again.');
    }
  };

  const handleStayActive = async () => {
    if (!activeRecord || isProcessing || isPreviousDay) return;
    setIsProcessing(true);
    setFeedback('Preserving active office attendance session...');

    try {
      const todayStr = getFormattedDateStr();
      const empId = activeRecord.employeeId || employeeId || 'emp';
      AutomaticAttendanceEngine.setReturningToOffice(empId, todayStr, activeRecord.pendingCheckoutEventId || undefined);

      setFeedback('Active session preserved.');
      setTimeout(() => {
        setIsProcessing(false);
        setFeedback(null);
        setActiveRecord(null);
      }, 500);
    } catch (err: any) {
      setIsProcessing(false);
      setManualError(err?.message || 'Failed to update session');
    }
  };

  const handleDismissLater = () => {
    if (activeRecord) {
      const recKey = activeRecord.id || `${activeRecord.employeeId}_${activeRecord.date}`;
      setDismissedRecordIds(prev => new Set(prev).add(recKey));
      setActiveRecord(null);
    }
  };

  if (!activeRecord) {
    return null;
  }

  const recordDateDisplay = formatDisplayDate(activeRecord.date);

  return (
    <AnimatePresence>
      <div
        id="checkout-confirmation-backdrop"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md select-none"
        onClick={handleDismissLater}
      >
        <motion.div
          id="checkout-confirmation-modal"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md glass-card border border-purple-800/60 rounded-2xl shadow-2xl shadow-purple-950/80 overflow-hidden text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close / Dismiss */}
          <button
            type="button"
            onClick={handleDismissLater}
            className="absolute top-4 right-4 z-10 p-2 text-purple-300 hover:text-white hover:bg-purple-900/50 rounded-xl transition-colors cursor-pointer"
            title="Decide later"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Banner */}
          <div className="glass-card border-b border-[var(--border)] px-6 pt-6 pb-5">
            <div className="flex items-center gap-3.5 mb-2">
              <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-purple-300 uppercase block">
                  {isPreviousDay ? 'Previous Day Checkout' : 'Checkout Confirmation'}
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                  {isPreviousDay 
                    ? `Checkout not recorded for ${recordDateDisplay}`
                    : 'Checkout time was not recorded'}
                </h3>
              </div>
            </div>
            <p className="text-xs text-purple-200/90 font-medium pl-[58px]">
              {isPreviousDay
                ? `Please enter your actual checkout time for ${recordDateDisplay}.`
                : 'Please confirm your checkout time to complete your attendance.'}
            </p>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-4">
            {/* Record Context Card */}
            <div className="bg-purple-950/40 rounded-xl border border-purple-800/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-purple-200">
                <span className="flex items-center gap-1.5 text-purple-300">
                  <Calendar className="w-3.5 h-3.5 text-purple-400" />
                  Attendance Date:
                </span>
                <span className="font-bold text-sm text-white">
                  {recordDateDisplay}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-purple-200">
                <span className="flex items-center gap-1.5 text-purple-300">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  Check-In Time:
                </span>
                <span className="font-medium text-emerald-300">
                  {activeRecord.checkInTime || '--:--'}
                </span>
              </div>
              {suggestedExitTime && (
                <div className="flex items-center justify-between text-xs text-purple-200 pt-1 border-t border-purple-900/50">
                  <span className="flex items-center gap-1.5 text-amber-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Suggested Exit:
                  </span>
                  <span className="font-bold text-amber-300">
                    {suggestedExitTime}
                  </span>
                </div>
              )}
            </div>

            {/* Time Picker Control */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-purple-200">
                Select / Enter Checkout Time:
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400 pointer-events-none" />
                  <input
                    type="time"
                    value={timeInput24}
                    onChange={handleTime24Change}
                    className="w-full pl-9 pr-4 py-2.5 bg-purple-950/80 border border-purple-700/80 text-white rounded-xl focus:outline-none focus:border-purple-400 font-bold text-base cursor-pointer"
                  />
                </div>
                <div className="px-3 py-2.5 bg-purple-900/40 border border-purple-700/40 rounded-xl text-center min-w-[100px]">
                  <span className="text-xs text-purple-400 block font-mono">12-Hour</span>
                  <span className="text-sm font-bold text-amber-300">{timeInput12}</span>
                </div>
              </div>
            </div>

            {/* Status Feedback / Errors */}
            {feedback && (
              <div className="p-3 bg-purple-900/40 border border-purple-700/50 rounded-xl text-xs text-purple-200 text-center font-medium flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{feedback}</span>
              </div>
            )}

            {manualError && (
              <div className="p-3 bg-rose-950/40 border border-rose-700/50 rounded-xl text-xs text-rose-200 text-center font-medium">
                <span>{manualError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 space-y-3">
              <button
                id="btn-confirm-checkout"
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmCheckout}
                className="w-full group relative flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:from-emerald-700 active:to-emerald-800 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950/40 border border-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-lg bg-emerald-800/60 border border-emerald-400/30 flex items-center justify-center text-emerald-200 group-hover:scale-105 transition-transform">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">Confirm Checkout</div>
                    <div className="text-[11px] text-emerald-100/80 font-normal">
                      Finalize {recordDateDisplay} at {timeInput12}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-semibold px-2.5 py-1 bg-emerald-800/70 border border-emerald-400/30 rounded-lg text-emerald-100">
                  Save
                </div>
              </button>

              {!isPreviousDay && (
                <button
                  id="btn-stay-active"
                  type="button"
                  disabled={isProcessing}
                  onClick={handleStayActive}
                  className="w-full group relative flex items-center justify-between px-4 py-3 bg-purple-900/60 hover:bg-purple-800/80 active:bg-purple-950 text-white font-semibold rounded-xl shadow-lg shadow-purple-950/40 border border-purple-700/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-8 h-8 rounded-lg bg-purple-800/70 border border-purple-600/40 flex items-center justify-center text-purple-200 group-hover:scale-105 transition-transform">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold tracking-tight">Returning to Office</div>
                      <div className="text-[10px] text-purple-200/80 font-normal">
                        Keep today's attendance session active
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-semibold px-2.5 py-0.5 bg-purple-800/80 border border-purple-600/40 rounded-lg text-purple-200">
                    Stay Active
                  </div>
                </button>
              )}

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={handleDismissLater}
                  className="text-xs text-purple-300 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Decide later (keep unresolved)
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
