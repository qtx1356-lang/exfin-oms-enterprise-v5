import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const configStr = fs.readFileSync('firebase-applet-config.json', 'utf8');
const config = JSON.parse(configStr);

const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  console.log('Fetching registrations...');
  const regSnapshot = await getDocs(collection(db, 'registrations'));
  const deviceMap = new Map();
  
  let exfrng001_id = null;
  let exfrng002_id = null;
  let exfrng001_deviceId = null;
  let exfrng002_deviceId = null;

  regSnapshot.docs.forEach(d => {
    const data = d.data();
    console.log(`[DATA] ID: ${d.id}, EmpCode: ${data.employeeCode}, DeviceID: ${data.deviceId}`);
    
    if (data.employeeCode === 'EXFRNG001') {
      exfrng001_id = d.id;
      exfrng001_deviceId = data.deviceId;
    }
    if (data.employeeCode === 'EXFRNG002') {
       exfrng002_id = d.id;
       exfrng002_deviceId = data.deviceId;
    }

    if (data.deviceId) {
      if (!deviceMap.has(data.deviceId)) {
        deviceMap.set(data.deviceId, []);
      }
      deviceMap.get(data.deviceId).push({ id: d.id, ...data });
    }
  });

  console.log(`\nFound EXFRNG001 doc ID: ${exfrng001_id}, deviceId: ${exfrng001_deviceId}`);
  console.log(`Found EXFRNG002 doc ID: ${exfrng002_id}, deviceId: ${exfrng002_deviceId}`);

  let deleted001 = false;
  let retained002 = false;

  console.log('\n--- Duplicate Resolution ---');
  for (const [deviceId, users] of deviceMap.entries()) {
    if (users.length > 1) {
      console.log(`Found duplicate for deviceId: ${deviceId}`);
      
      const getCodeNum = (code) => parseInt((code || '').replace('EXFRNG', ''), 10) || 0;
      
      users.sort((a, b) => {
        const dateA = new Date(a.registrationDate || 0).getTime();
        const dateB = new Date(b.registrationDate || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        
        return getCodeNum(b.employeeCode) - getCodeNum(a.employeeCode);
      });

      console.log(`Keeping: ${users[0].id} (EmpCode: ${users[0].employeeCode})`);
      if (users[0].id === exfrng002_id) retained002 = true;

      for (let i = 1; i < users.length; i++) {
        const target = users[i];
        console.log(`Deleting: ${target.id} (EmpCode: ${target.employeeCode})`);
        await deleteDoc(doc(db, 'registrations', target.id));
        if (target.id === exfrng001_id) deleted001 = true;
      }
    } else {
       if (users[0].id === exfrng002_id) retained002 = true;
    }
  }
  
  console.log('\n--- Verification ---');
  console.log(`EXFRNG001 deleted: ${deleted001}`);
  console.log(`EXFRNG002 retained: ${retained002}`);
  
  const finalSnap = await getDocs(collection(db, 'registrations'));
  const remainingIds = finalSnap.docs.map(d => d.id);
  
  if (exfrng001_id) {
     console.log(`Verification: EXFRNG001 still in DB? ${remainingIds.includes(exfrng001_id)}`);
  }
  if (exfrng002_id) {
     console.log(`Verification: EXFRNG002 still in DB? ${remainingIds.includes(exfrng002_id)}`);
  }
  
  console.log(`Number of remaining registration records for that deviceId: ${remainingIds.filter(id => {
      const data = finalSnap.docs.find(d => d.id === id).data();
      return data.deviceId === exfrng002_deviceId;
  }).length}`);

  process.exit(0);
}

run().catch(console.error);
