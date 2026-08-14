import { AttendanceRecord } from '../../types/attendance';

const STORAGE_KEY = 'exfin_attendance_records_v1';
const MIGRATION_FLAG_KEY = 'exfin_unresolved_migration_v1_executed';

export interface MigrationReport {
  migratedCount: number;
  skippedCount: number;
  migratedDocIds: string[];
  skippedDocIds: string[];
  timestamp: string;
}

/**
 * Performs a safe, idempotent one-time migration of historical records
 * where 11:59 PM was generated solely as an automatic fallback with no valid exit.
 */
export const runSafeUnresolvedHistoricalMigration = (): MigrationReport => {
  const records = getStoredAttendanceRecords();
  if (!records || records.length === 0) {
    return { migratedCount: 0, skippedCount: 0, migratedDocIds: [], skippedDocIds: [], timestamp: new Date().toISOString() };
  }

  const todayStr = new Date().toISOString().split('T')[0];
  let hasChanges = false;
  const migratedDocIds: string[] = [];
  const skippedDocIds: string[] = [];

  const updatedRecords = records.map((record) => {
    // Check if already migrated or resolved
    if (record.checkoutStatus === 'UNRESOLVED' || record.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
      return record;
    }

    // Only inspect historical records strictly before today
    if (!record.date || record.date >= todayStr) {
      return record;
    }

    // Check if checkoutTime is 11:59 PM fallback
    const is1159PM = record.checkOutTime === '11:59 PM' || record.checkOutTime === '23:59';
    if (!is1159PM) {
      return record;
    }

    // Safety checks: do NOT migrate if:
    // 1. Manually or Admin rectified / corrected
    if (record.manualRectified || record.isAdminRectified || record.correctedAt || record.checkoutResolvedBy) {
      skippedDocIds.push(record.id || `${record.employeeId}_${record.date}`);
      return record;
    }

    // 2. Legit remote work (WFH / Client Visit / Outdoor Work legitimately settled)
    const attType = (record.attendanceType || 'OFFICE').toUpperCase();
    if (attType === 'WFH' || attType === 'CLIENT_VISIT' || attType === 'OUTDOOR') {
      skippedDocIds.push(record.id || `${record.employeeId}_${record.date}`);
      return record;
    }

    // 3. Valid exit candidate was actually recorded
    const hasValidExitTime = record.lastExitTime && record.lastExitTime !== '11:59 PM' && record.lastExitTime !== '23:59';
    const hasValidExit = record.exitTime && record.exitTime !== '11:59 PM' && record.exitTime !== '23:59';
    if (hasValidExitTime || hasValidExit) {
      skippedDocIds.push(record.id || `${record.employeeId}_${record.date}`);
      return record;
    }

    // Strong evidence of unverified fallback checkout:
    // Office shift with 11:59 PM checkout and NO valid exit event
    const previousTime = record.checkOutTime;
    const previousStatus = record.checkoutStatus || record.status || 'COMPLETED';

    const migratedRecord: AttendanceRecord = {
      ...record,
      checkOutTime: null,
      checkoutStatus: 'UNRESOLVED',
      status: 'UNRESOLVED',
      workingHours: null,
      previousCheckoutTime: previousTime,
      previousCheckoutStatus: previousStatus,
      resolutionReason: 'HISTORICAL_UNRESOLVED_CHECKOUT',
      migratedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: (record.version || 1) + 1,
      syncStatus: 'Pending',
    };

    hasChanges = true;
    migratedDocIds.push(record.id || `${record.employeeId}_${record.date}`);
    return migratedRecord;
  });

  if (hasChanges) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedRecords));
      localStorage.setItem(MIGRATION_FLAG_KEY, new Date().toISOString());
      console.log(`[Historical Migration] Safely migrated ${migratedDocIds.length} fallback records to UNRESOLVED.`);
    } catch (e) {
      console.error('[Historical Migration] Failed to persist migrated records:', e);
    }
  }

  return {
    migratedCount: migratedDocIds.length,
    skippedCount: skippedDocIds.length,
    migratedDocIds,
    skippedDocIds,
    timestamp: new Date().toISOString(),
  };
};

export const getStoredAttendanceRecords = (): AttendanceRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse local attendance records:', err);
    return [];
  }
};

export const saveAttendanceRecord = (record: AttendanceRecord): void => {
  try {
    const records = getStoredAttendanceRecords();
    const existingIndex = records.findIndex(
      (r) => r.id === record.id || (r.docId && r.docId === record.docId)
    );
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to save attendance record locally:', err);
  }
};

export const updateAttendanceRecord = (record: AttendanceRecord): void => {
  saveAttendanceRecord(record);
};

export const getTodayAttendanceRecord = (employeeId: string, dateStr: string): AttendanceRecord | null => {
  const records = getStoredAttendanceRecords();
  const targetDocId = `${employeeId}_${dateStr}`;
  return records.find((r) => r.docId === targetDocId || (r.employeeId === employeeId && r.date === dateStr)) || null;
};

export const getPendingAttendanceRecords = (): AttendanceRecord[] => {
  const records = getStoredAttendanceRecords();
  return records.filter((r) => r.syncStatus === 'Pending');
};

export const markRecordSyncedInLocal = (id: string, serverSyncTime: string): void => {
  try {
    const records = getStoredAttendanceRecords();
    const record = records.find((r) => r.id === id || r.docId === id);
    if (record) {
      record.syncStatus = 'Synced';
      record.serverSyncTime = serverSyncTime;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to mark record synced locally:', err);
  }
};

export const removePendingAttendanceRecord = (id: string): void => {
  try {
    const records = getStoredAttendanceRecords();
    const filtered = records.filter((r) => r.id !== id && r.docId !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to remove pending attendance record:', err);
  }
};
