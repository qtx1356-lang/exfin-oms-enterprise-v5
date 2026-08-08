import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { ExpenseRecord } from '../../types/expense';
import {
  getPendingExpenseRecords,
  markExpenseSyncedInLocal,
  markExpenseSyncFailedInLocal,
  saveExpenseRecord,
} from './expenseStorage';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';

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
      let receiptDownloadUrl = record.receiptUrl || null;
      let storagePathVal = record.storagePath || null;

      // Priority 1: Move receipt image from Base64 to Firebase Storage
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

          console.log(`Expense Sync Engine: Uploading receipt to Storage path: ${storagePathVal}`);
          await uploadString(storageRef, record.localReceiptData, 'data_url');
          receiptDownloadUrl = await getDownloadURL(storageRef);
          console.log(`Expense Sync Engine: Receipt uploaded successfully. URL: ${receiptDownloadUrl}`);
        } catch (uploadErr: any) {
          console.error(`Expense Sync Engine: Receipt upload failed for ${record.id}:`, uploadErr);
          recordSyncFailure('Expenses', record.id, uploadErr?.message || 'Receipt storage upload failed', `Expense ₹${record.amount} (${record.category})`);
          markExpenseSyncFailedInLocal(record.id);
          errorsCount++;
          continue; // Skip Firestore doc update if Storage upload fails
        }
      }

      const docRef = doc(db, 'expenses', record.id);
      const docSnap = await getDoc(docRef);
      const serverSyncTime = new Date().toISOString();

      // Clean payload for Firestore: NEVER include heavy Base64 localReceiptData
      const { localReceiptData, ...cleanPayload } = record;
      const firestorePayload: ExpenseRecord = {
        ...cleanPayload,
        receiptUrl: receiptDownloadUrl,
        storagePath: storagePathVal,
        syncStatus: 'Synced',
        serverSyncTime: serverSyncTime,
        createdAtDeviceTime: record.createdAtDeviceTime,
      };

      if (!docSnap.exists()) {
        await setDoc(docRef, firestorePayload);
        console.log(`Expense Sync Engine: Successfully synced expense ID ${record.id}`);
      } else {
        const existingData = docSnap.data() as ExpenseRecord;
        await setDoc(
          docRef,
          {
            ...firestorePayload,
            status: existingData.status || record.status,
            rejectionReason: existingData.rejectionReason || record.rejectionReason,
            createdAtDeviceTime: existingData.createdAtDeviceTime || record.createdAtDeviceTime,
          },
          { merge: true }
        );
        console.log(`Expense Sync Engine: Updated synced expense ID ${record.id}`);
      }

      // Update local storage record with download URL, clear Base64 to save local storage space
      saveExpenseRecord({
        ...record,
        receiptUrl: receiptDownloadUrl,
        storagePath: storagePathVal,
        localReceiptData: null,
        syncStatus: 'Synced',
        serverSyncTime: serverSyncTime,
      });

      recordSyncSuccess('Expenses', record.id);
      syncedCount++;
    } catch (err: any) {
      console.error(`Expense Sync Engine: Error syncing expense ID ${record.id}:`, err);
      recordSyncFailure('Expenses', record.id, err?.message || 'Expense sync failed', `Expense ₹${record.amount} (${record.category})`);
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
