import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppConfig from '../../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: "exfin-oms-production.firebaseapp.com",
  projectId: "exfin-oms-production",
  storageBucket: "exfin-oms-production.firebasestorage.app",
  messagingSenderId: "467454374123",
  appId: "1:467454374123:web:1c039dad311c6362b44eae"
};

console.log('--- FIREBASE RUNTIME AUDIT ---');
console.log('SOURCE: Environment or Config File');
console.log('RUNTIME_PROJECT_ID:', firebaseConfig.projectId);
console.log('RUNTIME_APP_ID:', firebaseConfig.appId);
console.log('RUNTIME_AUTH_DOMAIN:', firebaseConfig.authDomain);
console.log('RUNTIME_API_KEY (Prefix):', firebaseConfig.apiKey?.substring(0, 10) + '...');
console.log('------------------------------');

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log('AUTH_INSTANCE_PROJECT:', auth.app.options.projectId);


