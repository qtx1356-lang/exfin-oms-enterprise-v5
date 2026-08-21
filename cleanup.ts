import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  projectId: 'ai-studio-exfinomsenterpri-b4e161a4-dcff-4b57-bd11-50183775a4f1'
});

const db = getFirestore();
db.settings({
    databaseId: 'exfinomsenterpri-b4e161a4-dcff'
});

async function run() {
  try {
    console.log('Fetching registrations...');
    const snapshot = await db.collection('registrations').get();
    const deviceMap = new Map();

    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`Found registration: ${doc.id}, employeeCode: ${data.employeeCode}, deviceId: ${data.deviceId}, name: ${data.name}`);
      const deviceId = data.deviceId;
      if (deviceId) {
        if (!deviceMap.has(deviceId)) {
          deviceMap.set(deviceId, []);
        }
        deviceMap.get(deviceId).push({ id: doc.id, ...data });
      }
    });

    console.log('\n--- Analyzing duplicates ---');
    for (const [deviceId, users] of deviceMap.entries()) {
      if (users.length > 1) {
        console.log(`\nDuplicate found for deviceId: ${deviceId}`);
        // Sort to find the one to keep. The newest or the one with higher EXFRNG
        const getCodeNum = (code) => parseInt(code.replace('EXFRNG', ''), 10) || 0;
        
        users.sort((a, b) => {
          const dateA = new Date(a.registrationDate || 0).getTime();
          const dateB = new Date(b.registrationDate || 0).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return getCodeNum(b.employeeCode) - getCodeNum(a.employeeCode);
        });

        // The first one is the one to keep
        console.log(`Keeping: ${users[0].id} (${users[0].employeeCode})`);
        
        for (let i = 1; i < users.length; i++) {
          console.log(`Deleting: ${users[i].id} (${users[i].employeeCode})`);
          await db.collection('registrations').doc(users[i].id).delete();
          console.log(`Successfully deleted ${users[i].id}`);
        }
      }
    }
    
    console.log('\nCleanup complete.');
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
