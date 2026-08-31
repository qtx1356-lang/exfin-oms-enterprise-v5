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
  
  // Fetch up to 10 attendance documents from August 2026
  // Note: We can't easily filter by date in REST without structured queries, 
  // so we'll just fetch a few and look at them manually.
  const attendanceUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/attendance?key=${apiKey}&pageSize=20`;

  try {
    console.log('Fetching sample attendance records...');
    const attendanceData = await get(attendanceUrl);
    const documents = attendanceData.documents || [];
    
    if (documents.length === 0) {
      console.log('No attendance records found.');
      return;
    }

    console.log(`Inspecting ${documents.length} sample records:\n`);
    
    documents.forEach((doc, index) => {
      const fields = doc.fields || {};
      const id = doc.name.split('/').pop();
      const date = fields.date?.stringValue || 'N/A';
      const employeeCode = fields.employeeCode?.stringValue || 'N/A';
      const employeeId = fields.employeeId?.stringValue || 'N/A';
      const checkIn = fields.checkIn?.stringValue || fields.checkInTime?.stringValue || 'N/A';
      const checkOut = fields.checkOut?.stringValue || fields.checkOutTime?.stringValue || 'N/A';
      const status = fields.status?.stringValue || 'N/A';
      const checkoutStatus = fields.checkoutStatus?.stringValue || 'N/A';

      console.log(`Record #${index + 1} (ID: ${id})`);
      console.log(` - Date: ${date}`);
      console.log(` - Employee Code: ${employeeCode}`);
      console.log(` - Employee ID: ${employeeId}`);
      console.log(` - Check-In: ${checkIn}`);
      console.log(` - Check-Out: ${checkOut}`);
      console.log(` - Status: ${status}`);
      console.log(` - Checkout Status: ${checkoutStatus}`);
      console.log('-----------------------------------');
    });

  } catch (err) {
    console.error('Error during diagnostic:', err);
  }
}

run();
