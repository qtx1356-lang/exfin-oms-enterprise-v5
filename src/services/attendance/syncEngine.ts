import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AttendanceRecord } from '../../types/attendance';
import {
  getPendingAttendanceRecords,
  markRecordSyncedInLocal
} from './attendanceStorage';
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
  if (!navigator.onLine) {
    console.log('Sync Engine: Device is offline. Changes saved locally.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (isAttendanceSyncInProgress) {
    console.log('Sync Engine: Attendance sync already running, skipping overlapping execution.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
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

        const evtRef = doc(db, 'attendance_events', evt.eventId);
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
    let attempt = 0;
    let success = false;
    const maxAttempts = 3;

    logSyncStart('Attendance', record.id);
    logSyncLocalUpdate('Attendance', record.id);

    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        const documentKey = record.docId || `${record.employeeId}_${record.date}` || record.id;
        const docRef = doc(db, 'attendance', documentKey);
        const localServerSyncTime = new Date().toISOString();

        logSyncServerWrite('Attendance', record.id);

        const sanitizedRecord = sanitizeFirestorePayload({
          ...record,
          docId: documentKey,
          syncStatus: 'Synced',
          serverSyncTime: localServerSyncTime,
          serverSyncTimestamp: serverTimestamp(),
          createdAtDeviceTime: record.createdAtDeviceTime,
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime,
          lastExitTime: record.lastExitTime || null,
          exitTime: record.exitTime || null,
          returnTime: record.returnTime || null,
          processedEvents: record.processedEvents || []
        });

        await setDoc(docRef, sanitizedRecord, { merge: true });

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
