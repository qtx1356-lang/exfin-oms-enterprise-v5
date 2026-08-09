import { GoogleAuth } from 'google-auth-library';

async function run() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/identitytoolkit']
  });
  try {
    const client = await auth.getClient();
    const projectId = await auth.getProjectId();
    console.log("Detected Project ID from ADC:", projectId);
    const token = await client.getAccessToken();
    console.log("Access token obtained:", !!token.token);
  } catch (e: any) {
    console.error("Auth error:", e.message);
  }
}

run().catch(console.error);
