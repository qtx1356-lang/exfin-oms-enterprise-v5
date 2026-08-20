import { AttendanceRecord, AttendanceType } from '../../types/attendance';

export interface SalaryRecord {
  id: string;
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
  salaryBeforeAdvance: number;
  finalSalary: number;
  generationTimestamp: string;
  allocatedPaidLeaves: number;
  usedPaidLeaves: number;
  remainingPaidLeaves: number;
  attendanceCutOffDate: string;
}

export interface SalaryEmployeeConfig {
  id: string;
  employeeCode: string;
  leaveYear: string;
  baseSalary: number;
  allocatedPaidLeaves: number;
}

export interface SalaryLeaveAudit {
  id: string;
  employeeCode: string;
  employeeName: string;
  date: string;
  month: number;
  year: number;
  leaveYear: string;
  daysConsumed: number;
  reason: string;
}

export interface PresentDaysResult {
  officeDays: number;
  wfhDays: number;
  clientVisitDays: number;
  outdoorDays: number;
  paidLeaveDays: number;
  sundayHolidayDays: number;
  totalPresentDays: number;
  lateDays: number;
  cutOffDateStr: string;
  datesConvertedToPaidLeave: string[];
  datesRemovedFromPaidLeave: string[];
}

/**
 * Self-contained helper to parse time strings like "10:15 AM" or "18:00" into minutes from midnight.
 */
export const parseAttendanceTimeToMinutes = (timeStr: string | null | undefined): number | null => {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  if (
    !clean ||
    clean === 'Pending' ||
    clean === 'N/A' ||
    clean === 'UNRESOLVED' ||
    clean === '--:--' ||
    clean === '--:-- --'
  ) {
    return null;
  }

  // Support 12-hour AM/PM format (e.g., "10:15 AM" or "09:30 PM")
  const ampmMatch = clean.match(/^(\d+):(\d+)\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const min = parseInt(ampmMatch[2], 10);
    const ampm = ampmMatch[3].toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return hour * 60 + min;
  }

  // Support 24-hour format (e.g., "10:15" or "18:30")
  const h24Match = clean.match(/^(\d+):(\d+)$/);
  if (h24Match) {
    const hour = parseInt(h24Match[1], 10);
    const min = parseInt(h24Match[2], 10);
    return hour * 60 + min;
  }

  return null;
};

/**
 * Determines if a check-in time counts as a late check-in (after 10:15 AM).
 */
export function isSalaryLateCheckIn(checkInTimeStr: string | null | undefined): boolean {
  if (!checkInTimeStr) return false;
  const mins = parseAttendanceTimeToMinutes(checkInTimeStr);
  if (mins === null) return false;
  // Late if check-in is strictly after 10:15 AM (10 * 60 + 15 = 615 minutes from midnight)
  return mins > 615;
}

/**
 * Calculates the Leave Year string based on Indian Financial Year starting in April.
 */
export function getLeaveYear(month: number, year: number): string {
  if (month >= 4) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Business logic to calculate present days, leaves, Sundays and late days for salary processing.
 */
export function calculatePresentDays(
  employeeCode: string,
  month: number,
  year: number,
  allocatedPaidLeaves: number,
  attendanceRecords: any[],
  approvedLeaveRequests: any[],
  leaveAudits: SalaryLeaveAudit[]
): PresentDaysResult {
  const padZero = (n: number) => String(n).padStart(2, '0');
  const daysInMonth = new Date(year, month, 0).getDate();
  
  let officeDays = 0;
  let wfhDays = 0;
  let clientVisitDays = 0;
  let outdoorDays = 0;
  let paidLeaveDays = 0;
  let sundayHolidayDays = 0;
  let lateDays = 0;

  const datesConvertedToPaidLeave: string[] = [];
  const datesRemovedFromPaidLeave: string[] = [];

  // Map attendance records by date string "YYYY-MM-DD"
  const attMap = new Map<string, any>();
  attendanceRecords.forEach((rec) => {
    if (rec && rec.date) {
      attMap.set(rec.date, rec);
    }
  });

  // Keep track of which dates in this month already have paid leave audits registered
  const existingAuditDates = new Set<string>();
  leaveAudits.forEach((audit) => {
    if (audit.month === month && audit.year === year && audit.date) {
      existingAuditDates.add(audit.date);
    }
  });

  // Count leaves consumed in OTHER months of the same leave year
  const leaveYear = getLeaveYear(month, year);
  const otherMonthsAuditCount = leaveAudits.filter(
    (audit) => audit.leaveYear === leaveYear && (audit.month !== month || audit.year !== year)
  ).length;

  const maxAllowedInMonth = Math.max(0, allocatedPaidLeaves - otherMonthsAuditCount);
  let paidLeavesAwardedThisMonth = 0;

  // Generate date cutoff string (yesterday or last day of selected month)
  const now = new Date();
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const lastDayOfSelectedMonthStr = `${year}-${padZero(month)}-${padZero(daysInMonth)}`;
  const cutOffDateStr = lastDayOfSelectedMonthStr < yesterdayStr ? lastDayOfSelectedMonthStr : yesterdayStr;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${padZero(month)}-${padZero(d)}`;
    const dateObj = new Date(year, month - 1, d);
    const isSunday = dateObj.getDay() === 0;

    const record = attMap.get(dateStr);
    const isPresent = !!(
      record &&
      record.checkInTime &&
      !['--:--', '--:-- --', 'Pending', 'pending', 'N/A', 'n/a', 'UNRESOLVED', 'unresolved'].includes(record.checkInTime.trim())
    );

    if (isPresent) {
      // Employee was present
      const mode = (record.attendanceType || 'OFFICE').toUpperCase();
      switch (mode) {
        case 'OFFICE':
          officeDays++;
          break;
        case 'WFH':
          wfhDays++;
          break;
        case 'CLIENT_VISIT':
        case 'CLIENT':
          clientVisitDays++;
          break;
        case 'OUTDOOR':
          outdoorDays++;
          break;
        default:
          officeDays++;
          break;
      }

      if (record.checkInTime && isSalaryLateCheckIn(record.checkInTime)) {
        lateDays++;
      }

      // If they were present but previously had a paid leave audit registered on this date, remove it
      if (existingAuditDates.has(dateStr)) {
        datesRemovedFromPaidLeave.push(dateStr);
      }
    } else {
      // Employee was absent / not checked in
      // Check for approved leave covering this day
      const hasApprovedLeave = approvedLeaveRequests.some((leave) => {
        const matchesCode = leave.employeeCode === employeeCode || leave.employeeId === employeeCode;
        const isApproved = leave.status === 'APPROVED' || leave.status === 'Approved' || leave.approvalStatus === 'APPROVED';
        return matchesCode && isApproved && dateStr >= leave.startDate && dateStr <= leave.endDate;
      });

      if (hasApprovedLeave) {
        if (paidLeavesAwardedThisMonth < maxAllowedInMonth) {
          paidLeaveDays++;
          paidLeavesAwardedThisMonth++;
          // If this is a newly converted paid leave, record it
          if (!existingAuditDates.has(dateStr)) {
            datesConvertedToPaidLeave.push(dateStr);
          }
        } else {
          // Ran out of paid leave balance: counts as unpaid absent day
          if (existingAuditDates.has(dateStr)) {
            datesRemovedFromPaidLeave.push(dateStr);
          }
        }
      } else {
        // No approved leave
        if (isSunday) {
          sundayHolidayDays++;
        }
        
        // Ensure any legacy/incorrect paid leave audits on this day are removed
        if (existingAuditDates.has(dateStr)) {
          datesRemovedFromPaidLeave.push(dateStr);
        }
      }
    }
  }

  const totalPresentDays = officeDays + wfhDays + clientVisitDays + outdoorDays + paidLeaveDays + sundayHolidayDays;

  return {
    officeDays,
    wfhDays,
    clientVisitDays,
    outdoorDays,
    paidLeaveDays,
    sundayHolidayDays,
    totalPresentDays,
    lateDays,
    cutOffDateStr,
    datesConvertedToPaidLeave,
    datesRemovedFromPaidLeave,
  };
}
