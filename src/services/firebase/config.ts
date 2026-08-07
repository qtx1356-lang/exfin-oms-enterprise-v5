import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../../firebase-applet-config.json';

const isConfigured = firebaseConfig && Object.keys(firebaseConfig).length > 0 && (firebaseConfig as any).projectId;

if (isConfigured) {
  console.log('Current Firebase projectId:', (firebaseConfig as any).projectId);
}

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId) : null;
export const storage = app ? getStorage(app) : null;
