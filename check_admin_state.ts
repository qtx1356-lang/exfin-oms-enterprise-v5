import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import firebaseConfig from './firebase-applet-config.json';

const app = initializeApp({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

let adminApp: any;
try {
  adminApp = initAdmin({
    projectId: firebaseConfig.projectId,
  }, 'admin-app');
} catch (e) {
  // already initialized
}

async function run() {
  console.log("=== Checking Firestore /login_ids/admin ====");
  const loginDoc = await getDoc(doc(db, 'login_ids', 'admin'));
  console.log("login_ids/admin exists:", loginDoc.exists());
  console.log("login_ids/admin data:", loginDoc.data());

  const email = loginDoc.exists() ? loginDoc.data()?.email : null;
  const uid = loginDoc.exists() ? loginDoc.data()?.uid : null;
  console.log("Mapped email:", email);
  console.log("Mapped uid:", uid);

  if (uid) {
    console.log(`=== Checking Firestore /admin_users/${uid} ===`);
    const adminUserDoc = await getDoc(doc(db, 'admin_users', uid));
    console.log("admin_users doc exists:", adminUserDoc.exists());
    console.log("admin_users doc data:", adminUserDoc.data());
  }

  if (adminApp && email) {
    const adminAuth = getAdminAuth(adminApp);
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      console.log("Firebase Auth user found by email:", {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified
      });
    } catch (e: any) {
      console.log("Firebase Auth user by email not found or error:", e.message);
    }

    if (uid) {
      try {
        const userRecordByUid = await adminAuth.getUser(uid);
        console.log("Firebase Auth user found by UID:", {
          uid: userRecordByUid.uid,
          email: userRecordByUid.email
        });
      } catch (e: any) {
        console.log("Firebase Auth user by UID not found or error:", e.message);
      }
    }
  }
}

run().catch(console.error);
