import { AttendanceDiagnosticLog, AttendanceLogCategory, SyncStatus } from '../../types/attendance';

const LOG_STORAGE_KEY = 'exfin_attendance_logs_v1';
const MAX_LOG_ENTRIES = 200;

export const getAttendanceLogs = (): AttendanceDiagnosticLog[] => {
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('Failed to parse attendance logs:', err);
    return [];
  }
};

export const clearAttendanceLogs = (): void => {
  try {
    localStorage.removeItem(LOG_STORAGE_KEY);
  } catch (err) {
    console.warn('Failed to clear attendance logs:', err);
  }
};

export const logAttendanceEvent = (
  category: AttendanceLogCategory,
  employeeId: string,
  details: string,
  options?: {
    eventId?: string;
    eventTimestamp?: string;
    syncStatus?: SyncStatus | 'N/A';
    metadata?: Record<string, any>;
  }
): AttendanceDiagnosticLog => {
  const log: AttendanceDiagnosticLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    category,
    employeeId: employeeId || 'UNKNOWN',
    eventId: options?.eventId,
    eventTimestamp: options?.eventTimestamp || new Date().toISOString(),
    syncStatus: options?.syncStatus || 'N/A',
    details,
    metadata: options?.metadata ? sanitizeMetadata(options.metadata) : undefined
  };

  try {
    const logs = getAttendanceLogs();
    logs.unshift(log);
    if (logs.length > MAX_LOG_ENTRIES) {
      logs.length = MAX_LOG_ENTRIES;
    }
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
  } catch (err) {
    console.warn('Failed to save attendance log:', err);
  }

  // Console output for structured debugging
  console.log(`[EXFIN ATTENDANCE LOG] [${category}] [Emp: ${log.employeeId}] [Event: ${log.eventId || 'N/A'}] - ${details}`);

  return log;
};

function sanitizeMetadata(data: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== 'object') return {};
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('key')
    ) {
      cleaned[key] = '[REDACTED]';
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}
