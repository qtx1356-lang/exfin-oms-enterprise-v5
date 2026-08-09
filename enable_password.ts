import { GoogleAuth } from 'google-auth-library';
import firebaseConfig from './firebase-applet-config.json';

async function run() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/identitytoolkit']
  });
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  // Try updating project config to enable email/password
  const url = `https://identitytoolkit.googleapis.com/v2/projects/${firebaseConfig.projectId}/config`;
  console.log("Calling GET/PATCH", url);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log("GET status:", res.status);
    const data = await res.json();
    console.log("Config data:", data);
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}

run().catch(console.error);
