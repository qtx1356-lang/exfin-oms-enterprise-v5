import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppConfig from '../../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: firebaseAppConfig.apiKey,
  authDomain: firebaseAppConfig.authDomain,
  projectId: firebaseAppConfig.projectId,
  storageBucket: firebaseAppConfig.storageBucket,
  messagingSenderId: firebaseAppConfig.messagingSenderId,
  appId: firebaseAppConfig.appId
};

console.log('CRITICAL: Initializing Firebase with Project:', firebaseConfig.projectId);
console.log('Runtime app.options.projectId:', firebaseConfig.projectId);
console.log('Runtime app.options.apiKey:', firebaseConfig.apiKey);
console.log('Runtime app.options.authDomain:', firebaseConfig.authDomain);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseAppConfig.firestoreDatabaseId);
export const storage = getStorage(app);

console.log('Firebase Auth Instance Project ID:', auth.app.options.projectId);


