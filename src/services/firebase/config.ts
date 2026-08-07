import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "exfin-oms-production.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "exfin-oms-production",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "exfin-oms-production.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "467454374123",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:467454374123:web:1c039dad311c6362b44eae",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

const isConfigured = Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);

if (isConfigured) {
  console.log('Current Firebase projectId:', firebaseConfig.projectId);
}

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
