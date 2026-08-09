import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});
const auth = getAuth(app);

async function run() {
  const email = 'admin_v6_secure@exfinoms.com';
  const password = 'AdminPassword2026!';

  console.log("Attempting createUserWithEmailAndPassword...");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log("SUCCESS creating user! UID:", cred.user.uid);
  } catch (e: any) {
    console.log("Create user error code:", e.code);
    console.log("Create user error message:", e.message);

    console.log("Attempting signInWithEmailAndPassword...");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      console.log("SUCCESS signing in! UID:", cred.user.uid);
    } catch (signinErr: any) {
      console.log("Sign in error code:", signinErr.code);
      console.log("Sign in error message:", signinErr.message);
    }
  }
}

run().catch(console.error);
