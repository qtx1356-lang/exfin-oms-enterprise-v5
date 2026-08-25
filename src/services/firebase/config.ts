import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppConfig from '../../../firebase-applet-config.json';

console.log('Firebase config raw import:', firebaseAppConfig);

// 1. Initialize Default App (Employee)
export const app = initializeApp(firebaseAppConfig);
const employeeAuth = getAuth(app);
const employeeDb = (firebaseAppConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseAppConfig as any).firestoreDatabaseId)
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
export const adminApp = initializeApp(firebaseAppConfig, 'admin');
const adminAuth = getAuth(adminApp);
const adminDb = (firebaseAppConfig as any).firestoreDatabaseId
  ? getFirestore(adminApp, (firebaseAppConfig as any).firestoreDatabaseId)
  : getFirestore(adminApp);
const adminStorage = getStorage(adminApp);

// 3. Dynamic Context Resolver Helper
const isAdminContext = (): boolean => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return path.startsWith('/x7Kp9') || path.startsWith('/admin-portal');
};

// 4. Robust JS Proxies for auth, db, and storage
export const auth = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? adminAuth : employeeAuth;
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
