import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getActiveDbSync } from './db_sync';
import firebaseAppConfig from '../../../firebase-applet-config.json';

console.log('Firebase config raw import:', firebaseAppConfig);

// 1. App Singletons
let defaultApp: any = null;
let adminAppInstance: any = null;

export const getDefaultApp = () => {
  if (!defaultApp) {
    console.log('Initializing Default Firebase App');
    defaultApp = initializeApp(firebaseAppConfig);
  }
  return defaultApp;
};

export const getAdminApp = () => {
  return getDefaultApp();
};

// 2. Service Singletons
let employeeAuth: any = null;

let adminAuth: any = null;

// 3. Lazy Getters
export const getEmployeeAuth = () => {
  if (!employeeAuth) employeeAuth = getAuth(getDefaultApp());
  return employeeAuth;
};

export const getAdminAuth = () => {
  if (!adminAuth) adminAuth = getAuth(getAdminApp());
  return adminAuth;
};

export { getDb, getEmployeeDb, getAdminDb } from './db';

// 4. Dynamic Context Resolver Helper
export const isAdminContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path.startsWith('/x7Kp9') || path.startsWith('/admin-portal') || path.startsWith('/admin');
};

export const getActiveAuth = () => isAdminContext() ? getAdminAuth() : getEmployeeAuth();

/**
 * Compatibility Proxy for 'getActiveDbSync()'
 * 
 * This proxy allows existing code to continue importing 'getActiveDbSync()' from config.ts.
 * It will resolve to either the Admin or Employee Firestore instance on-demand.
 */

export const app: any = new Proxy({}, {
  get(target, prop) {
    const activeApp = isAdminContext() ? getAdminApp() : getDefaultApp();
    if (!activeApp) return undefined;
    if (typeof activeApp[prop] === 'function') {
      return activeApp[prop].bind(activeApp);
    }
    return activeApp[prop];
  }
});
export const auth: any = new Proxy({}, {
  get(target, prop) {
    const activeAuth = getActiveAuth();
    if (!activeAuth) return undefined;
    if (typeof activeAuth[prop] === 'function') {
      return activeAuth[prop].bind(activeAuth);
    }
    return activeAuth[prop];
  }
});
