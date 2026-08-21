import { ExpenseRecord } from '../../types/expense';

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

export const saveExpenseRecord = (record: ExpenseRecord): void => {
  try {
    const records = getStoredExpenseRecords();
    const existingIndex = records.findIndex((r) => r.id === record.id);
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.unshift(record);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (err) {
    console.error('Failed to save expense record locally:', err);
  }
};

export const getPendingExpenseRecords = (): ExpenseRecord[] => {
  const records = getStoredExpenseRecords();
  return records.filter((r) => r.syncStatus === 'Pending Sync');
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
  } catch (err) {
    console.error('Failed to remove pending expense record:', err);
  }
};
