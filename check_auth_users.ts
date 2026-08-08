async function lookupEmail(email: string) {
  const apiKey = "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM";
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`;
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [email] })
    });
    const data = await res.json();
    console.log(`Lookup result for ${email}:`, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Error looking up ${email}:`, err);
  }
}

async function main() {
  await lookupEmail('admin@exfin.internal');
  await lookupEmail('super_admin@exfin.internal');
  await lookupEmail('qtx1356@gmail.com');
}

main();
