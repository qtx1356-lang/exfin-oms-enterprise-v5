import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ExpenseRecord } from '../../types/expense';
import {
  getPendingExpenseRecords,
  markExpenseSyncedInLocal,
  markExpenseSyncFailedInLocal,
} from './expenseStorage';

export const syncPendingExpenseRecords = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Expense Sync Engine: Device is offline. Skipping sync.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
    console.warn('Expense Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  const pendingRecords = getPendingExpenseRecords();
  if (pendingRecords.length === 0) {
    return { syncedCount: 0, errorsCount: 0 };
  }

  console.log(`Expense Sync Engine: Found ${pendingRecords.length} pending expense records to sync.`);
  let syncedCount = 0;
  let errorsCount = 0;

  for (const record of pendingRecords) {
    try {
      const docRef = doc(db, 'expenses', record.id);
      const docSnap = await getDoc(docRef);
      const serverSyncTime = new Date().toISOString();

      if (!docSnap.exists()) {
        const firestorePayload: ExpenseRecord = {
          ...record,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          // CRITICAL: Preserve original device creation time
          createdAtDeviceTime: record.createdAtDeviceTime,
        };

        await setDoc(docRef, firestorePayload);
        console.log(`Expense Sync Engine: Successfully synced expense ID ${record.id}`);
      } else {
        const existingData = docSnap.data() as ExpenseRecord;
        // Merge without overwriting original status if admin already updated it
        await setDoc(
          docRef,
          {
            ...record,
            status: existingData.status || record.status,
            rejectionReason: existingData.rejectionReason || record.rejectionReason,
            syncStatus: 'Synced',
            serverSyncTime: serverSyncTime,
            createdAtDeviceTime: existingData.createdAtDeviceTime || record.createdAtDeviceTime,
          },
          { merge: true }
        );
        console.log(`Expense Sync Engine: Updated synced expense ID ${record.id}`);
      }

      markExpenseSyncedInLocal(record.id, serverSyncTime);
      syncedCount++;
    } catch (err) {
      console.error(`Expense Sync Engine: Error syncing expense ID ${record.id}:`, err);
      markExpenseSyncFailedInLocal(record.id);
      errorsCount++;
    }
  }

  return { syncedCount, errorsCount };
};

export const startExpenseAutoSyncEngine = (intervalMs = 15000): (() => void) => {
  const handleOnline = () => {
    console.log('Expense Sync Engine: Connectivity restored. Syncing pending expenses...');
    syncPendingExpenseRecords();
  };

  window.addEventListener('online', handleOnline);

  const intervalId = setInterval(() => {
    if (navigator.onLine) {
      syncPendingExpenseRecords();
    }
  }, intervalMs);

  if (navigator.onLine) {
    syncPendingExpenseRecords();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    clearInterval(intervalId);
  };
};
