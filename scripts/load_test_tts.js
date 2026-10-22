/**
 * Campus Radio & Announcement System - Audio Streaming & TTS Load Test
 * Simulates concurrent ESP32 speakers and mobile clients fetching audio streams.
 */

const https = require('https');
const http = require('http');

const AZURE_TTS_BASE = 'https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net';
const CONCURRENT_CLIENTS = 10;
const TEST_PHRASES = [
  'Good morning students, welcome to another day of learning.',
  'Tomorrow is a national holiday for Gandhi Jayanti.',
  'Midterm examination schedule has been published on the portal.',
  'Campus placement drive for computer science starts at 10 AM.',
  'Please note that the library will remain open until 11 PM.',
];

const customAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 45000,
});

function fetchAudioStream(id, text) {
  return new Promise((resolve) => {
    const encodedText = encodeURIComponent(text);
    const url = `${AZURE_TTS_BASE}/tts?text=${encodedText}&voice=en-IN-NeerjaNeural`;
    const startTime = Date.now();
    let bytesReceived = 0;
    let firstByteTime = null;

    const req = https.get(url, { agent: customAgent }, (res) => {
      const statusCode = res.statusCode;

      res.on('data', (chunk) => {
        if (!firstByteTime) {
          firstByteTime = Date.now() - startTime;
        }
        bytesReceived += chunk.length;
      });

      res.on('end', () => {
        const totalDuration = Date.now() - startTime;
        resolve({
          id,
          success: statusCode === 200 && bytesReceived > 0,
          statusCode,
          firstByteTime: firstByteTime || totalDuration,
          totalDuration,
          bytesReceived,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        id,
        success: false,
        statusCode: 0,
        error: err.message,
        firstByteTime: 0,
        totalDuration: Date.now() - startTime,
        bytesReceived: 0,
      });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve({
        id,
        success: false,
        statusCode: 408,
        error: 'Timeout',
        firstByteTime: 0,
        totalDuration: Date.now() - startTime,
        bytesReceived,
      });
    });
  });
}

async function runLoadTest() {
  console.log('\n======================================================');
  console.log('   CAMPUS AUDIO STREAM & TTS PERFORMANCE LOAD TEST   ');
  console.log('======================================================');
  console.log(`Target Host: ${AZURE_TTS_BASE}`);
  console.log(`Simulated Concurrent Audio Streams: ${CONCURRENT_CLIENTS}\n`);

  const tasks = [];
  for (let i = 0; i < CONCURRENT_CLIENTS; i++) {
    const phrase = TEST_PHRASES[i % TEST_PHRASES.length];
    tasks.push(fetchAudioStream(i + 1, phrase));
  }

  const startTime = Date.now();
  const results = await Promise.all(tasks);
  const wallClockTime = Date.now() - startTime;

  let successful = 0;
  let totalBytes = 0;
  const latencies = [];
  const ttfbs = [];

  for (const r of results) {
    if (r.success) {
      successful++;
      totalBytes += r.bytesReceived;
      latencies.push(r.totalDuration);
      ttfbs.push(r.firstByteTime);
      console.log(`  Client #${r.id.toString().padEnd(2)}: \x1b[32m✔ 200 OK\x1b[0m | TTFB: ${r.firstByteTime}ms | Total: ${r.totalDuration}ms | Data: ${(r.bytesReceived / 1024).toFixed(1)} KB`);
    } else {
      console.log(`  Client #${r.id.toString().padEnd(2)}: \x1b[31m✘ FAILED\x1b[0m | Code: ${r.statusCode} | Error: ${r.error || 'None'}`);
    }
  }

  latencies.sort((a, b) => a - b);
  ttfbs.sort((a, b) => a - b);

  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const avgTTFB = ttfbs.length ? Math.round(ttfbs.reduce((a, b) => a + b, 0) / ttfbs.length) : 0;
  const p95Latency = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
  const throughputKbSec = wallClockTime > 0 ? ((totalBytes / 1024) / (wallClockTime / 1000)).toFixed(1) : 0;

  console.log('\n======================================================');
  console.log('                 PERFORMANCE METRICS                  ');
  console.log('======================================================');
  console.log(`  Success Rate           : ${successful}/${CONCURRENT_CLIENTS} (${Math.round((successful / CONCURRENT_CLIENTS) * 100)}%)`);
  console.log(`  Total Audio Received   : ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`  Avg Time-To-First-Byte : ${avgTTFB} ms`);
  console.log(`  Avg Total Stream Time  : ${avgLatency} ms`);
  console.log(`  P95 Stream Time        : ${p95Latency} ms`);
  console.log(`  Overall Throughput     : ${throughputKbSec} KB/sec`);
  console.log('======================================================\n');

  if (successful < CONCURRENT_CLIENTS) {
    process.exit(1);
  }
}

runLoadTest();
