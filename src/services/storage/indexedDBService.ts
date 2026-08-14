/**
 * IndexedDB Service for Exfin OMS
 * Provides durable client-side persistence for the offline operations queue.
 */

export interface OfflineOperation {
  id: string; // Unique operation ID
  operationType: 'Attendance' | 'WorkPlanner' | 'Expenses' | 'Leave' | 'Profile' | 'Chat' | string;
  createdAt: string;
  createdAtDeviceTime: string;
  employeeCode?: string;
  deviceId?: string;
  payload: any;
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'resolved';
  retryCount: number;
  lastAttemptAt: string;
  lastError?: string;
}

const DB_NAME = 'exfin_oms_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'offline_operations';

function isIndexedDBSupported(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBSupported()) {
      return reject(new Error('IndexedDB not supported'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('operationType', 'operationType', { unique: false });
        store.createIndex('createdAtDeviceTime', 'createdAtDeviceTime', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const saveOfflineOperationToDB = async (operation: OfflineOperation): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(operation);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveOfflineOperation failed, local storage fallback remains active:', err);
  }
};

export const getPendingOfflineOperationsFromDB = async (): Promise<OfflineOperation[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('status');
      const req = index.getAll('pending');

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getPendingOfflineOperations failed:', err);
    return [];
  }
};

export const getAllOfflineOperationsFromDB = async (): Promise<OfflineOperation[]> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getAllOfflineOperations failed:', err);
    return [];
  }
};

export const removeOfflineOperationFromDB = async (id: string): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB removeOfflineOperation failed:', err);
  }
};

export const updateOfflineOperationStatusInDB = async (
  id: string,
  status: OfflineOperation['status'],
  lastError?: string
): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const record = getReq.result as OfflineOperation | undefined;
        if (record) {
          record.status = status;
          record.lastAttemptAt = new Date().toISOString();
          if (lastError !== undefined) record.lastError = lastError;
          if (status === 'failed') record.retryCount = (record.retryCount || 0) + 1;
          store.put(record);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch (err) {
    console.warn('IndexedDB updateOfflineOperationStatus failed:', err);
  }
};
