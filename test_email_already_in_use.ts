import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: "exfin-oms-production.firebaseapp.com",
  projectId: "exfin-oms-production",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function checkEmailExists(email: string) {
  try {
    // Attempt registration with a dummy password
    await createUserWithEmailAndPassword(auth, email, "TempPassword123!");
    console.log(`[AVAILABLE] Email does not exist (created successfully): ${email}`);
  } catch (err: any) {
    if (err.code === 'auth/email-already-in-use') {
      console.log(`[EXISTING] Email already in use (exists!): ${email}`);
    } else {
      console.log(`[ERROR] ${email}:`, err.code, err.message);
    }
  }
}

async function main() {
  const candidates = [
    'admin@exfin.internal',
    'super_admin@exfin.internal',
    'admin@exfin.com',
    'super_admin@exfin.com',
    'admin@exfinoms.com',
    'admin@exfin-oms.com',
    'exfrng001@exfin.com',
    'exfrng002@exfin.com',
    'exfrng003@exfin.com',
    'qtx1356@gmail.com'
  ];

  for (const email of candidates) {
    await checkEmailExists(email);
  }
}

main().catch(err => {
  console.error("Main error:", err);
});
