import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const configStr = fs.readFileSync('firebase-applet-config.json', 'utf8');
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const regSnapshot = await getDocs(collection(db, 'registrations'));
  
  let exfrng001 = null;
  let exfrng002 = null;

  regSnapshot.docs.forEach(d => {
    const data = d.data();
    if (data.employeeCode === 'EXFRNG001') exfrng001 = data;
    if (data.employeeCode === 'EXFRNG002') exfrng002 = data;
  });

  console.log(`EXFRNG001 found: ${!!exfrng001}`);
  console.log(`EXFRNG002 found: ${!!exfrng002}`);
  if (exfrng002) {
      console.log(`EXFRNG002 deviceId: ${exfrng002.deviceId}`);
      const count = regSnapshot.docs.filter(d => d.data().deviceId === exfrng002.deviceId).length;
      console.log(`Remaining docs for ${exfrng002.deviceId}: ${count}`);
  }

  process.exit(0);
}

run().catch(console.error);
