/**
 * Campus Radio & Announcement System - Automated Health & Regression Audit
 * Non-invasive diagnostic script to verify permissions, schemas, OTA, GitHub Pages, and live audio APIs.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
let passCount = 0;
let failCount = 0;

function report(testName, passed, detail = '') {
  if (passed) {
    passCount++;
    console.log(`  \x1b[32m✔ PASS\x1b[0m : ${testName} ${detail ? `(${detail})` : ''}`);
  } else {
    failCount++;
    console.log(`  \x1b[31m✘ FAIL\x1b[0m : ${testName} - ${detail}`);
  }
}

function checkFile(relPath, checks) {
  const fullPath = path.join(ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    report(`File exists: ${relPath}`, false, 'File not found');
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const { name, regex, expected = true } of checks) {
    const match = regex.test(content);
    report(`${relPath} -> ${name}`, match === expected, match ? 'Found' : 'Missing');
  }
}

function checkHttpEndpoint(url, expectedStatus = 200, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let resolved = false;
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      const isOk = res.statusCode === expectedStatus || (res.statusCode >= 200 && res.statusCode < 400);
      report(`HTTP Endpoint: ${url}`, isOk, `Status ${res.statusCode}`);
      res.on('data', () => {});
      res.on('end', () => resolve(isOk));
    });
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      req.destroy();
      report(`HTTP Endpoint: ${url}`, false, 'Request timed out');
      resolve(false);
    }, timeoutMs);
    req.on('error', (err) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      report(`HTTP Endpoint: ${url}`, false, err.message);
      resolve(false);
    });
  });
}

async function runAudit() {
  console.log('\n======================================================');
  console.log('   CAMPUS SYSTEM AUTOMATED HEALTH & REGRESSION AUDIT   ');
  console.log('======================================================\n');

  console.log('[1] Auditing Mobile Platform Permissions & Network Rules:');
  checkFile('admin_app/android/app/src/main/AndroidManifest.xml', [
    { name: 'INTERNET permission', regex: /android\.permission\.INTERNET/ },
    { name: 'ACCESS_NETWORK_STATE permission', regex: /android\.permission\.ACCESS_NETWORK_STATE/ },
    { name: 'usesCleartextTraffic enabled', regex: /android:usesCleartextTraffic="true"/ },
  ]);

  console.log('\n[2] Auditing Mobile Audio Architecture & Context:');
  checkFile('admin_app/lib/widgets/in_app_audio_player.dart', [
    { name: 'AudioContext configured', regex: /AudioPlayer\.global\.setAudioContext/ },
    { name: 'Android usageType media', regex: /AndroidUsageType\.media/ },
    { name: 'Android audioFocus gain', regex: /AndroidAudioFocus\.gain/ },
  ]);

  console.log('\n[3] Auditing Student Module Data Models & Views:');
  checkFile('admin_app/lib/features/student/models/student_announcement.dart', [
    { name: 'audioUrl field in StudentAnnouncement', regex: /audioUrl/ },
  ]);

  checkFile('admin_app/lib/features/student/screens/student_announcement_detail_screen.dart', [
    { name: 'Priority row removed from student screen', regex: /_row\('Priority'/ , expected: false },
    { name: 'Listen Announcement audio button present', regex: /Listen Announcement/ },
    { name: 'CampusAudioPlayerSheet trigger present', regex: /CampusAudioPlayerSheet\.show/ },
  ]);

  checkFile('admin_app/lib/student/student_dashboard.dart', [
    { name: 'Dynamic notifications StreamBuilder (no hardcoded badge)', regex: /notifications/ },
  ]);

  console.log('\n[4] Auditing Admin Voice Greetings & Template Controls:');
  checkFile('admin_app/lib/services/firestore_service.dart', [
    { name: 'defaultAudioTemplates defined', regex: /defaultAudioTemplates/ },
    { name: 'systemAudioTemplatesStream present', regex: /systemAudioTemplatesStream/ },
  ]);
  checkFile('admin_app/lib/admin/campus_radio_studio_page.dart', [
    { name: 'Voice Greetings Tab added', regex: /Voice Greetings/ },
    { name: 'SystemVoiceGreetingsManager widget present', regex: /_SystemVoiceGreetingsManager/ },
  ]);

  console.log('\n[5] Auditing ESP32 Firmware In-Speaker Web Console, OTA & Partitions:');
  checkFile('firmware/worker/src/main.cpp', [
    { name: 'WebServer on port 80', regex: /WebServer webServer\(80\)/ },
    { name: 'Web console password auth', regex: /webServer\.authenticate\("admin", SETUP_AP_PASSWORD\)/ },
    { name: 'Autonomous SoftAP watchdog', regex: /CampusRadio-Speaker-/ },
    { name: 'Zero-heap PROGMEM HTML console', regex: /INDEX_HTML\[\] PROGMEM/ },
    { name: 'Update.h OTA include', regex: /#include <Update\.h>/ },
    { name: 'OTA update route /update', regex: /webServer\.on\("\/update", HTTP_POST/ },
  ]);
  checkFile('firmware/worker/partitions_ota.csv', [
    { name: 'Dual OTA app0 slot', regex: /app0,\s+app,\s+ota_0/ },
    { name: 'Dual OTA app1 slot', regex: /app1,\s+app,\s+ota_1/ },
  ]);

  console.log('\n[6] Auditing GitHub Pages Web Showcase Artifacts:');
  checkFile('docs/index.html', [
    { name: 'Live Radio Section', regex: /id="radio-player"/ },
    { name: 'Student AI Section', regex: /id="student-module"/ },
    { name: 'Admin Studio Section', regex: /id="admin-studio"/ },
    { name: 'Hardware & OTA Lab Section', regex: /id="hardware-lab"/ },
    { name: 'REST API Explorer Section', regex: /id="api-docs"/ },
  ]);
  checkFile('docs/app.js', [
    { name: 'Azure TTS Base URL', regex: /AZURE_TTS_BASE/ },
    { name: 'Radio Channels Config', regex: /RADIO_CHANNELS/ },
    { name: 'OTA Simulator Logic', regex: /initSpeakerConsoleSim/ },
  ]);
  const ghPagesWorkflow = fs.existsSync(path.join(ROOT, '.github/workflows/deploy-pages.yml'))
    ? '.github/workflows/deploy-pages.yml'
    : '.github/workflows/deploy_gh_pages.yml';
  checkFile(ghPagesWorkflow, [
    { name: 'Pages deploy action', regex: /actions\/deploy-pages/ },
  ]);

  console.log('\n[7] Auditing Cloud Azure Speech & Audio Endpoints:');
  await checkHttpEndpoint(
    'https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/tts?text=Thought%20of%20the%20day&voice=en-IN-NeerjaNeural',
    200
  );
  await checkHttpEndpoint(
    'https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/tts?text=Test%20Announcement&voice=en-IN-NeerjaNeural',
    200
  );

  console.log('\n======================================================');
  console.log(`   AUDIT RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('======================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAudit();
