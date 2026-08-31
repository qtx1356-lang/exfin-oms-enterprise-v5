import { isAdminContext } from './config';
import { getEmployeeDbCached, getAdminDbCached, getEmployeeDb, getAdminDb } from './db';

/**
 * Synchronous getters that return the cached instance if ready.
 * They do NOT trigger the import/evaluation of firebase/firestore at the top level.
 */
export const getEmployeeDbSync = (): any => {
  const cached = getEmployeeDbCached();
  if (cached) return cached;
  
  // Trigger background load if not already started
  getEmployeeDb();
  return null;
};

export const getAdminDbSync = (): any => {
  const cached = getAdminDbCached();
  if (cached) return cached;
  
  // Trigger background load
  getAdminDb();
  return null;
};

export const getActiveDbSync = (): any => {
  return isAdminContext() ? getAdminDbSync() : getEmployeeDbSync();
};
