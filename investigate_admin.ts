import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: "exfin-oms-production.firebaseapp.com",
  projectId: "exfin-oms-production",
  storageBucket: "exfin-oms-production.firebasestorage.app",
  messagingSenderId: "467454374123",
  appId: "1:467454374123:web:1c039dad311c6362b44eae"
};

async function investigate() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const targetEmail = 'admin@exfin.internal';
  const targetUid = 'ehCXF3mi8pOHYEh7gHWnsPIhKNq2';

  console.log(`\n--- FORENSIC INVESTIGATION: ${targetEmail} ---`);

  // 1. Check admin_users for the known UID
  try {
    const adminSnap = await getDoc(doc(db, 'admin_users', targetUid));
    if (adminSnap.exists()) {
      const data = adminSnap.data();
      console.log(`Found in /admin_users/${targetUid}:`);
      console.log(` - Role: ${data.role}`);
      console.log(` - Email: ${data.email}`);
      console.log(` - Login ID: ${data.loginId}`);
      console.log(` - Active: ${data.active}`);
    } else {
      console.log(`/admin_users/${targetUid} does not exist.`);
    }
  } catch (e: any) {
    console.log(`Error reading admin_users/${targetUid}: ${e.message}`);
  }

  // 2. Check login_ids/admin
  try {
    const loginSnap = await getDoc(doc(db, 'login_ids', 'admin'));
    if (loginSnap.exists()) {
      const data = loginSnap.data();
      console.log(`\nCurrent /login_ids/admin mapping:`);
      console.log(` - UID: ${data.uid}`);
      console.log(` - Email: ${data.email}`);
      console.log(` - Matches target UID (${targetUid})? ${data.uid === targetUid}`);
    }
  } catch (e: any) {
    console.log(`Error reading login_ids/admin: ${e.message}`);
  }

  // 3. Search for any login_ids pointing to the target UID
  try {
    const q = query(collection(db, 'login_ids'), where('uid', '==', targetUid));
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
      console.log(`\nLogin IDs pointing to UID ${targetUid}:`);
      qSnap.forEach(d => {
        console.log(` - ID: ${d.id}, Data: ${JSON.stringify(d.data())}`);
      });
    } else {
      console.log(`\nNo Login IDs found pointing to UID ${targetUid}.`);
    }
  } catch (e: any) {
    console.log(`Error searching login_ids: ${e.message}`);
  }

  process.exit(0);
}

investigate();
