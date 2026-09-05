import { AttendanceRecord } from '../../types/attendance';
import { calculateWorkingHours } from './smartAttendanceEngine';
import { hasActualCheckIn, getEarliestCheckInTime, logAttendanceWriteDiagnostic, getAttendanceCanonicalKey } from '../../utils/attendanceUtils';

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

import { getFormattedDateStr, parseAttendanceTimeToMinutes } from './automaticAttendanceEngine';

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

export const getAllStoredAttendanceRecords = (): AttendanceRecord[] => {
  if (typeof window === 'undefined') return [];
  const keys = ['exfin_employee_attendance_records_v1', 'exfin_admin_attendance_records_v1', 'exfin_attendance_records_v1'];
  const recordMap = new Map<string, AttendanceRecord>();

  keys.forEach((storageKey) => {
    try {
      const data = localStorage.getItem(storageKey);
      if (data) {
        const parsed: AttendanceRecord[] = JSON.parse(data);
        if (Array.isArray(parsed)) {
          parsed.forEach((rec) => {
            if (!rec) return;
            const canonicalKey = getAttendanceCanonicalKey(rec);
            if (!canonicalKey) return;

            const existing = recordMap.get(canonicalKey);
            if (!existing) {
              recordMap.set(canonicalKey, rec);
            } else {
              // Merge cleanly, preserving check-ins and check-outs
              const hasRecCheckIn = hasActualCheckIn(rec);
              const hasExistingCheckIn = hasActualCheckIn(existing);

              if (hasRecCheckIn && !hasExistingCheckIn) {
                recordMap.set(canonicalKey, { ...existing, ...rec });
              } else if (rec.checkOutTime && !existing.checkOutTime) {
                recordMap.set(canonicalKey, { ...existing, ...rec });
              } else {
                recordMap.set(canonicalKey, { ...existing, ...rec });
              }
            }
          });
        }
      }
    } catch (e) {
      console.warn(`[getAllStoredAttendanceRecords] Error reading key ${storageKey}:`, e);
    }
  });

  return Array.from(recordMap.values());
};

export const getStoredAttendanceRecords = (): AttendanceRecord[] => {
  return getAllStoredAttendanceRecords();
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

    // AUTHORITATIVE GEOFENCE EXIT TIME PRESERVATION (EPISODE-SCOPED):
    // Preserve earliest exit time only within the same active exit episode (do not restore if CHECKED_IN or RETURNING_TO_OFFICE).
    if (!isExplicitAdminCorrection && record.currentState !== 'RETURNING_TO_OFFICE' && record.currentState !== 'CHECKED_IN') {
      const returnTimeStr = record.returnTime || existingRecord.returnTime;
      const returnMins = returnTimeStr ? parseAttendanceTimeToMinutes(returnTimeStr) : null;
      const existingExitMins = existingRecord.geofenceExitTime ? parseAttendanceTimeToMinutes(existingRecord.geofenceExitTime) : null;
      const isExistingSameEpisode = !(returnMins !== null && existingExitMins !== null && existingExitMins <= returnMins);

      if (isExistingSameEpisode) {
        const existingExitMs = existingRecord.geofenceExitTimestamp ? new Date(existingRecord.geofenceExitTimestamp).getTime() : Infinity;
        const incomingExitMs = record.geofenceExitTimestamp ? new Date(record.geofenceExitTimestamp).getTime() : Infinity;

        if (existingExitMs < incomingExitMs && existingRecord.geofenceExitTime) {
          record.geofenceExitTime = existingRecord.geofenceExitTime;
          record.geofenceExitTimestamp = existingRecord.geofenceExitTimestamp;
          record.recordedExitTime = existingRecord.recordedExitTime || existingRecord.geofenceExitTime;
          record.exitDetectedAt = existingRecord.exitDetectedAt || existingRecord.geofenceExitTimestamp;
          record.exitDetectedTime = existingRecord.exitDetectedTime || existingRecord.geofenceExitTime;
          record.exitDetectionSource = existingRecord.exitDetectionSource || 'NATIVE_GEOFENCE';
          record.lastExitTime = existingRecord.lastExitTime || existingRecord.geofenceExitTime;
          record.exitTime = existingRecord.exitTime || existingRecord.geofenceExitTime;
        } else if (existingRecord.geofenceExitTime && !record.geofenceExitTime) {
          record.geofenceExitTime = existingRecord.geofenceExitTime;
          record.geofenceExitTimestamp = existingRecord.geofenceExitTimestamp;
          record.recordedExitTime = existingRecord.recordedExitTime || existingRecord.geofenceExitTime;
          record.exitDetectedAt = existingRecord.exitDetectedAt || existingRecord.geofenceExitTimestamp;
          record.exitDetectedTime = existingRecord.exitDetectedTime || existingRecord.geofenceExitTime;
          record.exitDetectionSource = existingRecord.exitDetectionSource || 'NATIVE_GEOFENCE';
          record.lastExitTime = existingRecord.lastExitTime || existingRecord.geofenceExitTime;
          record.exitTime = existingRecord.exitTime || existingRecord.geofenceExitTime;
        }
      }
    }

    // DEFENSIVE ADMIN-AUTHORITATIVE CHECKOUT PRESERVATION (LOCAL STORAGE):
    // STEP 2 & 3: Never allow local background/operational updates to downgrade an Admin-rectified record to UNRESOLVED
    const hasAdminCorrectionInExisting = Array.isArray(existingRecord.correctionHistory) && existingRecord.correctionHistory.some((c: any) => {
      const by = String(c?.correctedBy || c?.correctedByRole || '').toLowerCase();
      return by.includes('admin') || !!(c && c.correctedCheckOut && c.correctedCheckOut !== 'UNRESOLVED' && c.correctedCheckOut !== '--:--');
    });

    const isExistingCheckoutProtected = !!(
      existingRecord.isAdminRectified ||
      existingRecord.manualRectified ||
      existingRecord.checkoutFinalized === true ||
      existingRecord.checkoutStatus === 'COMPLETED' ||
      existingRecord.checkoutStatus === 'FINALIZED' ||
      existingRecord.attendanceStatus === 'RESOLVED' ||
      existingRecord.status === 'completed' ||
      existingRecord.checkoutResolvedBy ||
      existingRecord.checkoutResolvedAt ||
      existingRecord.resolutionSource === 'ADMIN_CORRECTION' ||
      existingRecord.resolutionSource === 'ADMIN_APPROVED_PROPOSAL' ||
      hasAdminCorrectionInExisting
    );

    if (isExistingCheckoutProtected && !isExplicitAdminCorrection) {
      let recoveredCheckOutTime = existingRecord.checkOutTime;
      if (
        (!recoveredCheckOutTime || recoveredCheckOutTime === 'UNRESOLVED' || recoveredCheckOutTime === '--:--' || recoveredCheckOutTime === 'Pending' || recoveredCheckOutTime === 'N/A') &&
        Array.isArray(existingRecord.correctionHistory)
      ) {
        const latestCorrection = [...existingRecord.correctionHistory].reverse().find(
          (c: any) => c && c.correctedCheckOut && c.correctedCheckOut !== 'UNRESOLVED' && c.correctedCheckOut !== '--:--'
        );
        if (latestCorrection && latestCorrection.correctedCheckOut) {
          recoveredCheckOutTime = latestCorrection.correctedCheckOut;
        }
      }
      if (
        (!recoveredCheckOutTime || recoveredCheckOutTime === 'UNRESOLVED' || recoveredCheckOutTime === '--:--' || recoveredCheckOutTime === 'Pending' || recoveredCheckOutTime === 'N/A') &&
        Array.isArray(record.correctionHistory)
      ) {
        const latestCorrection = [...record.correctionHistory].reverse().find(
          (c: any) => c && c.correctedCheckOut && c.correctedCheckOut !== 'UNRESOLVED' && c.correctedCheckOut !== '--:--'
        );
        if (latestCorrection && latestCorrection.correctedCheckOut) {
          recoveredCheckOutTime = latestCorrection.correctedCheckOut;
        }
      }
      if (
        !recoveredCheckOutTime || recoveredCheckOutTime === 'UNRESOLVED' || recoveredCheckOutTime === '--:--' || recoveredCheckOutTime === 'Pending' || recoveredCheckOutTime === 'N/A'
      ) {
        const prop = (existingRecord.employeeProposedCheckoutTime || existingRecord.employeeProvidedCheckoutTime || record.employeeProposedCheckoutTime || record.employeeProvidedCheckoutTime || '').trim();
        if (prop && prop !== 'UNRESOLVED' && prop !== '--:--' && prop !== 'Pending' && prop !== 'N/A') {
          recoveredCheckOutTime = prop;
        }
      }

      if (recoveredCheckOutTime && recoveredCheckOutTime !== 'UNRESOLVED' && recoveredCheckOutTime !== '--:--') {
        record.checkOutTime = recoveredCheckOutTime;
        record.checkoutStatus = 'COMPLETED';
        record.status = existingRecord.status && existingRecord.status !== 'UNRESOLVED' ? existingRecord.status : 'completed';
        record.attendanceStatus = 'RESOLVED';
        record.isAdminRectified = true;
        record.manualRectified = true;
        record.checkoutFinalized = true;
        record.checkoutResolvedBy = existingRecord.checkoutResolvedBy || 'admin';
        record.checkoutResolvedAt = existingRecord.checkoutResolvedAt || (existingRecord.correctionHistory?.[0] as any)?.correctedAt || existingRecord.updatedAt || new Date().toISOString();
        record.correctionHistory = existingRecord.correctionHistory || record.correctionHistory;
        record.workingHours = existingRecord.workingHours || calculateWorkingHours(record.checkInTime, record.checkOutTime);
        record.currentState = 'CHECKED_OUT';
        record.pendingCheckoutConfirmation = false;
        if (record.syncStatus === 'Pending' && record.checkoutStatus === 'COMPLETED') {
          record.syncStatus = 'Synced';
        }
      } else {
        record.isAdminRectified = existingRecord.isAdminRectified ?? true;
        record.manualRectified = existingRecord.manualRectified ?? true;
        record.checkoutResolvedBy = existingRecord.checkoutResolvedBy || 'admin';
        record.checkoutResolvedAt = existingRecord.checkoutResolvedAt || existingRecord.updatedAt;
        record.correctionHistory = existingRecord.correctionHistory || record.correctionHistory;
        if (existingRecord.checkoutStatus && existingRecord.checkoutStatus !== 'UNRESOLVED') {
          record.checkoutStatus = existingRecord.checkoutStatus;
        }
        if (existingRecord.status && existingRecord.status !== 'UNRESOLVED') {
          record.status = existingRecord.status;
        }
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

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
    }

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

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
    }
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
    const keys = ['exfin_employee_attendance_records_v1', 'exfin_admin_attendance_records_v1', 'exfin_attendance_records_v1'];
    keys.forEach((k) => {
      const data = localStorage.getItem(k);
      if (data) {
        const records: AttendanceRecord[] = JSON.parse(data);
        if (Array.isArray(records)) {
          let updated = false;
          records.forEach((r) => {
            if (r.id === id || r.docId === id) {
              r.syncStatus = 'Synced';
              r.serverSyncTime = serverSyncTime;
              updated = true;
            }
          });
          if (updated) {
            localStorage.setItem(k, JSON.stringify(records));
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to mark record synced locally:', err);
  }
};

export const removePendingAttendanceRecord = (id: string): void => {
  try {
    const keys = ['exfin_employee_attendance_records_v1', 'exfin_admin_attendance_records_v1', 'exfin_attendance_records_v1'];
    keys.forEach((k) => {
      const data = localStorage.getItem(k);
      if (data) {
        const records: AttendanceRecord[] = JSON.parse(data);
        if (Array.isArray(records)) {
          const filtered = records.filter((r) => r.id !== id && r.docId !== id);
          localStorage.setItem(k, JSON.stringify(filtered));
        }
      }
    });
  } catch (err) {
    console.error('Failed to remove pending attendance record:', err);
  }
};
