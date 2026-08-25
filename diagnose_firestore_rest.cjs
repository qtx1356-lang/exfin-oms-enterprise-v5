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
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/attendance?key=${apiKey}&pageSize=100`;
  
  console.log('Fetching recent documents from Firestore REST API...');
  try {
    const data = await get(url);
    if (!data.documents) {
      console.log('No documents found or error:', JSON.stringify(data, null, 2));
      return;
    }
    console.log(`Found ${data.documents.length} documents.`);
    for (const doc of data.documents) {
      const name = doc.name;
      const fields = doc.fields || {};
      const docId = name.split('/').pop();
      const empId = fields.employeeId?.stringValue || fields.employeeCode?.stringValue || 'N/A';
      const date = fields.date?.stringValue || 'N/A';
      const checkInTime = fields.checkInTime?.stringValue || 'N/A';
      const checkOutTime = fields.checkOutTime?.stringValue || 'N/A';
      const status = fields.status?.stringValue || fields.attendanceType?.stringValue || 'N/A';
      console.log(`Doc: ${docId} | Emp: ${empId} | Date: ${date} | CheckIn: ${checkInTime} | CheckOut: ${checkOutTime} | Status: ${status}`);
    }
  } catch (err) {
    console.error('Error fetching from Firestore REST API:', err);
  }
}

run();
