import { SyncModule } from '../../types/sync';
import { 
  saveOfflineOperationToDB, 
  removeOfflineOperationFromDB, 
  updateOfflineOperationStatusInDB,
  OfflineOperation 
} from '../storage/indexedDBService';

export type { SyncModule };

export interface DeadLetterItem {
  id: string; // unique operation ID
  module: SyncModule; // operation type
  recordId: string;
  employeeId?: string; // employee ID
  failureReason: string;
  attemptCount: number; // retry count
  lastAttemptAt: string; // timestamp
  nextRetryAt: string;
  status: 'pending' | 'syncing' | 'failed' | 'resolved'; // sync status
  payloadSummary?: string;
  payload?: any; // payload
  createdAtDeviceTime?: string;
}

const STORAGE_KEY = 'exfin_dead_letter_queue_v1';

export const getDeadLetterQueue = (): DeadLetterItem[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to parse dead letter queue:', err);
    return [];
  }
};

export const saveDeadLetterQueue = (items: DeadLetterItem[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save dead letter queue:', err);
  }
};

export const recordSyncFailure = (
  module: SyncModule,
  recordId: string,
  reason: string,
  payloadSummary?: string,
  employeeId?: string,
  payload?: any
): DeadLetterItem => {
  const queue = getDeadLetterQueue();
  const itemId = `${module}_${recordId}`;
  const existingIndex = queue.findIndex((i) => i.id === itemId);

  const now = new Date();
  let attemptCount = 1;
  let createdAtDeviceTime = now.toISOString();

  if (existingIndex >= 0) {
    attemptCount = queue[existingIndex].attemptCount + 1;
    createdAtDeviceTime = queue[existingIndex].createdAtDeviceTime || createdAtDeviceTime;
  }

  // Exponential backoff: min 300 seconds, 2^attempt * 10
  const backoffSec = Math.min(300, Math.pow(2, attemptCount) * 10);
  const nextRetry = new Date(now.getTime() + backoffSec * 1000).toISOString();

  // Mark as dead-letter failed state if >= 5 retries
  const isDeadLetter = attemptCount >= 5;

  const item: DeadLetterItem = {
    id: itemId,
    module,
    recordId,
    employeeId,
    failureReason: reason,
    attemptCount,
    lastAttemptAt: now.toISOString(),
    nextRetryAt: nextRetry,
    status: isDeadLetter ? 'failed' : 'pending',
    payloadSummary: payloadSummary || `${module} record ${recordId}`,
    payload,
    createdAtDeviceTime,
  };

  if (existingIndex >= 0) {
    queue[existingIndex] = item;
  } else {
    queue.push(item);
  }

  saveDeadLetterQueue(queue);

  // Asynchronously persist to IndexedDB
  saveOfflineOperationToDB({
    id: itemId,
    operationType: module,
    createdAt: item.lastAttemptAt,
    createdAtDeviceTime: item.createdAtDeviceTime || item.lastAttemptAt,
    employeeCode: employeeId,
    payload,
    status: item.status,
    retryCount: attemptCount,
    lastAttemptAt: item.lastAttemptAt,
    lastError: reason,
  }).catch(() => {});

  return item;
};

export const recordSyncSuccess = (module: SyncModule, recordId: string): void => {
  const queue = getDeadLetterQueue();
  const itemId = `${module}_${recordId}`;
  const filtered = queue.filter((i) => i.id !== itemId);
  saveDeadLetterQueue(filtered);
  removeOfflineOperationFromDB(itemId).catch(() => {});
};

export const retryDeadLetterItem = (id: string): void => {
  const queue = getDeadLetterQueue();
  const item = queue.find((i) => i.id === id);
  if (item) {
    item.attemptCount = 0;
    item.status = 'pending';
    item.nextRetryAt = new Date().toISOString();
    saveDeadLetterQueue(queue);
    updateOfflineOperationStatusInDB(id, 'pending').catch(() => {});
  }
};

export const removeDeadLetterItem = (id: string): void => {
  const queue = getDeadLetterQueue();
  const filtered = queue.filter((i) => i.id !== id);
  saveDeadLetterQueue(filtered);
  removeOfflineOperationFromDB(id).catch(() => {});
};

export const clearDeadLetterQueue = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear dead letter queue:', err);
  }
};
