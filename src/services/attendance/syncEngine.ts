import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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

/**
 * Strips undefined properties from object before sending to Firestore
 */
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
    console.log('Sync Engine: Device is offline. Skipping sync.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
    console.warn('Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  // 1. Sync Pending Events Queue first
  const pendingEvents = getPendingEventsFromQueue();
  if (pendingEvents.length > 0) {
    logAttendanceEvent('SYNC_STARTED', 'SYSTEM', `Syncing ${pendingEvents.length} queued attendance events to Firestore...`);
    for (const evt of pendingEvents) {
      try {
        const evtRef = doc(db, 'attendance_events', evt.eventId);
        const evtSnap = await getDoc(evtRef);
        if (!evtSnap.exists()) {
          await setDoc(evtRef, sanitizeFirestorePayload({
            ...evt,
            syncStatus: 'Synced',
            syncedAt: new Date().toISOString(),
            serverSyncTime: serverTimestamp()
          }));
        }
        markEventSyncedInQueue(evt.eventId);
        logAttendanceEvent('SYNC_SUCCESS', evt.employeeId, `Event ${evt.eventId} synced successfully.`, {
          eventId: evt.eventId,
          eventTimestamp: evt.createdAt,
          syncStatus: 'Synced'
        });
      } catch (err: any) {
        logAttendanceEvent('SYNC_FAILED', evt.employeeId, `Failed to sync event ${evt.eventId}: ${err?.message}`, {
          eventId: evt.eventId,
          eventTimestamp: evt.createdAt,
          syncStatus: 'Pending'
        });
      }
    }
  }

  // 2. Sync Pending Attendance Records
  const pendingRecords = getPendingAttendanceRecords();
  if (pendingRecords.length === 0) {
    return { syncedCount: 0, errorsCount: 0 };
  }

  console.log(`Sync Engine: Found ${pendingRecords.length} pending attendance records to sync.`);
  let syncedCount = 0;
  let errorsCount = 0;

  for (const record of pendingRecords) {
    try {
      const documentKey = record.docId || `${record.employeeId}_${record.date}` || record.id;
      const docRef = doc(db, 'attendance', documentKey);
      
      const docSnap = await getDoc(docRef);
      const localServerSyncTime = new Date().toISOString();

      const sanitizedRecord = sanitizeFirestorePayload({
        ...record,
        docId: documentKey,
        syncStatus: 'Synced',
        serverSyncTime: localServerSyncTime,
        // CRITICAL: Preserve original device creation time and original event timestamps
        createdAtDeviceTime: record.createdAtDeviceTime,
        checkInTime: record.checkInTime,
        checkOutTime: record.checkOutTime,
        lastExitTime: record.lastExitTime || null,
        exitTime: record.exitTime || null,
        returnTime: record.returnTime || null,
        processedEvents: record.processedEvents || []
      });

      if (!docSnap.exists()) {
        await setDoc(docRef, {
          ...sanitizedRecord,
          serverSyncTimestamp: serverTimestamp()
        });
        console.log(`Sync Engine: Successfully synced new attendance record docId ${documentKey}`);
        logAttendanceEvent('SYNC_SUCCESS', record.employeeId, `Synced attendance record docId ${documentKey}`, {
          eventTimestamp: record.createdAtDeviceTime,
          syncStatus: 'Synced'
        });
      } else {
        const existingData = docSnap.data() as AttendanceRecord;
        const mergedEvents = Array.from(new Set([...(existingData.processedEvents || []), ...(record.processedEvents || [])]));

        // Merge state safely preserving highest progress
        const updatedPayload = sanitizeFirestorePayload({
          ...existingData,
          checkOutTime: record.checkOutTime || existingData.checkOutTime,
          checkOutMode: record.checkOutTime ? record.checkOutMode : existingData.checkOutMode,
          workingHours: record.workingHours || existingData.workingHours,
          exitTime: record.exitTime !== undefined ? record.exitTime : existingData.exitTime,
          lastExitTime: record.lastExitTime !== undefined ? record.lastExitTime : existingData.lastExitTime,
          returnTime: record.returnTime !== undefined ? record.returnTime : existingData.returnTime,
          currentState: record.currentState || existingData.currentState,
          processedEvents: mergedEvents,
          syncStatus: 'Synced',
          serverSyncTime: localServerSyncTime,
          serverSyncTimestamp: serverTimestamp()
        });

        await setDoc(docRef, updatedPayload, { merge: true });
        console.log(`Sync Engine: Updated synced attendance record docId ${documentKey}`);
        logAttendanceEvent('SYNC_SUCCESS', record.employeeId, `Updated attendance docId ${documentKey} (Idempotent merge)`, {
          eventTimestamp: record.createdAtDeviceTime,
          syncStatus: 'Synced'
        });
      }

      recordSyncSuccess('Attendance', record.id);
      markRecordSyncedInLocal(record.id, localServerSyncTime);
      syncedCount++;
    } catch (err: any) {
      console.error(`Sync Engine: Error syncing record UUID ${record.id}:`, err);
      logAttendanceEvent('SYNC_FAILED', record.employeeId, `Failed to sync attendance record ${record.docId}: ${err?.message}`);
      recordSyncFailure('Attendance', record.id, err?.message || 'Attendance sync failed', `Attendance for ${record.date}`);
      errorsCount++;
    }
  }

  return { syncedCount, errorsCount };
};

export const startAutoSyncEngine = (intervalMs = 20000): (() => void) => {
  const handleOnline = () => {
    console.log('Sync Engine: Internet restored. Triggering auto sync...');
    syncPendingAttendanceRecords();
  };

  window.addEventListener('online', handleOnline);

  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      syncPendingAttendanceRecords();
    }
  }, intervalMs);

  if (navigator.onLine) {
    syncPendingAttendanceRecords();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(intervalId);
  };
};
