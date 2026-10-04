import { ExpenseRecord } from '../../types/expense';
import {
  saveReceiptToIndexedDB,
  deleteReceiptFromIndexedDB,
  getReceiptFromIndexedDB,
} from './expenseReceiptIndexedDB';

const STORAGE_KEY = 'exfin_expense_records_v1';

export const getStoredExpenseRecords = (): ExpenseRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse local expense records:', err);
    return [];
  }
};

/**
 * Saves expense record locally.
 * CRITICAL: To prevent quota exhaustion in localStorage, large base64 image data is moved to IndexedDB.
 * The record in localStorage only stores metadata and receiptLocalId.
 */
export const saveExpenseRecord = (record: ExpenseRecord): void => {
  try {
    // If incoming record has raw localReceiptData, persist it to IndexedDB
    if (record.localReceiptData && record.localReceiptData.startsWith('data:')) {
      const localId = `rec_loc_${record.id}`;
      record.receiptLocalId = localId;
      void saveReceiptToIndexedDB(record.id, {
        base64: record.localReceiptData,
        fileName: record.receiptFileName || `receipt_${record.id}.jpg`,
        contentType: record.receiptContentType || 'image/jpeg',
        size: record.receiptSize || Math.round(record.localReceiptData.length * 0.75),
      });
    }

    const records = getStoredExpenseRecords();
    const existingIndex = records.findIndex((r) => r.id === record.id);

    // Keep localStorage record lightweight by stripping raw base64 if receiptLocalId exists
    const recordToSave: ExpenseRecord = {
      ...record,
      localReceiptData: record.receiptLocalId ? null : record.localReceiptData,
    };

    if (existingIndex >= 0) {
      records[existingIndex] = recordToSave;
    } else {
      records.unshift(recordToSave);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err: any) {
    console.error('Failed to save expense record locally:', err);
  }
};

export const getPendingExpenseRecords = (): ExpenseRecord[] => {
  const records = getStoredExpenseRecords();
  return records.filter((r) => r.syncStatus === 'Pending Sync' || r.syncStatus === 'Sync Failed');
};

export const getPendingReceiptUploadRecords = (): ExpenseRecord[] => {
  const records = getStoredExpenseRecords();
  return records.filter(
    (r) =>
      r.receiptUploadStatus !== 'UPLOADED' &&
      (Boolean(r.receiptLocalId) || Boolean(r.localReceiptData && r.localReceiptData.startsWith('data:')))
  );
};

export const updateExpenseReceiptStatusInLocal = (
  id: string,
  updates: {
    receiptUrl?: string | null;
    receiptAttachmentId?: string | null;
    receiptLocalId?: string | null;
    storagePath?: string | null;
    receiptUploadStatus: 'PENDING' | 'UPLOADING' | 'UPLOADED' | 'FAILED' | null;
    receiptUploadError?: string | null;
    receiptUploadProgress?: number | null;
    receiptUploadProgressIndeterminate?: boolean | null;
    receiptLastAttemptAt?: string | null;
    clearLocalReceiptData?: boolean;
  }
): void => {
  try {
    const records = getStoredExpenseRecords();
    const record = records.find((r) => r.id === id);
    if (record) {
      if (updates.receiptUrl !== undefined) record.receiptUrl = updates.receiptUrl;
      if (updates.receiptAttachmentId !== undefined) record.receiptAttachmentId = updates.receiptAttachmentId;
      if (updates.receiptLocalId !== undefined) record.receiptLocalId = updates.receiptLocalId;
      if (updates.storagePath !== undefined) record.storagePath = updates.storagePath;
      record.receiptUploadStatus = updates.receiptUploadStatus;
      record.receiptUploadError = updates.receiptUploadError ?? null;
      if (updates.receiptUploadProgress !== undefined) {
        record.receiptUploadProgress = updates.receiptUploadProgress;
      }
      if (updates.receiptUploadProgressIndeterminate !== undefined) {
        record.receiptUploadProgressIndeterminate = updates.receiptUploadProgressIndeterminate;
      }
      record.receiptLastAttemptAt = updates.receiptLastAttemptAt ?? new Date().toISOString();

      if (updates.clearLocalReceiptData) {
        record.localReceiptData = null;
        record.receiptLocalId = null;
        void deleteReceiptFromIndexedDB(id);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to update expense receipt status locally:', err);
  }
};

export const markExpenseSyncedInLocal = (id: string, serverSyncTime: string): void => {
  try {
    const records = getStoredExpenseRecords();
    const record = records.find((r) => r.id === id);
    if (record) {
      record.syncStatus = 'Synced';
      record.serverSyncTime = serverSyncTime;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to mark expense record synced locally:', err);
  }
};

export const markExpenseSyncFailedInLocal = (id: string): void => {
  try {
    const records = getStoredExpenseRecords();
    const record = records.find((r) => r.id === id);
    if (record) {
      record.syncStatus = 'Sync Failed';
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }
  } catch (err) {
    console.error('Failed to mark expense sync failed locally:', err);
  }
};

export const removePendingExpenseRecord = (id: string): void => {
  try {
    const records = getStoredExpenseRecords();
    const filtered = records.filter((r) => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    void deleteReceiptFromIndexedDB(id);
  } catch (err) {
    console.error('Failed to remove pending expense record:', err);
  }
};

/**
 * Migration helper: Moves any legacy large Base64 receipts out of localStorage into IndexedDB.
 */
export const migrateLegacyLocalStorageReceipts = async (): Promise<void> => {
  try {
    const records = getStoredExpenseRecords();
    let hasChanges = false;

    for (const record of records) {
      if (record.localReceiptData && record.localReceiptData.startsWith('data:')) {
        const localId = `rec_loc_${record.id}`;
        record.receiptLocalId = localId;
        await saveReceiptToIndexedDB(record.id, {
          base64: record.localReceiptData,
          fileName: record.receiptFileName || `receipt_${record.id}.jpg`,
          contentType: record.receiptContentType || 'image/jpeg',
          size: record.receiptSize || Math.round(record.localReceiptData.length * 0.75),
        });
        record.localReceiptData = null;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      console.log('[EXPENSE_STORAGE] Migrated legacy receipts from localStorage to IndexedDB.');
    }
  } catch (err) {
    console.warn('[EXPENSE_STORAGE] Error migrating legacy receipts:', err);
  }
};
