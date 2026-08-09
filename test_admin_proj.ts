import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

async function testProj(projectId: string) {
  console.log(`Testing Firebase Admin with project: ${projectId}`);
  try {
    const app = initializeApp({ projectId }, projectId);
    const auth = getAuth(app);
    const list = await auth.listUsers(5);
    console.log(`Success for ${projectId}! Users count:`, list.users.length);
    list.users.forEach(u => console.log(u.uid, u.email));
  } catch (e: any) {
    console.error(`Failed for ${projectId}:`, e.message);
  }
}

async function run() {
  await testProj('gen-lang-client-0947333745');
  await testProj('ais-asia-southeast1-86de4dad38');
  await testProj('65234134226');
}

run().catch(console.error);
