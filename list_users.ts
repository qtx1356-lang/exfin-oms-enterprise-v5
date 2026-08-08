import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main() {
  console.log("Initializing firebase-admin with exfin-oms-production...");
  try {
    const app = initializeApp({
      projectId: "exfin-oms-production"
    });
    console.log("Successfully initialized with exfin-oms-production.");
    
    console.log("Listing users...");
    const auth = getAuth(app);
    const listUsersResult = await auth.listUsers(100);
    console.log(`Found ${listUsersResult.users.length} users:`);
    listUsersResult.users.forEach((userRecord) => {
      console.log('user:', {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        emailVerified: userRecord.emailVerified,
        disabled: userRecord.disabled,
      });
    });
  } catch (error: any) {
    console.error("Error listing users:", error.stack || error.message || error);
  }
}

main();
