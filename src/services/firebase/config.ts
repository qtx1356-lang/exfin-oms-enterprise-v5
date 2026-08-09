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

console.log('Active Firebase Config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  storageBucket: firebaseConfig.storageBucket
});

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseAppConfig.firestoreDatabaseId);
export const storage = getStorage(app);


