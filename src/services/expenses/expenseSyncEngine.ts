import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { getDb } from '../firebase/config';
import { storage } from '../firebase/storage';
import { ExpenseRecord } from '../../types/expense';
import {
  getPendingExpenseRecords,
  markExpenseSyncedInLocal,
  markExpenseSyncFailedInLocal,
  saveExpenseRecord,
} from './expenseStorage';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';
import {
  logSyncStart,
  logSyncLocalUpdate,
  logSyncServerWrite,
  logSyncServerConfirm,
  logSyncComplete,
} from '../sync/syncPerformanceLogger';

export const syncPendingExpenseRecords = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) {
    console.log('Expense Sync Engine: Device is offline. Changes saved locally.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  const activeDb = await getDb();
  if (!activeDb) {
    console.warn('Expense Sync Engine: Firestore getDb() instance unavailable.');
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
    let attempt = 0;
    let success = false;
    const maxAttempts = 3;

    logSyncStart('Expenses', record.id);
    logSyncLocalUpdate('Expenses', record.id);

    while (attempt < maxAttempts && !success) {
      attempt++;
      try {
        let receiptDownloadUrl = record.receiptUrl || null;
        let storagePathVal = record.storagePath || null;

        if (
          record.localReceiptData &&
          record.localReceiptData.startsWith('data:') &&
          storage
        ) {
          try {
            const empCode = record.employeeCode || 'EMP-UNKNOWN';
            const fileName = record.receiptFileName || `receipt_${record.id}.jpg`;
            storagePathVal = `expenseReceipts/${empCode}/${record.id}/${fileName}`;
            const storageRef = ref(storage, storagePathVal);

            logSyncServerWrite('Expenses_Storage', record.id);
            await uploadString(storageRef, record.localReceiptData, 'data_url');
            receiptDownloadUrl = await getDownloadURL(storageRef);
          } catch (uploadErr: any) {
            console.error(`Expense Sync Engine: Receipt upload failed for ${record.id}:`, uploadErr);
            recordSyncFailure('Expenses', record.id, uploadErr?.message || 'Receipt storage upload failed', `Expense ₹${record.amount} (${record.category})`, record.employeeCode, { ...record, localReceiptData: '[IMAGE_DATA]' });
            markExpenseSyncFailedInLocal(record.id);
            errorsCount++;
            break;
          }
        }

        logSyncServerWrite('Expenses', record.id);
        const docRef = doc(activeDb, 'expenses', record.id);
        const serverSyncTime = new Date().toISOString();

        const { localReceiptData, ...cleanPayload } = record;
        const firestorePayload: Partial<ExpenseRecord> = {
          ...cleanPayload,
          receiptUrl: receiptDownloadUrl,
          storagePath: storagePathVal,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
          createdAtDeviceTime: record.createdAtDeviceTime,
        };

        await setDoc(docRef, firestorePayload, { merge: true });

        logSyncServerConfirm('Expenses', record.id);

        saveExpenseRecord({
          ...record,
          receiptUrl: receiptDownloadUrl,
          storagePath: storagePathVal,
          localReceiptData: null,
          syncStatus: 'Synced',
          serverSyncTime: serverSyncTime,
        });

        recordSyncSuccess('Expenses', record.id);
        logSyncComplete('Expenses', record.id);

        syncedCount++;
        success = true;
      } catch (err: any) {
        console.error(`Expense Sync Engine: Error syncing expense ID ${record.id} (Attempt ${attempt}/${maxAttempts}):`, err);

        if (attempt < maxAttempts) {
          const backoffMs = attempt === 1 ? 300 : attempt === 2 ? 800 : 1500;
          await new Promise((res) => setTimeout(res, backoffMs));
        } else {
          recordSyncFailure('Expenses', record.id, err?.message || 'Expense sync failed', `Expense ₹${record.amount} (${record.category})`, record.employeeCode, { ...record, localReceiptData: '[IMAGE_DATA]' });
          markExpenseSyncFailedInLocal(record.id);
          errorsCount++;
        }
      }
    }
  }

  return { syncedCount, errorsCount };
};

export const startExpenseAutoSyncEngine = (): (() => void) => {
  const handleOnline = () => {
    console.log('Expense Sync Engine: Connectivity restored. Syncing pending expenses...');
    syncPendingExpenseRecords();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('Expense Sync Engine: App returned to foreground. Syncing pending expenses...');
      syncPendingExpenseRecords();
    }
  };

  window.addEventListener('online', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  if (navigator.onLine) {
    syncPendingExpenseRecords();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
  };
};
