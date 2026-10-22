/**
 * Azure Cognitive Speech TTS Server & Automated Campus Radio System
 * 
 * Features:
 * 1. Streams high-quality binary MP3 audio from Azure Neural TTS directly to ESP32 speakers.
 * 2. Automated Firestore Bridge: polls 'published' and due 'scheduled' announcements and transitions them to 'ready'.
 * 3. Daily Campus Radio Engine (Mon-Sat):
 *    - Morning Radio (08:30 IST): Greeting + Thought of the Day + Today's Notices & Activities
 *    - Afternoon Radio (13:15 IST): Placements + Hackathons + Mid-Day Announcements
 *    - Evening Radio (16:30 IST): Tomorrow's Preview + 48-Hour Outlook + Lab Deadlines
 *    - Continuous Department Audio (/dept/:code.mp3): Entrance Kiosks & in-app streaming
 * 4. Interactive Studio APIs: Preview script & Trigger test broadcast on-demand.
 */

const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const radioEngine = require('./backend/radio_engine');
const geminiAssistant = require('./backend/gemini_assistant');
const ttsTelemetry = require('./backend/tts_telemetry');
const docProcessor = require('./backend/doc_processor');
const eventReminderEngine = require('./backend/event_reminder_engine');
const mailer = require('./backend/mail');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));


// Enable universal CORS and handle preflight OPTIONS for Flutter Web & API clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Ocp-Apim-Subscription-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Universal file uploads directory and static public file server
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));


// Universal File & Attachment Upload Endpoint (PDFs, Images, Slides, Media)
app.post(['/api/upload', '/upload'], (req, res) => {
  try {
    const { filename, fileBase64, contentType } = req.body || {};
    if (!fileBase64) {
      return res.status(400).json({ success: false, error: 'Missing "fileBase64" in request body' });
    }

    const safeName = (filename || `upload_${Date.now()}.bin`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${Date.now()}_${safeName}`;
    const targetPath = path.join(uploadsDir, uniqueName);

    const buffer = Buffer.from(fileBase64, 'base64');
    fs.writeFileSync(targetPath, buffer);

    const host = req.get('host') || `${LOCAL_IP}:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const publicUrl = `${protocol}://${host}/uploads/${uniqueName}`;

    console.log(`📁 [Upload API] File saved: ${uniqueName} (${buffer.length} bytes) -> ${publicUrl}`);
    res.json({
      success: true,
      filename: uniqueName,
      size: buffer.length,
      url: publicUrl,
      contentType: contentType || 'application/octet-stream'
    });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


const PROJECT_ID = 'ai-powered-campus-radio';
const API_KEY = 'AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw';

// Detect local LAN IP address automatically
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  if (ifaces['en0']) {
    for (const net of ifaces['en0']) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIp();
const PUBLIC_BASE_URL = process.env.PUBLIC_URL || (process.env.WEBSITE_HOSTNAME 
  ? `https://${process.env.WEBSITE_HOSTNAME}` 
  : `https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net`);

// Azure Speech Service Credentials
let azureKey = process.env.AZURE_SPEECH_KEY;
let azureRegion = process.env.AZURE_SPEECH_REGION || 'centralindia';

try {
  const cfgPath = path.join(__dirname, 'backend', 'azure_config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    azureKey = azureKey || cfg.AZURE_SPEECH_KEY;
    azureRegion = azureRegion || cfg.AZURE_SPEECH_REGION;
  }
} catch (e) {}

const AZURE_KEY = azureKey || '';
const AZURE_REGION = azureRegion || 'centralindia';
const DEFAULT_VOICE = 'en-IN-NeerjaNeural'; // Female Indian English Neural Voice

function splitTextIntoSpeechChunks(text, maxChunkLen = 950) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkLen && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence.trim();
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  return chunks.length > 0 ? chunks : [text];
}

function synthesizeSingleAzureTTSChunk(text, voice = DEFAULT_VOICE, feature = 'announcements') {
  return new Promise((resolve, reject) => {
    const escapedText = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    const ssml = `<speak version='1.0' xml:lang='en-IN'><voice xml:lang='en-IN' xml:gender='Female' name='${voice}'>${escapedText}</voice></speak>`;

    const options = {
      hostname: `${AZURE_REGION}.tts.speech.microsoft.com`,
      path: '/cognitiveservices/v1',
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'CampusRadioAzureLocalProxy',
        'Content-Length': Buffer.byteLength(ssml)
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        let errBody = '';
        res.on('data', chunk => errBody += chunk);
        res.on('end', () => {
          try { ttsTelemetry.recordFailure(); } catch (e) {}
          reject(new Error(`Azure TTS returned ${res.statusCode}: ${errBody}`));
        });
        return;
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try { ttsTelemetry.recordSynthesis(text.length, feature, false); } catch (e) {}
        resolve(Buffer.concat(chunks));
      });
    });

    req.on('error', err => {
      try { ttsTelemetry.recordFailure(); } catch (e) {}
      reject(err);
    });
    req.write(ssml);
    req.end();
  });
}

async function synthesizeAzureTTS(text, voice = DEFAULT_VOICE, feature = 'announcements') {
  if (!text || !text.trim()) {
    return Buffer.alloc(0);
  }

  const cleanText = text.trim();

  // If text fits in a standard single TTS payload, synthesize directly
  if (cleanText.length <= 1000) {
    return synthesizeSingleAzureTTSChunk(cleanText, voice, feature);
  }

  // Split multi-department or lengthy speeches into contiguous sentence chunks
  const chunks = splitTextIntoSpeechChunks(cleanText, 950);
  console.log(`\n🎙️ [Multi-Chunk TTS] Synthesizing ${chunks.length} chunks for long narration (${cleanText.length} chars)...`);

  const audioBuffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    if (chunkText.trim().length === 0) continue;
    try {
      const buf = await synthesizeSingleAzureTTSChunk(chunkText, voice, feature);
      audioBuffers.push(buf);
    } catch (err) {
      console.warn(`⚠️ [Multi-Chunk TTS] Chunk ${i + 1}/${chunks.length} error: ${err.message}`);
    }
  }

  if (audioBuffers.length === 0) {
    throw new Error('Failed to synthesize any audio chunks for long narration.');
  }

  return Buffer.concat(audioBuffers);
}

// In-memory cache for announcement texts and department audio buffers
const textCache = new Map();
const audioCache = new Map();

// Helper to fetch text from Firestore for a given announcement docId
function fetchAnnouncementText(docId) {
  return new Promise((resolve) => {
    https.get(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/announcements/${encodeURIComponent(docId)}?key=${API_KEY}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const doc = JSON.parse(d);
          const fields = doc.fields || {};
          const title = fields.title && fields.title.stringValue ? fields.title.stringValue : '';
          const message = fields.message && fields.message.stringValue ? fields.message.stringValue : '';
          let spokenText = message;
          if (title && message) spokenText = `${title}. ${message}`;
          else if (title) spokenText = title;
          resolve(spokenText);
        } catch (e) {
          resolve('');
        }
      });
    }).on('error', () => resolve(''));
  });
}

// Validate live Azure Speech credentials and region connectivity
let lastProbeTime = 0;
let lastProbeResult = false;
let lastProbeError = '';
const PROBE_TTL_MS = 60 * 1000; // Cache probe result for 60s

function validateAzureConnectivity() {
  const now = Date.now();
  if (lastProbeTime && (now - lastProbeTime < PROBE_TTL_MS)) {
    return Promise.resolve({ ok: lastProbeResult, error: lastProbeError, cached: true });
  }

  if (!AZURE_KEY || !AZURE_REGION) {
    lastProbeTime = now;
    lastProbeResult = false;
    lastProbeError = 'Azure Speech credentials (AZURE_KEY / AZURE_REGION) are missing';
    return Promise.resolve({ ok: false, error: lastProbeError, cached: false });
  }

  return new Promise((resolve) => {
    const req = https.request({
      hostname: `${AZURE_REGION}.api.cognitive.microsoft.com`,
      path: '/sts/v1.0/issueToken',
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Length': 0
      },
      timeout: 3500
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        lastProbeTime = Date.now();
        if (res.statusCode === 200) {
          lastProbeResult = true;
          lastProbeError = '';
          resolve({ ok: true, error: '', cached: false });
        } else {
          lastProbeResult = false;
          lastProbeError = `Azure Auth Error (HTTP ${res.statusCode}): ${data}`;
          resolve({ ok: false, error: lastProbeError, cached: false });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      lastProbeTime = Date.now();
      lastProbeResult = false;
      lastProbeError = 'Azure Auth probe timed out';
      resolve({ ok: false, error: lastProbeError, cached: false });
    });

    req.on('error', (err) => {
      lastProbeTime = Date.now();
      lastProbeResult = false;
      lastProbeError = err.message;
      resolve({ ok: false, error: lastProbeError, cached: false });
    });

    req.end();
  });
}

// Health & Azure TTS Readiness Check Endpoint
app.get('/health', async (req, res) => {
  const isConfigured = Boolean(AZURE_KEY && AZURE_REGION);
  const probe = await validateAzureConnectivity();
  const isReady = isConfigured && probe.ok;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'degraded',
    service: 'Azure Neural TTS & Campus Radio Studio Engine',
    azureConfigured: isConfigured,
    azureConnected: probe.ok,
    region: AZURE_REGION,
    voice: DEFAULT_VOICE,
    baseUrl: PUBLIC_BASE_URL,
    error: probe.ok ? undefined : probe.error,
    timestamp: new Date().toISOString()
  });
});

// Root Health-Check / Status Endpoint
app.get('/', (req, res) => {
  const isConfigured = Boolean(AZURE_KEY && AZURE_REGION);
  res.json({
    status: isConfigured ? 'online' : 'degraded',
    service: 'Azure Neural TTS & Campus Radio Studio Engine',
    azureConfigured: isConfigured,
    region: AZURE_REGION,
    voice: DEFAULT_VOICE,
    baseUrl: PUBLIC_BASE_URL,
    timestamp: new Date().toISOString()
  });
});

// Clean Document-Based Audio Endpoint for ESP32 and Web Apps
app.get(['/audio/:docId', '/audio/:docId.mp3'], async (req, res) => {
  let docId = req.params.docId || '';
  let voice = req.query.voice || DEFAULT_VOICE;

  // Handle malformed docId where &voice was attached directly to the path
  if (docId.includes('&voice=')) {
    const parts = docId.split('&voice=');
    docId = parts[0];
    if (parts[1] && !req.query.voice) {
      voice = parts[1];
    }
  }
  if (docId.endsWith('.mp3')) {
    docId = docId.substring(0, docId.length - 4);
  }

  let text = textCache.get(docId);
  if (!text) {
    text = await fetchAnnouncementText(docId);
  }

  // Fallback to text query param if available
  if (!text && req.query.text) {
    text = req.query.text;
  }

  if (!text) {
    text = 'Campus radio announcement audio stream is active.';
  }

  console.log(`\n📢 [Speaker Audio Stream] (Doc: ${docId}) Synthesizing [${voice}]: "${text.substring(0, 80)}..."`);

  try {
    const audioBuffer = await synthesizeAzureTTS(text, voice);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(audioBuffer);
    console.log(`✓ Streamed ${audioBuffer.length} MP3 bytes directly!`);
  } catch (error) {
    console.error('❌ Azure TTS Error:', error.message);
    res.status(500).send(error.toString());
  }
});

// HTTP endpoint for streaming binary audio via query param
app.get('/tts', async (req, res) => {
  const text = req.query.text;
  const voice = req.query.voice || DEFAULT_VOICE;
  if (!text) {
    return res.status(400).send('Missing "text" query parameter.');
  }

  console.log(`\n📢 [Speaker Audio Stream] Synthesizing [${voice}]: "${text.substring(0, 80)}..."`);

  try {
    const audioBuffer = await synthesizeAzureTTS(text, voice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(audioBuffer);
    console.log(`✓ Streamed ${audioBuffer.length} MP3 bytes!`);
  } catch (error) {
    console.error('❌ Azure TTS Error:', error.message);
    res.status(500).send(error.toString());
  }
});

// Continuous / On-Demand Department Audio Endpoint
app.get('/dept/:deptCode.mp3', async (req, res) => {
  const deptCode = req.params.deptCode.toUpperCase();
  const cacheKey = `dept_${deptCode}`;

  try {
    if (audioCache.has(cacheKey)) {
      const cached = audioCache.get(cacheKey);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', cached.length);
      return res.send(cached);
    }

    const deptData = await radioEngine.assembleDepartmentScript(deptCode);
    console.log(`\n🏛️ [Department Stream] Synthesizing audio for ${deptCode}: "${deptData.script.substring(0, 80)}..."`);
    const audioBuffer = await synthesizeAzureTTS(deptData.script);
    audioCache.set(cacheKey, audioBuffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(audioBuffer);
  } catch (error) {
    console.error(`❌ Department Audio Error (${deptCode}):`, error.message);
    res.status(500).send(error.toString());
  }
});

// Thought of the Day Audio Stream
app.get('/thought-of-the-day.mp3', async (req, res) => {
  try {
    const thought = await radioEngine.fetchThoughtOfTheDay(radioEngine.getNowIST());
    const text = `Today's Thought of the Day: "${thought.quote}", by ${thought.author}.`;
    const audioBuffer = await synthesizeAzureTTS(text);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=1800');
    res.send(audioBuffer);
  } catch (error) {
    res.status(500).send(error.toString());
  }
});

// Studio API: Preview Radio Show Script (Morning, Afternoon, Evening, Department)
app.get('/radio/preview/:showType', async (req, res) => {
  const showType = req.params.showType.toLowerCase();
  try {
    let result;
    if (showType === 'morning') {
      result = await radioEngine.assembleMorningShowScript();
    } else if (showType === 'afternoon') {
      result = await radioEngine.assembleAfternoonShowScript();
    } else if (showType === 'evening') {
      result = await radioEngine.assembleEveningShowScript();
    } else {
      result = await radioEngine.assembleDepartmentScript(showType.toUpperCase());
    }
    res.json({ success: true, show: result });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Stream Radio Show Audio Directly (Morning, Afternoon, Evening, Department)
app.get(['/radio/stream/:showType', '/radio/audio/:showType'], async (req, res) => {
  const showType = (req.params.showType || 'morning').toLowerCase();
  try {
    let result;
    if (showType === 'morning') {
      result = await radioEngine.assembleMorningShowScript();
    } else if (showType === 'afternoon' || showType === 'midday' || showType === 'mid-day') {
      result = await radioEngine.assembleAfternoonShowScript();
    } else if (showType === 'evening') {
      result = await radioEngine.assembleEveningShowScript();
    } else {
      result = await radioEngine.assembleDepartmentScript(showType.toUpperCase());
    }

    const scriptText = result.script || result.audioMessage || result.text || 'Campus radio broadcast stream is active.';
    const voice = req.query.voice || DEFAULT_VOICE;
    const mp3Buffer = await synthesizeAzureTTS(scriptText, voice);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': mp3Buffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Accept-Ranges': 'bytes'
    });
    res.send(mp3Buffer);
  } catch (e) {
    console.error('Error generating radio audio stream:', e);
    res.status(500).send('Error streaming radio audio: ' + e.message);
  }
});

// AI Assistant Chat Endpoints (Student & Admin Copilot)
app.post(['/api/student/chat', '/api/admin/chat', '/api/chat', '/api/gemini/chat'], async (req, res) => {
  const { message, history } = req.body || {};
  const isReqAdmin = req.path.includes('admin') || req.body?.role === 'admin';
  const role = isReqAdmin ? 'admin' : (req.body?.role || 'student');

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing or invalid "message" in request body' });
  }

  try {
    const result = await geminiAssistant.queryGemini(message.trim(), history || [], role);
    res.json({
      success: true,
      reply: result.reply,
      source: result.source || 'gemini-ai',
      model: result.model || 'gemini-1.5-flash',
      role: role,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Telemetry & Quota Monitoring Endpoints
app.get(['/telemetry/azure-tts', '/api/telemetry/azure-tts', '/telemetry'], (req, res) => {
  res.json(ttsTelemetry.getSummary());
});

app.get(['/health', '/api/health'], (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024)
    },
    nodeVersion: process.version,
    platform: process.platform,
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/telemetry/overview', (req, res) => {
  const ttsSummary = ttsTelemetry.getSummary();
  const mem = process.memoryUsage();
  res.json({
    success: true,
    server: {
      status: 'online',
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV || 'production'
    },
    tts: ttsSummary,
    timestamp: new Date().toISOString()
  });
});

// Speech-to-Text (STT) Transcription Endpoint for Student Queries, Chatbots, and Admin Announcements
app.post(['/stt/transcribe', '/api/stt/transcribe', '/api/stt'], async (req, res) => {
  const { audioBase64, mimeType, durationSeconds, context, prompt } = req.body || {};
  console.log(`\n🎙️ [STT Transcribe] Received transcription request. Context: "${context || 'General'}", Duration: ${durationSeconds || 0}s`);

  // Case 1: Raw Audio Base64 is provided -> Transcribe via Azure Speech STT or Gemini
  if (audioBase64 && typeof audioBase64 === 'string') {
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      if (AZURE_KEY && AZURE_REGION) {
        const azureSttResult = await new Promise((resolve, reject) => {
          const sttReq = https.request({
            hostname: `${AZURE_REGION}.stt.speech.microsoft.com`,
            path: '/speech/recognition/conversation/cognitiveservices/v1?language=en-IN',
            method: 'POST',
            headers: {
              'Ocp-Apim-Subscription-Key': AZURE_KEY,
              'Content-Type': mimeType || 'audio/wav',
              'Content-Length': audioBuffer.length
            }
          }, (sttRes) => {
            let data = '';
            sttRes.on('data', chunk => data += chunk);
            sttRes.on('end', () => {
              if (sttRes.statusCode === 200) {
                try {
                  const json = JSON.parse(data);
                  resolve(json.DisplayText || json.RecognitionStatus === 'Success' ? json.DisplayText : null);
                } catch (e) {
                  resolve(null);
                }
              } else {
                resolve(null);
              }
            });
          });
          sttReq.on('error', () => resolve(null));
          sttReq.write(audioBuffer);
          sttReq.end();
        });

        if (azureSttResult) {
          console.log(`✓ [Azure STT] Transcribed: "${azureSttResult}"`);
          return res.json({ success: true, text: azureSttResult, source: 'azure-stt' });
        }
      }

      // Fallback to Gemini Multimodal Audio Transcription
      const geminiSttResult = await docProcessor.callGeminiMultimodal(
        audioBase64,
        mimeType || 'audio/wav',
        'Transcribe the speech in this audio clip word-for-word into plain English text. Return only the raw transcription without commentary.'
      ).catch(() => null);

      if (geminiSttResult && geminiSttResult.data) {
        const text = typeof geminiSttResult.data === 'string' ? geminiSttResult.data : JSON.stringify(geminiSttResult.data);
        return res.json({ success: true, text: text.trim(), source: 'gemini-stt' });
      }
    } catch (err) {
      console.warn('Audio decoding STT error:', err.message);
    }
  }

  // Case 2: Direct speech text or no audio detected
  const userSpeech = (req.body?.speechText || req.body?.text || '').trim();
  if (userSpeech.length > 0) {
    console.log(`✓ [STT] Verified user speech: "${userSpeech}"`);
    return res.json({
      success: true,
      text: userSpeech,
      source: 'web-speech-recognition',
      timestamp: new Date().toISOString()
    });
  }

  // If no audio bytes were provided or recognized
  console.log('ℹ️ [STT] No audio bytes or speech detected in request.');
  return res.json({
    success: true,
    text: '',
    source: 'stt-engine',
    timestamp: new Date().toISOString()
  });
});

// Feature 7: Process Event Poster Image via Gemini 3.8 Multimodal Vision
app.post('/api/process/image', async (req, res) => {
  const { imageBase64, mimeType } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ success: false, error: 'Missing "imageBase64" in request body' });
  }

  try {
    const result = await docProcessor.processPosterImage(imageBase64, mimeType || 'image/jpeg');
    res.json(result);
  } catch (err) {
    console.error('Image processing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 7: Process Official Circular PDF via Gemini 3.8 Document API
app.post('/api/process/pdf', async (req, res) => {
  const { pdfBase64 } = req.body || {};
  if (!pdfBase64) {
    return res.status(400).json({ success: false, error: 'Missing "pdfBase64" in request body' });
  }

  try {
    const result = await docProcessor.processCircularPdf(pdfBase64);
    res.json(result);
  } catch (err) {
    console.error('PDF processing error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 7: Publish Extracted Document Directly to Campus Radio & ESP32 Broadcast
app.post('/api/process/publish-to-radio', async (req, res) => {
  const { title, message, radioVoiceScript, category, priority, department, classes } = req.body || {};
  if (!title || (!message && !radioVoiceScript)) {
    return res.status(400).json({ success: false, error: 'Missing title or message/radioVoiceScript' });
  }

  const broadcastMessage = radioVoiceScript || message;
  try {
    const docResult = await createFirestoreAnnouncement({
      title: title,
      message: broadcastMessage,
      category: category || 'Campus Radio',
      priority: priority || 'High',
      department: department || 'All',
      classes: classes || ['Seminar Hall 1', 'IoT Lab', 'All']
    });
    res.json({
      success: true,
      message: 'Extracted document successfully published to Campus Radio broadcast queue!',
      docId: docResult.docId,
      broadcastScript: broadcastMessage
    });
  } catch (err) {
    console.error('Publish to radio error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 8: Get Academic & Event Calendar
app.get('/api/events', async (req, res) => {
  try {
    const events = await eventReminderEngine.seedDefaultEventsIfEmpty();
    res.json({ success: true, count: events.length, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 8: Create New Academic Calendar Event
app.post('/api/events', async (req, res) => {
  const eventData = req.body || {};
  if (!eventData.title || !eventData.eventDate) {
    return res.status(400).json({ success: false, error: 'Event title and eventDate are required' });
  }

  try {
    const docId = await eventReminderEngine.createCalendarEvent(eventData);
    res.json({ success: true, message: 'Event added to calendar', eventId: docId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 8: Multi-Channel Reminder Dispatcher (Radio + Email + In-App)
app.post('/api/events/trigger-reminders', async (req, res) => {
  try {
    const result = await eventReminderEngine.triggerMultiChannelReminders();
    res.json(result);
  } catch (err) {
    console.error('Reminder dispatch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Feature 9: User Provisioning Credentials Email Dispatcher
app.post('/api/mail/send-credentials', async (req, res) => {
  try {
    const { name, email, role, department, tempPassword, portalUrl } = req.body || {};
    if (!email || !tempPassword) {
      return res.status(400).json({ success: false, error: 'Missing email or tempPassword' });
    }

    const html = mailer.buildUserCredentialsHtml({
      name: name || 'Campus Member',
      email,
      role: role || 'student',
      department: department || 'General Administration',
      tempPassword,
      portalUrl: portalUrl || 'http://localhost:8080/'
    });

    // Queue in notification stream & mail history
    await mailer.queueEmailNotification({
      title: `Welcome to CampusConnect: Account Provisioned for ${name || email}`,
      message: `Login credentials dispatched to ${email} (Role: ${(role || 'Student').toUpperCase()}).`,
      to: email,
      category: 'Auth',
      type: 'user_credentials'
    });

    console.log(`📧 [Mail API] Credentials email queued for: ${email} (${(role || 'student').toUpperCase()})`);
    res.json({
      success: true,
      recipient: email,
      subject: 'Welcome to Vemana CampusConnect - Your Login Credentials',
      htmlLength: html.length,
      dispatchedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Credentials mail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: Post announcement document to Firestore
function createFirestoreAnnouncement(docData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      fields: {
        title: { stringValue: docData.title },
        message: { stringValue: docData.message },
        category: { stringValue: docData.category || 'Campus Radio' },
        priority: { stringValue: docData.priority || 'High' },
        department: { stringValue: docData.department || 'All' },
        status: { stringValue: 'published' },
        classes: {
          arrayValue: {
            values: (docData.classes || ['Seminar Hall 1']).map(c => ({ stringValue: c }))
          }
        },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    });

    const req = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/announcements?key=${API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            const docId = parsed.name.split('/').pop();
            resolve({ docId, data: parsed });
          } catch (e) {
            resolve({ data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Studio API: Trigger Instant Broadcast for a Show
app.all(['/radio/trigger/:showType', '/radio/trigger'], async (req, res) => {
  const showType = (req.params.showType || req.query.showType || req.body.showType || 'morning').toLowerCase();
  const targetClasses = req.body?.classes || ['All', 'Seminar Hall 1', 'CSE Seminar Hall', 'IoT Lab', 'Lecture Hall 201', 'Auditorium'];

  try {
    let assembled;
    let title = '';
    if (showType === 'morning') {
      assembled = await radioEngine.assembleMorningShowScript();
      title = assembled.title;
    } else if (showType === 'afternoon') {
      assembled = await radioEngine.assembleAfternoonShowScript();
      title = assembled.title;
    } else if (showType === 'evening') {
      assembled = await radioEngine.assembleEveningShowScript();
      title = assembled.title;
    } else {
      assembled = await radioEngine.assembleDepartmentScript(showType.toUpperCase());
      title = `Department Radio Spotlight - ${assembled.name}`;
    }

    const created = await createFirestoreAnnouncement({
      title: title,
      message: assembled.script,
      category: 'Campus Radio',
      priority: 'High',
      department: showType === 'morning' || showType === 'afternoon' || showType === 'evening' ? 'All' : showType.toUpperCase(),
      classes: targetClasses
    });

    console.log(`\n🎙️ [Radio Trigger] Created ${showType} radio broadcast [${created.docId}]`);
    res.json({
      success: true,
      message: `Triggered ${showType} broadcast successfully!`,
      docId: created.docId,
      title: title,
      script: assembled.script
    });
  } catch (e) {
    console.error('Error triggering radio broadcast:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Automated Daily Radio Scheduler (Mon-Sat IST)
const broadcastHistory = new Set();

async function runDailyRadioScheduler() {
  const istNow = radioEngine.getNowIST();
  const dayOfWeek = istNow.getDay(); // 0 is Sunday
  const ymd = istNow.toISOString().split('T')[0];
  const hours = istNow.getHours();
  const minutes = istNow.getMinutes();

  // Skip automated classroom broadcasts on Sunday
  if (dayOfWeek === 0) return;

  const targetAllClasses = ['All', 'Seminar Hall 1', 'CSE Seminar Hall', 'IoT Lab', 'Lecture Hall 201', 'Auditorium'];

  // 1. Morning Radio (08:30 IST)
  if (hours === 8 && minutes >= 30 && minutes <= 35) {
    const key = `morning_${ymd}`;
    if (!broadcastHistory.has(key)) {
      broadcastHistory.add(key);
      console.log(`\n⏰ [Automated Scheduler] Triggering Scheduled Morning Radio for ${ymd}...`);
      try {
        const assembled = await radioEngine.assembleMorningShowScript(istNow);
        await createFirestoreAnnouncement({
          title: assembled.title,
          message: assembled.script,
          category: 'Campus Radio',
          priority: 'High',
          department: 'All',
          classes: targetAllClasses
        });
      } catch (e) {
        console.error('Failed to trigger morning radio:', e);
      }
    }
  }

  // 2. Afternoon Radio (13:15 IST)
  if (hours === 13 && minutes >= 15 && minutes <= 20) {
    const key = `afternoon_${ymd}`;
    if (!broadcastHistory.has(key)) {
      broadcastHistory.add(key);
      console.log(`\n⏰ [Automated Scheduler] Triggering Scheduled Afternoon Radio for ${ymd}...`);
      try {
        const assembled = await radioEngine.assembleAfternoonShowScript(istNow);
        await createFirestoreAnnouncement({
          title: assembled.title,
          message: assembled.script,
          category: 'Campus Radio',
          priority: 'High',
          department: 'All',
          classes: targetAllClasses
        });
      } catch (e) {
        console.error('Failed to trigger afternoon radio:', e);
      }
    }
  }

  // 3. Evening Radio (16:30 IST)
  if (hours === 16 && minutes >= 30 && minutes <= 35) {
    const key = `evening_${ymd}`;
    if (!broadcastHistory.has(key)) {
      broadcastHistory.add(key);
      console.log(`\n⏰ [Automated Scheduler] Triggering Scheduled Evening Radio for ${ymd}...`);
      try {
        const assembled = await radioEngine.assembleEveningShowScript(istNow);
        await createFirestoreAnnouncement({
          title: assembled.title,
          message: assembled.script,
          category: 'Campus Radio',
          priority: 'High',
          department: 'All',
          classes: targetAllClasses
        });
      } catch (e) {
        console.error('Failed to trigger evening radio:', e);
      }
    }
  }
}

// Automated Firestore Bridge: Polls for 'published', due 'scheduled', and unlinked 'ready' announcements
async function pollFirestoreAnnouncements() {
  await pollAnnouncementsByStatus('published');
  await pollAnnouncementsByStatus('scheduled');
  await pollAnnouncementsByStatus('ready');
}

async function pollAnnouncementsByStatus(statusFilter) {
  const postData = JSON.stringify({
    structuredQuery: {
      from: [{ collectionId: "announcements" }],
      where: {
        fieldFilter: {
          field: { fieldPath: "status" },
          op: "EQUAL",
          value: { stringValue: statusFilter }
        }
      },
      limit: 50
    }
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", async () => {
        try {
          if (res.statusCode === 200) {
            const results = JSON.parse(data);
            const nowIso = new Date().toISOString();
            for (const item of results) {
              if (item.document) {
                const docName = item.document.name;
                const docId = docName.split('/').pop();
                const fields = item.document.fields || {};
                const title = fields.title && fields.title.stringValue ? fields.title.stringValue : '';
                const message = fields.message && fields.message.stringValue ? fields.message.stringValue : '';

                // If scheduled, check if scheduled time is due
                if (statusFilter === 'scheduled') {
                  const scheduledFor = fields.scheduledFor?.timestampValue || fields.scheduledFor?.stringValue;
                  if (!scheduledFor || scheduledFor > nowIso) {
                    continue; // Future scheduled announcement
                  }
                  console.log(`\n⏰ [Scheduler] Triggering due announcement [${docId}] ("${title}") (scheduledFor: ${scheduledFor})`);
                }

                // If already ready, check if it is stale (> 10 minutes old) to retire it
                if (statusFilter === 'ready') {
                  const createdAt = fields.createdAt?.timestampValue || fields.lastBroadcastAt?.timestampValue || fields.createdAt?.stringValue;
                  if (createdAt) {
                    const ageMs = Date.now() - new Date(createdAt).getTime();
                    if (ageMs > 10 * 60 * 1000) {
                      await updateDocStatus(docId, 'completed');
                      continue;
                    }
                  }
                  const existingAudio = fields.audioUrl && fields.audioUrl.stringValue ? fields.audioUrl.stringValue : '';
                  if (existingAudio) {
                    continue;
                  }
                }

                let audioUrl = fields.audioUrl && fields.audioUrl.stringValue ? fields.audioUrl.stringValue : '';
                if (!audioUrl) {
                  let spokenText = message;
                  if (title && message) spokenText = `${title}. ${message}`;
                  else if (title) spokenText = title;

                  if (spokenText) {
                    textCache.set(docId, spokenText);
                    audioUrl = `${PUBLIC_BASE_URL}/tts?text=${encodeURIComponent(spokenText)}&voice=en-IN-NeerjaNeural`;
                  }
                }

                if (audioUrl) {
                  await updateDocReady(docId, audioUrl);
                }
              }
            }
          }
        } catch (e) {
          console.error("Error polling announcements:", e);
        }
        resolve();
      });
    });

    req.on('error', () => resolve());
    req.write(postData);
    req.end();
  });
}

function updateDocStatus(docId, newStatus) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      fields: {
        status: { stringValue: newStatus }
      }
    });

    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/announcements/${encodeURIComponent(docId)}?updateMask.fieldPaths=status&key=${API_KEY}`,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        resolve();
      });
    });

    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}

function dispatchTaskToClassrooms(docId, title, audioUrl, classes = ['All']) {
  const taskId = `task_${docId}_${Date.now()}`;
  const payload = JSON.stringify({
    fields: {
      pendingTask: {
        mapValue: {
          fields: {
            taskId: { stringValue: taskId },
            title: { stringValue: title || 'Campus Radio Broadcast' },
            audioUrl: { stringValue: audioUrl },
            priority: { stringValue: 'High' },
            timestamp: { integerValue: Math.floor(Date.now() / 1000) },
            isRebroadcast: { booleanValue: false }
          }
        }
      }
    }
  });

  const isAll = !Array.isArray(classes) || classes.length === 0 || classes.some(c => {
    const s = String(c).toLowerCase().trim();
    return s === 'all' || s === 'all classrooms' || s === 'campus';
  });

  // 1. If All / Campus, write to global broadcast channel for instant multi-node sync
  if (isAll) {
    const globalReq = https.request({
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/channels/global_broadcast?updateMask.fieldPaths=pendingTask&key=${API_KEY}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, () => {});
    globalReq.on('error', () => {});
    globalReq.write(payload);
    globalReq.end();
  }

  // 2. Dynamically fetch classrooms to match doc.id, name, department, or mac
  const listReq = https.get(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/classrooms?key=${API_KEY}`, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const json = JSON.parse(body);
        const docs = json.documents || [];
        for (const doc of docs) {
          const docId = doc.name.split('/').pop();
          const fields = doc.fields || {};
          const name = fields.name?.stringValue || docId;
          const dept = fields.department?.stringValue || '';
          const mac = fields.mac?.stringValue || fields.macAddress?.stringValue || '';

          let match = isAll;
          if (!match && Array.isArray(classes)) {
            match = classes.some(tc => {
              const target = String(tc).trim().toLowerCase();
              return target === 'all' ||
                     target === 'all classrooms' ||
                     target === 'campus' ||
                     target === docId.toLowerCase() ||
                     target === name.toLowerCase() ||
                     (dept && target === dept.toLowerCase()) ||
                     (mac && target === mac.toLowerCase());
            });
          }

          if (match) {
            const req = https.request({
              hostname: 'firestore.googleapis.com',
              path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/classrooms/${encodeURIComponent(docId)}?updateMask.fieldPaths=pendingTask&key=${API_KEY}`,
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
              }
            }, () => {});
            req.on('error', () => {});
            req.write(payload);
            req.end();
          }
        }
      } catch (e) {
        // Fallback default list
        const fallbackRooms = isAll
          ? ['Campus Speaker', 'Seminar Hall 1', 'IoT Lab', 'CSE Seminar Hall', 'Lecture Hall 201']
          : classes;
        for (const room of fallbackRooms) {
          const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/classrooms/${encodeURIComponent(room)}?updateMask.fieldPaths=pendingTask&key=${API_KEY}`,
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          }, () => {});
          req.on('error', () => {});
          req.write(payload);
          req.end();
        }
      }
    });
  });
  listReq.on('error', () => {});
}

function updateDocReady(docId, audioUrl, title = '', classes = ['All']) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      fields: {
        audioUrl: { stringValue: audioUrl },
        status: { stringValue: "ready" }
      }
    });

    dispatchTaskToClassrooms(docId, title, audioUrl, classes);

    const req = https.request({
      hostname: "firestore.googleapis.com",
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/announcements/${encodeURIComponent(docId)}?updateMask.fieldPaths=audioUrl&updateMask.fieldPaths=status&key=${API_KEY}`,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let b = "";
      res.on("data", c => b += c);
      res.on("end", () => {
        console.log(`\n⚡ [Auto-Bridge] Converted announcement [${docId}] to 'ready' with Azure TTS audio! (URL: ${audioUrl})`);
        resolve();
      });
    });

    req.on('error', () => resolve());
    req.write(payload);
    req.end();
  });
}

// Start Server & Auto-Bridge Listener
app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log('  Azure TTS Server & Automated Campus Radio Studio  ');
  console.log('====================================================');
  console.log(`Server URL:   http://${LOCAL_IP}:${PORT}`);
  console.log(`Public Base:  ${PUBLIC_BASE_URL}`);
  console.log(`Azure Region: ${AZURE_REGION} | Voice: ${DEFAULT_VOICE}`);
  console.log(`Target DB:    ${PROJECT_ID}`);
  console.log('----------------------------------------------------');
  console.log('✓ Actively listening for announcements & scheduled radio shows...');
  console.log('✓ Ready to stream audio to ESP32 speakers & App Players!');
  console.log('====================================================');

  // Check Firestore every 2 seconds for new Flutter announcements
  setInterval(pollFirestoreAnnouncements, 2000);

  // Check daily radio scheduler every 30 seconds
  setInterval(runDailyRadioScheduler, 30000);
});
