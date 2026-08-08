import * as admin from 'firebase-admin';

// Initialize firebase-admin using Application Default Credentials
admin.initializeApp({
  projectId: "exfin-oms-production"
});

async function main() {
  console.log("Listing auth users...");
  try {
    const listUsersResult = await admin.auth().listUsers(1000);
    listUsersResult.users.forEach((userRecord) => {
      console.log('user', {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName,
        disabled: userRecord.disabled,
      });
    });
    console.log("Done.");
  } catch (err) {
    console.error("Error listing users:", err);
  }
}

main();
