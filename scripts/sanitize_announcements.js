/**
 * Firestore Announcement Sanitization & Afternoon Radio Broadcast Trigger
 */
const https = require('https');

const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const AZURE_TTS_BASE = 'https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const sep = path.includes('?') ? '&' : '?'; const url = new URL(`${BASE_URL}${path}${sep}key=${API_KEY}`);
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(json)}`));
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({});
          else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sanitizeAndTrigger() {
  console.log('--- Step 1: Sanitizing all existing announcements in Firestore ---');
  const res = await makeRequest('GET', '/announcements?pageSize=100');
  const docs = res.documents || [];
  console.log(`Found ${docs.length} announcements.`);

  let sanitizedCount = 0;
  for (const doc of docs) {
    const docId = doc.name.split('/').pop();
    const fields = doc.fields || {};
    const title = fields.title?.stringValue || 'Campus Notice';
    const message = fields.message?.stringValue || '';
    const rawAudio = fields.audioUrl?.stringValue || '';

    const isDeadUrl = !rawAudio ||
      rawAudio.includes('192.168.') ||
      rawAudio.includes('localhost') ||
      rawAudio.includes('/radio/stream/') ||
      rawAudio.includes('/audio/');

    if (isDeadUrl) {
      const speechText = `${title}. ${message}`.trim() || 'Campus radio announcement';
      const cleanAudioUrl = `${AZURE_TTS_BASE}/tts?text=${encodeURIComponent(speechText)}&voice=en-IN-NeerjaNeural`;

      const updatePayload = {
        fields: {
          ...fields,
          audioUrl: { stringValue: cleanAudioUrl }
        }
      };

      await makeRequest('PATCH', `/announcements/${docId}?updateMask.fieldPaths=audioUrl`, updatePayload);
      sanitizedCount++;
      console.log(`[SANITIZED] Doc ${docId} (${title}) -> Direct Azure TTS URL`);
    }
  }
  console.log(`Total announcements sanitized: ${sanitizedCount}`);

  console.log('\n--- Step 2: Publishing Mid-Day Afternoon Campus Radio Show (status: ready) ---');
  const dateStr = 'Saturday, October 3rd, 2026';
  const afternoonScript = `Good afternoon to all faculty, staff, and students of Vemana Institute of Technology! Welcome to the Mid-Day Campus Pulse for ${dateStr}. Here are your key mid-day opportunities, placement alerts, and deadlines. Placement cell reminds all final and pre-final year students to keep their technical profiles updated for upcoming campus recruitment drives. Hackathon registrations for the semester innovation challenge remain open online. Enjoy your lunch break, recharge your energy, and excel in your afternoon laboratory and lecture sessions. Stay tuned to Smart Campus Radio!`;
  
  const afternoonAudioUrl = `${AZURE_TTS_BASE}/tts?text=${encodeURIComponent(afternoonScript)}&voice=en-IN-NeerjaNeural`;

  const radioDoc = {
    fields: {
      title: { stringValue: `☀️ Mid-Day Campus Pulse - ${dateStr}` },
      message: { stringValue: afternoonScript },
      category: { stringValue: 'Campus Radio' },
      priority: { stringValue: 'High' },
      department: { stringValue: 'All' },
      classes: {
        arrayValue: {
          values: [
            { stringValue: 'All' },
            { stringValue: 'Seminar Hall 1' },
            { stringValue: 'CSE Seminar Hall' },
            { stringValue: 'IoT Lab' },
            { stringValue: 'Lecture Hall 201' },
            { stringValue: 'Auditorium' }
          ]
        }
      },
      status: { stringValue: 'ready' },
      audioUrl: { stringValue: afternoonAudioUrl },
      broadcastCount: { integerValue: '1' },
      createdAt: { timestampValue: new Date().toISOString() },
      lastBroadcastAt: { timestampValue: new Date().toISOString() }
    }
  };

  const created = await makeRequest('POST', '/announcements', radioDoc);
  console.log(`[PUBLISHED] Afternoon Radio Broadcast created with status 'ready': ${JSON.stringify(created.name)}`);
  console.log('ESP32 speakers in Seminar Hall 1 and other classrooms will pick up and broadcast this immediately!');
}

sanitizeAndTrigger().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
