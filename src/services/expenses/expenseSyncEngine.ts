import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { onAuthStateChanged, User, Auth } from 'firebase/auth';
import { db, storage, auth, getActiveAuth, getActiveStorage } from '../firebase/config';
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

// In-memory lock set to prevent duplicate concurrent uploads for the same expense
const activeExpenseUploadLocks = new Set<string>();

// Exponential backoff retry attempt tracker for transient failures
const expenseRetryAttempts = new Map<string, number>();

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
      console.warn('[EXPENSE_RECEIPT_UPLOAD] Error in receipt upload progress listener:', e);
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
 * Distinguishes temporary network/auth conditions from permanent permission/configuration failures.
 */
export const normalizeFirebaseStorageError = (err: any): { isTransient: boolean; message: string } => {
  if (!err) return { isTransient: true, message: 'Unknown upload issue. Will retry automatically.' };
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();

  if (code.includes('storage/unauthorized') || code.includes('unauthorized') || message.includes('unauthorized') || message.includes('permission denied')) {
    return { isTransient: false, message: 'Receipt upload was rejected by Firebase Storage security rules.' };
  }
  if (code.includes('storage/quota-exceeded') || code.includes('quota-exceeded') || message.includes('quota') || message.includes('billing')) {
    return { isTransient: false, message: 'Firebase Storage is unavailable due to project quota/billing limits.' };
  }
  if (code.includes('storage/bucket-not-found') || code.includes('bucket-not-found') || message.includes('bucket not found')) {
    return { isTransient: false, message: 'Firebase Storage bucket is not available.' };
  }
  if (code.includes('storage/unauthenticated') || code.includes('unauthenticated') || message.includes('unauthenticated') || message.includes('auth')) {
    return { isTransient: true, message: 'Waiting for secure login session...' };
  }
  if (code.includes('storage/retry-limit-exceeded') || message.includes('retry limit')) {
    return { isTransient: true, message: 'Upload retry limit reached. Kept for future retry.' };
  }
  if (code.includes('storage/network-request-failed') || code.includes('network') || message.includes('network') || message.includes('fetch failed')) {
    return { isTransient: true, message: 'Network error while uploading receipt. Will retry when connection stabilizes.' };
  }
  if (code.includes('storage/canceled') || code.includes('canceled') || message.includes('cancelled')) {
    return { isTransient: true, message: 'Receipt upload was cancelled.' };
  }
  if (message.includes('timed out') || message.includes('timeout')) {
    return { isTransient: true, message: 'Receipt upload timed out. Kept for automatic retry.' };
  }
  if (code.includes('unknown')) {
    return { isTransient: true, message: 'Firebase Storage returned an unknown error. Will retry.' };
  }

  return {
    isTransient: true,
    message: err?.message ? String(err.message).substring(0, 180) : 'Receipt upload failed. Will retry automatically.',
  };
};

/**
 * Waits for Firebase Auth initialization when the session is still restoring.
 * Ensures the authenticated user's UID is ready before constructing storage paths.
 * Configured with 30-second timeout to accommodate mobile app boot.
 */
export const waitForAuthenticatedFirebaseUser = async (
  authInstance?: Auth,
  timeoutMs: number = 30000
): Promise<User> => {
  const currentAuth = authInstance || (getActiveAuth ? getActiveAuth() : (auth.concrete || auth));
  const hasUid = Boolean(currentAuth?.currentUser && currentAuth.currentUser.uid);

  console.log(`[EXPENSE_RECEIPT_UPLOAD] AUTH_CHECK uidPresent=${hasUid} authInitialized=${Boolean(currentAuth?.currentUser)}`);

  if (hasUid) {
    console.log(`[EXPENSE_RECEIPT_UPLOAD] AUTH_READY uidPresent=true`);
    return currentAuth.currentUser;
  }

  return new Promise<User>((resolve, reject) => {
    let unsubscribe: (() => void) | null = null;
    const timer = setTimeout(() => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {}
      }
      reject(new Error('Firebase Auth initialization timed out. Login session may still be restoring.'));
    }, timeoutMs);

    try {
      unsubscribe = onAuthStateChanged(
        currentAuth,
        (user) => {
          if (user && user.uid) {
            clearTimeout(timer);
            if (unsubscribe) {
              try {
                unsubscribe();
              } catch {}
            }
            console.log(`[EXPENSE_RECEIPT_UPLOAD] AUTH_READY uidPresent=true`);
            resolve(user);
          }
        },
        (authError) => {
          clearTimeout(timer);
          if (unsubscribe) {
            try {
              unsubscribe();
            } catch {}
          }
          reject(authError);
        }
      );
    } catch (err) {
      clearTimeout(timer);
      reject(err);
    }
  });
};

/**
 * Safely converts Base64 Data URL into binary Blob.
 * Validates payload and MIME type, preventing unhandled browser exceptions.
 */
export const dataUrlToBlob = (dataUrl: string): { blob: Blob; contentType: string } => {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    throw new Error('Receipt image could not be prepared for upload. Please attach the receipt again.');
  }

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    throw new Error('Receipt image could not be prepared for upload. Please attach the receipt again.');
  }

  const metaPart = dataUrl.substring(0, commaIndex);
  const base64Data = dataUrl.substring(commaIndex + 1).trim();

  if (!base64Data) {
    throw new Error('Receipt image could not be prepared for upload. Please attach the receipt again.');
  }

  const mimeMatch = metaPart.match(/data:([^;]+);/);
  const contentType = mimeMatch && mimeMatch[1] ? mimeMatch[1] : 'image/jpeg';

  if (!contentType.startsWith('image/')) {
    throw new Error('Receipt image could not be prepared for upload. Please attach the receipt again.');
  }

  try {
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    if (len === 0) {
      throw new Error('Receipt image is empty.');
    }
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: contentType });
    if (blob.size === 0) {
      throw new Error('Receipt image binary is empty.');
    }
    return {
      blob,
      contentType,
    };
  } catch (decodeErr: any) {
    console.error('[EXPENSE_RECEIPT_UPLOAD] Failed to decode base64 receipt data:', decodeErr);
    throw new Error('Receipt image could not be prepared for upload. Please attach the receipt again.');
  }
};

/**
 * Resolves the rules-compliant Firebase Storage path:
 * expense_receipts/{firebaseAuthUid}/{deterministicSafeFileName}
 *
 * Exactly matches storage.rules:
 * match /expense_receipts/{userId}/{fileName} {
 *   allow read: if request.auth != null;
 *   allow write: if request.auth != null && request.auth.uid == userId;
 * }
 */
export const getExpenseReceiptStoragePath = (
  record: ExpenseRecord,
  authenticatedUid?: string
): { storagePath: string; firebaseUid: string } => {
  const currentAuth = getActiveAuth ? getActiveAuth() : auth;
  const firebaseUid = authenticatedUid || currentAuth?.currentUser?.uid || (auth as any)?.currentUser?.uid;

  if (!firebaseUid) {
    throw new Error('Authenticated Firebase user is unavailable for receipt upload.');
  }

  // Idempotent & deterministic safe filename based on record.id
  const safeExpenseId = record.id.replace(/[^a-zA-Z0-9_-]/g, '_');
  const rawBaseName = (record.receiptFileName || `${safeExpenseId}_receipt.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeFileName = rawBaseName.startsWith(safeExpenseId)
    ? rawBaseName
    : `${safeExpenseId}_${rawBaseName}`;

  return {
    storagePath: `expense_receipts/${firebaseUid}/${safeFileName}`,
    firebaseUid,
  };
};

/**
 * Schedules an automatic exponential-backoff retry for transient failures.
 */
const scheduleExpenseReceiptRetry = (expenseId: string): void => {
  const attempts = (expenseRetryAttempts.get(expenseId) || 0) + 1;
  expenseRetryAttempts.set(expenseId, attempts);

  const backoffDelays = [2000, 5000, 15000, 30000];
  const delay = backoffDelays[Math.min(attempts - 1, backoffDelays.length - 1)];

  console.log(`[EXPENSE_RECEIPT_UPLOAD] Scheduling automatic retry #${attempts} for ${expenseId} in ${delay}ms`);

  setTimeout(() => {
    if (navigator.onLine) {
      void retrySingleExpenseReceiptUpload(expenseId);
    }
  }, delay);
};

/**
 * Executes a Promise with a timeout safeguard.
 * Ensures Firebase Storage network requests never hang indefinitely.
 */
export const withTimeout = <T>(
  promise: Promise<T> | PromiseLike<T>,
  timeoutMs: number = 120000,
  label: string = 'Operation',
  onTimeoutCleanup?: () => void
): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (onTimeoutCleanup) {
        try {
          onTimeoutCleanup();
        } catch (cleanupErr) {
          console.warn('[EXPENSE_RECEIPT_UPLOAD] Cleanup on timeout failed:', cleanupErr);
        }
      }
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

  // Check in-memory lock to prevent duplicate concurrent uploads for this expense
  if (activeExpenseUploadLocks.has(record.id)) {
    console.log(`[EXPENSE_RECEIPT_UPLOAD] Upload for ${record.id} already in progress. Skipping duplicate.`);
    return false;
  }
  activeExpenseUploadLocks.add(record.id);

  const docRef = doc(db, 'expenses', record.id);

  // Check offline status
  if (!navigator.onLine) {
    console.log(`[EXPENSE_RECEIPT_UPLOAD] Device offline. Receipt for ${record.id} kept locally.`);
    const offlineMsg = 'Receipt saved. Will upload automatically.';
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
    activeExpenseUploadLocks.delete(record.id);
    return false;
  }

  // Step 1: Wait for Authenticated Firebase User
  let firebaseUid = '';
  try {
    const user = await waitForAuthenticatedFirebaseUser(undefined, 30000);
    firebaseUid = user.uid;
  } catch (authErr: any) {
    console.warn(`[EXPENSE_RECEIPT_UPLOAD] AUTH_NOT_READY expenseId=${record.id}:`, authErr);
    const waitingMsg = 'Waiting for secure login session...';

    // Temporary auth restoration delay is NOT marked as FAILED - kept as PENDING
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUploadStatus: 'PENDING',
      receiptUploadError: waitingMsg,
      receiptUploadProgress: 0,
      receiptLastAttemptAt: new Date().toISOString(),
      clearLocalReceiptData: false,
    });

    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 0,
      status: 'PENDING',
      error: waitingMsg,
    });

    activeExpenseUploadLocks.delete(record.id);
    scheduleExpenseReceiptRetry(record.id);
    return false;
  }

  // Step 2: Storage path resolution
  let storagePathVal = '';
  try {
    const pathInfo = getExpenseReceiptStoragePath(record, firebaseUid);
    storagePathVal = pathInfo.storagePath;
    console.log(`[EXPENSE_RECEIPT_UPLOAD] STORAGE_READY uid=<present> path=${storagePathVal}`);
  } catch (pathErr: any) {
    console.warn(`[EXPENSE_RECEIPT_UPLOAD] STORAGE_PATH_ERROR expenseId=${record.id}:`, pathErr);
    activeExpenseUploadLocks.delete(record.id);
    return false;
  }

  let uploadTaskRef: any = null;

  try {
    const activeStorage = getActiveStorage ? getActiveStorage() : (storage.concrete || storage);
    if (!activeStorage) {
      console.warn(`[EXPENSE_RECEIPT_UPLOAD] STORAGE_NOT_READY expenseId=${record.id}`);
      throw new Error('Firebase Storage instance is unavailable.');
    }

    const storageRef = ref(activeStorage, storagePathVal);
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

    // Convert data URL to Blob safely
    const { blob, contentType } = dataUrlToBlob(record.localReceiptData);
    console.log(`[EXPENSE_RECEIPT_UPLOAD] UPLOAD_START expenseId=${record.id} size=${blob.size} mime=${contentType}`);

    // Create Resumable Upload Task
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: record.receiptContentType || contentType,
    });
    uploadTaskRef = uploadTask;

    // Wrap uploadTask in a Promise that resolves ONLY when state_changed observer finishes
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
            console.log(`[EXPENSE_RECEIPT_UPLOAD] UPLOAD_PROGRESS expenseId=${record.id} progress=${percent}%`);
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

    // Await upload completion with 120-second timeout safeguard (cancels upload task on timeout)
    await withTimeout(
      uploadCompletionPromise,
      120000,
      `Receipt upload for ${record.id}`,
      () => {
        if (uploadTaskRef && typeof uploadTaskRef.cancel === 'function') {
          uploadTaskRef.cancel();
        }
      }
    );
    console.log(`[EXPENSE_RECEIPT_UPLOAD] UPLOAD_COMPLETE expenseId=${record.id}`);

    // Retrieve public download URL with 60-second timeout safeguard ONLY after upload completes
    console.log(`[EXPENSE_RECEIPT_UPLOAD] DOWNLOAD_URL_START expenseId=${record.id}`);
    const downloadUrl = await withTimeout<string>(
      getDownloadURL(storageRef),
      60000,
      `Receipt getDownloadURL for ${record.id}`
    );
    console.log(`[EXPENSE_RECEIPT_UPLOAD] DOWNLOAD_URL_COMPLETE expenseId=${record.id}`);

    const finishIso = new Date().toISOString();

    // Update Firestore document with live download URL
    console.log(`[EXPENSE_RECEIPT_UPLOAD] FIRESTORE_RECEIPT_UPDATE expenseId=${record.id}`);
    await updateDoc(docRef, {
      receiptUrl: downloadUrl,
      storagePath: storagePathVal,
      receiptUploadStatus: 'UPLOADED',
      receiptUploadError: null,
      receiptLastAttemptAt: finishIso,
    });

    // Update local record & free memory by clearing localReceiptData ONLY after confirmed success
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUrl: downloadUrl,
      storagePath: storagePathVal,
      receiptUploadStatus: 'UPLOADED',
      receiptUploadProgress: 100,
      receiptUploadError: null,
      receiptLastAttemptAt: finishIso,
      clearLocalReceiptData: true,
    });

    // Reset retry attempts on confirmed success
    expenseRetryAttempts.delete(record.id);

    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 100,
      status: 'UPLOADED',
    });

    console.log(`[EXPENSE_RECEIPT_UPLOAD] RECEIPT_UPLOAD_SUCCESS expenseId=${record.id}`);
    return true;
  } catch (uploadErr: any) {
    const failureCode = uploadErr?.code || 'UNKNOWN';
    console.log(`[EXPENSE_RECEIPT_UPLOAD] FAILURE_CODE=${failureCode}`);

    const { isTransient, message: normalizedError } = normalizeFirebaseStorageError(uploadErr);
    console.warn(
      `[EXPENSE_RECEIPT_UPLOAD] RECEIPT_UPLOAD_FAILED expenseId=${record.id} isTransient=${isTransient} error=${normalizedError}`,
      uploadErr
    );
    const errTime = new Date().toISOString();
    const finalStatus = isTransient ? 'PENDING' : 'FAILED';

    try {
      await updateDoc(docRef, {
        receiptUploadStatus: finalStatus,
        receiptUploadError: normalizedError,
        receiptLastAttemptAt: errTime,
      });
    } catch (fsErr) {
      console.warn('[EXPENSE_RECEIPT_UPLOAD] Could not update receipt upload status in Firestore:', fsErr);
    }

    // Keep localReceiptData for automatic background retry without invalidating the synced claim
    updateExpenseReceiptStatusInLocal(record.id, {
      receiptUploadStatus: finalStatus,
      receiptUploadError: normalizedError,
      receiptUploadProgress: 0,
      receiptLastAttemptAt: errTime,
      clearLocalReceiptData: false,
    });

    emitReceiptUploadProgress({
      expenseId: record.id,
      progress: 0,
      status: finalStatus,
      error: normalizedError,
    });

    if (isTransient) {
      scheduleExpenseReceiptRetry(record.id);
    }

    return false;
  } finally {
    activeExpenseUploadLocks.delete(record.id);
  }
};

/**
 * Manually or programmatically retries the receipt upload for a single expense record.
 */
export const retrySingleExpenseReceiptUpload = async (expenseId: string): Promise<boolean> => {
  console.log(`[EXPENSE_RECEIPT_UPLOAD] UPLOAD_RETRY single expenseId=${expenseId}`);
  const records = getStoredExpenseRecords();
  const target = records.find((r) => r.id === expenseId);
  if (!target) {
    console.warn(`[EXPENSE_RECEIPT_UPLOAD] No stored record found for expense ${expenseId}`);
    return false;
  }
  if (!target.localReceiptData) {
    console.warn(`[EXPENSE_RECEIPT_UPLOAD] No local receipt image data available for ${expenseId}`);
    return false;
  }

  return await uploadExpenseReceiptInBackground(target);
};

/**
 * Retries standalone receipt uploads for expenses whose Firestore documents already exist
 * but receipt image upload is pending or previously failed.
 * Guarantees zero duplicate Firestore expense documents.
 * Executes sequentially to prevent resource contention.
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

  console.log(`[EXPENSE_RECEIPT_UPLOAD] UPLOAD_RETRY batch count=${pendingUploads.length}`);
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

  // When auth session is initialized/restored, automatically trigger pending receipt upload retries
  const currentAuth = getActiveAuth ? getActiveAuth() : auth;
  let unsubAuth = () => {};
  try {
    unsubAuth = onAuthStateChanged(currentAuth, (user) => {
      if (user && user.uid && navigator.onLine) {
        console.log('[EXPENSE_RECEIPT_UPLOAD] Auth session active. Triggering pending receipt retries...');
        void retryPendingExpenseReceiptUploads();
      }
    });
  } catch (authSubErr) {
    console.warn('[EXPENSE_RECEIPT_UPLOAD] Could not attach auth state change listener:', authSubErr);
  }

  if (navigator.onLine) {
    syncPendingExpenseRecords();
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    try {
      unsubAuth();
    } catch {}
  };
};
