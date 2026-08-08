import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, initializeFirestore } from 'firebase/firestore';
import * as fs from 'fs';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded`)), ms))
  ]);
}

async function queryDb(name: string, projectId: string, apiKey: string, databaseId?: string) {
  console.log(`\n--- Querying ${name} (projectId: ${projectId}, databaseId: ${databaseId || '(default)'}) ---`);
  try {
    const firebaseConfig = {
      apiKey: apiKey,
      authDomain: `${projectId}.firebaseapp.com`,
      projectId: projectId,
    };
    const app = initializeApp(firebaseConfig, name);
    const db = databaseId 
      ? initializeFirestore(app, { databaseId })
      : getFirestore(app);

    console.log("Fetching login_ids...");
    const loginIdsCol = collection(db, 'login_ids');
    const loginIdsSnap = await withTimeout(getDocs(loginIdsCol), 4000);
    console.log(`login_ids count: ${loginIdsSnap.size}`);
    loginIdsSnap.forEach(d => {
      console.log(`  ${d.id} =>`, d.data());
    });

    console.log("Fetching admin_users...");
    const adminUsersCol = collection(db, 'admin_users');
    const adminUsersSnap = await withTimeout(getDocs(adminUsersCol), 4000);
    console.log(`admin_users count: ${adminUsersSnap.size}`);
    adminUsersSnap.forEach(d => {
      console.log(`  ${d.id} =>`, d.data());
    });

    console.log("Fetching registrations...");
    const registrationsCol = collection(db, 'registrations');
    const registrationsSnap = await withTimeout(getDocs(registrationsCol), 4000);
    console.log(`registrations count: ${registrationsSnap.size}`);
    registrationsSnap.forEach(d => {
      console.log(`  ${d.id} =>`, d.data());
    });

    return true;
  } catch (err: any) {
    console.error(`Failed ${name}: ${err.message || err}`);
    return false;
  }
}

async function main() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  
  // Test 1: Applet Project + Custom Database
  await queryDb(
    "AppletProject_CustomDB",
    config.projectId,
    config.apiKey,
    config.firestoreDatabaseId
  );

  // Test 2: Placeholder Project + Default DB
  await queryDb(
    "PlaceholderProject_DefaultDB",
    "exfin-oms-production",
    "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM"
  );
}

main().catch(err => {
  console.error("Main error:", err);
});
