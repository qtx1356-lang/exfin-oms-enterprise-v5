import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

async function main() {
  console.log("Querying exfin-oms-production clean...");
  const firebaseConfig = {
    apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
    authDomain: "exfin-oms-production.firebaseapp.com",
    projectId: "exfin-oms-production",
    storageBucket: "exfin-oms-production.firebasestorage.app",
  };
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("\n---- login_ids ----");
  const loginIdsCol = collection(db, 'login_ids');
  const loginIdsSnap = await getDocs(loginIdsCol);
  loginIdsSnap.forEach(d => {
    console.log(d.id, "=>", d.data());
  });

  console.log("\n---- admin_users ----");
  const adminUsersCol = collection(db, 'admin_users');
  const adminUsersSnap = await getDocs(adminUsersCol);
  adminUsersSnap.forEach(d => {
    const data = d.data();
    console.log(d.id, "=>", {
      uid: data.uid,
      loginId: data.loginId,
      role: data.role,
      active: data.active,
      email: data.email,
      status: data.status,
    });
  });

  console.log("\n---- registrations ----");
  const regsCol = collection(db, 'registrations');
  const regsSnap = await getDocs(regsCol);
  regsSnap.forEach(d => {
    const data = d.data();
    console.log(d.id, "=>", {
      role: data.role,
      email: data.email,
      status: data.status,
      office: data.office,
      name: data.name,
      employeeCode: data.employeeCode,
    });
  });
}

main().catch(err => {
  console.error("Error:", err);
});
