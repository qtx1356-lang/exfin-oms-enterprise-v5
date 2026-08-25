const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const apiKey = 'AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM';
  const projectId = 'exfin-oms-production';
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/registrations?key=${apiKey}&pageSize=100`;
  
  console.log('Fetching registrations from Firestore REST API...');
  try {
    const data = await get(url);
    if (!data.documents) {
      console.log('No registrations found or error:', JSON.stringify(data, null, 2));
      return;
    }
    console.log(`Found ${data.documents.length} registrations.`);
    for (const doc of data.documents) {
      const name = doc.name;
      const fields = doc.fields || {};
      const regId = name.split('/').pop();
      const empCode = fields.employeeCode?.stringValue || 'N/A';
      const fullName = fields.fullName?.stringValue || 'N/A';
      const status = fields.status?.stringValue || 'N/A';
      const deviceId = fields.deviceId?.stringValue || 'N/A';
      const email = fields.email?.stringValue || 'N/A';
      console.log(`RegId: ${regId} | Code: ${empCode} | Name: ${fullName} | Status: ${status} | Device: ${deviceId} | Email: ${email}`);
    }
  } catch (err) {
    console.error('Error fetching registrations:', err);
  }
}

run();
