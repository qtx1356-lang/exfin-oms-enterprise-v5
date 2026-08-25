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
  
  // Let's list documents using pageSize=300 to fetch everything
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/attendance?key=${apiKey}&pageSize=300`;
  
  console.log('Searching all documents for EXFRNG001...');
  try {
    const data = await get(url);
    if (!data.documents) {
      console.log('No documents found or error:', JSON.stringify(data, null, 2));
      return;
    }
    
    console.log(`Retrieved ${data.documents.length} total documents from collection.`);
    let found = 0;
    for (const doc of data.documents) {
      const name = doc.name;
      const docId = name.split('/').pop();
      const fields = doc.fields || {};
      
      const empId = fields.employeeId?.stringValue || '';
      const empCode = fields.employeeCode?.stringValue || '';
      
      const matchId = docId.toLowerCase().includes('exfrng001') || docId.toLowerCase().includes('emp001');
      const matchFields = empId.toLowerCase().includes('exfrng001') || empCode.toLowerCase().includes('exfrng001');
      
      if (matchId || matchFields) {
        found++;
        console.log(`MATCH FOUND: Doc ID: ${docId}`);
        console.log(`Full Fields:`, JSON.stringify(fields, null, 2));
      }
    }
    console.log(`Search complete. Found ${found} matching documents.`);
  } catch (err) {
    console.error('Error during search:', err);
  }
}

run();
