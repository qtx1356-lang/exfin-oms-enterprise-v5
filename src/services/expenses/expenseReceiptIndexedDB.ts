/**
 * Dedicated IndexedDB Storage for Expense Receipts: 'exfin-expense-receipts'
 * Decouples large image payloads from localStorage to prevent browser quota exhaustion.
 */

export interface StoredReceiptData {
  expenseId: string;
  receiptLocalId: string;
  blob?: Blob | null;
  base64?: string | null;
  fileName?: string | null;
  contentType?: string | null;
  size?: number | null;
  createdAt: string;
}

const DB_NAME = 'exfin_expense_db';
const DB_VERSION = 1;
const STORE_NAME = 'exfin-expense-receipts';

// In-memory fallback if IndexedDB is unavailable
const memoryFallback = new Map<string, StoredReceiptData>();

function isIndexedDBAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      return reject(new Error('IndexedDB not supported in current environment'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'expenseId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Persists a receipt payload in IndexedDB.
 * Returns the receiptLocalId.
 */
export async function saveReceiptToIndexedDB(
  expenseId: string,
  receipt: {
    blob?: Blob | null;
    base64?: string | null;
    fileName?: string | null;
    contentType?: string | null;
    size?: number | null;
  }
): Promise<string> {
  const receiptLocalId = `rec_loc_${expenseId}`;
  const dataToStore: StoredReceiptData = {
    expenseId,
    receiptLocalId,
    blob: receipt.blob || null,
    base64: receipt.base64 || null,
    fileName: receipt.fileName || null,
    contentType: receipt.contentType || 'image/jpeg',
    size: receipt.size ?? (receipt.blob?.size || (receipt.base64 ? Math.round(receipt.base64.length * 0.75) : 0)),
    createdAt: new Date().toISOString(),
  };

  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(dataToStore);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[EXPENSE_IDB] Fallback to in-memory store:', err);
    memoryFallback.set(expenseId, dataToStore);
  }

  return receiptLocalId;
}

/**
 * Retrieves a receipt payload from IndexedDB by expenseId.
 */
export async function getReceiptFromIndexedDB(expenseId: string): Promise<StoredReceiptData | null> {
  if (memoryFallback.has(expenseId)) {
    return memoryFallback.get(expenseId)!;
  }

  try {
    const db = await openDB();
    return await new Promise<StoredReceiptData | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(expenseId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[EXPENSE_IDB] Failed to retrieve receipt for ${expenseId}:`, err);
    return memoryFallback.get(expenseId) || null;
  }
}

/**
 * Deletes a receipt payload from IndexedDB.
 */
export async function deleteReceiptFromIndexedDB(expenseId: string): Promise<void> {
  memoryFallback.delete(expenseId);
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(expenseId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn(`[EXPENSE_IDB] Failed to delete receipt for ${expenseId}:`, err);
  }
}
