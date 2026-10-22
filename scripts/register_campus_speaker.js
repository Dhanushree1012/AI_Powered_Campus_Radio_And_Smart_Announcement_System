const https = require('https');

const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';

function registerSpeaker(docId, data) {
  return new Promise((resolve, reject) => {
    const fields = {
      name: { stringValue: data.name },
      department: { stringValue: data.department },
      macAddress: { stringValue: data.macAddress },
      mac: { stringValue: data.macAddress },
      status: { stringValue: data.status || 'active' },
      operationalStatus: { stringValue: data.operationalStatus || 'active' },
      updatedAt: { timestampValue: new Date().toISOString() }
    };

    const payload = JSON.stringify({ fields });
    const docPath = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/classrooms/${encodeURIComponent(docId)}?key=${API_KEY}`;

    const options = {
      hostname: 'firestore.googleapis.com',
      path: docPath,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`✅ Successfully registered [classrooms/${docId}]:`);
          console.log(JSON.stringify(JSON.parse(body), null, 2));
          resolve(JSON.parse(body));
        } else {
          console.error(`❌ Registration failed with HTTP ${res.statusCode}: ${body}`);
          reject(new Error(`Failed with status ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("Registering new ESP32 as Campus Speaker in Firestore...");
  await registerSpeaker('Campus Speaker', {
    name: 'Campus Speaker',
    department: 'Campus',
    macAddress: 'C0:CD:D6:85:AD:1C',
    status: 'active',
    operationalStatus: 'active'
  });
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
