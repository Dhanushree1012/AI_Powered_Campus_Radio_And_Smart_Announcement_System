/**
 * Database Cleanup & Seeding Script for Vemana Institute of Technology RBAC
 * 
 * - Retains:
 *   1. admin@vemanait.edu.in (Role: admin)
 *   2. principal@vemanait.edu.in (Role: admin)
 * 
 * - Seeds:
 *   3. hoddatascience@vemanait.edu.in (Role: hod, Department: Data Science (DS))
 *   4. mamathacr@vemanait.edu.in (Role: faculty, Department: Data Science (DS))
 * 
 * - Deletes all legacy/test user profiles so QA/testers can validate clean signup flows.
 */

const https = require('https');

const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}?key=${API_KEY}`);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({});
          else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runCleanupAndSeed() {
  console.log('--- Step 1: Fetching current users from Firestore ---');
  const res = await makeRequest('GET', '/users');
  const docs = res.documents || [];
  console.log(`Found ${docs.length} user documents in Firestore.`);

  const KEEP_EMAILS = [
    'admin@vemanait.edu.in',
    'principal@vemanait.edu.in',
  ];

  for (const doc of docs) {
    const docId = doc.name.split('/').pop();
    const email = doc.fields && doc.fields.email && doc.fields.email.stringValue ? doc.fields.email.stringValue.toLowerCase() : '';
    
    if (KEEP_EMAILS.includes(email)) {
      console.log(`[KEEP] Preserving core account: ${email} (${docId})`);
      const updatePayload = {
        fields: {
          ...doc.fields,
          role: { stringValue: 'admin' },
          department: { stringValue: 'General Administration' },
        }
      };
      await makeRequest('PATCH', `/users/${docId}`, updatePayload);
      console.log(`[UPDATED] Normalized ${email} to admin role.`);
    } else {
      console.log(`[DELETE] Removing test/legacy user: ${email || 'unknown'} (${docId})`);
      await makeRequest('DELETE', `/users/${docId}`);
    }
  }

  console.log('\n--- Step 2: Seeding HOD and Faculty accounts for testing ---');

  const hodDoc = {
    fields: {
      uid: { stringValue: 'hod_datascience_seed' },
      email: { stringValue: 'hoddatascience@vemanait.edu.in' },
      name: { stringValue: 'HOD Data Science' },
      role: { stringValue: 'hod' },
      department: { stringValue: 'Data Science (DS)' },
      active: { booleanValue: true },
      createdAt: { timestampValue: new Date().toISOString() },
    }
  };
  await makeRequest('PATCH', `/users/hod_datascience_seed`, hodDoc);
  console.log('[SEEDED] HOD Data Science: hoddatascience@vemanait.edu.in (Role: hod)');

  const facultyDoc = {
    fields: {
      uid: { stringValue: 'faculty_mamathacr_seed' },
      email: { stringValue: 'mamathacr@vemanait.edu.in' },
      name: { stringValue: 'Prof. Mamatha C R' },
      role: { stringValue: 'faculty' },
      department: { stringValue: 'Data Science (DS)' },
      active: { booleanValue: true },
      createdAt: { timestampValue: new Date().toISOString() },
    }
  };
  await makeRequest('PATCH', `/users/faculty_mamathacr_seed`, facultyDoc);
  console.log('[SEEDED] Faculty: mamathacr@vemanait.edu.in (Role: faculty)');

  console.log('\n--- Step 3: Verifying Final Users List ---');
  const finalRes = await makeRequest('GET', '/users');
  const finalDocs = finalRes.documents || [];
  console.log(`Total active verified accounts in database: ${finalDocs.length}`);
  finalDocs.forEach(d => {
    const f = d.fields;
    console.log(`- ${f.name?.stringValue || 'N/A'} | ${f.email?.stringValue} | Role: ${f.role?.stringValue} | Dept: ${f.department?.stringValue}`);
  });
  console.log('\nDatabase cleanup and seeding completed successfully!');
}

runCleanupAndSeed().catch(err => {
  console.error('Failed to cleanup and seed:', err);
  process.exit(1);
});
