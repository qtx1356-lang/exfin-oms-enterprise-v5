import { API_BASE_URL } from '@/src/utils/apiConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AttendanceRecord } from '../../types/attendance';
import { hasActualCheckIn, getEarliestCheckInTime, logAttendanceWriteDiagnostic, isAdminContextActive } from '../../utils/attendanceUtils';
import {
  getPendingAttendanceRecords,
  markRecordSyncedInLocal,
  saveAttendanceRecord
} from './attendanceStorage';
import { parseAttendanceTimeToMinutes } from './automaticAttendanceEngine';
import { calculateWorkingHours } from './smartAttendanceEngine';
import { 
  getPendingEventsFromQueue, 
  markEventSyncedInQueue 
} from './attendanceEventQueue';
import { logAttendanceEvent } from './attendanceLogger';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';
import {
  logSyncStart,
  logSyncLocalUpdate,
  logSyncServerWrite,
  logSyncServerConfirm,
  logSyncComplete,
} from '../sync/syncPerformanceLogger';
import {
  trackResourceCreated,
  trackResourceCleaned,
  setSyncRunningState,
  logPerfSyncEvent
} from '../monitoring/performanceDiagnostics';

let isAttendanceSyncInProgress = false;

function sanitizeFirestorePayload<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        clean[key] = sanitizeFirestorePayload(value);
      } else {
        clean[key] = value;
      }
    }
  }
  return clean as T;
}

/**
 * Checks whether an existing server attendance record is Admin-authoritative.
 * An Admin-authoritative server document must NEVER be downgraded, altered, or reverted
 * by employee background synchronization or employee-proposed checkout submissions.
 */
function isServerRecordAdminAuthoritative(serverData: any): boolean {
  if (!serverData || typeof serverData !== 'object') return false;

  // 1. serverData.isAdminRectified === true
  if (serverData.isAdminRectified === true) return true;

  // 2. serverData.manualRectified === true
  if (serverData.manualRectified === true) return true;

  // 3. serverData.checkoutResolvedBy represents an Admin/Super-Admin correction
  const resolvedBy = String(serverData.checkoutResolvedBy || '').toLowerCase();
  if (
    resolvedBy.includes('admin') ||
    resolvedBy.includes('super-admin') ||
    resolvedBy.includes('super_admin') ||
    resolvedBy === 'manager' ||
    resolvedBy === 'system_admin'
  ) {
    return true;
  }

  // 4. serverData.checkoutStatus === 'COMPLETED'
  if (serverData.checkoutStatus === 'COMPLETED') return true;

  // 5. serverData.checkoutStatus === 'FINALIZED'
  if (serverData.checkoutStatus === 'FINALIZED') return true;

  // 6. serverData.checkoutFinalized === true
  if (serverData.checkoutFinalized === true) return true;

  // 7. serverData.currentState === 'CHECKED_OUT'
  if (serverData.currentState === 'CHECKED_OUT') return true;

  // 8 & 9. serverData.correctionHistory contains a valid Admin/Super-Admin correction entry
  // OR correctionSource such as 'Admin Dashboard Portal'
  if (Array.isArray(serverData.correctionHistory) && serverData.correctionHistory.length > 0) {
    const hasAdminCorrection = serverData.correctionHistory.some((c: any) => {
      if (!c || typeof c !== 'object') return false;
      const by = String(c.correctedBy || c.correctedByRole || '').toLowerCase();
      const source = String(c.correctionSource || '').toLowerCase();
      if (
        source.includes('admin') ||
        source.includes('dashboard portal') ||
        source === 'admin dashboard portal'
      ) {
        return true;
      }
      if (
        by.includes('admin') ||
        by.includes('super-admin') ||
        by.includes('super_admin') ||
        by === 'manager' ||
        by === 'system_admin'
      ) {
        return true;
      }
      if (
        c.correctedCheckOut &&
        typeof c.correctedCheckOut === 'string' &&
        c.correctedCheckOut !== 'UNRESOLVED' &&
        c.correctedCheckOut !== '--:--' &&
        c.correctedCheckOut !== 'Pending' &&
        c.correctedCheckOut !== 'N/A'
      ) {
        return true;
      }
      return false;
    });
    if (hasAdminCorrection) return true;
  }

  return false;
}

/**
 * Extracts the most recent valid Admin/Super-Admin correction entry from correctionHistory.
 */
function findLatestAdminCorrection(history: any[]): any | null {
  if (!Array.isArray(history) || history.length === 0) return null;
  // Inspect in reverse order (newest first)
  for (let i = history.length - 1; i >= 0; i--) {
    const c = history[i];
    if (!c || typeof c !== 'object') continue;
    const time = c.correctedCheckOut;
    if (
      time &&
      typeof time === 'string' &&
      time.trim() !== '' &&
      time !== 'UNRESOLVED' &&
      time !== '--:--' &&
      time !== 'Pending' &&
      time !== 'N/A'
    ) {
      return c;
    }
  }
  return null;
}

export const syncPendingAttendanceRecords = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  const activeDb = db.concrete || db;

  if (!navigator.onLine) {
    console.log('Sync Engine: Device is offline. Changes saved locally.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (isAttendanceSyncInProgress) {
    console.log('Sync Engine: Attendance sync already running, skipping overlapping execution.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!activeDb) {
    console.warn('Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  isAttendanceSyncInProgress = true;
  setSyncRunningState(true);
  let syncedCount = 0;
  let errorsCount = 0;

  try {

  // 1. Sync Pending Events Queue first
  const pendingEvents = getPendingEventsFromQueue();
  if (pendingEvents.length > 0) {
    logAttendanceEvent('SYNC_STARTED', 'SYSTEM', `Syncing ${pendingEvents.length} queued attendance events to Firestore...`);
    for (const evt of pendingEvents) {
      try {
        logSyncStart('AttendanceEvent', evt.eventId);
        logSyncLocalUpdate('AttendanceEvent', evt.eventId);
        logSyncServerWrite('AttendanceEvent', evt.eventId);

        const evtRef = doc(activeDb, 'attendance_events', evt.eventId);
        await setDoc(evtRef, sanitizeFirestorePayload({
          ...evt,
          syncStatus: 'Synced',
          syncedAt: new Date().toISOString(),
          serverSyncTime: serverTimestamp()
        }), { merge: true });

        logSyncServerConfirm('AttendanceEvent', evt.eventId);
        markEventSyncedInQueue(evt.eventId);
        logSyncComplete('AttendanceEvent', evt.eventId);
      } catch (err: any) {
        logAttendanceEvent('SYNC_FAILED', evt.employeeId, `Failed to sync event ${evt.eventId}: ${err?.message}`);
      }
    }
  }

  // 2. Sync Pending Attendance Records
  const pendingRecords = getPendingAttendanceRecords();
  if (pendingRecords.length === 0) {
    return { syncedCount, errorsCount };
  }

  console.log(`Sync Engine: Found ${pendingRecords.length} pending attendance records to sync.`);

  for (const record of pendingRecords) {
    // Security check: Verify employee is authorized and approved before writing to Firestore
    let isApproved = true;
    try {
      const rawReg = typeof localStorage !== 'undefined' ? localStorage.getItem('cached_registration_data') : null;
      if (rawReg) {
        const parsed = JSON.parse(rawReg);
        if (parsed.status && parsed.status !== 'Approved') {
          isApproved = false;
        }
      }
    } catch (e) {}

    if (!isApproved) {
      console.warn(`[SyncEngine] Blocked sync for unapproved/suspended employee record: ${record.employeeId}`);
      continue;
    }

    let attempt = 0;
    let success = false;
    const maxAttempts = 3;

    logSyncStart('Attendance', record.id);
    logSyncLocalUpdate('Attendance', record.id);

    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        const documentKey = record.docId || `${record.employeeId}_${record.date}` || record.id;
        const docRef = doc(activeDb, 'attendance', documentKey);
        const localServerSyncTime = new Date().toISOString();

        logSyncServerWrite('Attendance', record.id);

        // DEFENSIVE CHECK-IN PRESERVATION:
        // Before writing, if Firestore already has a valid check-in time and this is not an explicit admin correction,
        // protect and retain the existing server check-in time and check-in origin details.
        let finalCheckInTime = record.checkInTime;
        let finalCreatedAtDeviceTime = record.createdAtDeviceTime;
        let finalCheckInLatitude = record.checkInLatitude;
        let finalCheckInLongitude = record.checkInLongitude;
        let finalCheckInDistance = record.checkInDistance;
        let finalCheckInTownCity = record.checkInTownCity;
        let finalCheckInMode = record.checkInMode;

        const isExplicitAdminCorrection = (record.isAdminRectified || record.manualRectified) && isAdminContextActive();
        let finalGeofenceExitTime = record.geofenceExitTime;
        let finalGeofenceExitTimestamp = record.geofenceExitTimestamp;
        let finalLastExitTime = record.lastExitTime;
        let finalExitTime = record.exitTime;

        let finalRecordedExitTime = record.recordedExitTime;
        let finalExitDetectedAt = record.exitDetectedAt;
        let finalExitDetectionSource = record.exitDetectionSource;

        let finalCheckOutTime = record.checkOutTime;
        let finalCheckoutStatus = record.checkoutStatus;
        let finalStatus = record.status;
        let finalWorkingHours = record.workingHours;
        let finalIsAdminRectified = record.isAdminRectified;
        let finalManualRectified = record.manualRectified;
        let finalCheckoutResolvedBy = record.checkoutResolvedBy;
        let finalCheckoutResolvedAt = record.checkoutResolvedAt;
        let finalCorrectionHistory = record.correctionHistory;
        let finalCheckoutType = record.checkoutType;
        let finalResolutionSource = record.resolutionSource;
        let finalCheckoutFinalizationSource = record.checkoutFinalizationSource;
        let finalReason = record.reason;
        let isRecordProtectedByAdmin = false;
        let serverData: any = null;

        if (!isExplicitAdminCorrection) {
          try {
            const serverSnap = await getDoc(docRef);
            if (serverSnap.exists()) {
              serverData = serverSnap.data();
              if (hasActualCheckIn(serverData)) {
                const earliest = getEarliestCheckInTime(serverData.checkInTime, finalCheckInTime) || serverData.checkInTime;
                finalCheckInTime = earliest;
                finalCreatedAtDeviceTime = serverData.createdAtDeviceTime || finalCreatedAtDeviceTime;
                finalCheckInLatitude = serverData.checkInLatitude ?? finalCheckInLatitude;
                finalCheckInLongitude = serverData.checkInLongitude ?? finalCheckInLongitude;
                finalCheckInDistance = serverData.checkInDistance ?? finalCheckInDistance;
                finalCheckInTownCity = serverData.checkInTownCity || finalCheckInTownCity;
                finalCheckInMode = serverData.checkInMode || finalCheckInMode;
              }

              // Preserve authoritative earlier geofenceExitTime from server ONLY within the same active exit episode
              if (
                serverData.geofenceExitTimestamp &&
                record.currentState !== 'RETURNING_TO_OFFICE' &&
                record.currentState !== 'CHECKED_IN'
              ) {
                const returnTimeStr = record.returnTime || serverData.returnTime;
                const returnMins = returnTimeStr ? parseAttendanceTimeToMinutes(returnTimeStr) : null;
                const serverExitMins = serverData.geofenceExitTime ? parseAttendanceTimeToMinutes(serverData.geofenceExitTime) : null;
                const isServerSameEpisode = serverData.currentState !== 'CHECKED_IN' &&
                  !(returnMins !== null && serverExitMins !== null && serverExitMins <= returnMins);

                if (isServerSameEpisode) {
                  const serverExitMs = new Date(serverData.geofenceExitTimestamp).getTime();
                  const localExitMs = record.geofenceExitTimestamp ? new Date(record.geofenceExitTimestamp).getTime() : Infinity;
                  if (serverExitMs < localExitMs && serverData.geofenceExitTime) {
                    finalGeofenceExitTime = serverData.geofenceExitTime;
                    finalGeofenceExitTimestamp = serverData.geofenceExitTimestamp;
                    finalRecordedExitTime = serverData.recordedExitTime || serverData.geofenceExitTime;
                    finalExitDetectedAt = serverData.exitDetectedAt || serverData.geofenceExitTimestamp;
                    finalExitDetectionSource = serverData.exitDetectionSource || 'NATIVE_GEOFENCE';
                    finalLastExitTime = serverData.lastExitTime || serverData.geofenceExitTime;
                    finalExitTime = serverData.exitTime || serverData.geofenceExitTime;
                  }
                }
              }

              // REQUIRED SERVER-AUTHORITY RULE:
              // Treat a server attendance record as ADMIN-AUTHORITATIVE when ANY of the 9 conditions is true.
              const isServerAdminAuth = isServerRecordAdminAuthoritative(serverData);

              if (isServerAdminAuth) {
                isRecordProtectedByAdmin = true;

                // CORRECTION HISTORY RECOVERY:
                // If serverData is Admin-authoritative, inspect correctionHistory for most recent valid Admin/Super-Admin correction
                const latestCorrection =
                  findLatestAdminCorrection(serverData.correctionHistory) ||
                  findLatestAdminCorrection(record.correctionHistory);

                const serverCheckOutTime = serverData.checkOutTime;
                const isServerCheckOutValid =
                  serverCheckOutTime &&
                  typeof serverCheckOutTime === 'string' &&
                  serverCheckOutTime.trim() !== '' &&
                  serverCheckOutTime !== 'UNRESOLVED' &&
                  serverCheckOutTime !== '--:--' &&
                  serverCheckOutTime !== 'Pending' &&
                  serverCheckOutTime !== 'N/A';

                const isServerProposed =
                  serverData.resolutionSource === 'EMPLOYEE_PROPOSED' ||
                  (serverData.employeeProposedCheckoutTime && serverData.checkOutTime === serverData.employeeProposedCheckoutTime) ||
                  (serverData.employeeProvidedCheckoutTime && serverData.checkOutTime === serverData.employeeProvidedCheckoutTime);

                let authoritativeCheckOutTime: string | null = null;
                if (latestCorrection?.correctedCheckOut) {
                  authoritativeCheckOutTime = latestCorrection.correctedCheckOut;
                } else if (isServerCheckOutValid && !isServerProposed) {
                  authoritativeCheckOutTime = serverCheckOutTime;
                } else if (isServerCheckOutValid) {
                  authoritativeCheckOutTime = serverCheckOutTime;
                }

                if (!authoritativeCheckOutTime && (serverData.employeeProposedCheckoutTime || serverData.employeeProvidedCheckoutTime)) {
                  const prop = (serverData.employeeProposedCheckoutTime || serverData.employeeProvidedCheckoutTime || '').trim();
                  if (prop && prop !== 'UNRESOLVED' && prop !== '--:--' && prop !== 'Pending' && prop !== 'N/A') {
                    authoritativeCheckOutTime = prop;
                  }
                }

                if (authoritativeCheckOutTime) {
                  finalCheckOutTime = authoritativeCheckOutTime;
                }

                // Protect checkout status & status: Authoritatively COMPLETED & completed / RESOLVED
                finalCheckoutStatus = 'COMPLETED';
                finalStatus = (serverData.status && serverData.status !== 'UNRESOLVED') ? serverData.status : 'completed';

                // Protect/Recover workingHours
                if (serverData.workingHours !== undefined && serverData.workingHours !== null && serverData.workingHours !== '') {
                  finalWorkingHours = serverData.workingHours;
                } else if (finalCheckInTime && finalCheckOutTime) {
                  finalWorkingHours = calculateWorkingHours(finalCheckInTime, finalCheckOutTime);
                }

                finalIsAdminRectified = true;
                finalManualRectified = true;
                finalCheckoutResolvedBy = serverData.checkoutResolvedBy || latestCorrection?.correctedBy || 'admin';
                finalCheckoutResolvedAt = serverData.checkoutResolvedAt || latestCorrection?.correctedAt || serverData.updatedAt || new Date().toISOString();
                finalCorrectionHistory = Array.isArray(serverData.correctionHistory) && serverData.correctionHistory.length > 0
                  ? serverData.correctionHistory
                  : (Array.isArray(record.correctionHistory) && record.correctionHistory.length > 0 ? record.correctionHistory : (latestCorrection ? [latestCorrection] : []));
                finalCheckoutType = (serverData.checkoutType && serverData.checkoutType !== 'N/A')
                  ? serverData.checkoutType
                  : (latestCorrection?.newCheckoutType || 'Manual Checkout');
                finalResolutionSource = (serverData.resolutionSource && serverData.resolutionSource !== 'EMPLOYEE_PROPOSED')
                  ? serverData.resolutionSource
                  : (latestCorrection?.correctionSource || 'ADMIN_CORRECTION');
                finalCheckoutFinalizationSource = serverData.checkoutFinalizationSource || 'MANUAL_CHECKOUT';
                if (serverData.reason !== undefined && serverData.reason !== null) {
                  finalReason = serverData.reason;
                } else if (latestCorrection?.reason) {
                  finalReason = latestCorrection.reason;
                }

                // Version handling: Preserve higher server version if present
                if (typeof serverData.version === 'number') {
                  if (record.version === undefined || serverData.version > record.version) {
                    record.version = serverData.version;
                  }
                }

                // Synchronize in-memory record to prevent local drift and repeated employee checkout prompts
                record.checkOutTime = finalCheckOutTime;
                record.checkoutStatus = finalCheckoutStatus;
                record.status = finalStatus;
                record.attendanceStatus = 'RESOLVED';
                record.workingHours = finalWorkingHours;
                record.isAdminRectified = true;
                record.manualRectified = true;
                record.checkoutResolvedBy = finalCheckoutResolvedBy;
                record.checkoutResolvedAt = finalCheckoutResolvedAt;
                record.correctionHistory = finalCorrectionHistory;
                record.checkoutType = finalCheckoutType;
                record.resolutionSource = finalResolutionSource;
                record.checkoutFinalizationSource = finalCheckoutFinalizationSource;
                record.currentState = 'CHECKED_OUT';
                record.checkoutFinalized = true;
                record.checkoutConfirmed = true;
                record.pendingCheckoutConfirmation = false;
                record.syncStatus = 'Synced';
                if (finalReason !== undefined) record.reason = finalReason;
                delete (record as any).employeeProposedCheckoutTime;
                delete (record as any).employeeProvidedCheckoutTime;
                delete (record as any).resolutionReason;
              } else if (
                serverData.checkOutTime !== undefined &&
                serverData.checkOutTime !== null &&
                serverData.checkOutTime !== '--:--' &&
                serverData.checkOutTime !== 'UNRESOLVED' &&
                serverData.checkOutTime !== 'Pending' &&
                serverData.checkOutTime !== 'N/A' &&
                (!record.checkOutTime || record.checkOutTime === '--:--' || record.checkOutTime === 'UNRESOLVED')
              ) {
                // Server already has a valid checkout time, do not let stale local null/unresolved overwrite it
                finalCheckOutTime = serverData.checkOutTime;
                finalCheckoutStatus = (serverData.checkoutStatus && serverData.checkoutStatus !== 'UNRESOLVED') ? serverData.checkoutStatus : 'COMPLETED';
                finalStatus = (serverData.status && serverData.status !== 'UNRESOLVED') ? serverData.status : 'completed';
                if (serverData.workingHours) {
                  finalWorkingHours = serverData.workingHours;
                } else if (finalCheckInTime && finalCheckOutTime) {
                  finalWorkingHours = calculateWorkingHours(finalCheckInTime, finalCheckOutTime);
                }
                record.checkOutTime = finalCheckOutTime;
                record.checkoutStatus = finalCheckoutStatus;
                record.status = finalStatus;
                record.workingHours = finalWorkingHours;
              }
            }
          } catch (readErr) {
            console.warn('[SyncEngine] Non-fatal check on existing server checkInTime/geofenceExitTime/checkout:', readErr);
          }
        }

        // Check if the record itself has admin authority (e.g. from local storage or previous sync)
        if (!isRecordProtectedByAdmin && (record.isAdminRectified || record.manualRectified || String(record.checkoutResolvedBy || '').toLowerCase().includes('admin'))) {
          isRecordProtectedByAdmin = true;
          const latestCorrection = findLatestAdminCorrection(record.correctionHistory);
          if ((!finalCheckOutTime || finalCheckOutTime === 'UNRESOLVED' || finalCheckOutTime === '--:--') && latestCorrection?.correctedCheckOut) {
            finalCheckOutTime = latestCorrection.correctedCheckOut;
          }
          finalCheckoutStatus = 'COMPLETED';
          finalStatus = (record.status && record.status !== 'UNRESOLVED') ? record.status : 'completed';
          if (!finalWorkingHours && finalCheckInTime && finalCheckOutTime) {
            finalWorkingHours = calculateWorkingHours(finalCheckInTime, finalCheckOutTime);
          }
        }

        const sanitizedRecord = sanitizeFirestorePayload({
          ...record,
          docId: documentKey,
          syncStatus: 'Synced',
          serverSyncTime: localServerSyncTime,
          serverSyncTimestamp: serverTimestamp(),
          createdAtDeviceTime: finalCreatedAtDeviceTime,
          checkInTime: finalCheckInTime,
          checkInLatitude: finalCheckInLatitude,
          checkInLongitude: finalCheckInLongitude,
          checkInDistance: finalCheckInDistance,
          checkInTownCity: finalCheckInTownCity,
          checkInMode: finalCheckInMode,
          checkOutTime: finalCheckOutTime,
          checkoutStatus: finalCheckoutStatus,
          status: finalStatus,
          attendanceStatus: isRecordProtectedByAdmin ? 'RESOLVED' : (record.attendanceStatus || (finalCheckoutStatus === 'COMPLETED' ? 'RESOLVED' : null)),
          workingHours: finalWorkingHours,
          isAdminRectified: isRecordProtectedByAdmin ? true : (finalIsAdminRectified ?? record.isAdminRectified ?? false),
          manualRectified: isRecordProtectedByAdmin ? true : (finalManualRectified ?? record.manualRectified ?? false),
          checkoutResolvedBy: isRecordProtectedByAdmin ? (finalCheckoutResolvedBy || 'admin') : (record.checkoutResolvedBy || null),
          checkoutResolvedAt: isRecordProtectedByAdmin ? (finalCheckoutResolvedAt || localServerSyncTime) : (record.checkoutResolvedAt || null),
          correctionHistory: isRecordProtectedByAdmin ? (finalCorrectionHistory || []) : (record.correctionHistory || []),
          checkoutType: isRecordProtectedByAdmin ? (finalCheckoutType || 'Manual Checkout') : (record.checkoutType || null),
          resolutionSource: isRecordProtectedByAdmin ? finalResolutionSource : (record.resolutionSource || null),
          reason: finalReason !== undefined ? finalReason : (isRecordProtectedByAdmin ? (serverData?.reason ?? null) : (record.reason || null)),

          // WRITE-MERGE SAFETY: If server is admin-authoritative, employee proposal fields MUST NOT pollute or downgrade
          employeeProposedCheckoutTime: isRecordProtectedByAdmin
            ? (serverData?.employeeProposedCheckoutTime ?? null)
            : (record.employeeProposedCheckoutTime || null),
          employeeProvidedCheckoutTime: isRecordProtectedByAdmin
            ? (serverData?.employeeProvidedCheckoutTime ?? null)
            : (record.employeeProvidedCheckoutTime || null),
          resolutionReason: isRecordProtectedByAdmin
            ? (serverData?.resolutionReason ?? null)
            : (record.resolutionReason || null),
          checkoutSource: isRecordProtectedByAdmin
            ? (serverData?.checkoutSource || 'MANUAL')
            : (record.checkoutSource || null),

          recordedExitTime: finalRecordedExitTime || finalGeofenceExitTime || null,
          exitDetectedAt: finalExitDetectedAt || finalGeofenceExitTimestamp || null,
          exitDetectionSource: finalExitDetectionSource || (finalGeofenceExitTime ? 'NATIVE_GEOFENCE' : null),
          appOpenedAt: record.appOpenedAt || null,
          confirmationDisplayedAt: record.confirmationDisplayedAt || null,
          confirmationCompletedAt: record.confirmationCompletedAt || null,
          checkoutFinalizationSource: isRecordProtectedByAdmin ? finalCheckoutFinalizationSource : (record.checkoutFinalizationSource || null),
          geofenceExitTime: finalGeofenceExitTime || null,
          geofenceExitTimestamp: finalGeofenceExitTimestamp || null,
          lastExitTime: finalLastExitTime || record.lastExitTime || null,
          exitTime: finalExitTime || record.exitTime || null,
          pendingCheckoutConfirmation: isRecordProtectedByAdmin ? false : (record.pendingCheckoutConfirmation ?? false),
          currentState: isRecordProtectedByAdmin ? 'CHECKED_OUT' : (record.currentState || null),
          checkoutFinalized: isRecordProtectedByAdmin ? true : (record.checkoutFinalized ?? (finalCheckoutStatus === 'COMPLETED')),
          checkoutConfirmed: isRecordProtectedByAdmin ? true : (record.checkoutConfirmed ?? false),
          returnTime: record.returnTime || null,
          processedEvents: record.processedEvents || [],
          version: isRecordProtectedByAdmin && typeof serverData?.version === 'number'
            ? Math.max(serverData.version, Number(record.version) || 0)
            : (record.version || 1)
        });

        // OFFLINE RACE CONDITION FIX: Never allow a local sync to downgrade a server record's authoritative status
        if (serverData) {
          if (sanitizedRecord.checkoutStatus === 'UNRESOLVED' || sanitizedRecord.checkoutStatus === 'PENDING_ADMIN_REVIEW' || !sanitizedRecord.checkoutStatus) {
            delete (sanitizedRecord as any).checkoutStatus;
          }
          if (sanitizedRecord.status === 'UNRESOLVED' || !sanitizedRecord.status) {
            delete (sanitizedRecord as any).status;
          }
          if (sanitizedRecord.attendanceStatus === 'UNRESOLVED' || !sanitizedRecord.attendanceStatus) {
            delete (sanitizedRecord as any).attendanceStatus;
          }
          if (sanitizedRecord.isAdminRectified === false) {
            delete (sanitizedRecord as any).isAdminRectified;
          }
          if (sanitizedRecord.manualRectified === false) {
            delete (sanitizedRecord as any).manualRectified;
          }
          if (sanitizedRecord.checkoutFinalized === false) {
            delete (sanitizedRecord as any).checkoutFinalized;
          }
          
          // Protect checkOutTime from being downgraded to UNRESOLVED or empty if server has a valid time
          if (serverData.checkOutTime && serverData.checkOutTime !== 'UNRESOLVED' && serverData.checkOutTime !== '--:--' && serverData.checkOutTime !== 'Pending' && serverData.checkOutTime !== 'N/A') {
            if (!sanitizedRecord.checkOutTime || sanitizedRecord.checkOutTime === 'UNRESOLVED' || sanitizedRecord.checkOutTime === '--:--' || sanitizedRecord.checkOutTime === 'Pending' || sanitizedRecord.checkOutTime === 'N/A') {
              delete (sanitizedRecord as any).checkOutTime;
            }
          }
        }

        await setDoc(docRef, sanitizedRecord, { merge: true });

        logAttendanceWriteDiagnostic(
          isExplicitAdminCorrection ? 'ADMIN_ATTENDANCE_CORRECTION' : 'SyncEngine',
          record.employeeId,
          finalCheckInTime,
          'FIRESTORE_WRITE',
          { docId: documentKey, isCorrection: !!isExplicitAdminCorrection }
        );

        logSyncServerConfirm('Attendance', record.id);
        recordSyncSuccess('Attendance', record.id);
        markRecordSyncedInLocal(record.id, localServerSyncTime);

        if (isRecordProtectedByAdmin) {
          saveAttendanceRecord(record);
        }
        logSyncComplete('Attendance', record.id);

        if (record.exitTime || record.lastExitTime) {
          console.log('[ATTENDANCE_EXIT_SYNCED]', {
            employeeId: record.employeeId,
            date: record.date,
            distance: record.distance || 0,
            timestamp: new Date().toISOString(),
            source: record.checkInMode || 'AUTO'
          });
          logAttendanceEvent('SYNC_SUCCESS', record.employeeId, `[ATTENDANCE_EXIT_SYNCED] Synced attendance exit state for ${record.date}`);
        }

        syncedCount++;
        success = true;

        // Non-blocking auxiliary WhatsApp notification dispatch upon successful Firestore persistence
        try {
          let eventType = 'AUTO_CHECK_IN';
          const attType = String(record.attendanceType || '');
          if (record.checkOutTime) {
            eventType = 'CHECK_OUT';
          } else if (attType === 'WFH') {
            eventType = 'WFH';
          } else if (attType === 'CLIENT_VISIT') {
            eventType = 'CLIENT_VISIT';
          } else if (attType === 'OUTDOOR' || attType === 'OUTDOOR_WORK') {
            eventType = 'OUTDOOR_WORK';
          } else if (record.exitTime || record.lastExitTime) {
            eventType = 'OUTSIDE_OFFICE';
          } else if (record.checkInMode === 'MANUAL') {
            eventType = 'MANUAL_CHECK_IN';
          }

          import('../notification/whatsappService').then(({ dispatchAttendanceWhatsApp }) => {
            dispatchAttendanceWhatsApp(sanitizedRecord as any, eventType).catch((waErr) => {
              console.warn('[SyncEngine] Auxiliary WhatsApp dispatch warning (non-fatal):', waErr);
            });
          }).catch(() => {});
        } catch (waHookErr) {
          // Auxiliary notification failure must never block or affect attendance synchronization
        }
      } catch (err: any) {
        console.error(`Sync Engine: Error syncing attendance record ID ${record.id} (Attempt ${attempt}/${maxAttempts}):`, err);

        if (attempt < maxAttempts) {
          const backoffMs = attempt === 1 ? 300 : attempt === 2 ? 800 : 1500;
          await new Promise((res) => setTimeout(res, backoffMs));
        } else {
          logAttendanceEvent('SYNC_FAILED', record.employeeId, `Failed to sync attendance record ${record.docId}: ${err?.message}`);
          recordSyncFailure('Attendance', record.id, err?.message || 'Attendance sync failed', `Attendance for ${record.date}`, record.employeeId, record);
          errorsCount++;
        }
      }
    }
  }
  } finally {
    isAttendanceSyncInProgress = false;
    setSyncRunningState(false);
  }

  return { syncedCount, errorsCount };
};

export const startAutoSyncEngine = (): (() => void) => {
  const handleOnline = () => {
    console.log('Sync Engine: Connectivity restored. Automatically syncing pending attendance...');
    syncPendingAttendanceRecords();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('Sync Engine: App returned to foreground. Syncing pending attendance...');
      syncPendingAttendanceRecords();
    }
  };

  const onlineListenerId = `att_autosync_online_${Date.now()}`;
  trackResourceCreated('ONLINE_LISTENER', onlineListenerId, 'attendance_autosync');

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  if (navigator.onLine) {
    syncPendingAttendanceRecords();
  }

  return () => {
    trackResourceCleaned('ONLINE_LISTENER', onlineListenerId);
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
};
