/**
 * IndexedDB Service for Exfin OMS
 * Provides durable client-side persistence for the offline operations queue and device session state.
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

export interface PersistentDeviceSession {
  deviceId: string;
  registrationId: string;
  employeeCode?: string;
  employeeName?: string;
  registrationStatus: string;
  cachedProfile?: any;
  lastSyncTime?: string;
  appVersion?: string;
}

const DB_NAME = 'exfin_oms_offline_db';
const DB_VERSION = 2;
const STORE_OPERATIONS = 'offline_operations';
const STORE_SESSION = 'device_session';

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
      
      if (!db.objectStoreNames.contains(STORE_OPERATIONS)) {
        const store = db.createObjectStore(STORE_OPERATIONS, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('operationType', 'operationType', { unique: false });
        store.createIndex('createdAtDeviceTime', 'createdAtDeviceTime', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------
// Offline Operations Queue Persistence
// ---------------------------------------------

export const saveOfflineOperationToDB = async (operation: OfflineOperation): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
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
      const tx = db.transaction(STORE_OPERATIONS, 'readonly');
      const store = tx.objectStore(STORE_OPERATIONS);
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
      const tx = db.transaction(STORE_OPERATIONS, 'readonly');
      const store = tx.objectStore(STORE_OPERATIONS);
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
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
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
      const tx = db.transaction(STORE_OPERATIONS, 'readwrite');
      const store = tx.objectStore(STORE_OPERATIONS);
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

// ---------------------------------------------
// Persistent Device Session Store
// ---------------------------------------------

export const saveDeviceSessionToDB = async (session: PersistentDeviceSession): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSION, 'readwrite');
      const store = tx.objectStore(STORE_SESSION);
      const req = store.put({ id: 'current_session', ...session });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB saveDeviceSession failed:', err);
  }
};

export const getDeviceSessionFromDB = async (): Promise<PersistentDeviceSession | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSION, 'readonly');
      const store = tx.objectStore(STORE_SESSION);
      const req = store.get('current_session');

      req.onsuccess = () => {
        if (req.result) {
          const { id, ...sessionData } = req.result;
          resolve(sessionData as PersistentDeviceSession);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB getDeviceSession failed:', err);
    return null;
  }
};

export const clearDeviceSessionFromDB = async (): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SESSION, 'readwrite');
      const store = tx.objectStore(STORE_SESSION);
      const req = store.delete('current_session');

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB clearDeviceSession failed:', err);
  }
};
