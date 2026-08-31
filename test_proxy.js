import { getAdminDb } from './src/services/firebase/db.js';
import { db } from './src/services/firebase/config.js';
import { collection } from 'firebase/firestore';

async function test() {
  await getAdminDb();
  console.log('Db loaded');
  try {
     collection(db, 'test');
     console.log('SUCCESS');
  } catch(e) {
     console.error('FAILED', e.message);
  }
}
test();
