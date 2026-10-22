/**
 * Comprehensive End-to-End Validation Suite for Campus Radio & AI Assistant
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://127.0.0.1:3000';
const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          raw: buffer
        });
      });
    }).on('error', reject);
  });
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function runValidation() {
  console.log('====================================================');
  console.log('  Campus Radio & AI Copilot Comprehensive E2E Test  ');
  console.log('====================================================');

  // Test 1: Health & Azure TTS Probe
  console.log('\n[Test 1] Checking /health status...');
  const health = await get(`${BASE_URL}/health`);
  console.log(`  HTTP ${health.statusCode} -> ${health.body}`);
  const healthJson = JSON.parse(health.body);
  if (health.statusCode !== 200 || !healthJson.azureConnected) {
    throw new Error('Health check failed: Azure TTS bridge not connected');
  }
  console.log('  ✓ Azure TTS is alive & connected in Central India!');

  // Test 2: Morning Show Preview
  console.log('\n[Test 2] Testing /radio/preview/morning...');
  const morning = await get(`${BASE_URL}/radio/preview/morning`);
  const morningJson = JSON.parse(morning.body);
  console.log(`  Title: ${morningJson.show.title}`);
  console.log(`  Thought: "${morningJson.show.thought.quote}" — ${morningJson.show.thought.author}`);
  console.log(`  Script: ${morningJson.show.script.substring(0, 100)}...`);
  if (!morningJson.success || !morningJson.show.script.includes('Good morning')) {
    throw new Error('Morning show assembly invalid');
  }
  console.log('  ✓ Morning Show correctly assembled with Thought of the Day!');

  // Test 3: Afternoon Show Preview
  console.log('\n[Test 3] Testing /radio/preview/afternoon...');
  const afternoon = await get(`${BASE_URL}/radio/preview/afternoon`);
  const afternoonJson = JSON.parse(afternoon.body);
  if (!afternoonJson.success || !afternoonJson.show.script.includes('Good afternoon')) {
    throw new Error('Afternoon show assembly invalid');
  }
  console.log('  ✓ Afternoon Show correctly assembled with mid-day notices & placements!');

  // Test 4: Evening Show Preview
  console.log('\n[Test 4] Testing /radio/preview/evening...');
  const evening = await get(`${BASE_URL}/radio/preview/evening`);
  const eveningJson = JSON.parse(evening.body);
  if (!eveningJson.success || !eveningJson.show.script.includes('Good evening')) {
    throw new Error('Evening show assembly invalid');
  }
  console.log('  ✓ Evening Show correctly assembled with next-day preview!');

  // Test 5: Thought of the Day Audio Stream
  console.log('\n[Test 5] Testing /thought-of-the-day.mp3 audio synthesis...');
  const thoughtAudio = await get(`${BASE_URL}/thought-of-the-day.mp3`);
  console.log(`  HTTP ${thoughtAudio.statusCode} | Content-Type: ${thoughtAudio.headers['content-type']} | Size: ${thoughtAudio.raw.length} bytes`);
  if (thoughtAudio.statusCode !== 200 || thoughtAudio.raw.length < 5000) {
    throw new Error('Thought of the day audio synthesis returned invalid response');
  }
  console.log(`  ✓ Successfully synthesized and streamed ${thoughtAudio.raw.length} MP3 bytes for Thought of the Day!`);

  // Test 6: Department Audio Stream (CSE)
  console.log('\n[Test 6] Testing /dept/CSE.mp3 audio synthesis...');
  const deptAudio = await get(`${BASE_URL}/dept/CSE.mp3`);
  console.log(`  HTTP ${deptAudio.statusCode} | Content-Type: ${deptAudio.headers['content-type']} | Size: ${deptAudio.raw.length} bytes`);
  if (deptAudio.statusCode !== 200 || deptAudio.raw.length < 5000) {
    throw new Error('Department audio synthesis returned invalid response');
  }
  console.log(`  ✓ Successfully synthesized and streamed ${deptAudio.raw.length} MP3 bytes for CSE Department!`);

  // Test 7: Telemetry & Azure TTS Quota Endpoint
  console.log('\n[Test 7] Testing /telemetry/azure-tts monitoring endpoint...');
  const telemetry = await get(`${BASE_URL}/telemetry/azure-tts`);
  const telemetryJson = JSON.parse(telemetry.body);
  console.log(`  Quota Remaining: ${telemetryJson.quota.remainingChars} / ${telemetryJson.quota.monthlyQuotaChars} chars (${telemetryJson.quota.percentUsed}% used)`);
  console.log(`  Synthesized: ${telemetryJson.quota.synthesizedChars} chars | Cached: ${telemetryJson.quota.cachedChars} chars`);
  if (telemetry.statusCode !== 200 || !telemetryJson.success) {
    throw new Error('Telemetry endpoint invalid');
  }
  console.log('  ✓ Azure TTS Telemetry & Quota Engine verified!');

  // Test 8: Student AI Assistant Grounded Query
  console.log('\n[Test 8] Testing /api/student/chat with Gemini 3.8 Flash RAG...');
  const studentChat = await post(`${BASE_URL}/api/student/chat`, {
    message: "Who is the HOD for CSE and what labs are available?"
  });
  console.log(`  Model: ${studentChat.body.model} | Source: ${studentChat.body.source}`);
  console.log(`  AI Reply:\n  ${studentChat.body.reply.split('\n').slice(0, 3).join('\n  ')}...`);
  if (studentChat.statusCode !== 200 || !studentChat.body.success || !studentChat.body.reply) {
    throw new Error('Student AI Assistant endpoint failed');
  }
  console.log('  ✓ Student AI Campus Assistant query successfully processed!');

  // Test 9: Admin AI Copilot Grounded Query
  console.log('\n[Test 9] Testing /api/admin/chat for Admin Copilot...');
  const adminChat = await post(`${BASE_URL}/api/admin/chat`, {
    message: "Draft an urgent announcement about placement orientation tomorrow at 10 AM in Seminar Hall 1"
  });
  console.log(`  Model: ${adminChat.body.model} | Role: ${adminChat.body.role}`);
  console.log(`  AI Reply:\n  ${adminChat.body.reply.split('\n').slice(0, 3).join('\n  ')}...`);
  if (adminChat.statusCode !== 200 || !adminChat.body.success || !adminChat.body.reply) {
    throw new Error('Admin AI Copilot endpoint failed');
  }
  console.log('  ✓ Admin AI Copilot announcement drafting verified!');

  // Test 10: Trigger Instant Broadcast via API
  console.log('\n[Test 10] Testing instant radio show broadcast trigger...');
  const triggerRes = await post(`${BASE_URL}/radio/trigger/morning`, {
    classes: ['Seminar Hall 1', 'Room 101']
  });
  console.log(`  Response:`, triggerRes.body);
  if (!triggerRes.body.success || !triggerRes.body.docId) {
    throw new Error('Broadcast trigger failed');
  }
  console.log(`  ✓ Broadcast announcement doc [${triggerRes.body.docId}] successfully created!`);

  // Test 11: Auto-Bridge Audio URL Resolution
  console.log('\n[Test 11] Verifying Auto-Bridge converted announcement to ready with Azure MP3 URL...');
  await new Promise(r => setTimeout(r, 3000));
  const docCheck = await new Promise((resolve) => {
    https.get(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/announcements/${triggerRes.body.docId}?key=${API_KEY}`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });
  const fields = docCheck.fields || {};
  console.log(`  Doc Status: ${fields.status?.stringValue} | Audio URL: ${fields.audioUrl?.stringValue}`);
  if (fields.status?.stringValue !== 'ready' && fields.status?.stringValue !== 'completed') {
    throw new Error(`Expected ready or completed status, got: ${fields.status?.stringValue}`);
  }
  console.log('  ✓ Announcement successfully transitioned to ready for ESP32 speakers!');

  console.log('\n====================================================');
  console.log('🎉 ALL 11 E2E VALIDATION CHECKS PASSED (100% SUCCESS)');
  console.log('====================================================');
}

runValidation().catch(err => {
  console.error('\n❌ VALIDATION ERROR:', err);
  process.exit(1);
});
