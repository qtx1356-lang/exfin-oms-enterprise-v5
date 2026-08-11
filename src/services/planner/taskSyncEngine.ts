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
    let attempt = 0;
    let success = false;
    
    while (attempt < 3 && !success) {
      attempt++;
      try {
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
          success = true;
        } else {
          const serverData = docSnap.data() as TaskRecord;
          const serverRev = serverData.revision || 1;
          const localRev = task.revision || 1;
          const newRevision = Math.max(serverRev, localRev) + 1;

          // Merge without conflict - partial payload
          const firestorePayload: Partial<TaskRecord> = {
            completionPercentage: task.completionPercentage,
            status: task.status,
            approvalStatus: task.approvalStatus,
            comments: task.comments || [],
            completedAt: task.completedAt || null,
            completedBy: task.completedBy || null,
            startedTime: task.startedTime || null,
            updatedAtDeviceTime: task.updatedAtDeviceTime || new Date().toISOString(),
            lastModifiedAt: new Date().toISOString(),
            revision: newRevision,
            serverSyncTime: serverSyncTime,
            hasConflict: false,
            conflictDetails: null,
            syncStatus: 'Synced'
          };

          await setDoc(docRef, firestorePayload, { merge: true });
          recordSyncSuccess('WorkPlanner', task.id);
          markTaskSyncedInLocal(task.id, serverSyncTime);
          console.log(`Task Sync Engine: Updated synced task ID ${task.id}`);
          syncedCount++;
          success = true;
        }
      } catch (err: any) {
        console.error(`Task Sync Engine: Error syncing task ID ${task.id} (Attempt ${attempt}):`, err);
        if (attempt < 3) {
          // short delay
          await new Promise(res => setTimeout(res, 1000 * attempt));
        } else {
          recordSyncFailure('WorkPlanner', task.id, err?.message || 'Task sync failed', `Task "${task.title}"`);
          markTaskSyncFailedInLocal(task.id);
          errorsCount++;
        }
      }
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
