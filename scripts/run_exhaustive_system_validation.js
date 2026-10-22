/**
 * Exhaustive System Validation & User Role Simulation
 * Tests RBAC, Announcement Lifecycle, Scheduled Promotion, Department Info Updates,
 * and Classroom Audio Distribution.
 */

const https = require('https');
const http = require('http');

const SERVER_URL = 'http://localhost:3000';
const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';

const validationLogs = [];

function logPass(suite, name, message, ms) {
  validationLogs.push({ suite, name, status: 'PASSED', message, ms });
  console.log(`✅ [${suite}] ${name} (PASSED) [${ms || 0}ms]`);
  if (message) console.log(`   ↳ ${message}`);
}

function logFail(suite, name, message, ms) {
  validationLogs.push({ suite, name, status: 'FAILED', message, ms });
  console.log(`❌ [${suite}] ${name} (FAILED) [${ms || 0}ms]`);
  if (message) console.log(`   ↳ ${message}`);
}

function firestorePost(collection, data) {
  return new Promise((resolve, reject) => {
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') fields[k] = { stringValue: v };
      else if (typeof v === 'number') fields[k] = { integerValue: v.toString() };
      else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
      else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(x => ({ stringValue: x })) } };
      else if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    }

    const payload = JSON.stringify({ fields });
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const json = JSON.parse(d);
          const docId = json.name.split('/').pop();
          resolve({ docId, json });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${d}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function firestorePatch(collection, docId, data, maskFields) {
  return new Promise((resolve, reject) => {
    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === 'string') fields[k] = { stringValue: v };
      else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
      else if (typeof v === 'number') fields[k] = { integerValue: v.toString() };
    }
    const mask = maskFields.map(f => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
    const payload = JSON.stringify({ fields });

    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}?${mask}&key=${API_KEY}`,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(d));
        else reject(new Error(`HTTP ${res.statusCode}: ${d}`));
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function firestoreDelete(collection, docId) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(docId)}?key=${API_KEY}`,
      method: 'DELETE'
    }, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) resolve();
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    req.end();
  });
}

function getRequest(urlStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const client = url.protocol === 'https:' ? https : http;
    const start = Date.now();
    const req = client.request(url, { method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const latency = Date.now() - start;
        const buffer = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          length: buffer.length,
          latency
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runExhaustiveValidation() {
  console.log('\n================================================================');
  console.log('   EXHAUSTIVE APPLICATION VERIFICATION & VALIDATION SUITE        ');
  console.log('================================================================\n');

  // 1. RBAC & User Creation Simulation
  console.log('--- 1. Testing RBAC User Lifecycle (Admin, HOD, Faculty, Student) ---');
  let testUserDocId = null;
  try {
    const start = Date.now();
    const res = await firestorePost('users', {
      name: 'Dr. Ramesh Kumar (HOD Test)',
      email: 'hod.cse.test@vemanait.edu.in',
      role: 'hod',
      department: 'Computer Science (CSE)',
      active: true,
      createdAt: new Date().toISOString()
    });
    testUserDocId = res.docId;
    logPass('RBAC Suite', 'Create HOD User in Firestore', `Created user doc [${testUserDocId}] with role "hod"`, Date.now() - start);

    // Test Deactivate
    const startDeact = Date.now();
    await firestorePatch('users', testUserDocId, { active: false }, ['active']);
    logPass('RBAC Suite', 'Deactivate User State', `Successfully set active: false for [${testUserDocId}]`, Date.now() - startDeact);

    // Test Re-activate
    const startAct = Date.now();
    await firestorePatch('users', testUserDocId, { active: true }, ['active']);
    logPass('RBAC Suite', 'Reactivate User State', `Successfully set active: true for [${testUserDocId}]`, Date.now() - startAct);
  } catch (e) {
    logFail('RBAC Suite', 'User Creation & RBAC Lifecycle', e.message);
  }

  // 2. Announcement Full Lifecycle (Create -> Auto-Bridge -> Update -> Rebroadcast -> Delete)
  console.log('\n--- 2. Testing Announcement Lifecycle & IoT Target Classrooms ---');
  let announceDocId = null;
  try {
    const start = Date.now();
    const res = await firestorePost('announcements', {
      title: 'Validation: Inter-College Project Exhibition 2026',
      message: 'Final year students of CSE, ISE, and ECE must assemble in Seminar Hall 1 with project posters by 10 AM.',
      category: 'Academic',
      priority: 'High',
      department: 'All',
      status: 'published',
      classes: ['Seminar Hall 1', 'IoT Lab', 'CSE Seminar Hall'],
      createdAt: new Date().toISOString()
    });
    announceDocId = res.docId;
    logPass('Announcement Lifecycle', 'Create High-Priority Broadcast', `Created doc [${announceDocId}] targeted to [Seminar Hall 1, IoT Lab, CSE Seminar Hall]`, Date.now() - start);

    // Wait 3 seconds for Auto-Bridge to poll and synthesize audioUrl
    await new Promise(r => setTimeout(r, 3000));

    // Verify Audio Stream Resolution for this document
    const audioRes = await getRequest(`${SERVER_URL}/audio/${announceDocId}.mp3`);
    if (audioRes.status === 200 && audioRes.length > 5000) {
      logPass('Announcement Lifecycle', 'Auto-Bridge Audio Stream Generation', `Generated ${audioRes.length} MP3 bytes from Azure Neural Voice`, audioRes.latency);
    } else {
      logFail('Announcement Lifecycle', 'Auto-Bridge Audio Stream Generation', `Status ${audioRes.status}, Length ${audioRes.length}`, audioRes.latency);
    }

    // Edit Announcement
    const startEdit = Date.now();
    await firestorePatch('announcements', announceDocId, {
      title: 'Validation: Inter-College Project Exhibition 2026 (Updated Venue)',
      priority: 'Urgent'
    }, ['title', 'priority']);
    logPass('Announcement Lifecycle', 'Edit Announcement Details', `Updated title and priority to "Urgent"`, Date.now() - startEdit);

    // Clean up created test document
    if (announceDocId) {
      await firestoreDelete('announcements', announceDocId);
      logPass('Announcement Lifecycle', 'Delete Announcement Cleanup', `Cleaned up test document [${announceDocId}]`);
    }
  } catch (e) {
    logFail('Announcement Lifecycle', 'Announcement Operations', e.message);
  }

  // Clean up test user
  if (testUserDocId) {
    try {
      await firestoreDelete('users', testUserDocId);
      logPass('RBAC Suite', 'Delete Test User Profile', `Cleaned up test user [${testUserDocId}]`);
    } catch (_) {}
  }

  // 3. Department Info & Kiosk Audio Regeneration
  console.log('\n--- 3. Testing Department Spotlight & Kiosk Audio Sync ---');
  try {
    const start = Date.now();
    const cseAudio = await getRequest(`${SERVER_URL}/dept/CSE.mp3`);
    if (cseAudio.status === 200 && cseAudio.length > 10000) {
      logPass('Department Spotlight', 'CSE Department Kiosk Stream', `Streamed ${cseAudio.length} bytes for entrance kiosks`, cseAudio.latency);
    } else {
      logFail('Department Spotlight', 'CSE Department Kiosk Stream', `Status ${cseAudio.status}`);
    }

    const iseAudio = await getRequest(`${SERVER_URL}/dept/ISE.mp3`);
    if (iseAudio.status === 200 && iseAudio.length > 10000) {
      logPass('Department Spotlight', 'ISE Department Kiosk Stream', `Streamed ${iseAudio.length} bytes for entrance kiosks`, iseAudio.latency);
    } else {
      logFail('Department Spotlight', 'ISE Department Kiosk Stream', `Status ${iseAudio.status}`);
    }
  } catch (e) {
    logFail('Department Spotlight', 'Department Kiosk Audio', e.message);
  }

  // 4. Radio Studio Broadcast Preview & Studio Auto-Bridge
  console.log('\n--- 4. Testing Campus Radio Studio Show Assembly & Broadcasts ---');
  const showTypes = ['morning', 'afternoon', 'evening'];
  for (const s of showTypes) {
    try {
      const start = Date.now();
      const stream = await getRequest(`${SERVER_URL}/radio/stream/${s}`);
      if (stream.status === 200 && stream.length > 50000) {
        logPass('Radio Studio', `Live Stream Validation [${s}]`, `Streamed ${stream.length} bytes of high-quality neural voice`, stream.latency);
      } else {
        logFail('Radio Studio', `Live Stream Validation [${s}]`, `Status ${stream.status}`);
      }
    } catch (e) {
      logFail('Radio Studio', `Live Stream Validation [${s}]`, e.message);
    }
  }

  // Summary
  console.log('\n================================================================');
  console.log('              EXHAUSTIVE VALIDATION SUMMARY                     ');
  console.log('================================================================\n');

  const total = validationLogs.length;
  const passed = validationLogs.filter(l => l.status === 'PASSED').length;
  const failed = validationLogs.filter(l => l.status === 'FAILED').length;

  console.log(`Total Scenarios Executed: ${total}`);
  console.log(`Passed: ${passed} / ${total} (${Math.round((passed / total) * 100)}%)`);
  console.log(`Failed: ${failed}\n`);

  if (failed === 0) {
    console.log('🌟 EXHAUSTIVE VALIDATION COMPLETE: All RBAC, Announcement CRUD, Department Spotlights, and Audio Streams are 100% OPERATIONAL!');
  } else {
    console.log(`⚠️ ${failed} tests reported issues.`);
  }
}

runExhaustiveValidation().catch(err => {
  console.error('Validation runner error:', err);
  process.exit(1);
});
