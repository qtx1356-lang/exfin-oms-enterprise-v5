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
 * Compatibility Proxy for 'db'
 * 
 * This proxy allows existing code to continue importing 'db' from config.ts.
 * It will resolve to either the Admin or Employee Firestore instance on-demand.
 */
export const db = new Proxy({}, {
  get(target, prop) {
    const activeDb = getActiveDbSync();
    if (!activeDb) return undefined;

    if (prop === 'concrete' || prop === '_concrete') {
      return activeDb;
    }
    const value = Reflect.get(activeDb, prop);
    if (typeof value === 'function') {
      return value.bind(activeDb);
    }
    return value;
  }
}) as any;

// 5. Robust JS Proxy for auth
export const auth = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? getAdminAuth() : getEmployeeAuth();
    if (prop === 'concrete' || prop === '_concrete') {
      return activeTarget;
    }
    const value = Reflect.get(activeTarget, prop);
    if (typeof value === 'function') {
      return value.bind(activeTarget);
    }
    return value;
  },
  set(target, prop, value) {
    const activeTarget = isAdminContext() ? getAdminAuth() : getEmployeeAuth();
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? getAdminAuth() : getEmployeeAuth());
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? getAdminAuth() : getEmployeeAuth(), prop);
  }
}) as any;

// Export app and adminApp as proxies as well
export const app = new Proxy({}, {
  get(target, prop) {
    const activeTarget = getDefaultApp();
    return Reflect.get(activeTarget, prop);
  }
}) as any;

export const adminApp = new Proxy({}, {
  get(target, prop) {
    const activeTarget = getAdminApp();
    return Reflect.get(activeTarget, prop);
  }
}) as any;

console.log('Firebase config initialized dynamic proxies for auth.');
