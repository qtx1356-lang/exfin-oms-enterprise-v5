import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import appletConfig from '../../../firebase-applet-config.json';

const getEnvVar = (key: string, fallback: string) => {
  const value = import.meta.env[key] || fallback;
  if (!value) {
    throw new Error(`Firebase configuration error: ${key} is missing.`);
  }
  return value;
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || appletConfig.apiKey || "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig.authDomain || "exfin-oms-production.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig.projectId || "exfin-oms-production",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig.storageBucket || "exfin-oms-production.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig.messagingSenderId || "467454374123",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || appletConfig.appId || "1:467454374123:web:1c039dad311c6362b44eae"
};

console.log('Current Firebase projectId:', firebaseConfig.projectId);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = appletConfig.firestoreDatabaseId 
  ? getFirestore(app, appletConfig.firestoreDatabaseId)
  : getFirestore(app);
export const storage = getStorage(app);

