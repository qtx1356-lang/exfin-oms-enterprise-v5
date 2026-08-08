import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function main() {
  const firebaseConfig = {
    apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
    authDomain: "exfin-oms-production.firebaseapp.com",
    projectId: "exfin-oms-production",
    storageBucket: "exfin-oms-production.firebasestorage.app",
  };
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("---- login_ids ----");
  const loginIdsCol = collection(db, 'login_ids');
  const loginIdsSnap = await getDocs(loginIdsCol);
  loginIdsSnap.forEach(d => {
    console.log(d.id, "=>", d.data());
  });

  console.log("\n---- admin_users ----");
  const adminUsersCol = collection(db, 'admin_users');
  const adminUsersSnap = await getDocs(adminUsersCol);
  adminUsersSnap.forEach(d => {
    console.log(d.id, "=>", d.data());
  });

  console.log("\n---- registrations ----");
  const registrationsCol = collection(db, 'registrations');
  const registrationsSnap = await getDocs(registrationsCol);
  registrationsSnap.forEach(d => {
    console.log(d.id, "=>", d.data());
  });
}

main().catch(err => {
  console.error("Error:", err);
});
