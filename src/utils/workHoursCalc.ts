import { AttendanceRecord, AttendanceType } from '../types/attendance';
import { calculateWorkingHours } from '../services/attendance/smartAttendanceEngine';

// Get current date string in Asia/Kolkata timezone (format: YYYY-MM-DD)
export const getKolkataDateStr = (dateInput: Date = new Date()): string => {
  return dateInput.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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

// Calculate working hours between checkIn and checkOut or fallback
export const getRecordWorkingMinutes = (record: AttendanceRecord): number => {
  if (!record.checkInTime) return 0;
  
  // Unresolved or Pending Review records have NO fake duration
  if (record.checkoutStatus === 'UNRESOLVED' || record.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
    return 0;
  }
  
  // Completed attendance
  if (record.checkOutTime && record.checkOutTime !== '--:--') {
    const hoursStr = calculateWorkingHours(record.checkInTime, record.checkOutTime);
    return parseDurationToMinutes(hoursStr);
  }
  
  // Live in progress attendance (only if today)
  const todayStr = getKolkataDateStr();
  if (record.date === todayStr) {
    const currentTimeStr = getKolkataTimeStr();
    const hoursStr = calculateWorkingHours(record.checkInTime, currentTimeStr);
    return parseDurationToMinutes(hoursStr);
  }
  
  return 0;
};

// Helper for UI display of work hours adhering to Unresolved Checkout protection
export const getRecordWorkingHoursDisplay = (record: AttendanceRecord): { display: string; status: 'COMPLETED' | 'IN_PROGRESS' | 'UNRESOLVED' | 'PENDING_REVIEW' } => {
  if (record.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
    return { display: 'PENDING REVIEW', status: 'PENDING_REVIEW' };
  }
  if (record.checkoutStatus === 'UNRESOLVED') {
    return { display: 'UNRESOLVED', status: 'UNRESOLVED' };
  }
  if (record.checkOutTime && record.checkOutTime !== '--:--') {
    const mins = getRecordWorkingMinutes(record);
    return { display: record.workingHours || formatMinutesToDuration(mins), status: 'COMPLETED' };
  }
  const todayStr = getKolkataDateStr();
  if (record.date === todayStr && record.checkInTime) {
    const mins = getRecordWorkingMinutes(record);
    return { display: formatMinutesToDuration(mins), status: 'IN_PROGRESS' };
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
  monthYYYYMM: string
): WorkHoursSummary => {
  const filtered = records.filter((r) => r.date.startsWith(monthYYYYMM));
  
  let totalMinutes = 0;
  let workingDays = 0;
  
  let officeMinutes = 0;
  let officeDays = 0;
  let wfhMinutes = 0;
  let wfhDays = 0;
  let clientMinutes = 0;
  let clientDays = 0;
  let outdoorMinutes = 0;
  let outdoorDays = 0;
  
  filtered.forEach((r) => {
    // Only count completed days for final summaries, unless it is today and checked-in
    const isCompleted = !!(r.checkOutTime && r.checkOutTime !== '--:--');
    const isTodayActive = r.date === getKolkataDateStr() && !isCompleted;
    
    if (isCompleted || isTodayActive) {
      const mins = getRecordWorkingMinutes(r);
      if (mins > 0) {
        totalMinutes += mins;
        workingDays += 1;
        
        switch (r.attendanceType) {
          case 'OFFICE':
            officeMinutes += mins;
            officeDays += 1;
            break;
          case 'WFH':
            wfhMinutes += mins;
            wfhDays += 1;
            break;
          case 'CLIENT_VISIT':
            clientMinutes += mins;
            clientDays += 1;
            break;
          case 'OUTDOOR':
            outdoorMinutes += mins;
            outdoorDays += 1;
            break;
        }
      }
    }
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
