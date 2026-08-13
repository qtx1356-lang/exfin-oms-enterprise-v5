import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppConfig from '../../../firebase-applet-config.json';

console.log('Firebase config raw import:', firebaseAppConfig);

export const app = initializeApp(firebaseAppConfig);
export const auth = getAuth(app);
export const db = (firebaseAppConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseAppConfig as any).firestoreDatabaseId)
  : getFirestore(app);
export const storage = getStorage(app);

console.log('Firebase config initialized db:', db);
