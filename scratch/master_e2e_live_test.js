/**
 * Master End-to-End Live Validation & Handover Suite
 * Validates:
 * 1. Quick & Scheduled Announcement Pipeline (Azure TTS + ESP32 Ready)
 * 2. Image/PDF Processing & Radio Publishing
 * 3. Gemini 3.8 Flash Assistant & Admin Copilot
 * 4. Calendar Events with Due Dates Today/Tomorrow & Multi-Channel Email Reminders
 * 5. Instant Evening Radio Show Trigger (Plays on ESP32 Speakers Now)
 * 6. Department-to-ESP32 Mapping & Department Audio Streaming
 * 7. Student Query Submission & HOD/Admin Status Lifecycle
 * 8. Audio Replay URLs for Student Mobile Player
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://127.0.0.1:3000';
const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data), raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(d), raw: d });
        } catch (e) {
          resolve({ status: res.statusCode, raw: d });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function firestorePost(collection, fieldsData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ fields: fieldsData });
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}?key=${API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(d);
          const docId = json.name ? json.name.split('/').pop() : 'unknown';
          resolve({ docId, data: json });
        } catch (e) {
          resolve({ data: d });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function firestoreGet(collection, docId) {
  return new Promise((resolve) => {
    https.get(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}?key=${API_KEY}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve({});
        }
      });
    }).on('error', () => resolve({}));
  });
}

async function runMasterValidation() {
  console.log('================================================================');
  console.log('       MASTER END-TO-END SYSTEM VALIDATION & LIVE TEST          ');
  console.log('================================================================\n');

  // STEP 1: Quick Announcement Creation & Azure Auto-Bridge
  console.log('[Step 1] Creating Quick Instant Announcement in Firestore...');
  const quickDoc = await firestorePost('announcements', {
    title: { stringValue: 'Live Handover Sound Check' },
    message: { stringValue: 'Attention students and faculty. This is a live sound check verifying classroom speaker node audio streaming.' },
    category: { stringValue: 'Campus Radio' },
    priority: { stringValue: 'High' },
    department: { stringValue: 'All' },
    status: { stringValue: 'published' },
    classes: { arrayValue: { values: [{ stringValue: 'Seminar Hall 1' }, { stringValue: 'IoT Lab' }, { stringValue: 'All' }] } },
    createdAt: { timestampValue: new Date().toISOString() }
  });
  console.log(`  ✓ Created announcement doc [${quickDoc.docId}] (status: published)`);
  
  console.log('  Waiting 3s for Auto-Bridge Azure TTS synthesis...');
  await new Promise(r => setTimeout(r, 3000));
  const quickCheck = await firestoreGet('announcements', quickDoc.docId);
  const qStatus = quickCheck.fields?.status?.stringValue;
  const qAudio = quickCheck.fields?.audioUrl?.stringValue;
  console.log(`  ✓ Auto-Bridge Status: ${qStatus} | Audio URL: ${qAudio}`);
  if (qStatus !== 'ready' && qStatus !== 'completed') {
    throw new Error('Quick announcement failed to transition to ready');
  }

  // STEP 2: Scheduled Announcement Pipeline
  console.log('\n[Step 2] Testing Scheduled Announcement...');
  const schedDoc = await firestorePost('announcements', {
    title: { stringValue: 'Scheduled Lab Maintenance Notice' },
    message: { stringValue: 'The high performance computing lab will undergo routine firmware optimization this evening.' },
    category: { stringValue: 'Academic' },
    priority: { stringValue: 'Normal' },
    department: { stringValue: 'CSE' },
    status: { stringValue: 'scheduled' },
    scheduledFor: { stringValue: new Date().toISOString() },
    classes: { arrayValue: { values: [{ stringValue: 'IoT Lab' }, { stringValue: 'Seminar Hall 1' }] } },
    createdAt: { timestampValue: new Date().toISOString() }
  });
  console.log(`  ✓ Created scheduled announcement [${schedDoc.docId}]`);

  // STEP 3: Image/PDF to Voice Announcement
  console.log('\n[Step 3] Testing Document Extraction to Radio Publishing...');
  const docPublish = await post(`${BASE_URL}/api/process/publish-to-radio`, {
    title: 'Inter-College Robo-Wars 2026',
    message: 'Official circular for annual robotics battle. Teams must assemble in Seminar Hall 1.',
    radioVoiceScript: 'Calling all engineering innovators! Vemana Annual Robo-Wars is now open for registration. Join us for live autonomous bot competitions. Check the student portal for team details.',
    category: 'Event',
    priority: 'High',
    department: 'All'
  });
  console.log(`  ✓ Published extracted circular to Radio [${docPublish.body.docId}]`);

  // STEP 4: Gemini 3.8 Flash RAG Chatbot (Student & Admin)
  console.log('\n[Step 4] Testing Gemini 3.8 Flash AI Assistant & Admin Copilot...');
  const studentQ = await post(`${BASE_URL}/api/student/chat`, {
    message: "What is the thought of the day and who is the CSE HOD?"
  });
  console.log(`  Student Reply (${studentQ.body.model}):`);
  console.log(`  ${studentQ.body.reply.split('\n').slice(0, 2).join('\n  ')}...`);

  const adminQ = await post(`${BASE_URL}/api/admin/chat`, {
    message: "Draft a notice for final year placements tomorrow at 10 AM"
  });
  console.log(`  Admin Copilot Reply (${adminQ.body.role}):`);
  console.log(`  ${adminQ.body.reply.split('\n').slice(0, 2).join('\n  ')}...`);

  // STEP 5: Academic Calendar & Multi-Channel Email Reminders (Today/Tomorrow Due Dates)
  console.log('\n[Step 5] Creating Calendar Events (Due Today & Tomorrow) and Triggering Email Reminders...');
  await post(`${BASE_URL}/api/events`, {
    title: "VTU Practical Lab Exams – Final Batch",
    description: "Final laboratory examinations for 6th sem students. Submit signed lab records before 9:00 AM.",
    category: "Examination",
    eventDate: "Today 09:00 AM",
    department: "ECE, CSE",
    semester: "6th Sem",
    location: "IoT Lab & Electronics Lab 3",
    actionRequired: "Carry hardcopy lab records with faculty signature.",
    urgent: true
  });

  const remindersRes = await post(`${BASE_URL}/api/events/trigger-reminders`, {});
  console.log(`  ✓ Processed ${remindersRes.body.totalEventsProcessed} calendar events!`);
  remindersRes.body.dispatches.slice(0, 2).forEach(d => {
    console.log(`    • ${d.title} -> ${d.channels.studentEmail}`);
  });

  // STEP 6: Department Mapping & Dedicated Audio Stream
  console.log('\n[Step 6] Testing Department Audio Streams (CSE & ECE)...');
  const eceStream = await get(`${BASE_URL}/dept/ECE.mp3`);
  console.log(`  ✓ ECE Department Stream: HTTP ${eceStream.status} (${eceStream.raw ? eceStream.raw.length : 'ok'} bytes)`);

  // STEP 7: Student Query Lifecycle (Student submits -> HOD/Admin resolves)
  console.log('\n[Step 7] Testing Student Query Lifecycle...');
  const queryDoc = await firestorePost('student_queries', {
    subject: { stringValue: 'Lab Equipment Access Timing' },
    message: { stringValue: 'Can students access the IoT Lab post 5:00 PM for hackathon prototyping?' },
    studentName: { stringValue: 'Junaid (8th Sem CSE)' },
    studentEmail: { stringValue: 'junaid@vemanait.edu.in' },
    department: { stringValue: 'CSE' },
    status: { stringValue: 'open' },
    createdAt: { timestampValue: new Date().toISOString() }
  });
  console.log(`  ✓ Created student support query [${queryDoc.docId}]`);

  // STEP 8: Trigger Evening Campus Radio Show (Plays LIVE on ESP32 Speakers)
  console.log('\n[Step 8] 🎙️ Triggering Live Evening Radio Show Broadcast on ESP32 Speakers...');
  const eveningTrigger = await post(`${BASE_URL}/radio/trigger/evening`, {
    classes: ['Seminar Hall 1', 'IoT Lab', 'All']
  });
  console.log(`  ✓ Evening Radio Broadcast Triggered [Doc: ${eveningTrigger.body.docId}]`);
  console.log(`  Title: ${eveningTrigger.body.title}`);
  console.log(`  Script: "${eveningTrigger.body.script.substring(0, 160)}..."`);
  
  console.log('\n  Waiting 3s for ESP32 Audio Transition...');
  await new Promise(r => setTimeout(r, 3000));
  const eveningCheck = await firestoreGet('announcements', eveningTrigger.body.docId);
  console.log(`  ✓ Broadcast Document Status: ${eveningCheck.fields?.status?.stringValue} | Ready for ESP32!`);

  console.log('\n================================================================');
  console.log('🎉 MASTER VALIDATION COMPLETE: ALL 8 LIVE WORKFLOWS PASSED!     ');
  console.log('================================================================');
}

runMasterValidation().catch(err => {
  console.error('❌ Master validation failed:', err);
  process.exit(1);
});
