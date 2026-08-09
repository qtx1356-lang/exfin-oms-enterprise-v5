import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
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
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const email = 'admin_v6_secure@exfinoms.com';
  const password = 'AdminPassword2026!';
  const expectedUid = 'admin_fresh_uid_v6_789';

  console.log(`Ensuring Firestore /login_ids/admin points to email ${email}...`);
  await setDoc(doc(db, 'login_ids', 'admin'), {
    email: email,
    uid: expectedUid
  });
  console.log("Updated /login_ids/admin successfully.");

  console.log(`Ensuring Firestore /admin_users/${expectedUid} exists with role ADMIN...`);
  await setDoc(doc(db, 'admin_users', expectedUid), {
    uid: expectedUid,
    role: 'ADMIN',
    active: true,
    loginId: 'admin',
    email: email,
    authorizedOffice: 'ALL',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, { merge: true });
  console.log(`Updated /admin_users/${expectedUid} successfully.`);

  // Now test signing in with client SDK
  console.log(`Attempting signInWithEmailAndPassword for ${email}...`);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log("SUCCESS! Signed in UID:", cred.user.uid);
    if (cred.user.uid === expectedUid) {
      console.log("UID MATCHES EXPECTED UID EXACTLY!");
    } else {
      console.log("WARNING: UID mismatch! Got:", cred.user.uid, "Expected:", expectedUid);
    }
  } catch (err: any) {
    console.log("Sign in failed:", err.code, err.message);
    if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
      console.log("Attempting to create user with email and password...");
      try {
        // Can we create user with specific UID? Client SDK createUserWithEmailAndPassword generates its own UID.
        // Wait, if client SDK generates its own UID, it won't be admin_fresh_uid_v6_789 unless we use Firebase Admin or custom token or sign up.
        // Wait! Can we use Firebase Admin with service account key or ADC? Let's test Firebase Admin.
      } catch (e) {
        console.error("Create user failed:", e);
      }
    }
  }
}

run().catch(console.error);
