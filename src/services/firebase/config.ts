import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppConfig from '../../../firebase-applet-config.json';

const env = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env : ({} as any);

const resolvedConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || (firebaseAppConfig as any).apiKey || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || (firebaseAppConfig as any).authDomain || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || (firebaseAppConfig as any).projectId || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || (firebaseAppConfig as any).storageBucket || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || (firebaseAppConfig as any).messagingSenderId || '',
  appId: env.VITE_FIREBASE_APP_ID || (firebaseAppConfig as any).appId || '',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || (firebaseAppConfig as any).measurementId || '',
  firestoreDatabaseId: (firebaseAppConfig as any).firestoreDatabaseId || undefined,
};

// 1. Initialize Default App (Employee)
export const app = initializeApp(resolvedConfig);
const employeeAuth = getAuth(app);
const employeeDb = resolvedConfig.firestoreDatabaseId
  ? getFirestore(app, resolvedConfig.firestoreDatabaseId)
  : getFirestore(app);
const employeeStorage = getStorage(app);

if (employeeDb) {
  try {
    enableIndexedDbPersistence(employeeDb).catch((err) => {
      console.warn('Firestore persistence warning:', err.code || err);
    });
  } catch (e) {
    console.warn('Firestore enableIndexedDbPersistence catch:', e);
  }
}

// 2. Initialize Named App (Admin)
export const adminApp = initializeApp(resolvedConfig, 'admin');
const adminAuth = getAuth(adminApp);
const adminDb = resolvedConfig.firestoreDatabaseId
  ? getFirestore(adminApp, resolvedConfig.firestoreDatabaseId)
  : getFirestore(adminApp);
const adminStorage = getStorage(adminApp);

// 3. Dynamic Context Resolver Helper
const isAdminContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path.startsWith('/x7Kp9') || path.startsWith('/admin-portal');
};

export const getActiveAuth = () => isAdminContext() ? adminAuth : employeeAuth;
export const getActiveDb = () => isAdminContext() ? adminDb : employeeDb;
export const getActiveStorage = () => isAdminContext() ? adminStorage : employeeStorage;

// 4. Robust JS Proxies for auth, db, and storage
export const auth = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? adminAuth : employeeAuth;
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
    const activeTarget = isAdminContext() ? adminAuth : employeeAuth;
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? adminAuth : employeeAuth);
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? adminAuth : employeeAuth, prop);
  }
}) as any;

export const db = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? adminDb : employeeDb;
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
    const activeTarget = isAdminContext() ? adminDb : employeeDb;
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? adminDb : employeeDb);
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? adminDb : employeeDb, prop);
  }
}) as any;

export const storage = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? adminStorage : employeeStorage;
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
    const activeTarget = isAdminContext() ? adminStorage : employeeStorage;
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? adminStorage : employeeStorage);
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? adminStorage : employeeStorage, prop);
  }
}) as any;

console.log('Firebase config initialized dynamic proxies for auth, db, storage.');
