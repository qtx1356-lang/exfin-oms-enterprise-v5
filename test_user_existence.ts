import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: "exfin-oms-production.firebaseapp.com",
  projectId: "exfin-oms-production",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function testUser(email: string) {
  try {
    await signInWithEmailAndPassword(auth, email, "wrongpassword123");
    console.log(`${email} signed in successfully?!`);
  } catch (err: any) {
    console.log(`${email} error:`, err.code, err.message);
  }
}

async function main() {
  await testUser('admin@exfin.internal');
  await testUser('super_admin@exfin.internal');
  await testUser('super_admin@exfin.com');
  await testUser('admin@exfin.com');
}

main().catch(err => {
  console.error("Error:", err);
});
