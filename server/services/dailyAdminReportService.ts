import { Firestore, FieldValue } from 'firebase-admin/firestore';
import { sendMail } from './emailService';
import { calculateEfficiency } from '../../src/services/efficiency/efficiencyCalculator';
import { DEFAULT_WEIGHTAGES } from '../../src/services/efficiency/efficiencyService';

export interface DailyReportConfig {
  enabled: boolean;
  adminEmail?: string; // backward compatibility
  adminEmails: string[];
  sendTime: string;
  includeAttendance: boolean;
  includeLeaves: boolean;
  includeExpenses: boolean;
  includeOtherDailyActivity: boolean;
  updatedAt?: string;
  updatedBy?: string;
  lastSchedulerTick?: string;
}

export interface ReportStatusRecord {
  reportDate: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'PARTIALLY_SENT' | 'FAILED' | 'NOT_CONFIGURED';
  startedAt: string;
  completedAt?: string;
  recipientCount?: number;
  recipients?: string[];
  recipient: string; // compatibility
  messageId?: string;
  error?: string;
  createdAt: any;
  updatedAt: any;
}

// Centralized Target Recipients
export const DEFAULT_TARGET_RECIPIENTS = [
  'hr@exfinsolution.com',
  'ceo@exfinsolution.com',
  'sanjivsinha06@gmail.com'
];

export function getCentralizedRecipients(configEmails?: string[]): string[] {
  if (Array.isArray(configEmails)) {
    return configEmails;
  }
  if (process.env.EMAIL_RECIPIENTS) {
    const envList = process.env.EMAIL_RECIPIENTS.split(',').map(s => s.trim()).filter(Boolean);
    if (envList.length > 0) {
      return envList;
    }
  }
  return [...DEFAULT_TARGET_RECIPIENTS];
}

// Default Configuration values
export const DEFAULT_REPORT_CONFIG: DailyReportConfig = {
  enabled: true,
  adminEmails: [...DEFAULT_TARGET_RECIPIENTS],
  sendTime: '07:00 AM',
  includeAttendance: true,
  includeLeaves: true,
  includeExpenses: true,
  includeOtherDailyActivity: true,
};

const CONFIG_DOC_PATH = 'notification_settings/daily_admin_report_config';

/**
 * Validates a list of email recipients according to strict rules:
 * - non-empty array, max 20 entries, correct email format, no duplicates (case-insensitive)
 */
export function validateAdminEmails(emails: any): { valid: boolean; error?: string; cleaned?: string[] } {
  if (!emails) {
    return { valid: false, error: "Recipient list is required." };
  }
  if (!Array.isArray(emails)) {
    return { valid: false, error: "Recipient list must be an array." };
  }
  if (emails.length > 20) {
    return { valid: false, error: "Maximum 20 email recipients are allowed." };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleaned: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < emails.length; i++) {
    const raw = emails[i];
    if (typeof raw !== 'string') {
      return { valid: false, error: `Invalid recipient format at index ${i}.` };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return { valid: false, error: "Email addresses cannot be empty." };
    }
    if (!emailRegex.test(trimmed)) {
      return { valid: false, error: `"${trimmed}" is not a valid email address.` };
    }
    
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) {
      return { valid: false, error: `Duplicate email address detected: "${trimmed}".` };
    }
    seen.add(lower);
    cleaned.push(trimmed);
  }

  return { valid: true, cleaned };
}

/**
 * Helper to get the formatted Date string (YYYY-MM-DD) for Asia/Kolkata timezone
 */
export function getKolkataDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Get the previous calendar day string in YYYY-MM-DD format for Asia/Kolkata
 * Uses pure UTC calendar arithmetic on the parsed Kolkata date to avoid any DST or locale parsing issues.
 */
export function getPreviousKolkataDateString(currentDate: Date = new Date()): string {
  const todayKolkata = getKolkataDateString(currentDate);
  const [yearStr, monthStr, dayStr] = todayKolkata.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  
  const utc = new Date(Date.UTC(year, month, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  
  const prevYear = utc.getUTCFullYear();
  const prevMonth = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const prevDay = String(utc.getUTCDate()).padStart(2, '0');
  return `${prevYear}-${prevMonth}-${prevDay}`;
}

/**
 * Get the current time in minutes since midnight for Asia/Kolkata
 */
export function getKolkataCurrentMinutes(currentDate: Date = new Date()): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(currentDate);
  const hourPart = parts.find(p => p.type === 'hour');
  const minutePart = parts.find(p => p.type === 'minute');
  let hour = hourPart ? parseInt(hourPart.value, 10) : 0;
  if (hour === 24) hour = 0;
  const min = minutePart ? parseInt(minutePart.value, 10) : 0;
  return hour * 60 + min;
}

/**
 * Format string to DD MMM YYYY (e.g. 27 Aug 2026)
 */
export function formatDateStringFriendly(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthNum = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const monthName = months[monthNum - 1] || 'Jan';
  return `${day} ${monthName} ${year}`;
}

/**
 * Helper to parse a time string like "10:31 AM" or "14:15" to minutes since midnight
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  try {
    const trimmed = timeStr.trim().toUpperCase();
    const match = trimmed.match(/^(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm === 'PM' && hours < 12) {
      hours += 12;
    } else if (ampm === 'AM' && hours === 12) {
      hours = 0;
    }
    return hours * 60 + minutes;
  } catch (e) {
    return null;
  }
}

/**
 * Convert a 24-hour HH:mm (or potential legacy AM/PM format) string to 12-hour components
 */
export function to12HourFormat(time24: string): { hour: string; minute: string; period: 'AM' | 'PM' } {
  if (!time24) return { hour: '07', minute: '00', period: 'AM' };
  try {
    const trimmed = time24.trim().toUpperCase();
    const match = trimmed.match(/^(\d+):(\d+)\s*(AM|PM)?$/);
    if (!match) {
      return { hour: '07', minute: '00', period: 'AM' };
    }
    
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    let period: 'AM' | 'PM' = match[3] as 'AM' | 'PM' || 'AM';
    
    if (!match[3]) {
      // 24-hour standard string
      if (hours >= 12) {
        period = 'PM';
        if (hours > 12) hours -= 12;
      } else {
        period = 'AM';
        if (hours === 0) hours = 12;
      }
    } else {
      // Already has AM/PM suffix, keep but make sure hour is normalized 1-12
      if (hours > 12) {
        hours = hours % 12 || 12;
      }
    }
    
    return {
      hour: String(hours).padStart(2, '0'),
      minute: String(minutes).padStart(2, '0'),
      period
    };
  } catch (e) {
    return { hour: '07', minute: '00', period: 'AM' };
  }
}

/**
 * Convert 12-hour components back to 24-hour HH:mm string
 */
export function to24HourFormat(hour: string, minute: string, period: 'AM' | 'PM'): string {
  let hours = parseInt(hour, 10);
  if (isNaN(hours)) hours = 7;
  const mins = parseInt(minute, 10);
  const minStr = String(isNaN(mins) ? 0 : mins).padStart(2, '0');
  
  if (period === 'PM' && hours < 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return `${String(hours).padStart(2, '0')}:${minStr}`;
}

/**
 * Determine if an attendance record indicates a late check-in (after 10:30 AM IST)
 */
export function isKolkataLateCheckIn(checkInTimeStr: string): boolean {
  const mins = parseTimeToMinutes(checkInTimeStr);
  if (mins === null) return false;
  return mins > 630; // 10:30 AM is 630 mins
}

let inMemoryReportConfig: DailyReportConfig = { ...DEFAULT_REPORT_CONFIG };
let hasLoadedFromFirestore = false;
let isSchedulerExecuting = false;
let isSchedulerDisabled = false;
let hasLoggedSchedulerDisabled = false;

/**
 * Fetches the Daily Admin Email Report configuration from Firestore with in-memory fallback
 */
export async function getDailyReportConfig(db?: Firestore | null): Promise<DailyReportConfig> {
  if (!db) {
    return { ...inMemoryReportConfig };
  }

  try {
    // Read from primary 'system_settings' collection used by Cloudflare Pages
    let snap = await db.collection('system_settings').doc('daily_admin_report').get();
    
    // Fallback to 'notification_settings' collection
    if (!snap.exists) {
      snap = await db.collection('notification_settings').doc('daily_admin_report_config').get();
    }

    // Since we successfully reached and read from the database, reset the authorization disabled flag
    if (isSchedulerDisabled) {
      isSchedulerDisabled = false;
      hasLoggedSchedulerDisabled = false;
      console.log('[DailyReport Scheduler] Self-healed: Successfully read configuration from Firestore. Re-enabling scheduler.');
    }

    if (!snap.exists) {
      if (process.env.EMAIL_RECIPIENTS) {
        const envList = process.env.EMAIL_RECIPIENTS.split(',').map(s => s.trim()).filter(Boolean);
        if (envList.length > 0) {
          inMemoryReportConfig.adminEmails = envList;
        }
      }
      hasLoadedFromFirestore = true;
      return { ...inMemoryReportConfig };
    }
    const data = snap.data();

    // BACKWARD COMPATIBILITY & MIGRATION
    let adminEmails: string[] = [];
    if (Array.isArray(data?.adminEmails)) {
      adminEmails = data.adminEmails;
    } else if (typeof data?.adminEmail === 'string' && data.adminEmail.trim()) {
      adminEmails = [data.adminEmail.trim()];
    } else {
      adminEmails = inMemoryReportConfig.adminEmails;
    }

    const loadedConfig: DailyReportConfig = {
      enabled: data?.enabled !== false,
      adminEmails,
      sendTime: data?.sendTime || inMemoryReportConfig.sendTime || '07:00 AM',
      includeAttendance: data?.includeAttendance !== false,
      includeLeaves: data?.includeLeaves !== false,
      includeExpenses: data?.includeExpenses !== false,
      includeOtherDailyActivity: data?.includeOtherDailyActivity !== false,
      updatedAt: data?.updatedAt || inMemoryReportConfig.updatedAt,
      updatedBy: data?.updatedBy || inMemoryReportConfig.updatedBy,
      lastSchedulerTick: data?.lastSchedulerTick || inMemoryReportConfig.lastSchedulerTick,
    };

    inMemoryReportConfig = loadedConfig;
    hasLoadedFromFirestore = true;
    return loadedConfig;
  } catch (err: any) {
    if (!hasLoadedFromFirestore) {
      console.log('[DailyReportService] Note: Using local configuration cache (Firestore:', err?.message || 'unavailable', ')');
    }
    return { ...inMemoryReportConfig };
  }
}

/**
 * Saves the Daily Admin Email Report configuration
 */
export async function saveDailyReportConfig(
  db: Firestore | null | undefined,
  config: Partial<DailyReportConfig>,
  updatedBy: string
): Promise<DailyReportConfig> {
  const current = await getDailyReportConfig(db);

  // Clean / Validate config
  let emailsToSave = config.adminEmails;
  if (emailsToSave !== undefined) {
    const valResult = validateAdminEmails(emailsToSave);
    if (!valResult.valid) {
      throw new Error(valResult.error);
    }
    emailsToSave = valResult.cleaned;
  }

  const updated: DailyReportConfig = {
    ...current,
    ...config,
    adminEmails: emailsToSave !== undefined ? emailsToSave : current.adminEmails,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  inMemoryReportConfig = { ...updated };

  // Since we are updating configuration, reset the scheduler disabled flag
  if (isSchedulerDisabled) {
    isSchedulerDisabled = false;
    hasLoggedSchedulerDisabled = false;
    console.log('[DailyReport Scheduler] Config updated: Re-enabling scheduler.');
  }

  if (db) {
    try {
      // Save to both collections to guarantee perfect synchronization across all Express and Cloudflare components
      await db.collection('system_settings').doc('daily_admin_report').set({
        enabled: updated.enabled,
        sendTime: updated.sendTime,
        adminEmails: updated.adminEmails,
        includeAttendance: updated.includeAttendance,
        includeLeaves: updated.includeLeaves,
        includeExpenses: updated.includeExpenses,
        includeOtherDailyActivity: updated.includeOtherDailyActivity,
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
      }, { merge: true });

      await db.collection('notification_settings').doc('daily_admin_report_config').set(updated, { merge: true });
    } catch (writeErr: any) {
      console.warn('[DailyReportService] Saved configuration to in-memory store; Firestore sync notice:', writeErr?.message || writeErr);
    }
  }

  return updated;
}

/**
 * Query previous calendar day's operational data and trigger email dispatch
 */
export async function generateAndSendDailyReport(
  db: Firestore,
  targetDateStr?: string, // optional manual override
  isManualSend = false,
  triggerBy = 'SYSTEM_SCHEDULER'
): Promise<{ success: boolean; message: string; reportDate: string; recipientCount?: number; recipients?: string[]; recipient?: string; messageId?: string; error?: string }> {
  
  // 1. Resolve target date (previous calendar day in Asia/Kolkata by default)
  const reportDate = targetDateStr || getPreviousKolkataDateString();
  const dateFormattedFriendly = formatDateStringFriendly(reportDate);

  // 2. Fetch Config
  const config = await getDailyReportConfig(db);
  if (!config.enabled && !isManualSend) {
    return { success: true, message: 'Daily Admin Report is currently disabled in configuration.', reportDate };
  }

  const recipients = config.adminEmails || [];
  const reportLogRef = db.collection('daily_admin_reports').doc(reportDate);

  if (recipients.length === 0) {
    // Write FAILED or NOT_CONFIGURED log with error message
    await reportLogRef.set({
      reportDate,
      status: 'FAILED',
      recipientCount: 0,
      recipients: [],
      recipient: '',
      error: 'No Admin email recipients are configured.',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: false, message: 'No Admin email recipients are configured.', reportDate };
  }

  const primaryRecipient = recipients[0];

  // 3. Atomically enforce Idempotency using Firestore transactions to avoid dual delivery
  const canProceed = await db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(reportLogRef);
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data) {
        if (data.status === 'SENT' && !isManualSend) {
          return { proceed: false, reason: 'Already successfully sent report for this date.' };
        }
        if (data.status === 'SENDING' && !isManualSend) {
          // Allow override if the locked task started > 10 mins ago (abandoned or crashed)
          const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : 0;
          const diffMins = (Date.now() - startedAt) / 60000;
          if (diffMins < 10) {
            return { proceed: false, reason: 'A report dispatch is already active for this date.' };
          }
        }
      }
    }

    // Lock the report log
    transaction.set(reportLogRef, {
      reportDate,
      status: 'SENDING',
      startedAt: new Date().toISOString(),
      recipientCount: recipients.length,
      recipients: recipients,
      recipient: primaryRecipient,
      triggeredBy: triggerBy,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { proceed: true, reason: 'Ok' };
  });

  if (!canProceed.proceed) {
    console.log(`[DailyReportService] Skipping generation: ${canProceed.reason}`);
    return { success: false, message: canProceed.reason, reportDate, recipient: primaryRecipient };
  }

  try {
    // 4. Fetch All Registrations (Employees) to get complete lookup metadata
    const regsSnap = await db.collection('registrations').get();
    const employeesMap = new Map<string, any>();
    const employeeCodeMap = new Map<string, any>();

    regsSnap.forEach((doc) => {
      const data = doc.data() || {};
      const reg = { id: doc.id, ...data };
      employeesMap.set(doc.id, reg);
      if (data.employeeCode) {
        employeeCodeMap.set(data.employeeCode, reg);
      }
    });

    const totalEmployeesCount = Array.from(employeesMap.values()).filter(
      (r) => r.status === 'Approved' && r.role !== 'ADMIN' && r.role !== 'SUPER_ADMIN'
    ).length;

    // 5. Gather Attendance Records for the target reportDate
    let presentCount = 0;
    let lateCount = 0;
    let checkedInCount = 0;
    let checkedOutCount = 0;
    let unresolvedCount = 0;
    let wfhCount = 0;
    let clientVisitCount = 0;
    let outdoorWorkCount = 0;

    const attendanceRows: string[] = [];

    if (config.includeAttendance) {
      const attSnap = await db.collection('attendance').where('date', '==', reportDate).get();
      attSnap.forEach((doc) => {
        const d = doc.data() || {};
        const empCode = d.employeeCode || '';
        const empName = d.employeeName || d.name || employeeCodeMap.get(empCode)?.name || 'Employee';
        const attType = d.attendanceType || 'Office';
        const inTime = d.checkInTime || '-';
        const outTime = d.checkOutTime || '-';
        const workHrs = d.workingHours || '-';
        const isLate = d.isLate === true || d.late === true || (d.checkInTime && isKolkataLateCheckIn(d.checkInTime));
        const status = d.checkoutStatus || 'Completed';

        // Increment stats
        presentCount++;
        if (isLate) lateCount++;
        if (inTime && inTime !== '-') checkedInCount++;
        if (outTime && outTime !== '-') checkedOutCount++;
        if (status === 'Pending' || status === 'UNRESOLVED' || (inTime !== '-' && outTime === '-')) unresolvedCount++;
        
        if (attType === 'WFH') wfhCount++;
        else if (attType === 'Client Visit' || attType === 'CLIENT_VISIT') clientVisitCount++;
        else if (attType === 'Outdoor Work' || attType === 'OUTDOOR_WORK') outdoorWorkCount++;

        // Render location context
        let locDetails = '-';
        if (attType === 'WFH') {
          locDetails = d.wfhReason ? `WFH Reason: ${d.wfhReason}` : 'WFH';
        } else if (attType === 'Client Visit' || attType === 'CLIENT_VISIT') {
          locDetails = `${d.clientName || 'Client'} (${d.clientLocation || d.townCity || 'Unknown'})`;
        } else if (attType === 'Outdoor Work' || attType === 'OUTDOOR_WORK') {
          locDetails = d.description || d.outdoorType || 'Outdoor';
        } else {
          locDetails = d.townCity ? `Office: ${d.townCity}` : 'HQ Office';
        }

        attendanceRows.push(`
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold; color: #1e293b;">${empCode}</td>
            <td style="padding: 10px; color: #334155;">${empName}</td>
            <td style="padding: 10px; color: #334155;">
              <span style="padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${
                attType === 'WFH' ? '#dbeafe; color: #1e40af;' : 
                (attType.includes('Client') ? '#fef3c7; color: #92400e;' : 
                (attType.includes('Outdoor') ? '#f3e8ff; color: #6b21a8;' : '#d1fae5; color: #065f46;'))
              }">${attType}</span>
            </td>
            <td style="padding: 10px; color: #334155;">${inTime}</td>
            <td style="padding: 10px; color: #334155;">${outTime}</td>
            <td style="padding: 10px; color: #334155;">${workHrs}</td>
            <td style="padding: 10px; color: #334155;">
              <span style="font-weight: 500; color: ${status === 'Pending' || status === 'UNRESOLVED' ? '#ef4444;' : '#10b981;'}">${status}</span>
            </td>
            <td style="padding: 10px; color: #334155;">${isLate ? '<span style="color: #f59e0b; font-weight: bold;">LATE</span>' : 'On-Time'}</td>
            <td style="padding: 10px; font-size: 12px; color: #64748b;">${locDetails}</td>
          </tr>
        `);
      });
    }

    const absentCount = Math.max(0, totalEmployeesCount - presentCount);

    // 6. Gather Leaves overlapping with target reportDate
    const leaveRows: string[] = [];
    if (config.includeLeaves) {
      const leavesSnap = await db.collection('leaves').get();
      leavesSnap.forEach((doc) => {
        const l = doc.data() || {};
        const startDate = l.startDate || '';
        const endDate = l.endDate || '';
        const empCode = l.employeeCode || '';
        const empName = l.employeeName || employeeCodeMap.get(empCode)?.name || 'Employee';
        const reason = l.reason || '-';
        const status = l.status || l.approvalStatus || 'APPROVED';

        // Check date overlap (reportDate lies between startDate and endDate)
        if (startDate && endDate && reportDate >= startDate && reportDate <= endDate) {
          leaveRows.push(`
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px; font-weight: bold; color: #1e293b;">${empCode}</td>
              <td style="padding: 10px; color: #334155;">${empName}</td>
              <td style="padding: 10px; color: #334155;">${startDate} to ${endDate} (${l.totalDays || 1} days)</td>
              <td style="padding: 10px; color: #334155;">
                <span style="padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${
                  status === 'APPROVED' ? '#d1fae5; color: #065f46;' : '#fee2e2; color: #991b1b;'
                }">${status}</span>
              </td>
              <td style="padding: 10px; font-size: 12px; color: #64748b;">${reason}</td>
            </tr>
          `);
        }
      });
    }

    // 7. Gather Expenses for the target reportDate
    const expenseRows: string[] = [];
    let totalExpensesSum = 0;
    if (config.includeExpenses) {
      const expSnap = await db.collection('expenses').where('date', '==', reportDate).get();
      expSnap.forEach((doc) => {
        const e = doc.data() || {};
        const empCode = e.employeeCode || '';
        const empName = e.employeeName || employeeCodeMap.get(empCode)?.name || 'Employee';
        const amount = parseFloat(e.amount) || 0;
        const category = e.category || 'Miscellaneous';
        const desc = e.description || '-';
        const status = e.status || 'Pending';

        totalExpensesSum += amount;

        expenseRows.push(`
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold; color: #1e293b;">${empCode}</td>
            <td style="padding: 10px; color: #334155;">${empName}</td>
            <td style="padding: 10px; font-weight: bold; color: #10b981;">₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td style="padding: 10px; color: #334155;">${category}</td>
            <td style="padding: 10px; font-size: 12px; color: #64748b;">${desc}</td>
            <td style="padding: 10px; color: #334155;">
              <span style="padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${
                status === 'Approved' ? '#d1fae5; color: #065f46;' : (status === 'Rejected' ? '#fee2e2; color: #991b1b;' : '#fef3c7; color: #92400e;')
              }">${status}</span>
            </td>
          </tr>
        `);
      });
    }

    // 8. Other Operational Data (e.g., Announcements, created tasks)
    let otherDataHtml = '<p style="color: #64748b; font-size: 13px;">No other operational activities found for this date.</p>';
    if (config.includeOtherDailyActivity) {
      const taskSnap = await db.collection('tasks').where('dueDate', '==', reportDate).get();
      const taskRows: string[] = [];
      taskSnap.forEach((doc) => {
        const t = doc.data() || {};
        taskRows.push(`<li><strong>${t.title}</strong> (Assigned: ${t.assignedToEmployeeCodes?.join(', ') || '-'}, Status: ${t.status})</li>`);
      });

      if (taskRows.length > 0) {
        otherDataHtml = `
          <div style="background: #f8fafc; border-radius: 8px; padding: 15px; border-left: 4px solid #6366f1;">
            <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 14px;">Tasks Due on this Day</h4>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
              ${taskRows.join('')}
            </ul>
          </div>
        `;
      }
    }

    // 8.5. Efficiency & Performance Section Computation (Reusing Production calculateEfficiency)
    const employeesList = Array.from(employeesMap.values()).filter((r: any) => {
      const status = (r.status || '').toUpperCase();
      const role = (r.role || '').toUpperCase();
      if (status === 'DELETED' || status === 'PENDING' || status === 'REJECTED') return false;
      if (role === 'ADMIN' || role === 'SUPER_ADMIN') return false;
      return status === 'APPROVED' || status === 'Approved' || status === 'ACTIVE' || !r.status;
    });

    const tasksSnap = await db.collection('tasks').get();
    const allTasks: any[] = [];
    tasksSnap.forEach(tDoc => allTasks.push({ id: tDoc.id, ...tDoc.data() }));

    const attSnap = await db.collection('attendance').get();
    const allAttendance: any[] = [];
    attSnap.forEach(aDoc => allAttendance.push({ id: aDoc.id, ...aDoc.data() }));

    const evaluatedEmployees: any[] = [];
    let totalScoreSum = 0;
    let aboveTargetCount = 0;
    let belowTargetCount = 0;
    let insufficientDataCount = 0;

    employeesList.forEach(emp => {
      const empCode = emp.employeeCode || emp.id;
      const empName = emp.name || empCode;
      const dept = emp.department || emp.office || 'Operations';
      const teamLeaderId = emp.teamLeaderId || null;

      const calc = calculateEfficiency(
        emp.id || empCode,
        empCode,
        empName,
        dept,
        teamLeaderId,
        reportDate,
        reportDate,
        allTasks,
        allAttendance,
        DEFAULT_WEIGHTAGES
      );

      const efficiency = Math.round(calc.finalScore);
      const grade = calc.grade;

      const hasActivity = allAttendance.some(a => (a.employeeCode === empCode || a.employeeId === emp.id || a.employeeId === empCode) && (a.date === reportDate || (a.createdAtDeviceTime || '').startsWith(reportDate))) ||
                          allTasks.some(t => {
                            const matchCode = t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(empCode);
                            const matchId = t.assignedToEmployeeIds && (t.assignedToEmployeeIds.includes(emp.id) || t.assignedToEmployeeIds.includes(empCode));
                            const tDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime ? t.createdAtDeviceTime.substring(0, 10) : '');
                            return (matchCode || matchId) && tDate === reportDate;
                          });

      if (!hasActivity && efficiency === 0) {
        insufficientDataCount++;
      }

      totalScoreSum += efficiency;
      if (efficiency >= 75) {
        aboveTargetCount++;
      } else {
        belowTargetCount++;
      }

      evaluatedEmployees.push({
        empCode,
        empName,
        dept,
        efficiency,
        grade,
        insufficientData: !hasActivity && efficiency === 0
      });
    });

    const validEvaluated = evaluatedEmployees.filter(e => e.efficiency >= 0);
    const overallAvgEfficiency = validEvaluated.length > 0 ? Math.round(totalScoreSum / validEvaluated.length) : 0;
    const sortedByEff = [...validEvaluated].sort((a, b) => b.efficiency - a.efficiency);
    const highestEff = sortedByEff.length > 0 ? sortedByEff[0].efficiency : 0;
    const lowestEff = sortedByEff.length > 0 ? sortedByEff[sortedByEff.length - 1].efficiency : 0;
    const topPerformers = sortedByEff.slice(0, 5);
    const bottomPerformers = [...validEvaluated].sort((a, b) => a.efficiency - b.efficiency).slice(0, 5);

    const dist = {
      excellent: validEvaluated.filter(e => e.efficiency >= 90).length,
      good: validEvaluated.filter(e => e.efficiency >= 75 && e.efficiency < 90).length,
      needsImprovement: validEvaluated.filter(e => e.efficiency >= 60 && e.efficiency < 75).length,
      critical: validEvaluated.filter(e => e.efficiency < 60).length,
      insufficient: insufficientDataCount
    };

    const teamMap = new Map<string, { totalScore: number; count: number; above: number; needAttention: number }>();
    evaluatedEmployees.forEach(e => {
      if (e.insufficientData) return;
      const d = e.dept;
      if (!teamMap.has(d)) {
        teamMap.set(d, { totalScore: 0, count: 0, above: 0, needAttention: 0 });
      }
      const t = teamMap.get(d)!;
      t.count++;
      t.totalScore += e.efficiency;
      if (e.efficiency >= 75) t.above++;
      else t.needAttention++;
    });

    const teamRowsHtml: string[] = [];
    teamMap.forEach((val, teamName) => {
      const avg = Math.round(val.totalScore / val.count);
      teamRowsHtml.push(`
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-weight: bold; color: #1e293b;">${teamName}</td>
          <td style="padding: 10px; font-weight: bold; color: ${avg >= 75 ? '#059669' : '#d97706'};">${avg}%</td>
          <td style="padding: 10px; color: #334155;">${val.count}</td>
          <td style="padding: 10px; color: #059669; font-weight: 500;">${val.above}</td>
          <td style="padding: 10px; color: #dc2626; font-weight: 500;">${val.needAttention}</td>
        </tr>
      `);
    });

    const diagnosticHtml = validEvaluated.length === 0 ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 15px; font-size: 12px; color: #991b1b;">
        <strong>Server Diagnostics:</strong> No efficiency data available.<br/>
        - Report Date: ${reportDate}<br/>
        - Employees Found: ${employeesList.length}<br/>
        - Attendance Records Found: ${allAttendance.length}<br/>
        - Tasks Found: ${allTasks.length}<br/>
        - Valid Scores: ${validEvaluated.length}
      </div>
    ` : '';

    const topPerformersRowsHtml = topPerformers.map((p, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; font-weight: bold; color: #1e293b;">#${idx + 1}</td>
        <td style="padding: 10px; color: #334155;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 10px; font-weight: bold; color: #059669;">${p.efficiency}%</td>
        <td style="padding: 10px; color: #334155;">${p.workHours}</td>
        <td style="padding: 10px; color: #334155;">${p.tasksCompleted}/${p.tasksTotal} tasks</td>
      </tr>
    `).join('');

    const bottomPerformersRowsHtml = bottomPerformers.map((p) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; color: #334155;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 10px; font-weight: bold; color: #dc2626;">${p.efficiency}%</td>
        <td style="padding: 10px; color: #334155;">${p.workHours}</td>
        <td style="padding: 10px; color: #334155;">${p.tasksCompleted}/${p.tasksTotal} tasks</td>
        <td style="padding: 10px; font-size: 12px; color: #b91c1c;">${p.reason}</td>
      </tr>
    `).join('');

    // 9. Generate Complete HTML Content
    const highestEffEmp = sortedByEff.length > 0 ? sortedByEff[0] : null;
    const lowestEffEmp = sortedByEff.length > 0 ? sortedByEff[sortedByEff.length - 1] : null;
    const highestEffEmpName = highestEffEmp ? `${highestEffEmp.empName} (${highestEffEmp.empCode})` : 'N/A';
    const lowestEffEmpName = lowestEffEmp ? `${lowestEffEmp.empName} (${lowestEffEmp.empCode})` : 'N/A';

    const topPerformersRows = topPerformers.map((p, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 10px; font-weight: bold; color: #0f766e;">#${idx + 1}</td>
        <td style="padding: 12px 10px; color: #0f172a; font-weight: 500;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 12px 10px; color: #475569;">${p.dept}</td>
        <td style="padding: 12px 10px; font-weight: bold; color: #047857; text-align: right;">${p.efficiency}%</td>
      </tr>
    `).join('');

    const needsImprovementRows = bottomPerformers.map((p, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 10px; font-weight: bold; color: #b91c1c;">#${idx + 1}</td>
        <td style="padding: 12px 10px; color: #0f172a; font-weight: 500;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 12px 10px; color: #475569;">${p.dept}</td>
        <td style="padding: 12px 10px; font-weight: bold; color: #b91c1c; text-align: right;">${p.efficiency}%</td>
      </tr>
    `).join('');

    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : 'https://exfin-oms-enterprise-v5.pages.dev';
    const adminPanelUrl = `${appUrl}/x7Kp9`;

    const generatedTimeKolkata = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EXFIN OMS Daily Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 20px; margin: 0; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
    
    <!-- 1. Header -->
    <div style="background-color: #0f766e; color: #ffffff; padding: 32px 24px; text-align: center; border-bottom: 4px solid #0d9488;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">EXFIN OMS</h1>
      <p style="margin: 4px 0 0 0; font-size: 16px; color: #ccfbf1; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Daily Administration Report</p>
      <div style="margin-top: 16px; display: inline-block; background-color: rgba(255, 255, 255, 0.15); padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: bold;">
        Report Date: ${dateFormattedFriendly}
      </div>
      <p style="margin: 8px 0 0 0; font-size: 11px; color: #99f6e4;">Generated Time: ${generatedTimeKolkata} (Asia/Kolkata)</p>
    </div>

    <div style="padding: 25px;">
      
      <!-- 2. Attendance Overview -->
      <div style="margin-bottom: 35px;">
        <h3 style="margin-top: 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">2. Attendance Overview</h3>
        
        <!-- Stats Grid -->
        <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 15px; margin-bottom: 25px;">
          <div style="flex: 1 1 120px; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #047857; text-transform: uppercase;">Present</div>
            <div style="font-size: 24px; font-weight: 800; color: #065f46; margin-top: 2px;">${presentCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #b91c1c; text-transform: uppercase;">Absent</div>
            <div style="font-size: 24px; font-weight: 800; color: #991b1b; margin-top: 2px;">${absentCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #1d4ed8; text-transform: uppercase;">WFH</div>
            <div style="font-size: 24px; font-weight: 800; color: #1e40af; margin-top: 2px;">${wfhCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #b45309; text-transform: uppercase;">Client Visit</div>
            <div style="font-size: 24px; font-weight: 800; color: #92400e; margin-top: 2px;">${clientVisitCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #f3e8ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #7e22ce; text-transform: uppercase;">Outdoor</div>
            <div style="font-size: 24px; font-weight: 800; color: #6b21a8; margin-top: 2px;">${outdoorWorkCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #d97706; text-transform: uppercase;">Late</div>
            <div style="font-size: 24px; font-weight: 800; color: #92400e; margin-top: 2px;">${lateCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Expenses</div>
            <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 2px;">₹${totalExpensesSum.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        <!-- Attendance Detail Table -->
        ${attendanceRows.length === 0 ? 
          '<p style="color: #64748b; font-size: 13px; font-style: italic;">No attendance recorded for this date.</p>' : `
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 12px 10px;">Emp Code</th>
                  <th style="padding: 12px 10px;">Name</th>
                  <th style="padding: 12px 10px;">Type</th>
                  <th style="padding: 12px 10px;">In</th>
                  <th style="padding: 12px 10px;">Out</th>
                  <th style="padding: 12px 10px;">Hours</th>
                  <th style="padding: 12px 10px;">Status</th>
                  <th style="padding: 12px 10px;">Late</th>
                  <th style="padding: 12px 10px;">Location Details</th>
                </tr>
              </thead>
              <tbody>
                ${attendanceRows.join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- 3. Efficiency Summary -->
      <div style="margin-bottom: 35px; border-top: 2px solid #f1f5f9; padding-top: 20px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">3. Efficiency Summary</h3>
        ${validEvaluated.length === 0 ? `
          <p style="color: #64748b; font-size: 13px; font-style: italic; padding: 15px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; margin-top: 15px;">
            No efficiency data available for this reporting period.
          </p>
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-top: 10px; font-size: 12px; color: #991b1b;">
            <strong>Server Diagnostics:</strong> Efficiency data source returned 0 evaluated employees.<br/>
            - Report Date: ${reportDate}<br/>
            - Employees Found: ${employeesList.length}<br/>
            - Attendance Records Found: ${allAttendance.length}<br/>
            - Tasks Found: ${allTasks.length}
          </div>
        ` : `
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-top: 15px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #dcfce7;">
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Team Average Efficiency</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #0f766e; font-size: 16px;">${overallAvgEfficiency}%</td>
              </tr>
              <tr style="border-bottom: 1px solid #dcfce7;">
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Highest Efficiency Employee</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #047857;">${highestEffEmpName} (${highestEff}%)</td>
              </tr>
              <tr style="border-bottom: 1px solid #dcfce7;">
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Lowest Efficiency Employee</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #b91c1c;">${lowestEffEmpName} (${lowestEff}%)</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Total Employees Evaluated</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #0f172a;">${evaluatedCount}</td>
              </tr>
            </table>
          </div>
        `}
      </div>

      <!-- 4. Efficiency Leaderboard -->
      <div style="margin-bottom: 35px; border-top: 2px solid #f1f5f9; padding-top: 20px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">4. Efficiency Leaderboard</h3>
        
        <h4 style="color: #047857; font-size: 13px; font-weight: bold; margin-top: 15px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">🏆 Top Performers</h4>
        <div style="overflow-x: auto; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead>
              <tr style="background-color: #f0fdf4; border-bottom: 2px solid #bbf7d0; color: #166534; font-weight: bold;">
                <th style="padding: 12px 10px; width: 60px;">Rank</th>
                <th style="padding: 12px 10px;">Employee Name</th>
                <th style="padding: 12px 10px;">Department</th>
                <th style="padding: 12px 10px; text-align: right; width: 120px;">Efficiency Score</th>
              </tr>
            </thead>
            <tbody>
              ${topPerformersRows}
            </tbody>
          </table>
        </div>

        <h4 style="color: #b91c1c; font-size: 13px; font-weight: bold; margin-top: 15px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ Needs Improvement</h4>
        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead>
              <tr style="background-color: #fef2f2; border-bottom: 2px solid #fecaca; color: #991b1b; font-weight: bold;">
                <th style="padding: 12px 10px; width: 60px;">Rank</th>
                <th style="padding: 12px 10px;">Employee Name</th>
                <th style="padding: 12px 10px;">Department</th>
                <th style="padding: 12px 10px; text-align: right; width: 120px;">Efficiency Score</th>
              </tr>
            </thead>
            <tbody>
              ${needsImprovementRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. Operational Summary & Additional Details -->
      <div style="margin-bottom: 35px; border-top: 2px solid #f1f5f9; padding-top: 20px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">5. Leaves Overview</h3>
        ${leaveRows.length === 0 ? 
          '<p style="color: #64748b; font-size: 13px; font-style: italic;">No active leaves recorded for this date.</p>' : `
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 12px 10px;">Emp Code</th>
                  <th style="padding: 12px 10px;">Name</th>
                  <th style="padding: 12px 10px;">Leave Period</th>
                  <th style="padding: 12px 10px;">Status</th>
                  <th style="padding: 12px 10px;">Reason</th>
                </tr>
              </thead>
              <tbody>
                ${leaveRows.join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div style="margin-bottom: 35px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">6. Expenses Claims</h3>
        ${expenseRows.length === 0 ? 
          '<p style="color: #64748b; font-size: 13px; font-style: italic;">No expenses submitted for this date.</p>' : `
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 12px 10px;">Emp Code</th>
                  <th style="padding: 12px 10px;">Name</th>
                  <th style="padding: 12px 10px;">Amount</th>
                  <th style="padding: 12px 10px;">Category</th>
                  <th style="padding: 12px 10px;">Description</th>
                  <th style="padding: 12px 10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${expenseRows.join('')}
              </tbody>
            </table>
          </div>
          <div style="text-align: right; margin-top: 15px; font-size: 14px; font-weight: bold; color: #0f172a;">
            Total Daily Expenses Claimed: <span style="color: #0f766e; font-size: 16px;">₹${totalExpensesSum.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
          </div>
        `}
      </div>

      ${validEvaluated.length > 0 ? `
        <!-- Team Performance -->
        ${teamRowsHtml.length > 0 ? `
          <div style="margin-bottom: 35px;">
            <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">7. Team Performance Breakdown</h3>
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                    <th style="padding: 12px 10px;">Department / Team</th>
                    <th style="padding: 12px 10px;">Avg Efficiency</th>
                    <th style="padding: 12px 10px;">Evaluated</th>
                    <th style="padding: 12px 10px;">Above Target</th>
                    <th style="padding: 12px 10px;">Needs Attention</th>
                  </tr>
                </thead>
                <tbody>
                  ${teamRowsHtml.join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

        <!-- Efficiency Distribution Details -->
        <div style="margin-bottom: 35px;">
          <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">8. Efficiency Distribution</h3>
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Excellent (90%+)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #059669;">${dist.excellent} employees</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Good (75% - 89%)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #2563eb;">${dist.good} employees</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Needs Improvement (60% - 74%)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #d97706;">${dist.needsImprovement} employees</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Critical (&lt;60%)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #dc2626;">${dist.critical} employees</td>
              </tr>
              <tr>
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Insufficient Data</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #64748b;">${dist.insufficient} employees</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Productivity Highlights -->
        <div style="margin-bottom: 35px; background-color: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 16px;">
          <h3 style="color: #0f766e; font-size: 14px; font-weight: 700; text-transform: uppercase; margin: 0 0 10px 0;">Productivity Highlights</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #1e293b; line-height: 1.6;">
            <li>Highest efficiency recorded today: <strong>${highestEff}%</strong></li>
            <li>Number of employees meeting or exceeding performance targets: <strong>${aboveTargetCount} / ${evaluatedCount}</strong></li>
            <li>Active attendance tracking operational across all departments with <strong>${presentCount}</strong> present today.</li>
          </ul>
        </div>

        <!-- Action Required -->
        <div style="margin-bottom: 35px; background-color: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 16px;">
          <h3 style="color: #92400e; font-size: 14px; font-weight: 700; text-transform: uppercase; margin: 0 0 10px 0;">Action Required</h3>
          <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.6;">
            Review employees falling into the critical or needs improvement categories. Follow up on attendance exceptions and investigate missing activity logs for employees with insufficient tracking data.
          </p>
        </div>
      ` : ''}

      <!-- Other Activity -->
      <div style="margin-top: 30px; margin-bottom: 10px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Other Daily Operational Data</h3>
        ${otherDataHtml}
      </div>

      <!-- 6. Admin Panel Access (Highlighted) -->
      <div style="margin-top: 40px; background-color: #f0fdf4; border: 1.5px solid #0f766e; border-radius: 12px; padding: 24px; text-align: center; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.05);">
        <h3 style="margin: 0 0 8px 0; color: #0f766e; font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Admin Panel</h3>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.5; max-width: 500px; margin-left: auto; margin-right: auto;">
          View the complete dashboard, analytics, attendance, efficiency, reports and employee management.
        </p>
        <a href="${adminPanelUrl}" target="_blank" style="display: inline-block; background-color: #0f766e; color: #ffffff; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: bold; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px 0 rgba(15, 118, 110, 0.2);">
          View More
        </a>
        
        <!-- 7. Admin Login Credentials -->
        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6;">
          <strong style="color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Admin Login</strong>
          Admin credentials are managed securely by the system.
        </div>
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #cbd5e1; padding: 24px; text-align: center; color: #64748b; font-size: 11px; line-height: 1.5;">
      <p style="margin: 0;">This email is an automatically generated administrative report from your EXFIN Office Management System.</p>
      <p style="margin: 5px 0 0 0;">© 2026 EXFIN OMS. All rights reserved.</p>
    </div>

  </div>
</body>
</html>
    `;

    // 10. Send the Mail via backend email service
    const subject = `EXFIN OMS — Daily Admin Report — ${formatDateStringFriendly(reportDate)}`;

    const emailRes = await sendMail({
      to: recipients,
      subject,
      html: emailHtml,
    });

    if (emailRes.success) {
      const accepted = emailRes.accepted || [];
      const rejected = emailRes.rejected || [];
      const hasRejections = rejected.length > 0;
      const statusValue = hasRejections ? 'PARTIALLY_SENT' : 'SENT';

      await reportLogRef.set({
        status: statusValue,
        completedAt: new Date().toISOString(),
        messageId: emailRes.messageId || 'simulated',
        simulated: emailRes.simulated,
        acceptedRecipients: accepted,
        rejectedRecipients: rejected,
        error: hasRejections ? `Delivery failed for: ${rejected.join(', ')}` : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // Append Audit Log
      try {
        const auditRef = db.collection('audit_logs').doc();
        await auditRef.set({
          id: auditRef.id,
          actionCategory: 'SYSTEM_SETTINGS',
          action: isManualSend ? 'Manually Dispatched Daily Admin Email Report' : 'Dispatched Scheduled Daily Admin Email Report',
          performedByUserId: triggerBy,
          performedByName: triggerBy,
          timestamp: new Date().toISOString(),
          details: {
            reportDate,
            recipients,
            recipientCount: recipients.length,
            status: statusValue,
            manual: isManualSend,
            simulated: emailRes.simulated,
            messageId: emailRes.messageId,
            acceptedCount: accepted.length,
            rejectedCount: rejected.length,
          },
        });
      } catch (ae) {}

      return {
        success: true,
        message: 'Email accepted by Gmail SMTP',
        reportDate,
        recipientCount: recipients.length,
        recipients,
        recipient: recipients.join(', '),
        messageId: emailRes.messageId,
      };
    } else {
      throw new Error(emailRes.error || 'Failed to dispatch email');
    }

  } catch (err: any) {
    console.error(`[DailyReportService] Error generating and sending report for ${reportDate}:`, err);
    
    // Set to failed in Firestore
    await reportLogRef.set({
      status: 'FAILED',
      completedAt: new Date().toISOString(),
      error: err.message || String(err),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Append Audit Log for Failure
    try {
      const auditRef = db.collection('audit_logs').doc();
      await auditRef.set({
        id: auditRef.id,
        actionCategory: 'SYSTEM_SETTINGS',
        action: 'Daily Admin Email Report Dispatch Failed',
        performedByUserId: triggerBy,
        performedByName: triggerBy,
        timestamp: new Date().toISOString(),
        details: {
          reportDate,
          recipients,
          recipientCount: recipients.length,
          error: err.message || String(err),
        },
      });
    } catch (ae) {}

    return {
      success: false,
      message: err.message || 'Failed to generate and dispatch daily report.',
      error: err.message || 'Failed to generate and dispatch daily report.',
      reportDate,
      recipient: primaryRecipient,
    };
  }
}

/**
 * Sends a clean test email to the configured Admin email addresses
 */
export async function sendDailyReportTestEmail(
  db: Firestore,
  triggerBy = 'SUPER_ADMIN'
): Promise<{ success: boolean; message: string; recipientCount?: number; recipients?: string[]; messageId?: string }> {
  const config = await getDailyReportConfig(db);
  const recipients = getCentralizedRecipients(config.adminEmails);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (recipients.length !== 3 || recipients.some(r => !emailRegex.test(r))) {
    return {
      success: false,
      message: 'EMAIL_RECIPIENTS contains invalid recipient configuration.',
      recipientCount: 0,
      recipients: []
    };
  }

  const subject = `EXFIN OMS — Test Daily Report`;
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 25px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgb(0 0 0 / 0.05); border-top: 4px solid #6366f1;">
    <h2 style="color: #1e1b4b; margin-top: 0;">EXFIN OMS — Connection Verification</h2>
    <p>This is a <strong>Test Daily Report</strong> designed to verify that the EXFIN OMS backend email server configuration is fully operational.</p>
    <p>Details:</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Status</td>
        <td style="padding: 8px 0; color: #10b981;">ACTIVE / OPERATIONAL</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Recipients</td>
        <td style="padding: 8px 0;">${recipients.join(', ')}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Recipient Count</td>
        <td style="padding: 8px 0;">${recipients.length}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Send Time Setting</td>
        <td style="padding: 8px 0;">${config.sendTime} (Asia/Kolkata)</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Dispatched From</td>
        <td style="padding: 8px 0;">EXFIN OMS Server</td>
      </tr>
    </table>
    <p style="margin-top: 25px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
      Verified successfully on ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })} IST.
    </p>
  </div>
</body>
</html>
  `;

  const emailRes = await sendMail({
    to: recipients,
    subject,
    html,
  });

  if (emailRes.success) {
    const accepted = emailRes.accepted || [];
    const rejected = emailRes.rejected || [];

    // Audit Log
    try {
      const auditRef = db.collection('audit_logs').doc();
      await auditRef.set({
        id: auditRef.id,
        actionCategory: 'SYSTEM_SETTINGS',
        action: 'Dispatched Test Daily Admin Report Email',
        performedByUserId: triggerBy,
        performedByName: triggerBy,
        timestamp: new Date().toISOString(),
        details: {
          recipients,
          recipientCount: recipients.length,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
        },
      });
    } catch (ae) {}

    return {
      success: true,
      message: 'Test email sent to 3 recipients',
      recipientCount: recipients.length,
      recipients,
      messageId: emailRes.messageId,
    };
  } else {
    return {
      success: false,
      message: emailRes.error || 'Failed to dispatch verification email',
      recipientCount: recipients.length,
      recipients,
    };
  }
}

/**
 * Background automated runner: checks if the current time in Asia/Kolkata matches or exceeds
 * the configured daily send time, and dispatches yesterday's operational summary report if not already sent.
 */
export async function checkAndRunScheduledDailyReport(db: Firestore | null): Promise<void> {
  if (!db) {
    console.log('[DailyReport Scheduler] Database is not initialized. Skipping scheduled check.');
    return;
  }
  if (isSchedulerExecuting) {
    console.log('[DailyReport Scheduler] Scheduler is already executing. Skipping concurrent check.');
    return;
  }
  if (isSchedulerDisabled) {
    return;
  }

  try {
    isSchedulerExecuting = true;
    const config = await getDailyReportConfig(db);
    
    const currentKolkataTime = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date());

    if (!config.enabled) {
      console.log(`[DailyReport Scheduler] Check completed at ${currentKolkataTime} IST: Automated delivery is DISABLED in configuration.`);
      return;
    }

    if (!config.adminEmails || config.adminEmails.length === 0) {
      console.log(`[DailyReport Scheduler] Check completed at ${currentKolkataTime} IST: No admin email recipients are configured.`);
      return;
    }

    const scheduledMinutes = parseTimeToMinutes(config.sendTime) ?? 420; // default 07:00 AM (420 mins)
    const currentMinutes = getKolkataCurrentMinutes();

    console.log(`[DailyReport Scheduler] Check at ${currentKolkataTime} IST | Configured Time: ${config.sendTime} (${scheduledMinutes}m) | Current Time: ${currentMinutes}m`);

    // Only proceed if current Kolkata time is at or after the scheduled send time
    if (currentMinutes < scheduledMinutes) {
      console.log(`[DailyReport Scheduler] Too early to run. Remaining time: ${scheduledMinutes - currentMinutes} minute(s).`);
      return;
    }

    const reportDate = getPreviousKolkataDateString();
    const reportLogRef = db.collection('daily_admin_reports').doc(reportDate);
    const logSnap = await reportLogRef.get();

    if (logSnap.exists) {
      const data = logSnap.data();
      if (data?.status === 'SENT') {
        console.log(`[DailyReport Scheduler] Automated report for date ${reportDate} was already successfully SENT. Skipping.`);
        return;
      }
      if (data?.status === 'SENDING') {
        const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : 0;
        const diffMins = (Date.now() - startedAt) / 60000;
        if (diffMins < 15) {
          console.log(`[DailyReport Scheduler] Automated report for date ${reportDate} is currently SENDING (active lock since ${diffMins.toFixed(1)} mins ago). Skipping.`);
          return;
        } else {
          console.log(`[DailyReport Scheduler] Found stale SENDING lock for date ${reportDate} from ${diffMins.toFixed(1)} mins ago. Overriding lock.`);
        }
      }
    }

    console.log(`[DailyReport Scheduler] CRON Triggered: Dispatching automated morning report for date: ${reportDate} to ${config.adminEmails.length} recipient(s).`);
    const result = await generateAndSendDailyReport(db, reportDate, false, 'SYSTEM_SCHEDULER');
    console.log(`[DailyReport Scheduler] Report run completed for ${reportDate}. Result success: ${result.success}`);
  } catch (err: any) {
    if (err && err.message && err.message.includes('PERMISSION_DENIED')) {
      isSchedulerDisabled = true;
    } else {
      console.error('[DailyReport Scheduler] Error in automated scheduled check:', err);
    }
  } finally {
    isSchedulerExecuting = false;
  }
}

