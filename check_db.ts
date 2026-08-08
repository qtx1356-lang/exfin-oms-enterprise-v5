import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, initializeFirestore } from 'firebase/firestore';
import * as fs from 'fs';

async function main() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  const firebaseConfig = {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  };

  const app = initializeApp(firebaseConfig);
  // Correctly initialize Firestore with custom databaseId if provided
  const db = initializeFirestore(app, {
    databaseId: config.firestoreDatabaseId || '(default)',
  });

  console.log("Querying collections...");

  // Check login_ids collection
  console.log("---- login_ids ----");
  const loginIdsCol = collection(db, 'login_ids');
  const loginIdsSnap = await getDocs(loginIdsCol);
  loginIdsSnap.forEach(d => {
    console.log(d.id, "=>", d.data());
  });

  // Check admin_users collection
  console.log("---- admin_users ----");
  const adminUsersCol = collection(db, 'admin_users');
  const adminUsersSnap = await getDocs(adminUsersCol);
  adminUsersSnap.forEach(d => {
    console.log(d.id, "=>", d.data());
  });

  // Check registrations collection
  console.log("---- registrations ----");
  const regsCol = collection(db, 'registrations');
  const regsSnap = await getDocs(regsCol);
  regsSnap.forEach(d => {
    console.log(d.id, "=>", d.data());
  });
}

main().catch(err => {
  console.error("Error:", err);
});
