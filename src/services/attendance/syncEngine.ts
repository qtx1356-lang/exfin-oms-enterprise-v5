import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { AttendanceRecord } from '../../types/attendance';
import {
  getPendingAttendanceRecords,
  markRecordSyncedInLocal,
  saveAttendanceRecord
} from './attendanceStorage';

export const syncPendingAttendanceRecords = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Sync Engine: Device is offline. Skipping sync.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
    console.warn('Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  const pendingRecords = getPendingAttendanceRecords();
  if (pendingRecords.length === 0) {
    return { syncedCount: 0, errorsCount: 0 };
  }

  console.log(`Sync Engine: Found ${pendingRecords.length} pending attendance records to sync.`);
  let syncedCount = 0;
  let errorsCount = 0;

  for (const record of pendingRecords) {
    try {
      // Use docId (e.g. EMP101_2026-08-07) or record.id as the Firestore Document ID for Daily Attendance Lock & Duplicate Prevention
      const documentKey = record.docId || `${record.employeeId}_${record.date}` || record.id;
      const docRef = doc(db, 'attendance', documentKey);
      
      const docSnap = await getDoc(docRef);
      const serverSyncTime = new Date().toISOString();

      if (!docSnap.exists()) {
        const firestorePayload: AttendanceRecord = {
          ...record,
          docId: documentKey,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          // CRITICAL: Preserve original device creation time and attendance event timestamps
          createdAtDeviceTime: record.createdAtDeviceTime,
          checkInTime: record.checkInTime,
          checkOutTime: record.checkOutTime
        };

        await setDoc(docRef, firestorePayload);
        console.log(`Sync Engine: Successfully synced record docId ${documentKey} (UUID: ${record.id})`);
      } else {
        const existingData = docSnap.data() as AttendanceRecord;
        // If local has updated checkout or exit/return log that Firestore doesn't have yet, update doc
        if (record.checkOutTime && !existingData.checkOutTime) {
          await setDoc(docRef, {
            ...existingData,
            checkOutTime: record.checkOutTime,
            checkOutMode: record.checkOutMode,
            workingHours: record.workingHours,
            exitTime: record.exitTime || existingData.exitTime,
            returnTime: record.returnTime || existingData.returnTime,
            reason: record.reason || existingData.reason,
            reminderCount: Math.max(record.reminderCount || 0, existingData.reminderCount || 0),
            syncStatus: 'Synced',
            serverSyncTime: serverSyncTime
          }, { merge: true });
          console.log(`Sync Engine: Updated checkout for synced docId ${documentKey}`);
        } else {
          console.log(`Sync Engine: Record docId ${documentKey} already synced in Firestore. Skipping duplicate.`);
        }
      }

      markRecordSyncedInLocal(record.id, serverSyncTime);
      syncedCount++;
    } catch (err) {
      console.error(`Sync Engine: Error syncing record UUID ${record.id}:`, err);
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
