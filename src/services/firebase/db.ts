import { getDefaultApp, getAdminApp, isAdminContext } from './config';

let employeeDb: any = null;
let employeeDbPromise: Promise<any> | null = null;

let adminDb: any = null;
let adminDbPromise: Promise<any> | null = null;

/**
 * Returns the cached employee Firestore instance if it exists.
 * This is used for internal synchronous access by the proxy.
 */
export const getEmployeeDbCached = () => employeeDb;

/**
 * Returns the cached admin Firestore instance if it exists.
 */
export const getAdminDbCached = () => adminDb;

export const getEmployeeDb = async () => {
  if (employeeDb) return employeeDb;
  if (!employeeDbPromise) {
    employeeDbPromise = (async () => {
      try {
        const { getFirestore, enableIndexedDbPersistence } = await import('firebase/firestore');
        const app = getDefaultApp();
        const instance = (app as any).firestoreDatabaseId
          ? getFirestore(app, (app as any).firestoreDatabaseId)
          : getFirestore(app);
        
        // Enable persistence once on first access
        await enableIndexedDbPersistence(instance).catch((err) => {
          console.warn('Firestore persistence warning:', err.code || err);
        });
        
        employeeDb = instance;
        return instance;
      } catch (err) {
        employeeDbPromise = null; // Allow retry on failure
        throw err;
      }
    })();
  }
  return employeeDbPromise;
};

export const getAdminDb = async () => {
  if (adminDb) return adminDb;
  if (!adminDbPromise) {
    adminDbPromise = (async () => {
      try {
        const { getFirestore } = await import('firebase/firestore');
        const app = getAdminApp();
        const instance = (app as any).firestoreDatabaseId
          ? getFirestore(app, (app as any).firestoreDatabaseId)
          : getFirestore(app);
        
        adminDb = instance;
        return instance;
      } catch (err) {
        adminDbPromise = null; // Allow retry on failure
        throw err;
      }
    })();
  }
  return adminDbPromise;
};

export const getDb = async () => {
  return isAdminContext() ? await getAdminDb() : await getEmployeeDb();
};
