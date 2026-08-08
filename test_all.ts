import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, initializeFirestore } from 'firebase/firestore';
import * as fs from 'fs';

async function testConfig(name: string, projectId: string, apiKey: string, databaseId?: string) {
  console.log(`\nTesting Config: ${name} (projectId: ${projectId}, databaseId: ${databaseId || '(default)'})`);
  try {
    const firebaseConfig = {
      apiKey: apiKey,
      authDomain: `${projectId}.firebaseapp.com`,
      projectId: projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
    };
    const app = initializeApp(firebaseConfig, name);
    const db = databaseId 
      ? initializeFirestore(app, { databaseId })
      : getFirestore(app);

    const loginIdsCol = collection(db, 'login_ids');
    const snap = await getDocs(loginIdsCol);
    console.log(`Success! Found ${snap.size} documents in login_ids:`);
    snap.forEach(d => {
      console.log(` - ${d.id} =>`, d.data());
    });
    return true;
  } catch (err: any) {
    console.error(`Failed: ${err.message || err}`);
    return false;
  }
}

async function main() {
  const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
  
  // Test 1: Actual Applet Project + Custom Database
  await testConfig(
    "AppletProject_CustomDB",
    config.projectId,
    config.apiKey,
    config.firestoreDatabaseId
  );

  // Test 2: Actual Applet Project + Default DB
  await testConfig(
    "AppletProject_DefaultDB",
    config.projectId,
    config.apiKey
  );

  // Test 3: Placeholder Project + Default DB
  await testConfig(
    "PlaceholderProject_DefaultDB",
    "exfin-oms-production",
    "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM"
  );
}

main().catch(err => {
  console.error("Main error:", err);
});
