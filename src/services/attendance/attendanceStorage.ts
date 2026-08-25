import { AttendanceRecord } from '../../types/attendance';
import { calculateWorkingHours } from './smartAttendanceEngine';
import { hasActualCheckIn, getEarliestCheckInTime, logAttendanceWriteDiagnostic } from '../../utils/attendanceUtils';

export const isAdminContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path.startsWith('/x7Kp9') || path.startsWith('/admin-portal');
};

export const getStorageKey = (): string => {
  return isAdminContext() ? 'exfin_admin_attendance_records_v1' : 'exfin_employee_attendance_records_v1';
};

// Safe, idempotent one-time migration of existing records from old shared key to isolated employee key
if (typeof window !== 'undefined') {
  try {
    const path = window.location.pathname;
    const isAdmin = path.startsWith('/x7Kp9') || path.startsWith('/admin-portal');
    if (!isAdmin) {
      const oldKey = 'exfin_attendance_records_v1';
      const newKey = 'exfin_employee_attendance_records_v1';
      const oldData = localStorage.getItem(oldKey);
      const newData = localStorage.getItem(newKey);
      
      if (oldData && !newData) {
        localStorage.setItem(newKey, oldData);
        console.log('[Migration] Successfully migrated existing local attendance records to employee namespace.');
      }
    }
  } catch (e) {
    console.error('[Migration] Failed to migrate local attendance records:', e);
  }
}

import { getFormattedDateStr } from './automaticAttendanceEngine';

const MIGRATION_FLAG_KEY = 'exfin_unresolved_migration_v1_executed';
const WORKING_HOURS_REPAIR_FLAG_KEY = 'exfin_working_hours_repair_v1_executed';

export interface MigrationReport {
  migratedCount: number;
  skippedCount: number;
  migratedDocIds: string[];
  skippedDocIds: string[];
  timestamp: string;
}

/**
 * Safe, idempotent repair for completed attendance records with stale workingHours strings.
 */
export const runSafeWorkingHoursNormalization = (): number => {
  const records = getStoredAttendanceRecords();
  if (!records || records.length === 0) return 0;
  
  let changedCount = 0;
  const updated = records.map((rec) => {
    if (rec.checkoutStatus === 'UNRESOLVED' || rec.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
      if (rec.workingHours !== null) {
        changedCount++;
        return { ...rec, workingHours: null };
      }
      return rec;
    }
    
    if (
      rec.checkInTime &&
      rec.checkOutTime &&
      rec.checkOutTime !== '--:--' &&
      rec.checkOutTime !== 'Pending' &&
      rec.checkOutTime !== 'N/A' &&
      rec.checkOutTime !== 'UNRESOLVED'
    ) {
      const calculated = calculateWorkingHours(rec.checkInTime, rec.checkOutTime);
      if (rec.workingHours !== calculated) {
        changedCount++;
        return { ...rec, workingHours: calculated };
      }
    }
    return rec;
  });
  
  if (changedCount > 0) {
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(updated));
      localStorage.setItem(WORKING_HOURS_REPAIR_FLAG_KEY, new Date().toISOString());
      console.log(`[WORKING_HOURS_REPAIR] Safely normalized ${changedCount} attendance records with authoritative working hours.`);
    } catch (e) {
      console.error('[WORKING_HOURS_REPAIR] Failed to persist repaired records:', e);
    }
  }
  return changedCount;
};

/**
 * Performs a safe, idempotent one-time migration of historical records
 * where 11:59 PM was generated solely as an automatic fallback with no valid exit.
 */
export const runSafeUnresolvedHistoricalMigration = (): MigrationReport => {
  const records = getStoredAttendanceRecords();
  if (!records || records.length === 0) {
    return { migratedCount: 0, skippedCount: 0, migratedDocIds: [], skippedDocIds: [], timestamp: new Date().toISOString() };
  }

  const todayStr = getFormattedDateStr();
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
      localStorage.setItem(getStorageKey(), JSON.stringify(updatedRecords));
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

let cachedRecordsMemory: { [key: string]: AttendanceRecord[] } = {};

export const getStoredAttendanceRecords = (): AttendanceRecord[] => {
  const key = getStorageKey();
  if (cachedRecordsMemory[key]) {
    return cachedRecordsMemory[key];
  }
  try {
    const data = localStorage.getItem(key);
    cachedRecordsMemory[key] = data ? JSON.parse(data) : [];
    return cachedRecordsMemory[key];
  } catch (err) {
    console.error('Failed to parse local attendance records:', err);
    return [];
  }
};

const processSingleRecordInMemory = (records: AttendanceRecord[], record: AttendanceRecord): boolean => {
  const cleanEmpId = (record.employeeId || (record as any).employeeCode || '').trim().toLowerCase();
  const existingIndex = records.findIndex((r) => {
    if (!r) return false;
    if (record.id && r.id === record.id) return true;
    if (record.docId && r.docId && r.docId === record.docId) return true;
    
    const rEmpId = (r.employeeId || (r as any).employeeCode || '').trim().toLowerCase();
    if (cleanEmpId && rEmpId && cleanEmpId === rEmpId && r.date === record.date) {
      return true;
    }
    return false;
  });

  if (existingIndex >= 0) {
    const existingRecord = records[existingIndex];

    // WRITE-ONCE RULE FOR CHECK-IN TIME:
    // If the existing record has a valid check-in time, preserve it!
    // Do not allow ANY normal operational update to overwrite an already recorded check-in time.
    const isExplicitAdminCorrection = record.isAdminRectified || record.manualRectified;
    if (hasActualCheckIn(existingRecord) && !isExplicitAdminCorrection) {
      const earliestIn = getEarliestCheckInTime(existingRecord.checkInTime, record.checkInTime) || existingRecord.checkInTime;
      record.checkInTime = earliestIn;
      record.createdAtDeviceTime = existingRecord.createdAtDeviceTime || record.createdAtDeviceTime;
      record.checkInLatitude = existingRecord.checkInLatitude ?? record.checkInLatitude;
      record.checkInLongitude = existingRecord.checkInLongitude ?? record.checkInLongitude;
      record.checkInDistance = existingRecord.checkInDistance ?? record.checkInDistance;
      record.checkInTownCity = existingRecord.checkInTownCity || record.checkInTownCity;
      record.checkInMode = existingRecord.checkInMode || record.checkInMode;
    }

    // AUTHORITATIVE GEOFENCE EXIT TIME PRESERVATION:
    // If existingRecord has a valid geofenceExitTimestamp/geofenceExitTime, preserve the earliest exit time!
    if (!isExplicitAdminCorrection && record.currentState !== 'RETURNING_TO_OFFICE') {
      const existingExitMs = existingRecord.geofenceExitTimestamp ? new Date(existingRecord.geofenceExitTimestamp).getTime() : Infinity;
      const incomingExitMs = record.geofenceExitTimestamp ? new Date(record.geofenceExitTimestamp).getTime() : Infinity;

      if (existingExitMs < incomingExitMs && existingRecord.geofenceExitTime) {
        record.geofenceExitTime = existingRecord.geofenceExitTime;
        record.geofenceExitTimestamp = existingRecord.geofenceExitTimestamp;
        record.lastExitTime = existingRecord.lastExitTime || existingRecord.geofenceExitTime;
        record.exitTime = existingRecord.exitTime || existingRecord.geofenceExitTime;
      } else if (existingRecord.geofenceExitTime && !record.geofenceExitTime) {
        record.geofenceExitTime = existingRecord.geofenceExitTime;
        record.geofenceExitTimestamp = existingRecord.geofenceExitTimestamp;
        record.lastExitTime = existingRecord.lastExitTime || existingRecord.geofenceExitTime;
        record.exitTime = existingRecord.exitTime || existingRecord.geofenceExitTime;
      }
    }

    // Authoritatively calculate workingHours when valid check-in and check-out exist
    if (record.checkoutStatus === 'UNRESOLVED' || record.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
      record.workingHours = null;
    } else if (
      record.checkInTime &&
      record.checkOutTime &&
      record.checkOutTime !== '--:--' &&
      record.checkOutTime !== 'Pending' &&
      record.checkOutTime !== 'N/A' &&
      record.checkOutTime !== 'UNRESOLVED'
    ) {
      record.workingHours = calculateWorkingHours(record.checkInTime, record.checkOutTime);
    }

    records[existingIndex] = record;
  } else {
    // Authoritatively calculate workingHours for new records
    if (record.checkoutStatus === 'UNRESOLVED' || record.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
      record.workingHours = null;
    } else if (
      record.checkInTime &&
      record.checkOutTime &&
      record.checkOutTime !== '--:--' &&
      record.checkOutTime !== 'Pending' &&
      record.checkOutTime !== 'N/A' &&
      record.checkOutTime !== 'UNRESOLVED'
    ) {
      record.workingHours = calculateWorkingHours(record.checkInTime, record.checkOutTime);
    }

    records.unshift(record);
  }

  return existingIndex >= 0;
};

export const saveAttendanceRecord = (record: AttendanceRecord): void => {
  try {
    const records = getStoredAttendanceRecords();
    const isUpdate = processSingleRecordInMemory(records, record);
    cachedRecordsMemory[getStorageKey()] = records;
    localStorage.setItem(getStorageKey(), JSON.stringify(records));

    logAttendanceWriteDiagnostic(
      record.isAdminRectified || record.manualRectified ? 'ADMIN_ATTENDANCE_CORRECTION' : ((record as any).source || record.checkInMode || 'LocalStorage'),
      record.employeeId,
      record.checkInTime,
      isUpdate ? 'LOCAL_STORAGE_UPDATE' : 'LOCAL_STORAGE_CREATE'
    );
  } catch (err) {
    console.error('Failed to save attendance record locally:', err);
  }
};

export const saveMultipleAttendanceRecords = (newRecords: AttendanceRecord[]): void => {
  if (!newRecords || newRecords.length === 0) return;
  try {
    const records = getStoredAttendanceRecords();
    newRecords.forEach((rec) => {
      processSingleRecordInMemory(records, rec);
    });
    cachedRecordsMemory[getStorageKey()] = records;
    localStorage.setItem(getStorageKey(), JSON.stringify(records));
  } catch (err) {
    console.error('Failed to save multiple attendance records locally:', err);
  }
};

export const updateAttendanceRecord = (record: AttendanceRecord): void => {
  saveAttendanceRecord(record);
};

export const getTodayAttendanceRecord = (employeeId: string, dateStr: string): AttendanceRecord | null => {
  if (!employeeId || !dateStr) return null;
  const records = getStoredAttendanceRecords();
  const cleanEmpId = employeeId.trim().toLowerCase();
  const targetDocId = `${employeeId}_${dateStr}`.toLowerCase();

  return records.find((r) => {
    if (!r || !r.date || r.date !== dateStr) return false;
    const rDocId = (r.docId || '').trim().toLowerCase();
    const rEmpId = (r.employeeId || (r as any).employeeCode || r.id || '').trim().toLowerCase();
    return rDocId === targetDocId || rEmpId === cleanEmpId;
  }) || null;
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
      localStorage.setItem(getStorageKey(), JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to mark record synced locally:', err);
  }
};

export const removePendingAttendanceRecord = (id: string): void => {
  try {
    const records = getStoredAttendanceRecords();
    const filtered = records.filter((r) => r.id !== id && r.docId !== id);
    localStorage.setItem(getStorageKey(), JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to remove pending attendance record:', err);
  }
};
