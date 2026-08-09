import { GoogleAuth } from 'google-auth-library';
import firebaseConfig from './firebase-applet-config.json';

async function run() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/identitytoolkit']
  });
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  console.log("Calling Identity Toolkit accounts:list for project:", firebaseConfig.projectId);
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${firebaseConfig.projectId}/accounts:batchGet`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", data);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

run().catch(console.error);
