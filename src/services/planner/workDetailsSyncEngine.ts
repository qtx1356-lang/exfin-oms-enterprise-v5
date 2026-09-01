import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { DailyWorkDetailRecord } from '../../types/workDetails';
import {
  getPendingWorkDetails,
  markWorkDetailSyncedInLocal,
  markWorkDetailSyncFailedInLocal,
  saveWorkDetailRecord,
} from './workDetailsStorage';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';
import {
  logSyncStart,
  logSyncLocalUpdate,
  logSyncServerWrite,
  logSyncServerConfirm,
  logSyncComplete,
} from '../sync/syncPerformanceLogger';

const coalescedWorkDetailsQueue = new Map<string, DailyWorkDetailRecord>();
let debounceTimer: any = null;

export const queueWorkDetailSync = (detail: DailyWorkDetailRecord): void => {
  logSyncStart('WorkPlanner', detail.id);

  // 1. Immediate local UI update
  saveWorkDetailRecord({
    ...detail,
    syncStatus: 'Pending Sync',
  });
  logSyncLocalUpdate('WorkPlanner', detail.id);

  // 2. Coalesce rapid edits
  coalescedWorkDetailsQueue.set(detail.id, detail);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Flush queue to server after 300ms debounce
  debounceTimer = setTimeout(() => {
    syncPendingWorkDetails();
  }, 300);
};

export const syncPendingWorkDetails = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Work Details Sync Engine: Device is offline. Changes saved locally.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
    console.warn('Work Details Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  const pending = getPendingWorkDetails();
  if (pending.length === 0) {
    return { syncedCount: 0, errorsCount: 0 };
  }

  console.log(`Work Details Sync Engine: Found ${pending.length} pending work detail records to sync.`);
  let syncedCount = 0;
  let errorsCount = 0;

  for (const detail of pending) {
    let attempt = 0;
    let success = false;
    const maxAttempts = 3;

    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        logSyncServerWrite('WorkPlanner', detail.id);
        const docRef = doc(db, 'daily_work_details', detail.id);
        const serverSyncTime = new Date().toISOString();

        const firestorePayload: DailyWorkDetailRecord = {
          ...detail,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          updatedAt: serverSyncTime,
          updatedAtDeviceTime: detail.updatedAtDeviceTime || serverSyncTime,
          createdAt: detail.createdAt || serverSyncTime,
          createdAtDeviceTime: detail.createdAtDeviceTime || serverSyncTime,
        };

        await setDoc(docRef, firestorePayload, { merge: true });

        logSyncServerConfirm('WorkPlanner', detail.id);
        recordSyncSuccess('WorkPlanner', detail.id);
        markWorkDetailSyncedInLocal(detail.id, serverSyncTime);
        logSyncComplete('WorkPlanner', detail.id);

        syncedCount++;
        success = true;
      } catch (err: any) {
        console.error(`Work Details Sync Engine: Attempt ${attempt} failed for record ${detail.id}:`, err);
        if (attempt >= maxAttempts) {
          errorsCount++;
          markWorkDetailSyncFailedInLocal(detail.id);
          recordSyncFailure(
            'WorkPlanner',
            detail.id,
            err?.message || 'Sync failed after max retries',
            `Work detail ${detail.date} for ${detail.employeeCode}`,
            detail.employeeId,
            detail
          );
        } else {
          await new Promise((res) => setTimeout(res, 500 * Math.pow(2, attempt)));
        }
      }
    }
  }

  return { syncedCount, errorsCount };
};
