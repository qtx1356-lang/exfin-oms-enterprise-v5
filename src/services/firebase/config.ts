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
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:467454374123:web:1c039dad311c6362b44eae"
};

console.log('Active Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket
});

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);


