import { db } from '../firebase/config';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';
import { getCompanyOfficeAttendanceCountsByDate } from '../../utils/attendanceUtils';

export interface SalaryRecord {
  id: string; // ${employeeCode}_${year}_${month}
  employeeCode: string;
  employeeName: string;
  month: number;
  year: number;
  baseSalary: number;
  daysInMonth: number;
  officePresentDays: number;
  wfhDays: number;
  clientVisitDays: number;
  outdoorDays: number;
  paidLeaveDays: number;
  sundayHolidayDays: number;
  totalPresentDays: number;
  advance: number;
  lateDays: number;
  lateFine: number;
  salaryBeforeDeductions: number;
  salaryBeforeAdvance: number; // for compatibility
  finalSalary: number;
  generationTimestamp: string;
  allocatedPaidLeaves?: number;
  usedPaidLeaves?: number;
  remainingPaidLeaves?: number;
  attendanceCutOffDate?: string;
}

export interface SalaryEmployeeConfig {
  id: string; // ${employeeCode}_${leaveYear}
  employeeCode: string;
  leaveYear: string;
  baseSalary: number;
  allocatedPaidLeaves: number;
}

export interface SalaryLeaveAudit {
  id: string; // ${employeeCode}_${date}
  employeeCode: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  month: number;
  year: number;
  leaveYear: string;
  daysConsumed: number;
  reason: string;
}

/**
 * Calculates the Leave Year string for a given month and year
 * 1 April -> 31 March
 */
export function getLeaveYear(month: number, year: number): string {
  const startYear = month < 4 ? year - 1 : year;
  const endYear = startYear + 1;
  return `${startYear}-${endYear}`;
}

export interface PresentDaysResult {
  officeDays: number;
  wfhDays: number;
  clientVisitDays: number;
  outdoorDays: number;
  paidLeaveDays: number;
  sundayHolidayDays: number;
  totalPresentDays: number;
  datesConvertedToPaidLeave: string[];
  datesRemovedFromPaidLeave: string[];
  cutOffDateStr: string;
  lateDays: number;
}

/**
 * Checks if a check-in time string (e.g. "10:31 AM") is late (10:31 AM or later)
 */
export function isSalaryLateCheckIn(checkInTimeStr: string): boolean {
  if (!checkInTimeStr) return false;
  try {
    const trimmed = checkInTimeStr.trim().toUpperCase();
    const match = trimmed.match(/^(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/);
    if (!match) return false;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm === 'PM' && hours < 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
    const totalMinutes = hours * 60 + minutes;
    const threshold = 10 * 60 + 30; // 10:30 AM is 630 minutes
    return totalMinutes > threshold; // 10:31 AM or later is > 630 mins
  } catch (err) {
    return false;
  }
}

/**
 * Core presenter engine for salary calculation
 */
export function calculatePresentDays(
  employeeCode: string,
  month: number,
  year: number,
  allocatedPaidLeaves: number,
  attendanceRecords: any[], // Attendance records of this employee for this month
  approvedLeaveRequests: any[], // Approved leave requests covering this month
  allLeaveAuditsForYear: SalaryLeaveAudit[], // All leave audits for this employee in the leave year
  allOfficeAttendanceRecords?: any[] // Optional: Complete attendance records across all employees for this month
): PresentDaysResult {
  const daysInMonth = new Date(year, month, 0).getDate();
  const leaveYear = getLeaveYear(month, year);

  // Index ONLY company-wide OFFICE mode check-in counts for each date in the month
  // WFH, CLIENT_VISIT, and OUTDOOR records do NOT make the day an office day.
  const hasOfficeAttendanceData = Array.isArray(allOfficeAttendanceRecords);
  const officeCheckInCountsByDate = hasOfficeAttendanceData && allOfficeAttendanceRecords
    ? getCompanyOfficeAttendanceCountsByDate(allOfficeAttendanceRecords)
    : new Map<string, number>();

  // 1. Calculate Cut-off date Str (YYYY-MM-DD)
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const padZero = (n: number) => String(n).padStart(2, '0');
  const yesterdayStr = `${yesterday.getFullYear()}-${padZero(yesterday.getMonth() + 1)}-${padZero(yesterday.getDate())}`;
  
  const lastDayOfSelectedMonthStr = `${year}-${padZero(month)}-${padZero(daysInMonth)}`;
  const cutOffDateStr = lastDayOfSelectedMonthStr < yesterdayStr ? lastDayOfSelectedMonthStr : yesterdayStr;

  let officeDays = 0;
  let wfhDays = 0;
  let clientVisitDays = 0;
  let outdoorDays = 0;
  let paidLeaveDays = 0;
  let sundayHolidayDays = 0;
  let lateDays = 0;

  // Track audits that already exist for other months in this leave year
  const auditsOtherMonths = allLeaveAuditsForYear.filter(
    (audit) => audit.leaveYear === leaveYear && audit.month !== month
  );
  const usedLeavesOtherMonths = auditsOtherMonths.length;

  // Track audits that already exist for THIS month
  const auditsThisMonth = allLeaveAuditsForYear.filter(
    (audit) => audit.leaveYear === leaveYear && audit.month === month
  );

  const datesConvertedToPaidLeave: string[] = [];
  const datesRemovedFromPaidLeave: string[] = [];

  // Index attendance records by date (YYYY-MM-DD)
  const attendanceMap = new Map<string, any>();
  attendanceRecords.forEach((rec) => {
    if (rec.date) {
      attendanceMap.set(rec.date, rec);
    }
  });

  // Keep track of which existing audits for this month are actually used
  const usedAuditsThisMonth = new Set<string>();

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const monthStr = month < 10 ? `0${month}` : `${month}`;
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    // Skip entirely if date is after the cut-off date
    if (dateStr > cutOffDateStr) {
      continue;
    }

    const attendance = attendanceMap.get(dateStr);

    if (attendance) {
      // Check for late check-in
      if (attendance.checkInTime && isSalaryLateCheckIn(attendance.checkInTime)) {
        lateDays++;
      }

      // Rule 1: Attendance modes count as PRESENT
      const type = (attendance.attendanceType || '').toUpperCase();
      if (type === 'OFFICE') {
        officeDays++;
      } else if (type === 'WFH') {
        wfhDays++;
      } else if (type === 'CLIENT_VISIT') {
        clientVisitDays++;
      } else if (type === 'OUTDOOR') {
        outdoorDays++;
      } else {
        // Fallback if there's any unknown type but marked present
        officeDays++;
      }
    } else {
      // No physical attendance marked by this employee.
      // Check if this date was a Sunday
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const isSunday = dayOfWeek === 0;

      // Rule: If 0 employees checked in across the office on this completed date, the date is a HOLIDAY.
      // A HOLIDAY counts as 1 PRESENT DAY for salary and does NOT consume an employee's allocated paid leave balance.
      const officeCheckInCount = hasOfficeAttendanceData ? (officeCheckInCountsByDate.get(dateStr) || 0) : null;
      const isZeroOfficeCheckInHoliday = officeCheckInCount !== null ? (officeCheckInCount === 0) : isSunday;

      if (isZeroOfficeCheckInHoliday) {
        // Classify as HOLIDAY: +1 PRESENT DAY for salary, 0 ABSENT, no paid leave deduction
        sundayHolidayDays++;
      } else {
        // Office was open with check-ins. Check if employee is absent on an approved leave:
        const isAbsentOnLeave = approvedLeaveRequests.some((req) => {
          const start = req.startDate || '';
          const end = req.endDate || '';
          return (
            req.status === 'APPROVED' &&
            dateStr >= start &&
            dateStr <= end
          );
        });

        if (isAbsentOnLeave) {
          // Rule 3: ABSENT on working day + PAID LEAVE AVAILABLE
          // First check if a paid leave audit already exists for this date
          const existingAudit = auditsThisMonth.find((a) => a.date === dateStr);

          if (existingAudit) {
            paidLeaveDays++;
            usedAuditsThisMonth.add(dateStr);
          } else {
            // Check if we have remaining balance
            const totalPaidLeavesUsedSoFar = usedLeavesOtherMonths + paidLeaveDays;
            if (totalPaidLeavesUsedSoFar < allocatedPaidLeaves) {
              paidLeaveDays++;
              datesConvertedToPaidLeave.push(dateStr);
            } else {
              // No paid leaves available, counts as 0 PRESENT days (absent without paid leave)
            }
          }
        } else {
          // Rule 2: Unapproved absence on an open office day -> 0 PRESENT days
        }
      }
    }
  }

  // Any existing audits for this month that were NOT used in this calculation should be removed
  auditsThisMonth.forEach((audit) => {
    if (!usedAuditsThisMonth.has(audit.date)) {
      datesRemovedFromPaidLeave.push(audit.date);
    }
  });

  const totalPresentDays = officeDays + wfhDays + clientVisitDays + outdoorDays + paidLeaveDays + sundayHolidayDays;

  return {
    officeDays,
    wfhDays,
    clientVisitDays,
    outdoorDays,
    paidLeaveDays,
    sundayHolidayDays,
    totalPresentDays,
    datesConvertedToPaidLeave,
    datesRemovedFromPaidLeave,
    cutOffDateStr,
    lateDays,
  };
}
