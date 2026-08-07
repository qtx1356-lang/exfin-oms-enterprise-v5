import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const getEnvVar = (key: string, fallback: string) => {
  const value = import.meta.env[key] || fallback;
  if (!value) {
    throw new Error(`Firebase configuration error: ${key} is missing.`);
  }
  return value;
};

const firebaseConfig = {
  apiKey: getEnvVar('VITE_FIREBASE_API_KEY', "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM"),
  authDomain: getEnvVar('VITE_FIREBASE_AUTH_DOMAIN', "exfin-oms-production.firebaseapp.com"),
  projectId: getEnvVar('VITE_FIREBASE_PROJECT_ID', "exfin-oms-production"),
  storageBucket: getEnvVar('VITE_FIREBASE_STORAGE_BUCKET', "exfin-oms-production.firebasestorage.app"),
  messagingSenderId: getEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', "467454374123"),
  appId: getEnvVar('VITE_FIREBASE_APP_ID', "1:467454374123:web:1c039dad311c6362b44eae")
};

console.log('Current Firebase projectId:', firebaseConfig.projectId);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
