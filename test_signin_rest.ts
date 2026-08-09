import firebaseConfig from './firebase-applet-config.json';

async function run() {
  const email = 'admin_v6_secure@exfinoms.com';
  const password = 'AdminPassword2026!';

  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });
  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Data:", data);
}

run().catch(console.error);
