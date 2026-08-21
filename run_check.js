import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const configStr = fs.readFileSync('firebase-applet-config.json', 'utf8');
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const regSnapshot = await getDocs(collection(db, 'registrations'));

  regSnapshot.docs.forEach(d => {
    const data = d.data();
    console.log(`EmpCode: ${data.employeeCode}`);
    console.log(`  ID: ${d.id}`);
    console.log(`  DeviceID: ${data.deviceId}`);
    console.log(`  Name: ${data.name}`);
    console.log(`  Mobile: ${data.mobileNumber}`);
    console.log(`  Model: ${data.deviceModel}`);
    console.log('---');
  });

  process.exit(0);
}

run().catch(console.error);
