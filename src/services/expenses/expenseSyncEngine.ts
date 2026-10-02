import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, auth, getActiveAuth } from '../firebase/config';
import { ExpenseRecord } from '../../types/expense';
import {
  getPendingExpenseRecords,
  getPendingReceiptUploadRecords,
  getStoredExpenseRecords,
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

export interface ReceiptUploadProgressEvent {
  expenseId: string;
  progress: number; // 0 to 100
  status: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED';
  error?: string | null;
}

const progressListeners = new Set<(event: ReceiptUploadProgressEvent) => void>();

export const subscribeToReceiptUploadProgress = (
  listener: (event: ReceiptUploadProgressEvent) => void
): (() => void) => {
  progressListeners.add(listener);
  return () => {
    progressListeners.delete(listener);
  };
};

export const emitReceiptUploadProgress = (event: ReceiptUploadProgressEvent): void => {
  progressListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (e) {
      console.warn('Error in receipt upload progress listener:', e);
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('exfin-receipt-upload-progress', { detail: event })
    );
  }
};

/**
 * Normalizes Firebase Storage errors into human-readable, safe status descriptions.
 * Prevents raw exceptions from confusing users or leaking internal infrastructure details.
 */
export const normalizeFirebaseStorageError = (err: any): string => {
  if (!err) return 'Unknown upload error occurred.';
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();

  if (message.includes('timed out') || message.includes('timeout')) {
    return 'Receipt upload timed out. The receipt has been kept for retry.';
  }
  if (code.includes('unauthorized') || message.includes('unauthorized') || message.includes('permission denied')) {
    return 'Receipt upload was rejected by Firebase Storage security rules.';
  }
  if (code.includes('unauthenticated') || message.includes('unauthenticated')) {
    return 'Your Firebase login session is unavailable. Please sign in again.';
  }
  if (code.includes('bucket-not-found') || message.includes('bucket-not-found') || message.includes('bucket not found')) {
    return 'Firebase Storage bucket is not available.';
  }
  if (code.includes('quota-exceeded') || message.includes('quota') || message.includes('billing')) {
    return 'Firebase Storage is unavailable because the project Storage quota/billing configuration does not allow this upload.';
  }
  if (code.includes('network') || message.includes('network') || message.includes('fetch failed')) {
    return 'Network error while uploading receipt. The receipt has been kept for retry.';
  }
  if (code.includes('canceled') || message.includes('canceled') || message.includes('cancelled')) {
    return 'Receipt upload was cancelled.';
  }
  if (code.includes('unknown')) {
    return 'Firebase Storage returned an unknown upload error.';
  }

  return (err?.message ? String(err.message).substring(0, 180) : 'Receipt upload failed. Please check network and retry.');
};

/**
 * Safely converts Base64 Data URL into binary Blob.
 */
export const dataUrlToBlob = (dataUrl: string): { blob: Blob; contentType: string } => {
  const parts = dataUrl.split(';base64,');
  const contentType = parts[0]?.split(':')[1] || 'image/jpeg';
  const base64Data = parts[1] || '';
  const binaryString = window.atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return {
    blob: new Blob([bytes], { type: contentType }),
    contentType,
  };
};

/**
 * Resolves the rules-compliant Firebase Storage path:
 * expense_receipts/{firebaseAuthUid}/{safeUniqueFileName}
 * Exactly matches storage.rules:
 * match /expense_receipts/{userId}/{fileName} {
 *   allow read: if request.auth != null;
 *   allow write: if request.auth != null && request.auth.uid == userId;
 * }
 */
export const getExpenseReceiptStoragePath = (
  record: ExpenseRecord
): { storagePath: string; firebaseUid: string } => {
  const currentAuth = getActiveAuth ? getActiveAuth() : auth;
  const firebaseUid = currentAuth?.currentUser?.uid || (auth as any)?.currentUser?.uid;

  if (!firebaseUid) {
    throw new Error('Authenticated Firebase user is unavailable for receipt upload.');
  }

  // Create unique safe file name containing the expense ID and clean filename
  const baseName = record.receiptFileName || `receipt_${record.id}.jpg`;
  const cleanBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeFileName = cleanBaseName.startsWith(record.id)
    ? cleanBaseName
    : `${record.id}_${cleanBaseName}`;

  return {
    storagePath: `expense_receipts/${firebaseUid}/${safeFileName}`,
    firebaseUid,
  };
};

/**
 * Executes a Promise with a timeout safeguard.
 * Ensures Firebase Storage network requests never hang the application indefinitely.
 */
export const withTimeout = <T>(
  promise: Promise<T> | PromiseLike<T>,
  timeoutMs: number = 60000,
  label: string = 'Operation'
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((res) => {
        clearTimeout(timer);
        resolve(res as T);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

/**
 * Uploads an expense receipt image to Firebase Storage in the background using resumable upload.
 * Tracks real byte transfer progress (0% - 100%).
 * Completely decoupled from the primary expense submission flow.
 * Uses the canonical storage.rules path: expense_receipts/{uid}/{fileName}
 */
export const uploadExpenseReceiptInBackground = async (
  record: ExpenseRecord
): Promise<boolean> => {
  if (
    !record.localReceiptData ||
    !record.localReceiptData.startsWith('data:') ||
    !storage ||
    !db
  ) {
    return false;
  }

  const docRef = doc(db, 'expenses', record.id);

  // Check offline status
  if (!navigator.onLine) {
    console.log(`Expense Sync Engine: Device offline. Receipt for ${record.id} kept locally.`);
    const offlineMsg = 'Receipt saved locally. Will upload when connection is restored.';
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUploadStatus: 'PENDING',
      receiptUploadError: offlineMsg,
      receiptUploadProgress: 0,
      clearLocalReceiptData: false,
    });
    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 0,
      status: 'PENDING',
      error: offlineMsg,
    });
    return false;
  }

  // Check Firebase Auth UID
  let storagePathVal = '';
  try {
    const pathInfo = getExpenseReceiptStoragePath(record);
    storagePathVal = pathInfo.storagePath;
  } catch (authErr: any) {
    const errorMsg = 'Your Firebase login session is unavailable. Please sign in again.';
    console.warn(`Expense Sync Engine: Cannot upload receipt for ${record.id}:`, authErr);

    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUploadStatus: 'FAILED',
      receiptUploadError: errorMsg,
      receiptUploadProgress: 0,
      receiptLastAttemptAt: new Date().toISOString(),
      clearLocalReceiptData: false,
    });

    try {
      await updateDoc(docRef, {
        receiptUploadStatus: 'FAILED',
        receiptUploadError: errorMsg,
        receiptLastAttemptAt: new Date().toISOString(),
      });
    } catch {}

    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 0,
      status: 'FAILED',
      error: errorMsg,
    });

    return false;
  }

  try {
    const storageRef = ref(storage, storagePathVal);
    logSyncServerWrite('Expenses_Receipt_Storage', record.id);

    // Initial state: UPLOADING 0%
    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 0,
      status: 'UPLOADING',
    });
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUploadStatus: 'UPLOADING',
      receiptUploadProgress: 0,
      receiptUploadError: null,
      storagePath: storagePathVal,
    });

    // Convert data URL to Blob
    const { blob, contentType } = dataUrlToBlob(record.localReceiptData);

    // Create Resumable Upload Task
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: record.receiptContentType || contentType,
    });

    // Wrap uploadTask in a real Promise that resolves ONLY when state_changed observer finishes
    const uploadCompletionPromise = new Promise<void>((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (snapshot.totalBytes > 0) {
            const percent = Math.min(
              99,
              Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
            );
            emitReceiptUploadProgress({
              expenseId: record.id,
              progress: percent,
              status: 'UPLOADING',
            });
            updateExpenseReceiptStatusInLocal(record.id, {
              receiptUploadStatus: 'UPLOADING',
              receiptUploadProgress: percent,
            });
          }
        },
        (error) => {
          reject(error);
        },
        () => {
          resolve();
        }
      );
    });

    // Await upload completion with 60-second timeout safeguard
    await withTimeout(
      uploadCompletionPromise,
      60000,
      `Receipt upload for ${record.id}`
    );

    // Retrieve public download URL with 60-second timeout safeguard ONLY after upload completes
    const downloadUrl = await withTimeout<string>(
      getDownloadURL(storageRef),
      60000,
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
      receiptUploadProgress: 100,
      receiptUploadError: null,
      receiptLastAttemptAt: finishIso,
      clearLocalReceiptData: true,
    });

    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 100,
      status: 'UPLOADED',
    });

    console.log(`Expense Sync Engine: Background receipt upload successfully completed for ${record.id}`);
    return true;
  } catch (uploadErr: any) {
    const normalizedError = normalizeFirebaseStorageError(uploadErr);
    console.warn(
      `Expense Sync Engine: Background receipt upload failed for ${record.id} (${normalizedError}):`,
      uploadErr
    );
    const errTime = new Date().toISOString();

    try {
      await updateDoc(docRef, {
        receiptUploadStatus: 'FAILED',
        receiptUploadError: normalizedError,
        receiptLastAttemptAt: errTime,
      });
    } catch (fsErr) {
      console.warn('Could not update receipt upload error status in Firestore:', fsErr);
    }

    // Keep localReceiptData for automatic background retry without invalidating the synced claim
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUploadStatus: 'FAILED',
      receiptUploadError: normalizedError,
      receiptUploadProgress: 0,
      receiptLastAttemptAt: errTime,
      clearLocalReceiptData: false,
    });

    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 0,
      status: 'FAILED',
      error: normalizedError,
    });

    return false;
  }
};

/**
 * Manually or programmatically retries the receipt upload for a single expense record.
 */
export const retrySingleExpenseReceiptUpload = async (expenseId: string): Promise<boolean> => {
  const records = getStoredExpenseRecords();
  const target = records.find((r) => r.id === expenseId);
  if (!target) {
    console.warn(`Expense Sync Engine: No stored record found for expense ${expenseId}`);
    return false;
  }
  if (!target.localReceiptData) {
    console.warn(`Expense Sync Engine: No local receipt image data available for ${expenseId}`);
    return false;
  }

  return await uploadExpenseReceiptInBackground(target);
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
    const success = await uploadExpenseReceiptInBackground(record);
    if (success) {
      uploadedCount++;
    } else {
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
          const initialReceiptStatus: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED' = record.receiptUrl
            ? 'UPLOADED'
            : hasLocalReceipt
            ? (record.receiptUploadStatus === 'FAILED' ? 'FAILED' : 'PENDING')
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
