import { getDefaultApp, getAdminApp, isAdminContext } from './config';

let employeeDbInstance: any = null;
let employeeDbPromise: Promise<any> | null = null;

let adminDbInstance: any = null;
let adminDbPromise: Promise<any> | null = null;

/**
 * Returns the cached employee Firestore instance if it exists.
 * Used strictly for diagnostic/status checks.
 */
export const getEmployeeDbCached = () => employeeDbInstance;

/**
 * Returns the cached admin Firestore instance if it exists.
 * Used strictly for diagnostic/status checks.
 */
export const getAdminDbCached = () => adminDbInstance;

/**
 * Promise singleton for Employee database.
 * Resolves to the real, valid FirebaseFirestore instance.
 */
export const getEmployeeDb = (): Promise<any> => {
  if (employeeDbInstance) {
    return Promise.resolve(employeeDbInstance);
  }

  if (!employeeDbPromise) {
    employeeDbPromise = (async () => {
      try {
        const { getFirestore, enableIndexedDbPersistence } = await import('firebase/firestore');
        const app = getDefaultApp();
        if (!app) throw new Error('Default Firebase App not initialized');

        const instance = (app as any).firestoreDatabaseId
          ? getFirestore(app, (app as any).firestoreDatabaseId)
          : getFirestore(app);

        if (!instance) throw new Error('getFirestore returned null/undefined instance');

        // Enable persistence once on first access for the employee app
        await enableIndexedDbPersistence(instance).catch((err) => {
          console.warn('Firestore persistence warning:', err.code || err);
        });

        employeeDbInstance = instance;
        return instance;
      } catch (err) {
        console.error('Fatal Employee Firestore initialization error:', err);
        employeeDbPromise = null; // Allow retry on failure
        throw err;
      }
    })();
  }
  return employeeDbPromise;
};

/**
 * Promise singleton for Admin database.
 * Resolves to the real, valid FirebaseFirestore instance.
 */
export const getAdminDb = (): Promise<any> => {
  if (adminDbInstance) {
    return Promise.resolve(adminDbInstance);
  }

  if (!adminDbPromise) {
    adminDbPromise = (async () => {
      try {
        const { getFirestore } = await import('firebase/firestore');
        const app = getAdminApp();
        if (!app) throw new Error('Admin Firebase App not initialized');

        const instance = (app as any).firestoreDatabaseId
          ? getFirestore(app, (app as any).firestoreDatabaseId)
          : getFirestore(app);

        if (!instance) throw new Error('getFirestore returned null/undefined instance');

        adminDbInstance = instance;
        return instance;
      } catch (err) {
        console.error('Fatal Admin Firestore initialization error:', err);
        adminDbPromise = null; // Allow retry on failure
        throw err;
      }
    })();
  }
  return adminDbPromise;
};

/**
 * Unified context-aware asynchronous getter.
 * Guarantees a real FirebaseFirestore instance or valid reference is returned.
 */
export const getDb = (): Promise<any> => {
  return isAdminContext() ? getAdminDb() : getEmployeeDb();
};

