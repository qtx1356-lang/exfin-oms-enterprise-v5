import { GoogleAuth } from 'google-auth-library';

async function run() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const client = await auth.getClient();
  const tokenRes = await client.getAccessToken();
  const token = tokenRes.token;

  const projectId = '65234134226';
  const url = `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/identitytoolkit.googleapis.com:enable`;

  console.log("Enabling Identity Toolkit API on project", projectId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  console.log("Status:", res.status);
  const data = await res.json();
  console.log("Response:", data);
}

run().catch(console.error);
