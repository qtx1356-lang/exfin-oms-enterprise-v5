import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const configStr = fs.readFileSync('firebase-applet-config.json', 'utf8');
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const regSnapshot = await getDocs(collection(db, 'registrations'));
  
  for (const d of regSnapshot.docs) {
    const data = d.data();
    if (data.employeeCode === 'EXFRNG001') {
      console.log(`Deleting EXFRNG001 (doc ID: ${d.id})`);
      await deleteDoc(doc(db, 'registrations', d.id));
    }
  }

  process.exit(0);
}

run().catch(console.error);
