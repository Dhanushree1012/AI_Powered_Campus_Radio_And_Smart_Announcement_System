/**
 * End-to-End Validation for:
 * 1. Image & PDF Processing & Voice Conversion Engine
 * 2. Multi-Channel Broadcasting & Event Calendar Reminders
 */

const http = require('http');

const BASE_URL = 'http://127.0.0.1:3000';

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
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
          resolve({ status: res.statusCode, body: JSON.parse(d) });
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

async function testNewFeatures() {
  console.log('================================================================');
  console.log('  Testing Image/PDF Voice Processing & Multi-Channel Reminders  ');
  console.log('================================================================\n');

  // Test 1: Event Calendar Retrieval
  console.log('[Check 1] Testing /api/events (Academic Calendar)...');
  const eventsRes = await get(`${BASE_URL}/api/events`);
  console.log(`  Events Count: ${eventsRes.body.count}`);
  eventsRes.body.events.slice(0, 2).forEach(e => {
    console.log(`  - [${e.category}] ${e.title} (${e.eventDate})`);
  });
  if (eventsRes.status !== 200 || eventsRes.body.count === 0) {
    throw new Error('Failed to retrieve event calendar');
  }
  console.log('  ✓ Academic Event Calendar verified!\n');

  // Test 2: Multi-Channel Reminder Dispatcher
  console.log('[Check 2] Testing /api/events/trigger-reminders (Radio + Email + App)...');
  const reminderRes = await post(`${BASE_URL}/api/events/trigger-reminders`, {});
  console.log(`  Processed ${reminderRes.body.totalEventsProcessed} events across channels:`);
  reminderRes.body.dispatches.slice(0, 2).forEach(d => {
    console.log(`  - ${d.title}`);
    console.log(`    Radio: ${d.channels.campusRadio}`);
    console.log(`    Email: ${d.channels.studentEmail}`);
  });
  if (reminderRes.status !== 200 || !reminderRes.body.success) {
    throw new Error('Reminder dispatch failed');
  }
  console.log('  ✓ Multi-Channel Reminder Engine successfully triggered!\n');

  // Test 3: Radio Morning Show Calendar Integration
  console.log('[Check 3] Testing /radio/preview/morning for Calendar Integration...');
  const morningRes = await get(`${BASE_URL}/radio/preview/morning`);
  console.log(`  Morning Script Snippet:`);
  console.log(`  "${morningRes.body.show.script.substring(0, 280)}..."`);
  if (!morningRes.body.show.script.includes('Deadlines') && !morningRes.body.show.script.includes('Reminders')) {
    throw new Error('Morning show did not contain event calendar reminders');
  }
  console.log('  ✓ Morning radio script dynamically included upcoming deadlines!\n');

  // Test 4: Document Voice Publishing
  console.log('[Check 4] Testing /api/process/publish-to-radio (Extracted Doc ➔ ESP32 Radio)...');
  const publishRes = await post(`${BASE_URL}/api/process/publish-to-radio`, {
    title: "National Level AI & Robotics Symposium 2026",
    message: "Official circular regarding paper presentations, project showcase, and keynote by ISRO scientists in Seminar Hall 1.",
    radioVoiceScript: "Attention all students and faculty! Vemana Institute of Technology is pleased to announce the National Level AI and Robotics Symposium. Join us in Seminar Hall 1 on October 5th for breakthrough demonstrations and project exhibitions. Register online today!",
    category: "Event",
    priority: "High",
    department: "All"
  });
  console.log(`  Response:`, publishRes.body);
  if (publishRes.status !== 200 || !publishRes.body.docId) {
    throw new Error('Document voice publish failed');
  }
  console.log(`  ✓ Document announcement [${publishRes.body.docId}] queued for voice broadcast!\n`);

  console.log('================================================================');
  console.log('🎉 ALL FEATURE 7 & 8 VALIDATION CHECKS PASSED (100% SUCCESS)    ');
  console.log('================================================================');
}

testNewFeatures().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
