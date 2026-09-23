import React, { useEffect, useState, useMemo, useRef } from 'react';
import { getStoredAttendanceRecords } from '../../services/attendance/attendanceStorage';
import { AttendanceRecord } from '../../types/attendance';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { AutomaticAttendanceEngine } from '../../services/attendance/automaticAttendanceEngine';
import { useRegistration } from '../../context/RegistrationContext';
import { isServerAttendanceAuthoritative, isAttendanceCheckoutUnresolved, hasValidCheckoutTime } from '../../utils/attendanceUtils';
import { dismissUnresolvedNotificationForDate } from '../../services/notification/notificationService';
import { useSensitiveActionGuard } from '../../services/security/useSensitiveActionGuard';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { AlertCircle, Clock, Check } from 'lucide-react';

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

  // Matches "HH:MM", "H:MM", "HH:MM AM", "H:MM PM", "HH.MM", etc.
  const match = trimmed.match(/^(\d{1,2})[:.](\d{1,2})(?:\s*(AM|PM|am|pm|A\.M\.|P\.M\.))?$/i);
  if (!match) {
    return {
      isValid: false,
      error: 'Invalid time format. Please enter time as HH:MM AM/PM (e.g. 06:00 PM).'
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
    // No AM/PM specified: if 0..23
    if (rawHour < 0 || rawHour > 23) {
      return { isValid: false, error: 'Hour must be between 0 and 23.' };
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

export const GlobalUnresolvedRecovery: React.FC = () => {
  const { employeeData } = useRegistration();
  const { executeSensitiveAction } = useSensitiveActionGuard();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [time, setTime] = useState('06:00 PM');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const textInputRef = useRef<HTMLInputElement>(null);
  const hiddenTimeInputRef = useRef<HTMLInputElement>(null);

  const todayStr = getFormattedDateStr();

  // Polling to keep records up to date
  useEffect(() => {
    const fetchRecords = () => {
      if (employeeData) {
        setRecords(getStoredAttendanceRecords());
      }
    };
    fetchRecords();
    
    const interval = setInterval(fetchRecords, 5000);
    window.addEventListener('focus', fetchRecords);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchRecords);
    };
  }, [employeeData]);

  // Find oldest unresolved record
  const unresolvedRecord = useMemo(() => {
    if (!employeeData || !records.length) return null;
    const empId = employeeData.employeeCode || employeeData.id;
    
    const pastRecords = records
      .filter((r) => {
        const rEmp = r.employeeId || r.employeeCode;
        if (rEmp !== empId) return false;
        if (r.date >= todayStr) return false;
        
        // Never trigger recovery modal for records that are already Admin-authoritative or resolved
        if (isServerAttendanceAuthoritative(r)) return false;
        if (hasValidCheckoutTime(r)) return false;
        if (!isAttendanceCheckoutUnresolved(r)) return false;

        // Target specifically: attendance is applicable Office attendance AND date is previous day AND attendanceStatus/checkoutStatus = UNRESOLVED AND checkoutTime = EMPTY AND not already EMPLOYEE_REPORTED
        const isOffice = r.attendanceType === 'OFFICE' || !r.attendanceType;
        const isUnresolved = r.attendanceStatus === 'UNRESOLVED' || r.checkoutStatus === 'UNRESOLVED';
        const hasCheckIn = !!(r.checkInTime && r.checkInTime !== '--:--');
        
        const checkOutVal = (r.checkOutTime || '').trim();
        const isCheckoutEmpty = !checkOutVal || 
                                checkOutVal === '--:--' || 
                                checkOutVal === '--:-- --' ||
                                checkOutVal === 'Pending' ||
                                checkOutVal === 'N/A' ||
                                checkOutVal === 'UNRESOLVED';

        const notReported = r.checkoutSource !== 'EMPLOYEE_REPORTED';
        
        return isOffice && isUnresolved && hasCheckIn && isCheckoutEmpty && notReported;
      })
      .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first
      
    return pastRecords.length > 0 ? pastRecords[0] : null;
  }, [records, employeeData, todayStr]);

  // When unresolvedRecord changes, show the modal
  useEffect(() => {
    if (unresolvedRecord) {
      setTime('06:00 PM');
      setError(null);
      setIsOpen(true);
    }
  }, [unresolvedRecord?.id, unresolvedRecord?.date]);

  const currentAmPm = useMemo(() => {
    if (/AM/i.test(time)) return 'AM';
    if (/PM/i.test(time)) return 'PM';
    const parsed = parseAndValidateTime(time);
    if (parsed.isValid && parsed.hours24 !== undefined) {
      return parsed.hours24 >= 12 ? 'PM' : 'AM';
    }
    return 'PM';
  }, [time]);

  const toggleAmPm = () => {
    const parsed = parseAndValidateTime(time);
    if (parsed.isValid && parsed.hours24 !== undefined && parsed.minutes !== undefined) {
      const newHours24 = (parsed.hours24 + 12) % 24;
      let newH = newHours24 % 12;
      if (newH === 0) newH = 12;
      const newAmPm = newHours24 >= 12 ? 'PM' : 'AM';
      const newFormatted = `${String(newH).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')} ${newAmPm}`;
      setTime(newFormatted);
      setError(null);
    } else {
      if (/AM/i.test(time)) {
        setTime(time.replace(/AM/i, 'PM'));
      } else if (/PM/i.test(time)) {
        setTime(time.replace(/PM/i, 'AM'));
      } else {
        setTime(`${time.trim()} PM`);
      }
      setError(null);
    }
  };

  const to24Hour = (val: string): string => {
    const parsed = parseAndValidateTime(val);
    if (parsed.isValid && parsed.hours24 !== undefined && parsed.minutes !== undefined) {
      return `${String(parsed.hours24).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
    }
    return '18:00';
  };

  const handleNativePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; // "HH:MM"
    if (val) {
      const parsed = parseAndValidateTime(val);
      if (parsed.isValid && parsed.formatted12) {
        setTime(parsed.formatted12);
        setError(null);
      }
    }
  };

  const handleClockIconClick = () => {
    try {
      if (hiddenTimeInputRef.current && typeof hiddenTimeInputRef.current.showPicker === 'function') {
        hiddenTimeInputRef.current.showPicker();
        return;
      }
    } catch {
      // showPicker not supported or blocked by WebView
    }
    // Directly focus the text input so the employee can type immediately
    textInputRef.current?.focus();
  };

  const handleInputBlur = () => {
    const parsed = parseAndValidateTime(time);
    if (parsed.isValid && parsed.formatted12) {
      setTime(parsed.formatted12);
    }
  };

  if (!unresolvedRecord) return null;

  const handleSubmit = async () => {
    setError(null);

    const validation = parseAndValidateTime(time);
    if (!validation.isValid) {
      setError(validation.error || 'Please enter a valid checkout time.');
      return;
    }

    const { formatted12, hours24, minutes } = validation;
    if (!formatted12 || hours24 === undefined || minutes === undefined) {
      setError('Please enter a valid checkout time.');
      return;
    }

    // Validate that checkout time is after check-in time
    if (unresolvedRecord.checkInTime) {
      const checkInParsed = parseAndValidateTime(unresolvedRecord.checkInTime);
      if (checkInParsed.isValid && checkInParsed.hours24 !== undefined && checkInParsed.minutes !== undefined) {
        const checkInTotalMin = checkInParsed.hours24 * 60 + checkInParsed.minutes;
        const checkoutTotalMin = hours24 * 60 + minutes;
        if (checkoutTotalMin <= checkInTotalMin) {
          setError(`Checkout time (${formatted12}) must be after your check-in time (${unresolvedRecord.checkInTime}).`);
          return;
        }
      }
    }

    // Validate not in future relative to current time
    // Constructed strictly using previous attendance date and Asia/Kolkata timezone (+05:30)
    const pad = (n: number) => String(n).padStart(2, '0');
    const checkoutKolkataIso = `${unresolvedRecord.date}T${pad(hours24)}:${pad(minutes)}:00+05:30`;
    const checkoutDateObj = new Date(checkoutKolkataIso);
    if (checkoutDateObj.getTime() > Date.now()) {
      setError('Checkout time cannot be in the future.');
      return;
    }

    // Execute with Security PIN guard if configured
    executeSensitiveAction('ATTENDANCE_CHECKOUT_RESOLUTION', async () => {
      setIsSubmitting(true);
      try {
        const empId = employeeData?.employeeCode || employeeData?.id || unresolvedRecord.employeeId;
        const updated = AutomaticAttendanceEngine.submitEmployeeCheckoutTime(
          empId,
          unresolvedRecord.date,
          formatted12,
          true
        );

        if (updated) {
          setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          dismissUnresolvedNotificationForDate(empId, unresolvedRecord.date, updated.id).catch(() => {});
        }

        // Reset form
        setTime('06:00 PM');
        setIsOpen(false);
      } catch (e: any) {
        console.error('Failed to submit unresolved checkout', e);
        setError(e?.message || 'Failed to save checkout. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  return (
    <>
      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Previous Day Checkout Pending" hideDefaultFooter>
        <div className="space-y-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <p className="text-sm text-rose-200 font-bold mb-1">
              Your checkout for {unresolvedRecord.date} was not recorded.
            </p>
            <p className="text-xs text-rose-200/80">
              No office exit was detected by the app. Please enter the time you actually checked out on {unresolvedRecord.date}.
            </p>
          </div>

          <div className="text-xs text-[var(--text-muted)] bg-[var(--surface-elevated)] p-3 rounded-xl border border-[var(--border)]">
            <div className="flex justify-between items-center mb-1">
              <span>Date:</span>
              <span className="font-bold text-white">{unresolvedRecord.date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Check-in Time:</span>
              <span className="font-bold text-[var(--warning)]">{unresolvedRecord.checkInTime}</span>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-400 font-bold flex items-center gap-1.5 p-2 bg-rose-500/10 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="prev-day-checkout-time" className="block text-xs font-bold text-[var(--text-muted)] mb-1.5">
              Enter Previous Day Checkout Time
            </label>

            {/* Input Group */}
            <div className="relative flex items-center bg-[var(--app-background)] border border-[var(--border)] rounded-xl focus-within:border-[var(--info)] transition-colors">
              {/* Native clock picker trigger button */}
              <button
                type="button"
                onClick={handleClockIconClick}
                title="Tap to open clock picker (or type manually in the field)"
                aria-label="Clock picker"
                className="p-3 text-[var(--primary)] hover:text-white transition-colors focus:outline-none cursor-pointer flex-shrink-0"
              >
                <Clock className="w-5 h-5" />
              </button>

              {/* Hidden native time input for Android/browsers that support showPicker() */}
              <input
                ref={hiddenTimeInputRef}
                type="time"
                tabIndex={-1}
                aria-hidden="true"
                value={to24Hour(time)}
                onChange={handleNativePickerChange}
                className="sr-only opacity-0 pointer-events-none absolute w-0 h-0"
              />

              {/* Direct editable text input — NEVER blocks the keyboard, allows typing HH:MM AM/PM */}
              <input
                id="prev-day-checkout-time"
                ref={textInputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                value={time}
                onChange={(e) => {
                  setTime(e.target.value);
                  if (error) setError(null);
                }}
                onBlur={handleInputBlur}
                placeholder="06:00 PM"
                className="w-full py-2.5 px-1 bg-transparent text-[var(--text-primary)] font-semibold text-base focus:outline-none placeholder:text-[var(--text-muted)]"
              />

              {/* AM/PM toggle button */}
              <div className="pr-2.5 flex items-center flex-shrink-0">
                <button
                  type="button"
                  onClick={toggleAmPm}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] hover:bg-white/10 transition-colors cursor-pointer"
                  title="Toggle AM / PM"
                >
                  {currentAmPm}
                </button>
              </div>
            </div>

            {/* Quick preset chips for rapid 1-tap checkout selection on mobile */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              <span className="text-[11px] font-medium text-[var(--text-muted)] mr-0.5">Quick Pick:</span>
              {['05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM', '08:00 PM'].map((preset) => {
                const isSelected = time.trim().toUpperCase() === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTime(preset);
                      setError(null);
                    }}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--info)]/20 border-[var(--info)] text-[var(--info)] shadow-sm'
                        : 'bg-[var(--surface-elevated)]/60 border-[var(--border)] text-[var(--text-secondary)] hover:text-white hover:border-white/30'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Dismiss for now</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/50 hover:bg-[var(--info)]/20 hover:text-[var(--info)] shadow-[0_0_15px_rgba(0,245,255,0.15)] flex items-center gap-1">
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Submitting...' : 'Enter Checkout Time'}
            </Button>
          </div>
        </div>
      </Dialog>
      
      {/* Persistent Banner if dismissed */}
      {!isOpen && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-3xl mx-auto">
          <div className="bg-rose-500 border border-rose-600 rounded-xl shadow-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-600/50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Action Required</h4>
                <p className="text-rose-100 text-xs">Missing checkout for {unresolvedRecord.date}</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setTime('06:00 PM');
                setError(null);
                setIsOpen(true);
              }}
              className="px-3 py-1.5 btn-danger text-white font-bold text-xs rounded-lg transition-colors shadow-sm cursor-pointer"
            >
              Resolve Now
            </button>
          </div>
        </div>
      )}
    </>
  );
};
