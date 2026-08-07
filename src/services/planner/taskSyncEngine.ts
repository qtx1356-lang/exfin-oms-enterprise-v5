import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TaskRecord } from '../../types/planner';
import {
  getPendingTasks,
  markTaskSyncedInLocal,
  markTaskSyncFailedInLocal,
} from './taskStorage';

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
      const docRef = doc(db, 'tasks', task.id);
      const docSnap = await getDoc(docRef);
      const serverSyncTime = new Date().toISOString();

      if (!docSnap.exists()) {
        const firestorePayload: TaskRecord = {
          ...task,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          // CRITICAL: Preserve original creation timestamp
          createdAtDeviceTime: task.createdAtDeviceTime,
          updatedAtDeviceTime: task.updatedAtDeviceTime || new Date().toISOString(),
        };

        await setDoc(docRef, firestorePayload);
        console.log(`Task Sync Engine: Successfully synced task ID ${task.id}`);
      } else {
        const existingData = docSnap.data() as TaskRecord;
        // Merge updates safely
        await setDoc(
          docRef,
          {
            ...task,
            syncStatus: 'Synced',
            serverSyncTime: serverSyncTime,
            createdAtDeviceTime: existingData.createdAtDeviceTime || task.createdAtDeviceTime,
            updatedAtDeviceTime: task.updatedAtDeviceTime || new Date().toISOString(),
          },
          { merge: true }
        );
        console.log(`Task Sync Engine: Updated synced task ID ${task.id}`);
      }

      markTaskSyncedInLocal(task.id, serverSyncTime);
      syncedCount++;
    } catch (err) {
      console.error(`Task Sync Engine: Error syncing task ID ${task.id}:`, err);
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
