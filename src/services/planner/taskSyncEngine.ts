import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TaskRecord } from '../../types/planner';
import {
  getPendingTasks,
  markTaskSyncedInLocal,
  markTaskSyncFailedInLocal,
  saveTaskRecord,
} from './taskStorage';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';
import {
  logSyncStart,
  logSyncLocalUpdate,
  logSyncServerWrite,
  logSyncServerConfirm,
  logSyncComplete,
} from '../sync/syncPerformanceLogger';

// Coalescing queue for rapid task progress updates
const coalescedTaskQueue = new Map<string, TaskRecord>();
let debounceTimer: any = null;

export const queueTaskSync = (task: TaskRecord): void => {
  logSyncStart('WorkPlanner', task.id);

  // 1. Immediate local UI update
  saveTaskRecord({
    ...task,
    syncStatus: 'Pending Sync',
  });
  logSyncLocalUpdate('WorkPlanner', task.id);

  // 2. Coalesce rapid edits (e.g. 25% -> 50% -> 75% -> 100%)
  coalescedTaskQueue.set(task.id, task);

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Flush queue to server after 300ms debounce
  debounceTimer = setTimeout(() => {
    syncPendingTasks();
  }, 300);
};

export const syncPendingTasks = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Task Sync Engine: Device is offline. Changes saved locally.');
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
    const maxAttempts = 3;

    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        logSyncServerWrite('WorkPlanner', task.id);
        const docRef = doc(db, 'tasks', task.id);
        const serverSyncTime = new Date().toISOString();

        // Direct surgical merge write without roundtrip getDoc
        const firestorePayload: Partial<TaskRecord> = {
          ...task,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          updatedAtDeviceTime: task.updatedAtDeviceTime || new Date().toISOString(),
          lastModifiedAt: new Date().toISOString(),
          revision: (task.revision || 1) + 1,
          hasConflict: false,
          conflictDetails: null,
        };

        await setDoc(docRef, firestorePayload, { merge: true });

        logSyncServerConfirm('WorkPlanner', task.id);
        recordSyncSuccess('WorkPlanner', task.id);
        markTaskSyncedInLocal(task.id, serverSyncTime);
        logSyncComplete('WorkPlanner', task.id);

        syncedCount++;
        success = true;
      } catch (err: any) {
        console.error(
          `Task Sync Engine: Error syncing task ID ${task.id} (Attempt ${attempt}/${maxAttempts}):`,
          err
        );

        if (attempt < maxAttempts) {
          // Fast exponential backoff retry: 300ms, 800ms, 1500ms
          const backoffMs = attempt === 1 ? 300 : attempt === 2 ? 800 : 1500;
          await new Promise((res) => setTimeout(res, backoffMs));
        } else {
          recordSyncFailure(
            'WorkPlanner',
            task.id,
            err?.message || 'Task sync failed',
            `Task "${task.title}"`
          );
          markTaskSyncFailedInLocal(task.id);
          errorsCount++;
        }
      }
    }
  }

  // Clear coalesced map
  coalescedTaskQueue.clear();

  return { syncedCount, errorsCount };
};

export const startTaskAutoSyncEngine = (): (() => void) => {
  const handleOnline = () => {
    console.log('Task Sync Engine: Connectivity restored. Automatically syncing pending tasks...');
    syncPendingTasks();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('Task Sync Engine: App returned to foreground. Reconciling pending task sync...');
      syncPendingTasks();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  if (navigator.onLine) {
    syncPendingTasks();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
};
