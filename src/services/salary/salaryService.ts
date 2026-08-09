import { db } from '../firebase/config';
import { collection, doc, setDoc, getDocs, deleteDoc, query, where } from 'firebase/firestore';

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
  salaryBeforeAdvance: number;
  finalSalary: number;
  generationTimestamp: string;
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
  allLeaveAuditsForYear: SalaryLeaveAudit[] // All leave audits for this employee in the leave year
): PresentDaysResult {
  const daysInMonth = new Date(year, month, 0).getDate();
  const leaveYear = getLeaveYear(month, year);

  let officeDays = 0;
  let wfhDays = 0;
  let clientVisitDays = 0;
  let outdoorDays = 0;
  let paidLeaveDays = 0;
  let sundayHolidayDays = 0;

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

    const attendance = attendanceMap.get(dateStr);

    if (attendance) {
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
      // No attendance marked.
      // Is the employee absent on an approved leave?
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
        // Rule 3: ABSENT + PAID LEAVE AVAILABLE
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
        // Rule 2: NO ATTENDANCE MARKED -> Treat as Sunday/Holiday and count as PRESENT
        sundayHolidayDays++;
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
  };
}
