import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { ExpenseRecord } from '../../types/expense';
import {
  getPendingExpenseRecords,
  getPendingReceiptUploadRecords,
  markExpenseSyncedInLocal,
  markExpenseSyncFailedInLocal,
  updateExpenseReceiptStatusInLocal,
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

/**
 * Executes a Promise with a timeout safeguard.
 * Ensures Firebase Storage network requests never hang the application indefinitely.
 */
export const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  label: string = 'Operation'
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

/**
 * Uploads an expense receipt image to Firebase Storage in the background.
 * Completely decoupled from the primary expense submission flow.
 * Timeouts after 30 seconds to prevent hanging.
 */
export const uploadExpenseReceiptInBackground = async (
  record: ExpenseRecord
): Promise<void> => {
  if (
    !record.localReceiptData ||
    !record.localReceiptData.startsWith('data:') ||
    !storage ||
    !db
  ) {
    return;
  }

  const nowIso = new Date().toISOString();
  const empCode = record.employeeCode || record.employeeId || 'EMP-UNKNOWN';
  const fileName = record.receiptFileName || `receipt_${record.id}.jpg`;
  const storagePathVal = record.storagePath || `expenseReceipts/${empCode}/${record.id}/${fileName}`;
  const docRef = doc(db, 'expenses', record.id);

  try {
    const storageRef = ref(storage, storagePathVal);
    logSyncServerWrite('Expenses_Receipt_Storage', record.id);

    // Upload image data with 30-second timeout
    await withTimeout(
      uploadString(storageRef, record.localReceiptData, 'data_url'),
      30000,
      `Receipt upload for ${record.id}`
    );

    // Retrieve public download URL with 30-second timeout
    const downloadUrl = await withTimeout(
      getDownloadURL(storageRef),
      30000,
      `Receipt getDownloadURL for ${record.id}`
    );

    const finishIso = new Date().toISOString();

    // Update Firestore document with live download URL
    await updateDoc(docRef, {
      receiptUrl: downloadUrl,
      storagePath: storagePathVal,
      receiptUploadStatus: 'UPLOADED',
      receiptUploadError: null,
      receiptLastAttemptAt: finishIso,
    });

    // Update local record & free memory by clearing localReceiptData
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUrl: downloadUrl,
      storagePath: storagePathVal,
      receiptUploadStatus: 'UPLOADED',
      receiptUploadError: null,
      receiptLastAttemptAt: finishIso,
      clearLocalReceiptData: true,
    });

    console.log(`Expense Sync Engine: Background receipt upload successfully completed for ${record.id}`);
  } catch (uploadErr: any) {
    console.warn(
      `Expense Sync Engine: Background receipt upload failed for ${record.id} (expense claim remains valid):`,
      uploadErr
    );
    const safeMsg = uploadErr?.message
      ? String(uploadErr.message).substring(0, 200)
      : 'Receipt image upload failed';
    const errTime = new Date().toISOString();

    try {
      await updateDoc(docRef, {
        receiptUploadStatus: 'FAILED',
        receiptUploadError: safeMsg,
        receiptLastAttemptAt: errTime,
      });
    } catch (fsErr) {
      console.warn('Could not update receipt upload error status in Firestore:', fsErr);
    }

    // Keep localReceiptData for automatic background retry without invalidating the synced claim
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUploadStatus: 'FAILED',
      receiptUploadError: safeMsg,
      receiptLastAttemptAt: errTime,
      clearLocalReceiptData: false,
    });
  }
};

/**
 * Retries standalone receipt uploads for expenses whose Firestore documents already exist
 * but receipt image upload is pending or previously failed.
 * Guarantees zero duplicate Firestore expense documents.
 */
export const retryPendingExpenseReceiptUploads = async (): Promise<{
  uploadedCount: number;
  failedCount: number;
}> => {
  if (!navigator.onLine || !storage || !db) {
    return { uploadedCount: 0, failedCount: 0 };
  }

  const pendingUploads = getPendingReceiptUploadRecords();
  if (pendingUploads.length === 0) {
    return { uploadedCount: 0, failedCount: 0 };
  }

  console.log(`Expense Sync Engine: Retrying ${pendingUploads.length} pending receipt uploads in background.`);
  let uploadedCount = 0;
  let failedCount = 0;

  for (const record of pendingUploads) {
    if (!record.localReceiptData || !record.localReceiptData.startsWith('data:')) {
      continue;
    }

    const nowIso = new Date().toISOString();
    try {
      const empCode = record.employeeCode || record.employeeId || 'EMP-UNKNOWN';
      const fileName = record.receiptFileName || `receipt_${record.id}.jpg`;
      const storagePathVal = record.storagePath || `expenseReceipts/${empCode}/${record.id}/${fileName}`;
      const storageRef = ref(storage, storagePathVal);

      logSyncServerWrite('Expenses_Receipt_Storage_Retry', record.id);

      await withTimeout(
        uploadString(storageRef, record.localReceiptData, 'data_url'),
        30000,
        `Receipt retry upload for ${record.id}`
      );

      const downloadUrl = await withTimeout(
        getDownloadURL(storageRef),
        30000,
        `Receipt retry getDownloadURL for ${record.id}`
      );

      const finishIso = new Date().toISOString();

      // Update Firestore document with receipt metadata
      const docRef = doc(db, 'expenses', record.id);
      await updateDoc(docRef, {
        receiptUrl: downloadUrl,
        storagePath: storagePathVal,
        receiptUploadStatus: 'UPLOADED',
        receiptUploadError: null,
        receiptLastAttemptAt: finishIso,
      });

      // Update local storage record (clearing local base64 data to free memory)
      updateExpenseReceiptStatusInLocal(record.id, {
        receiptUrl: downloadUrl,
        storagePath: storagePathVal,
        receiptUploadStatus: 'UPLOADED',
        receiptUploadError: null,
        receiptLastAttemptAt: finishIso,
        clearLocalReceiptData: true,
      });

      console.log(`Expense Sync Engine: Successfully retried receipt upload for expense ${record.id}`);
      uploadedCount++;
    } catch (err: any) {
      console.warn(`Expense Sync Engine: Standalone receipt retry failed for expense ${record.id}:`, err);
      const safeErrorMsg = err?.message ? String(err.message).substring(0, 200) : 'Receipt upload failed';
      const errIso = new Date().toISOString();

      try {
        const docRef = doc(db, 'expenses', record.id);
        await updateDoc(docRef, {
          receiptUploadStatus: 'FAILED',
          receiptUploadError: safeErrorMsg,
          receiptLastAttemptAt: errIso,
        });
      } catch (firestoreUpdateErr) {
        console.warn('Failed to update receipt error status in Firestore:', firestoreUpdateErr);
      }

      updateExpenseReceiptStatusInLocal(record.id, {
        receiptUploadStatus: 'FAILED',
        receiptUploadError: safeErrorMsg,
        receiptLastAttemptAt: errIso,
        clearLocalReceiptData: false,
      });

      failedCount++;
    }
  }

  return { uploadedCount, failedCount };
};

/**
 * Synchronizes pending expense claims to Firestore.
 * CORE RULE: The authoritative expense document is ALWAYS written and resolved FIRST.
 * Receipt image upload to Firebase Storage runs completely independently in the background
 * and NEVER blocks or delays the UI from closing the "Saving Claim..." modal.
 */
export const syncPendingExpenseRecords = async (): Promise<{
  syncedCount: number;
  errorsCount: number;
}> => {
  if (!navigator.onLine) {
    console.log('Expense Sync Engine: Device is offline. Changes saved locally.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  if (!db) {
    console.warn('Expense Sync Engine: Firestore db instance unavailable.');
    return { syncedCount: 0, errorsCount: 0 };
  }

  const pendingRecords = getPendingExpenseRecords();
  let syncedCount = 0;
  let errorsCount = 0;

  if (pendingRecords.length > 0) {
    console.log(`Expense Sync Engine: Found ${pendingRecords.length} pending expense records to sync.`);

    for (const record of pendingRecords) {
      let attempt = 0;
      let success = false;
      const maxAttempts = 3;

      logSyncStart('Expenses', record.id);
      logSyncLocalUpdate('Expenses', record.id);

      while (attempt < maxAttempts && !success) {
        attempt++;
        try {
          // STEP 1: Build the clean Firestore expense payload.
          // Note: localReceiptData is stripped so large base64 image strings are never stored in Firestore doc
          const { localReceiptData, ...cleanPayload } = record;
          const serverSyncTime = new Date().toISOString();

          // Determine initial receipt upload status
          const hasLocalReceipt = Boolean(localReceiptData && localReceiptData.startsWith('data:'));
          const initialReceiptStatus: 'PENDING' | 'UPLOADED' | 'FAILED' = record.receiptUrl
            ? 'UPLOADED'
            : hasLocalReceipt
            ? (record.receiptUploadStatus || 'PENDING')
            : 'UPLOADED';

          const firestorePayload: Record<string, any> = {
            ...cleanPayload,
            id: record.id,
            employeeId: record.employeeId || 'EMP-UNKNOWN',
            employeeName: record.employeeName || 'Unknown Employee',
            employeeCode: record.employeeCode || record.employeeId || 'EMP-UNKNOWN',
            amount: Number(record.amount) || 0,
            category: record.category || 'Miscellaneous',
            date: record.date || serverSyncTime.split('T')[0],
            description: record.description || '',
            status: record.status || 'Pending',
            syncStatus: 'Synced',
            createdAtDeviceTime: record.createdAtDeviceTime || serverSyncTime,
            serverSyncTime: serverSyncTime,
            merchant: record.merchant || null,
            receiptNumber: record.receiptNumber || null,
            gstAmount: record.gstAmount != null ? Number(record.gstAmount) : null,
            receiptUrl: record.receiptUrl || null,
            storagePath: record.storagePath || null,
            receiptFileName: record.receiptFileName || null,
            receiptContentType: record.receiptContentType || null,
            receiptSize: record.receiptSize || null,
            receiptUploadStatus: initialReceiptStatus,
            receiptUploadError: record.receiptUploadError || null,
            receiptLastAttemptAt: record.receiptLastAttemptAt || null,
            approvedAt: record.approvedAt || null,
            approvedBy: record.approvedBy || null,
            rejectedAt: record.rejectedAt || null,
            rejectedBy: record.rejectedBy || null,
            rejectionReason: record.rejectionReason || null,
          };

          // STEP 2: Authoritatively write the expense document to Firestore FIRST.
          // This ensures the Admin Dashboard immediately receives and displays the claim.
          logSyncServerWrite('Expenses', record.id);
          const docRef = doc(db, 'expenses', record.id);
          await setDoc(docRef, firestorePayload, { merge: true });
          logSyncServerConfirm('Expenses', record.id);

          // Mark the expense itself as synchronized locally
          markExpenseSyncedInLocal(record.id, serverSyncTime);
          saveExpenseRecord({
            ...record,
            syncStatus: 'Synced',
            serverSyncTime: serverSyncTime,
            receiptUploadStatus: initialReceiptStatus,
          });

          recordSyncSuccess('Expenses', record.id);
          logSyncComplete('Expenses', record.id);
          syncedCount++;
          success = true;

          // STEP 3: Dispatch receipt upload in the BACKGROUND without blocking the save path.
          if (hasLocalReceipt && storage) {
            void uploadExpenseReceiptInBackground({
              ...record,
              syncStatus: 'Synced',
              serverSyncTime: serverSyncTime,
              receiptUploadStatus: initialReceiptStatus,
            });
          }
        } catch (err: any) {
          console.error(`Expense Sync Engine: Error writing expense document ${record.id} (Attempt ${attempt}/${maxAttempts}):`, err);

          if (attempt < maxAttempts) {
            const backoffMs = attempt === 1 ? 300 : attempt === 2 ? 800 : 1500;
            await new Promise((res) => setTimeout(res, backoffMs));
          } else {
            recordSyncFailure(
              'Expenses',
              record.id,
              err?.message || 'Expense Firestore write failed',
              `Expense ₹${record.amount} (${record.category})`,
              record.employeeCode,
              { ...record, localReceiptData: '[IMAGE_DATA]' }
            );
            markExpenseSyncFailedInLocal(record.id);
            errorsCount++;
          }
        }
      }
    }
  }

  // Trigger any pending standalone receipt retries in the background without blocking the return
  if (navigator.onLine && storage) {
    void retryPendingExpenseReceiptUploads();
  }

  return { syncedCount, errorsCount };
};

export const startExpenseAutoSyncEngine = (): (() => void) => {
  const handleOnline = () => {
    console.log('Expense Sync Engine: Connectivity restored. Syncing pending expenses and receipts...');
    syncPendingExpenseRecords();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('Expense Sync Engine: App returned to foreground. Syncing pending expenses and receipts...');
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
