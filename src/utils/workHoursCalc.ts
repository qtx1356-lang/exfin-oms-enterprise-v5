import { AttendanceRecord, AttendanceType } from '../types/attendance';
import { calculateWorkingHours, parseAttendanceTimeToMinutes } from '../services/attendance/smartAttendanceEngine';
import { isAttendanceCheckoutUnresolved } from './attendanceUtils';

// Get current date string in Asia/Kolkata timezone (format: YYYY-MM-DD)
export const getKolkataDateStr = (dateInput: Date = new Date()): string => {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(dateInput);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch (e) {}
  
  const year = dateInput.getFullYear();
  const month = String(dateInput.getMonth() + 1).padStart(2, '0');
  const day = String(dateInput.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Get current time string in Asia/Kolkata timezone (format: hh:mm AM/PM)
export const getKolkataTimeStr = (dateInput: Date = new Date()): string => {
  return dateInput.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Parse a duration string like "7h 45m", "2h", "15m" into total minutes
export const parseDurationToMinutes = (durationStr: string | null | undefined): number => {
  if (!durationStr) return 0;
  let totalMins = 0;
  
  const hMatch = durationStr.match(/(\d+)\s*h/i);
  if (hMatch) {
    totalMins += parseInt(hMatch[1], 10) * 60;
  }
  
  const mMatch = durationStr.match(/(\d+)\s*m/i);
  if (mMatch) {
    totalMins += parseInt(mMatch[1], 10);
  }
  
  return totalMins;
};

// Format total minutes into a duration string like "7h 45m"
export const formatMinutesToDuration = (minutes: number): string => {
  if (minutes <= 0) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

// Calculate working hours in minutes between checkIn and checkOut using authoritative minutes-from-midnight
export const getRecordWorkingMinutes = (record: AttendanceRecord): number => {
  if (!record.checkInTime) return 0;
  
  // Unresolved or Pending Review records have NO completed duration
  if (
    isAttendanceCheckoutUnresolved(record) ||
    record.checkoutStatus === 'UNRESOLVED' ||
    record.checkoutStatus === 'PENDING_ADMIN_REVIEW'
  ) {
    return 0;
  }
  
  // Completed attendance: calculate from checkInTime and checkOutTime directly
  if (
    record.checkOutTime &&
    record.checkOutTime !== '--:--' &&
    record.checkOutTime !== 'Pending' &&
    record.checkOutTime !== 'N/A' &&
    record.checkOutTime !== 'UNRESOLVED'
  ) {
    const inMins = parseAttendanceTimeToMinutes(record.checkInTime);
    const outMins = parseAttendanceTimeToMinutes(record.checkOutTime);
    if (inMins !== null && outMins !== null && outMins >= inMins) {
      return outMins - inMins;
    }
    return 0;
  }
  
  // Live in progress attendance (only if today)
  const todayStr = getKolkataDateStr();
  if (record.date === todayStr && record.checkInTime && record.checkInTime !== '--:--') {
    const currentTimeStr = getKolkataTimeStr();
    const inMins = parseAttendanceTimeToMinutes(record.checkInTime);
    const currentMins = parseAttendanceTimeToMinutes(currentTimeStr);
    if (inMins !== null && currentMins !== null && currentMins >= inMins) {
      return currentMins - inMins;
    }
    return 0;
  }
  
  return 0;
};

// Helper for UI display of work hours adhering to Unresolved Checkout protection
export const getRecordWorkingHoursDisplay = (record: AttendanceRecord): { display: string; status: 'COMPLETED' | 'IN_PROGRESS' | 'UNRESOLVED' | 'PENDING_REVIEW' } => {
  if (record.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
    return { display: 'PENDING REVIEW', status: 'PENDING_REVIEW' };
  }
  if (isAttendanceCheckoutUnresolved(record) || record.checkoutStatus === 'UNRESOLVED') {
    return { display: 'UNRESOLVED', status: 'UNRESOLVED' };
  }
  if (
    record.checkOutTime &&
    record.checkOutTime !== '--:--' &&
    record.checkOutTime !== 'Pending' &&
    record.checkOutTime !== 'N/A' &&
    record.checkOutTime !== 'UNRESOLVED'
  ) {
    const inMins = parseAttendanceTimeToMinutes(record.checkInTime);
    const outMins = parseAttendanceTimeToMinutes(record.checkOutTime);
    if (inMins !== null && outMins !== null && outMins >= inMins) {
      const diff = outMins - inMins;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return { display: `${h}h ${m}m`, status: 'COMPLETED' };
    }
    // If calculateWorkingHours returned null (e.g. invalid time sequence like 10 AM -> 5 AM), do NOT show old 19h
    return { display: '—', status: 'COMPLETED' };
  }
  const todayStr = getKolkataDateStr();
  if (record.date === todayStr && record.checkInTime && record.checkInTime !== '--:--') {
    const currentTimeStr = getKolkataTimeStr();
    const inMins = parseAttendanceTimeToMinutes(record.checkInTime);
    const currentMins = parseAttendanceTimeToMinutes(currentTimeStr);
    if (inMins !== null && currentMins !== null && currentMins >= inMins) {
      const diff = currentMins - inMins;
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return { display: `${h}h ${m}m`, status: 'IN_PROGRESS' };
    }
    return { display: '—', status: 'IN_PROGRESS' };
  }
  return { display: 'UNRESOLVED', status: 'UNRESOLVED' };
};

export interface WorkHoursSummary {
  totalMinutes: number;
  workingDays: number;
  averageMinutesPerDay: number;
  
  // Breakdowns by mode
  officeMinutes: number;
  officeDays: number;
  wfhMinutes: number;
  wfhDays: number;
  clientMinutes: number;
  clientDays: number;
  outdoorMinutes: number;
  outdoorDays: number;
}

// Compute stats for a given month (format: YYYY-MM)
export const calculateMonthlySummary = (
  records: AttendanceRecord[],
  monthYYYYMM: string,
  targetEmpId?: string,
  targetEmpCode?: string
): WorkHoursSummary => {
  const tId = String(targetEmpId || '').trim().toUpperCase();
  const tCode = String(targetEmpCode || '').trim().toUpperCase();

  const filtered = records.filter((r) => {
    const dateMatch = r.date && r.date.startsWith(monthYYYYMM);
    if (!dateMatch) return false;

    if (!tId && !tCode) return true; // No employee filter requested

    const rId = String(r.employeeId || '').trim().toUpperCase();
    const rCode = String(r.employeeCode || '').trim().toUpperCase();
    
    const matchId = rId && (rId === tCode || (tId && rId === tId));
    const matchCode = rCode && (rCode === tCode || (tId && rCode === tId));
    
    return matchId || matchCode;
  });
  
  let totalMinutes = 0;
  let workingDays = 0;
  let completedCount = 0;
  let unresolvedCount = 0;
  
  let officeMinutes = 0;
  let officeDays = 0;
  let wfhMinutes = 0;
  let wfhDays = 0;
  let clientMinutes = 0;
  let clientDays = 0;
  let outdoorMinutes = 0;
  let outdoorDays = 0;

  const todayStr = getKolkataDateStr();
  
  filtered.forEach((r) => {
    const isUnresolved = isAttendanceCheckoutUnresolved(r) || r.checkoutStatus === 'UNRESOLVED';
    const isPendingReview = r.checkoutStatus === 'PENDING_ADMIN_REVIEW';
    const hasCheckout = !!(
      r.checkOutTime &&
      r.checkOutTime !== '--:--' &&
      r.checkOutTime !== 'Pending' &&
      r.checkOutTime !== 'N/A' &&
      r.checkOutTime !== 'UNRESOLVED'
    );
    const isToday = r.date === todayStr;

    if (isUnresolved || isPendingReview) {
      unresolvedCount += 1;
    }

    const calculatedMinutes = getRecordWorkingMinutes(r);

    // Diagnostic logging per record as requested
    console.log('[WORK_HOURS_RECORD]', {
      date: r.date,
      employeeId: r.employeeId,
      employeeCode: r.employeeCode,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      checkoutStatus: r.checkoutStatus,
      attendanceType: r.attendanceType,
      calculatedMinutes,
      storedWorkingHours: r.workingHours
    });

    if (calculatedMinutes > 0) {
      if (hasCheckout && !isUnresolved && !isPendingReview) {
        completedCount += 1;
      }
      totalMinutes += calculatedMinutes;
      workingDays += 1;
      
      const mode = (r.attendanceType || 'OFFICE').toUpperCase();
      switch (mode) {
        case 'OFFICE':
          officeMinutes += calculatedMinutes;
          officeDays += 1;
          break;
        case 'WFH':
          wfhMinutes += calculatedMinutes;
          wfhDays += 1;
          break;
        case 'CLIENT_VISIT':
        case 'CLIENT':
          clientMinutes += calculatedMinutes;
          clientDays += 1;
          break;
        case 'OUTDOOR':
          outdoorMinutes += calculatedMinutes;
          outdoorDays += 1;
          break;
        default:
          officeMinutes += calculatedMinutes;
          officeDays += 1;
          break;
      }
    }
  });

  // Diagnostic summary logging as requested
  console.log('[WORK_HOURS_SUMMARY]', {
    selectedMonth: monthYYYYMM,
    recordCount: filtered.length,
    completedCount,
    unresolvedCount,
    totalMinutes,
    workingDays
  });
  
  return {
    totalMinutes,
    workingDays,
    averageMinutesPerDay: workingDays > 0 ? Math.round(totalMinutes / workingDays) : 0,
    officeMinutes,
    officeDays,
    wfhMinutes,
    wfhDays,
    clientMinutes,
    clientDays,
    outdoorMinutes,
    outdoorDays,
  };
};

