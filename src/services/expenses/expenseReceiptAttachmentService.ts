import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { signInAnonymously } from 'firebase/auth';

export interface ExpenseReceiptAttachmentMetadata {
  attachmentId: string;
  expenseId: string;
  employeeId?: string | null;
  employeeCode?: string | null;
  fileName: string;
  mimeType: string;
  fileSize: number;
  totalChunks: number;
  status: 'uploading' | 'completed' | 'failed';
  uploadedAt: string;
  completedAt?: string | null;
  failureReason?: string | null;
}

const CHUNK_SIZE = 500 * 1024; // 500 KB chunk, comfortable within Firestore 1 MB document limit
const ATTACHMENT_COLLECTION = 'expense_receipt_attachments';

// In-memory cache for reconstructed Blob URLs to avoid re-fetching/re-creating Blobs on every render
const attachmentBlobCache = new Map<string, string>();
const pendingAttachmentFetches = new Map<string, Promise<string>>();

/**
 * Ensures a valid Firebase Authentication session is active.
 */
export async function ensureFirebaseAuthSession(): Promise<string> {
  if (auth?.currentUser?.uid) {
    return auth.currentUser.uid;
  }
  if (!auth) {
    throw new Error('Firebase Auth is uninitialized.');
  }

  try {
    console.log('[EXPENSE_ATTACHMENT] Initializing auth session...');
    const cred = await signInAnonymously(auth);
    console.log('[EXPENSE_ATTACHMENT] Anonymous auth session established:', cred.user.uid);
    return cred.user.uid;
  } catch (err: any) {
    console.warn('[EXPENSE_ATTACHMENT] Auth initialization error:', err);
    if (auth?.currentUser?.uid) {
      return auth.currentUser.uid;
    }
    throw new Error(`Authentication required for receipt attachment: ${err?.message || err}`);
  }
}

/**
 * Normalizes raw Base64 data string by removing any data URL scheme prefix.
 */
function cleanBase64(dataUrlOrBase64: string): { base64: string; mimeType: string } {
  if (dataUrlOrBase64.startsWith('data:')) {
    const commaIdx = dataUrlOrBase64.indexOf(',');
    const header = dataUrlOrBase64.substring(5, commaIdx);
    const mimeType = header.split(';')[0] || 'image/jpeg';
    return {
      base64: dataUrlOrBase64.substring(commaIdx + 1),
      mimeType,
    };
  }
  return {
    base64: dataUrlOrBase64,
    mimeType: 'image/jpeg',
  };
}

/**
 * Converts File or Blob to clean Base64 string.
 */
function blobToBase64(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(cleanBase64(result));
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads an expense receipt using the proven Chat-style chunked Firestore engine.
 * Writes metadata -> writes all 500 KB chunks -> reads back all chunks ->
 * reconstructs & decodes -> verifies byte size matches original -> updates status: 'completed' -> reports 100%.
 */
export async function uploadExpenseReceiptAttachment(params: {
  expenseId: string;
  file?: File | Blob;
  base64Data?: string;
  fileName?: string;
  mimeType?: string;
  employeeId?: string;
  employeeCode?: string;
  onProgress?: (percent: number) => void;
  timeoutMs?: number;
}): Promise<string> {
  const {
    expenseId,
    file,
    base64Data: rawBase64,
    fileName = `receipt_${expenseId}.jpg`,
    employeeId = 'EMP-UNKNOWN',
    employeeCode = 'EMP-UNKNOWN',
    onProgress,
    timeoutMs = 120000,
  } = params;

  if (!navigator.onLine) {
    throw new Error('Device is offline. Upload deferred until network connects.');
  }

  if (!db) {
    throw new Error('Firestore database instance is unavailable.');
  }

  // 1. Ensure Auth
  await ensureFirebaseAuthSession();

  // 2. Prepare Base64 payload & size
  let base64 = '';
  let mimeType = params.mimeType || 'image/jpeg';
  let originalByteSize = 0;

  if (file) {
    const res = await blobToBase64(file);
    base64 = res.base64;
    mimeType = params.mimeType || file.type || res.mimeType || 'image/jpeg';
    originalByteSize = file.size;
  } else if (rawBase64) {
    const res = cleanBase64(rawBase64);
    base64 = res.base64;
    mimeType = params.mimeType || res.mimeType || 'image/jpeg';
    // Calculate decoded byte length from base64
    const padding = (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    originalByteSize = Math.floor((base64.length * 3) / 4) - padding;
  } else {
    throw new Error('No receipt data provided for upload.');
  }

  if (!base64 || originalByteSize <= 0) {
    throw new Error('Receipt payload is empty or corrupted.');
  }

  const attachmentId = `rec_att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const totalChunks = Math.max(1, Math.ceil(base64.length / CHUNK_SIZE));

  console.log('[EXPENSE_ATTACHMENT_UPLOAD] START', {
    attachmentId,
    expenseId,
    totalChunks,
    originalByteSize,
    mimeType,
  });

  // Watchdog timeout to prevent endless hanging
  let timerId: any = null;
  let isTimedOut = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      isTimedOut = true;
      reject(new Error(`Receipt upload timed out after ${timeoutMs / 1000}s.`));
    }, timeoutMs);
  });

  const uploadOperation = async (): Promise<string> => {
    const attRef = doc(db, ATTACHMENT_COLLECTION, attachmentId);

    // 0% -> 5%: Create metadata doc
    onProgress?.(5);
    const metadata: ExpenseReceiptAttachmentMetadata = {
      attachmentId,
      expenseId,
      employeeId,
      employeeCode,
      fileName,
      mimeType,
      fileSize: originalByteSize,
      totalChunks,
      status: 'uploading',
      uploadedAt: new Date().toISOString(),
      completedAt: null,
    };
    await setDoc(attRef, metadata);

    // 5% -> 95%: Upload chunks sequentially with progress
    for (let i = 0; i < totalChunks; i++) {
      if (isTimedOut) throw new Error('Upload aborted: operation timed out.');
      const chunkData = base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const chunkRef = doc(db, ATTACHMENT_COLLECTION, attachmentId, 'chunks', `chunk_${i}`);
      await setDoc(chunkRef, {
        index: i,
        data: chunkData,
        createdAt: new Date().toISOString(),
      });

      const currentProgress = Math.round(5 + ((i + 1) / totalChunks) * 90);
      onProgress?.(Math.min(95, currentProgress));
    }

    // 95% -> 99%: Comprehensive Read-back & Byte Size Verification
    onProgress?.(96);
    console.log('[EXPENSE_ATTACHMENT_VERIFY] Reading back chunks for verification:', attachmentId);

    const chunkVerifyPromises = [];
    for (let i = 0; i < totalChunks; i++) {
      const chunkRef = doc(db, ATTACHMENT_COLLECTION, attachmentId, 'chunks', `chunk_${i}`);
      chunkVerifyPromises.push(getDoc(chunkRef));
    }
    const chunkSnaps = await Promise.all(chunkVerifyPromises);

    let reconstructedBase64 = '';
    for (let i = 0; i < chunkSnaps.length; i++) {
      const snap = chunkSnaps[i];
      if (!snap.exists() || !snap.data()?.data) {
        throw new Error(`Verification failed: chunk ${i} is missing in Firestore.`);
      }
      reconstructedBase64 += snap.data()!.data;
    }

    onProgress?.(98);
    // Decode and verify exact byte length
    const decodedBytes = atob(reconstructedBase64);
    if (decodedBytes.length !== originalByteSize) {
      throw new Error(
        `Verification failed: reconstructed byte length (${decodedBytes.length}) mismatch original size (${originalByteSize}).`
      );
    }

    // Mark metadata completed in Firestore
    const completedAt = new Date().toISOString();
    await updateDoc(attRef, {
      status: 'completed',
      completedAt,
    });

    // Cache reconstructed Blob URL for immediate instantaneous UI display
    try {
      const byteNumbers = new Array(decodedBytes.length);
      for (let i = 0; i < decodedBytes.length; i++) {
        byteNumbers[i] = decodedBytes.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      attachmentBlobCache.set(attachmentId, blobUrl);
    } catch (cacheErr) {
      console.warn('[EXPENSE_ATTACHMENT] Failed to create cached blob url:', cacheErr);
    }

    console.log('[EXPENSE_ATTACHMENT_UPLOAD] SUCCESS', {
      attachmentId,
      expenseId,
      verifiedBytes: decodedBytes.length,
    });

    return attachmentId;
  };

  try {
    const result = await Promise.race([uploadOperation(), timeoutPromise]);
    if (timerId) clearTimeout(timerId);
    return result;
  } catch (err: any) {
    if (timerId) clearTimeout(timerId);
    console.error('[EXPENSE_ATTACHMENT_UPLOAD] FAILED:', err);
    try {
      const attRef = doc(db, ATTACHMENT_COLLECTION, attachmentId);
      await updateDoc(attRef, {
        status: 'failed',
        failureReason: err?.message || String(err),
      });
    } catch {}
    throw err;
  }
}

/**
 * Reconstructs the receipt attachment from Firestore chunks into a Blob URL.
 * Supports memory caching and inflight deduplication.
 */
export async function getExpenseReceiptBlobUrl(
  attachmentIdOrUrl: string,
  mimeTypeFallback: string = 'image/jpeg'
): Promise<string> {
  if (!attachmentIdOrUrl) {
    throw new Error('No attachment ID provided.');
  }

  // If already a direct URL (Firebase Storage http/https or local blob:), return directly
  if (
    attachmentIdOrUrl.startsWith('http://') ||
    attachmentIdOrUrl.startsWith('https://') ||
    attachmentIdOrUrl.startsWith('blob:')
  ) {
    return attachmentIdOrUrl;
  }

  // Check in-memory cache
  if (attachmentBlobCache.has(attachmentIdOrUrl)) {
    return attachmentBlobCache.get(attachmentIdOrUrl)!;
  }

  // Deduplicate simultaneous fetches
  if (pendingAttachmentFetches.has(attachmentIdOrUrl)) {
    return pendingAttachmentFetches.get(attachmentIdOrUrl)!;
  }

  const fetchPromise = (async () => {
    try {
      if (!db) {
        throw new Error('Firestore is unavailable.');
      }

      await ensureFirebaseAuthSession();

      const attDocRef = doc(db, ATTACHMENT_COLLECTION, attachmentIdOrUrl);
      const attSnap = await getDoc(attDocRef);

      if (!attSnap.exists()) {
        throw new Error(`Receipt attachment "${attachmentIdOrUrl}" metadata not found.`);
      }

      const meta = attSnap.data() as ExpenseReceiptAttachmentMetadata;
      const totalChunks = meta.totalChunks || 1;

      // Fetch all chunks
      const chunkPromises = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkRef = doc(db, ATTACHMENT_COLLECTION, attachmentIdOrUrl, 'chunks', `chunk_${i}`);
        chunkPromises.push(getDoc(chunkRef));
      }

      const chunkSnaps = await Promise.all(chunkPromises);
      let fullBase64 = '';
      for (let i = 0; i < chunkSnaps.length; i++) {
        const snap = chunkSnaps[i];
        if (!snap.exists() || !snap.data()?.data) {
          throw new Error(`Chunk ${i} is missing for attachment "${attachmentIdOrUrl}".`);
        }
        fullBase64 += snap.data()!.data;
      }

      const byteCharacters = atob(fullBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const mime = meta.mimeType || mimeTypeFallback || 'image/jpeg';
      const blob = new Blob([byteArray], { type: mime });

      const blobUrl = URL.createObjectURL(blob);
      attachmentBlobCache.set(attachmentIdOrUrl, blobUrl);
      pendingAttachmentFetches.delete(attachmentIdOrUrl);
      return blobUrl;
    } catch (err) {
      pendingAttachmentFetches.delete(attachmentIdOrUrl);
      console.error(`[EXPENSE_ATTACHMENT_RETRIEVE] Failed for "${attachmentIdOrUrl}":`, err);
      throw err;
    }
  })();

  pendingAttachmentFetches.set(attachmentIdOrUrl, fetchPromise);
  return fetchPromise;
}

/**
 * Downloads or opens the expense receipt in a new tab.
 */
export async function downloadExpenseReceipt(
  attachmentIdOrUrl: string,
  fileName: string = 'expense_receipt.jpg'
): Promise<void> {
  const blobUrl = await getExpenseReceiptBlobUrl(attachmentIdOrUrl);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Deletes a receipt attachment metadata and its chunks from Firestore.
 */
export async function deleteExpenseReceiptAttachment(attachmentId: string): Promise<void> {
  if (!db || !attachmentId) return;
  attachmentBlobCache.delete(attachmentId);

  try {
    const attDocRef = doc(db, ATTACHMENT_COLLECTION, attachmentId);
    const attSnap = await getDoc(attDocRef);
    if (!attSnap.exists()) return;

    const totalChunks = (attSnap.data() as ExpenseReceiptAttachmentMetadata)?.totalChunks || 0;
    const deletes = [];
    for (let i = 0; i < totalChunks; i++) {
      deletes.push(deleteDoc(doc(db, ATTACHMENT_COLLECTION, attachmentId, 'chunks', `chunk_${i}`)));
    }
    await Promise.all(deletes);
    await deleteDoc(attDocRef);
  } catch (err) {
    console.warn(`[EXPENSE_ATTACHMENT] Failed to delete attachment ${attachmentId}:`, err);
  }
}

/**
 * Validates that an attachment exists and is verified in Firestore.
 */
export async function verifyExpenseReceiptAttachment(attachmentId: string): Promise<boolean> {
  try {
    if (!db || !attachmentId) return false;
    const attDocRef = doc(db, ATTACHMENT_COLLECTION, attachmentId);
    const snap = await getDoc(attDocRef);
    return snap.exists() && snap.data()?.status === 'completed';
  } catch {
    return false;
  }
}
