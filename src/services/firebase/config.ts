import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppConfig from '../../../firebase-applet-config.json';

console.log('--- FIREBASE RUNTIME AUDIT ---');
console.log('SOURCE: firebase-applet-config.json');
console.log('RUNTIME_PROJECT_ID:', firebaseAppConfig.projectId);
console.log('RUNTIME_APP_ID:', firebaseAppConfig.appId);
console.log('RUNTIME_AUTH_DOMAIN:', firebaseAppConfig.authDomain);
console.log('RUNTIME_DATABASE_ID:', (firebaseAppConfig as any).firestoreDatabaseId);
console.log('------------------------------');

export const app = initializeApp(firebaseAppConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (firebaseAppConfig as any).firestoreDatabaseId);
export const storage = getStorage(app);
