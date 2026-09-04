import { API_BASE_URL } from '@/src/utils/apiConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AttendanceRecord } from '../../types/attendance';
import { hasActualCheckIn, getEarliestCheckInTime, logAttendanceWriteDiagnostic, isAdminContextActive } from '../../utils/attendanceUtils';
import {
  getPendingAttendanceRecords,
  markRecordSyncedInLocal
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

        if (!isExplicitAdminCorrection) {
          try {
            const serverSnap = await getDoc(docRef);
            if (serverSnap.exists()) {
              const serverData = serverSnap.data();
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

              // DEFENSIVE SERVER-AUTHORITY CHECK FOR FINALIZED / ADMIN-CORRECTED CHECKOUT:
              // When the existing Firestore document contains isAdminRectified === true, manualRectified === true,
              // checkoutStatus === "COMPLETED" / "FINALIZED", or valid Admin correction history with correctedCheckOut,
              // employee synchronization MUST NOT overwrite the server's finalized checkout information with stale local values.
              const hasCorrectionWithCheckout = Array.isArray(serverData.correctionHistory) && serverData.correctionHistory.some((c: any) => c && c.correctedCheckOut && c.correctedCheckOut !== 'UNRESOLVED' && c.correctedCheckOut !== '--:--');

              const isServerCheckoutProtected = !!(
                serverData.isAdminRectified === true ||
                serverData.manualRectified === true ||
                serverData.checkoutStatus === 'COMPLETED' ||
                serverData.checkoutStatus === 'FINALIZED' ||
                hasCorrectionWithCheckout
              );

              if (isServerCheckoutProtected) {
                // Recover or protect checkout time:
                let authoritativeCheckOutTime = serverData.checkOutTime;
                if ((authoritativeCheckOutTime === undefined || authoritativeCheckOutTime === null || authoritativeCheckOutTime === 'UNRESOLVED' || authoritativeCheckOutTime === '--:--') && Array.isArray(serverData.correctionHistory)) {
                  const latestCorrection = [...serverData.correctionHistory].reverse().find((c: any) => c && c.correctedCheckOut && c.correctedCheckOut !== 'UNRESOLVED' && c.correctedCheckOut !== '--:--');
                  if (latestCorrection && latestCorrection.correctedCheckOut) {
                    authoritativeCheckOutTime = latestCorrection.correctedCheckOut;
                  }
                }

                if (authoritativeCheckOutTime !== undefined && authoritativeCheckOutTime !== null && authoritativeCheckOutTime !== 'UNRESOLVED' && authoritativeCheckOutTime !== '--:--') {
                  finalCheckOutTime = authoritativeCheckOutTime;
                }

                // Protect checkout status: Never downgrade a completed or rectified record to UNRESOLVED
                if (serverData.checkoutStatus && serverData.checkoutStatus !== 'UNRESOLVED') {
                  finalCheckoutStatus = serverData.checkoutStatus;
                } else if (finalCheckOutTime && finalCheckOutTime !== '--:--' && finalCheckOutTime !== 'UNRESOLVED') {
                  finalCheckoutStatus = 'COMPLETED';
                }

                // Protect status: Never downgrade a completed or present record to UNRESOLVED
                if (serverData.status && serverData.status !== 'UNRESOLVED') {
                  finalStatus = serverData.status;
                } else if (finalCheckOutTime && finalCheckOutTime !== '--:--' && finalCheckOutTime !== 'UNRESOLVED') {
                  finalStatus = 'PRESENT';
                }

                // Protect/Recover workingHours
                if (serverData.workingHours !== undefined && serverData.workingHours !== null && serverData.workingHours !== '') {
                  finalWorkingHours = serverData.workingHours;
                } else if (finalCheckInTime && finalCheckOutTime) {
                  finalWorkingHours = calculateWorkingHours(finalCheckInTime, finalCheckOutTime);
                }

                if (serverData.isAdminRectified !== undefined) {
                  finalIsAdminRectified = serverData.isAdminRectified;
                } else {
                  finalIsAdminRectified = true;
                }
                if (serverData.manualRectified !== undefined) {
                  finalManualRectified = serverData.manualRectified;
                } else {
                  finalManualRectified = true;
                }
                if (serverData.checkoutResolvedBy) {
                  finalCheckoutResolvedBy = serverData.checkoutResolvedBy;
                } else if (Array.isArray(serverData.correctionHistory) && serverData.correctionHistory.length > 0) {
                  const lastCorr = serverData.correctionHistory[serverData.correctionHistory.length - 1];
                  if (lastCorr?.correctedBy) finalCheckoutResolvedBy = lastCorr.correctedBy;
                }
                if (serverData.checkoutResolvedAt) {
                  finalCheckoutResolvedAt = serverData.checkoutResolvedAt;
                } else if (Array.isArray(serverData.correctionHistory) && serverData.correctionHistory.length > 0) {
                  const lastCorr = serverData.correctionHistory[serverData.correctionHistory.length - 1];
                  if (lastCorr?.correctedAt) finalCheckoutResolvedAt = lastCorr.correctedAt;
                }
                if (serverData.correctionHistory && Array.isArray(serverData.correctionHistory)) {
                  finalCorrectionHistory = serverData.correctionHistory;
                }
                if (serverData.checkoutType) {
                  finalCheckoutType = serverData.checkoutType;
                }
                if (serverData.resolutionSource) {
                  finalResolutionSource = serverData.resolutionSource;
                }
                if (serverData.checkoutFinalizationSource) {
                  finalCheckoutFinalizationSource = serverData.checkoutFinalizationSource;
                }
                if (serverData.reason !== undefined && serverData.reason !== null) {
                  finalReason = serverData.reason;
                }

                // Version handling: Preserve higher server version if present
                if (typeof serverData.version === 'number') {
                  if (record.version === undefined || serverData.version > record.version) {
                    record.version = serverData.version;
                  }
                }

                // Synchronize in-memory record to prevent local drift
                record.checkOutTime = finalCheckOutTime;
                record.checkoutStatus = finalCheckoutStatus;
                record.status = finalStatus;
                record.workingHours = finalWorkingHours;
                record.isAdminRectified = finalIsAdminRectified;
                record.manualRectified = finalManualRectified;
                record.checkoutResolvedBy = finalCheckoutResolvedBy;
                record.checkoutResolvedAt = finalCheckoutResolvedAt;
                record.correctionHistory = finalCorrectionHistory;
                record.checkoutType = finalCheckoutType;
                record.resolutionSource = finalResolutionSource;
                record.checkoutFinalizationSource = finalCheckoutFinalizationSource;
                if (finalReason !== undefined) record.reason = finalReason;
              } else if (
                serverData.checkOutTime !== undefined &&
                serverData.checkOutTime !== null &&
                serverData.checkOutTime !== '--:--' &&
                serverData.checkOutTime !== 'UNRESOLVED' &&
                (!record.checkOutTime || record.checkOutTime === '--:--' || record.checkOutTime === 'UNRESOLVED')
              ) {
                // Server already has a valid checkout time, do not let stale local null/unresolved overwrite it
                finalCheckOutTime = serverData.checkOutTime;
                if (serverData.checkoutStatus && serverData.checkoutStatus !== 'UNRESOLVED') {
                  finalCheckoutStatus = serverData.checkoutStatus;
                } else {
                  finalCheckoutStatus = 'COMPLETED';
                }
                if (serverData.status && serverData.status !== 'UNRESOLVED') {
                  finalStatus = serverData.status;
                }
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
          workingHours: finalWorkingHours,
          isAdminRectified: finalIsAdminRectified,
          manualRectified: finalManualRectified,
          checkoutResolvedBy: finalCheckoutResolvedBy || null,
          checkoutResolvedAt: finalCheckoutResolvedAt || null,
          correctionHistory: finalCorrectionHistory || [],
          checkoutType: finalCheckoutType || null,
          resolutionSource: finalResolutionSource || null,
          reason: finalReason !== undefined ? finalReason : (record.reason || null),
          recordedExitTime: finalRecordedExitTime || finalGeofenceExitTime || null,
          exitDetectedAt: finalExitDetectedAt || finalGeofenceExitTimestamp || null,
          exitDetectionSource: finalExitDetectionSource || (finalGeofenceExitTime ? 'NATIVE_GEOFENCE' : null),
          appOpenedAt: record.appOpenedAt || null,
          confirmationDisplayedAt: record.confirmationDisplayedAt || null,
          confirmationCompletedAt: record.confirmationCompletedAt || null,
          checkoutFinalizationSource: finalCheckoutFinalizationSource || record.checkoutFinalizationSource || null,
          geofenceExitTime: finalGeofenceExitTime || null,
          geofenceExitTimestamp: finalGeofenceExitTimestamp || null,
          lastExitTime: finalLastExitTime || record.lastExitTime || null,
          exitTime: finalExitTime || record.exitTime || null,
          pendingCheckoutConfirmation: record.pendingCheckoutConfirmation ?? false,
          currentState: record.currentState || null,
          returnTime: record.returnTime || null,
          processedEvents: record.processedEvents || []
        });

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
