import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TaskRecord } from '../../types/planner';
import {
  getPendingTasks,
  markTaskSyncedInLocal,
  markTaskSyncFailedInLocal,
  saveTaskRecord,
} from './taskStorage';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';

export const syncPendingTasks = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Task Sync Engine: Device is offline. Skipping sync.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
    console.warn('Task Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  const pendingTasks = getPendingTasks();
  if (pendingTasks.length === 0) {
    return { syncedCount: 0, errorsCount: 0 };
  }

  console.log(`Task Sync Engine: Found ${pendingTasks.length} pending task records to sync.`);
  let syncedCount = 0;
  let errorsCount = 0;

  for (const task of pendingTasks) {
    try {
      // If task is explicitly marked with unresolved conflict, skip auto-pushing until resolved by user
      if (task.hasConflict) {
        console.warn(`Task Sync Engine: Task ${task.id} has an unresolved conflict. Skipping auto sync.`);
        errorsCount++;
        continue;
      }

      const docRef = doc(db, 'tasks', task.id);
      const docSnap = await getDoc(docRef);
      const serverSyncTime = new Date().toISOString();

      if (!docSnap.exists()) {
        const firestorePayload: TaskRecord = {
          ...task,
          revision: task.revision || 1,
          lastModifiedAt: new Date().toISOString(),
          hasConflict: false,
          conflictDetails: null,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          createdAtDeviceTime: task.createdAtDeviceTime,
          updatedAtDeviceTime: task.updatedAtDeviceTime || new Date().toISOString(),
        };

        await setDoc(docRef, firestorePayload);
        recordSyncSuccess('WorkPlanner', task.id);
        markTaskSyncedInLocal(task.id, serverSyncTime);
        console.log(`Task Sync Engine: Successfully synced new task ID ${task.id}`);
        syncedCount++;
      } else {
        const serverData = docSnap.data() as TaskRecord;

        // Priority 3: Conflict Detection
        // If server doc was updated after local task base time and modified by someone else, detect conflict!
        const serverRev = serverData.revision || 1;
        const localRev = task.revision || 1;
        const serverLastModifiedBy = serverData.lastModifiedBy || serverData.updatedAtDeviceTime || 'SERVER';
        const localLastModifiedBy = task.lastModifiedBy || task.createdBy;

        const isModifiedByOther = serverLastModifiedBy !== localLastModifiedBy;
        const isServerNewer = serverRev >= localRev || (serverData.serverSyncTime && task.serverSyncTime && serverData.serverSyncTime > task.serverSyncTime);

        if (isServerNewer && isModifiedByOther) {
          console.warn(`Task Sync Engine: Conflict detected on task ID ${task.id}. Marking for manual resolution.`);
          const conflictTask: TaskRecord = {
            ...task,
            hasConflict: true,
            syncStatus: 'Sync Failed',
            conflictDetails: {
              serverVersion: serverData,
              localVersion: task,
              conflictTime: new Date().toISOString(),
            },
          };

          saveTaskRecord(conflictTask);
          recordSyncFailure(
            'WorkPlanner',
            task.id,
            'Conflict detected: Server task updated offline by another user',
            `Task "${task.title}" has conflicting server modifications`
          );
          errorsCount++;
          continue;
        }

        // Merge without conflict
        const newRevision = Math.max(serverRev, localRev) + 1;
        const firestorePayload: TaskRecord = {
          ...task,
          revision: newRevision,
          lastModifiedAt: new Date().toISOString(),
          hasConflict: false,
          conflictDetails: null,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          createdAtDeviceTime: serverData.createdAtDeviceTime || task.createdAtDeviceTime,
          updatedAtDeviceTime: new Date().toISOString(),
        };

        await setDoc(docRef, firestorePayload, { merge: true });
        recordSyncSuccess('WorkPlanner', task.id);
        markTaskSyncedInLocal(task.id, serverSyncTime);
        console.log(`Task Sync Engine: Updated synced task ID ${task.id}`);
        syncedCount++;
      }
    } catch (err: any) {
      console.error(`Task Sync Engine: Error syncing task ID ${task.id}:`, err);
      recordSyncFailure('WorkPlanner', task.id, err?.message || 'Task sync failed', `Task "${task.title}"`);
      markTaskSyncFailedInLocal(task.id);
      errorsCount++;
    }
  }

  return { syncedCount, errorsCount };
};

export const startTaskAutoSyncEngine = (intervalMs = 15000): (() => void) => {
  const handleOnline = () => {
    console.log('Task Sync Engine: Connectivity restored. Syncing pending tasks...');
    syncPendingTasks();
  };

  window.addEventListener('online', handleOnline);

  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      syncPendingTasks();
    }
  }, intervalMs);

  if (navigator.onLine) {
    syncPendingTasks();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(intervalId);
  };
};
