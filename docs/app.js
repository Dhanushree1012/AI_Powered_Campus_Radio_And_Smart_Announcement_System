// ==========================================================================
// CAMPUSWAVE AI — INTERACTIVE APPLICATION LOGIC & SHOWCASE ENGINE
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initRadioPlayer();
  initChatAssistant();
  initVoiceGreetingsDemo();
  initSpeakerConsoleSim();
  initApiExplorer();
});

// ==========================================================================
// 1. LIVE CAMPUS RADIO & AUDIO PLAYER ENGINE
// ==========================================================================

const AZURE_TTS_BASE = 'https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/tts';
const DEFAULT_VOICE = 'en-IN-NeerjaNeural';

const RADIO_CHANNELS = {
  morning: {
    title: '🌅 Morning Chronicle (08:30 AM)',
    meta: 'Daily campus morning greeting, Thought of the Day, and academic schedule.',
    text: 'Good morning Vemana Institute of Technology! Welcome to today\'s Morning Chronicle. The thought of the day is: Innovation distinguishes between a leader and a follower. Today\'s AI lab sessions start at 10 AM.',
  },
  midday: {
    title: '☀️ Mid-Day Campus Pulse (01:15 PM)',
    meta: 'Real-time placement drives, hackathon cutoffs, and afternoon announcements.',
    text: 'Attention students! This is the Mid-Day Campus Pulse. The Google Cloud Generative AI Hackathon registration closes today at 5 PM. Campus recruitment interviews for 7th-semester CSE students begin in Seminar Hall 1.',
  },
  evening: {
    title: '🌆 Evening Preview (04:30 PM)',
    meta: 'Next-day schedule preview, lab preparations, and 48-hour event outlook.',
    text: 'Good evening campus! This is your Evening Preview. Tomorrow\'s Embedded Systems workshop will be conducted in IoT Lab 3. Please ensure your ESP32 toolchains are pre-configured before 9 AM.',
  },
  cse: {
    title: '💻 Computer Science & Engineering Hub',
    meta: 'Dedicated departmental voice announcements for CSE classrooms & labs.',
    text: 'Department of Computer Science and Engineering notice. Submission deadline for 6th semester Mini-Projects has been updated in the portal. Please submit to your respective mentors by Friday.',
  },
  ece: {
    title: '⚡ Electronics & Communication Hub',
    meta: 'Dedicated departmental voice announcements for ECE classrooms & labs.',
    text: 'Department of Electronics and Communication Engineering notice. VLSI Design lab exam batches are published on the 3rd-floor notice board.',
  }
};

let currentAudio = new Audio();
let currentChannelKey = 'morning';
let isPlaying = false;

function initRadioPlayer() {
  const playBtn = document.getElementById('play-btn');
  const channelBtns = document.querySelectorAll('.channel-btn');
  const trackTitle = document.getElementById('track-title');
  const trackMeta = document.getElementById('track-desc');
  const visualizer = document.getElementById('visualizer');
  const progressFill = document.getElementById('progress-fill');
  const timeCurrent = document.getElementById('time-current');
  const timeTotal = document.getElementById('time-total');

  function loadChannel(key) {
    currentChannelKey = key;
    const ch = RADIO_CHANNELS[key];
    if (trackTitle) trackTitle.textContent = ch.title;
    if (trackMeta) trackMeta.textContent = ch.meta;

    const audioUrl = `${AZURE_TTS_BASE}?text=${encodeURIComponent(ch.text)}&voice=${DEFAULT_VOICE}`;
    currentAudio.src = audioUrl;
    currentAudio.load();
  }

  channelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      channelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const channel = btn.getAttribute('data-channel');
      loadChannel(channel);
      if (isPlaying) {
        currentAudio.play().catch(e => console.log('Audio autoplay prevented:', e));
      }
    });
  });

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (isPlaying) {
        currentAudio.pause();
      } else {
        if (!currentAudio.src) {
          loadChannel(currentChannelKey);
        }
        currentAudio.play().catch(e => {
          console.warn('Playback error:', e);
          alert('Audio playback could not start automatically. Check internet connection or Azure TTS endpoint.');
        });
      }
    });
  }

  currentAudio.addEventListener('play', () => {
    isPlaying = true;
    if (playBtn) playBtn.innerHTML = '⏸';
    if (visualizer) visualizer.classList.add('playing');
  });

  currentAudio.addEventListener('pause', () => {
    isPlaying = false;
    if (playBtn) playBtn.innerHTML = '▶';
    if (visualizer) visualizer.classList.remove('playing');
  });

  currentAudio.addEventListener('timeupdate', () => {
    if (currentAudio.duration) {
      const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
      if (progressFill) progressFill.style.width = `${progress}%`;
      if (timeCurrent) timeCurrent.textContent = formatTime(currentAudio.currentTime);
      if (timeTotal) timeTotal.textContent = formatTime(currentAudio.duration);
    }
  });

  currentAudio.addEventListener('ended', () => {
    isPlaying = false;
    if (playBtn) playBtn.innerHTML = '▶';
    if (visualizer) visualizer.classList.remove('playing');
    if (progressFill) progressFill.style.width = '0%';
  });

  // Initial load
  loadChannel('morning');
}

function formatTime(seconds) {
  if (isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// ==========================================================================
// 2. GEMINI 3.8 FLASH CAMPUS ASSISTANT SIMULATOR
// ==========================================================================

const SAMPLE_QA = {
  'lab': {
    q: 'What are the IoT Lab timings today?',
    a: 'According to today\'s academic schedule, the **IoT and Embedded Systems Lab** is open from **09:00 AM to 04:30 PM** for 6th-semester CSE students. Batch B has their practical session starting at 02:00 PM.'
  },
  'hod': {
    q: 'Who is the Head of Department for CSE?',
    a: 'The HOD for the **Computer Science & Engineering** department is **Dr. Manoj Kumar**, located at **Cabin 304, Academic Block 2**. Office hours for student queries are 02:00 PM to 04:00 PM.'
  },
  'radio': {
    q: 'What is scheduled on Campus Radio today?',
    a: 'Today\'s **Morning Chronicle** was broadcast at 08:30 AM featuring today\'s Thought of the Day. Up next is the **Mid-Day Campus Pulse** at 01:15 PM covering Google Cloud Hackathon registrations and placement notices.'
  },
  'exam': {
    q: 'When do the semester end examinations start?',
    a: 'As per the verified VTU Academic Circular in Firestore, 6th and 8th semester theory examinations commence on **November 14, 2026**. Practical lab examinations are scheduled from **November 02 to November 10**.'
  }
};

function initChatAssistant() {
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send-btn');
  const promptChips = document.querySelectorAll('.prompt-chip');

  function appendMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function handleSend(userText) {
    if (!userText.trim()) return;
    appendMessage('user', userText);
    if (chatInput) chatInput.value = '';

    // Typing simulation
    setTimeout(() => {
      let matched = SAMPLE_QA['radio'].a;
      const lower = userText.toLowerCase();
      if (lower.includes('lab') || lower.includes('timing')) matched = SAMPLE_QA['lab'].a;
      else if (lower.includes('hod') || lower.includes('head') || lower.includes('faculty')) matched = SAMPLE_QA['hod'].a;
      else if (lower.includes('exam') || lower.includes('circular') || lower.includes('test')) matched = SAMPLE_QA['exam'].a;

      appendMessage('ai', `✨ <i>[Gemini 3.8 Flash RAG Grounded]</i><br>${matched}`);
    }, 600);
  }

  if (sendBtn && chatInput) {
    sendBtn.addEventListener('click', () => handleSend(chatInput.value));
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSend(chatInput.value);
    });
  }

  promptChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const promptKey = chip.getAttribute('data-qa');
      if (SAMPLE_QA[promptKey]) {
        handleSend(SAMPLE_QA[promptKey].q);
      }
    });
  });
}

// ==========================================================================
// 3. ADMIN VOICE GREETINGS PREVIEW ENGINE
// ==========================================================================

function initVoiceGreetingsDemo() {
  const collegeInput = document.getElementById('vg-college');
  const roomInput = document.getElementById('vg-classroom');
  const previewBtns = document.querySelectorAll('.btn-vg-preview');

  previewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const templateText = btn.getAttribute('data-template') || '';
      const college = (collegeInput && collegeInput.value) ? collegeInput.value : 'Vemana Institute of Technology';
      const classroom = (roomInput && roomInput.value) ? roomInput.value : 'Seminar Hall 1';

      const resolved = templateText
        .replace(/{college}/g, college)
        .replace(/{classroom}/g, classroom);

      btn.textContent = '🔊 Synthesizing...';
      const previewAudio = new Audio(`${AZURE_TTS_BASE}?text=${encodeURIComponent(resolved)}&voice=${DEFAULT_VOICE}`);
      previewAudio.play().then(() => {
        btn.textContent = '▶ Listen Preview';
      }).catch(err => {
        console.warn('Preview error:', err);
        btn.textContent = '▶ Listen Preview';
        alert(`Synthesized Preview Text:\n\n"${resolved}"`);
      });
    });
  });
}

// ==========================================================================
// 4. IN-SPEAKER WEB CONSOLE & OTA SIMULATOR
// ==========================================================================

function initSpeakerConsoleSim() {
  const otaBtn = document.getElementById('sim-ota-btn');
  const otaStatus = document.getElementById('sim-ota-status');
  const otaProgress = document.getElementById('sim-ota-progress');

  if (otaBtn) {
    otaBtn.addEventListener('click', () => {
      if (!confirm('Upload and flash simulated firmware.bin Over-The-Air?')) return;
      otaBtn.disabled = true;
      otaBtn.textContent = 'Uploading firmware.bin...';
      if (otaStatus) otaStatus.style.display = 'block';

      let percent = 0;
      const interval = setInterval(() => {
        percent += 15;
        if (percent > 100) percent = 100;
        if (otaProgress) otaProgress.style.width = `${percent}%`;
        if (otaStatus) otaStatus.textContent = `Writing to Flash OTA partition... ${percent}%`;

        if (percent === 100) {
          clearInterval(interval);
          otaStatus.textContent = '✅ Flash Complete! Rebooting ESP32 into new firmware...';
          setTimeout(() => {
            otaBtn.disabled = false;
            otaBtn.textContent = 'Flash Firmware OTA';
            otaStatus.textContent = '🔵 Blue LED solid ON. Connected & Listening on port 80.';
          }, 2000);
        }
      }, 250);
    });
  }
}

// ==========================================================================
// 5. REST API EXPLORER
// ==========================================================================

const API_SCHEMAS = {
  health: {
    method: 'GET',
    url: '/health',
    curl: 'curl -X GET https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/health',
    response: {
      status: "online",
      version: "1.0.0",
      azureSpeech: "healthy",
      voice: "en-IN-NeerjaNeural",
      timestamp: new Date().toISOString()
    }
  },
  thought: {
    method: 'GET',
    url: '/thought-of-the-day.mp3',
    curl: 'curl -X GET https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/thought-of-the-day.mp3 --output thought.mp3',
    response: {
      format: "audio/mpeg",
      bitrate: "48 kbps",
      samplerate: "24 kHz",
      status: 200
    }
  },
  radioTrigger: {
    method: 'POST',
    url: '/radio/trigger/morning',
    curl: 'curl -X POST https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/radio/trigger/morning',
    response: {
      success: true,
      broadcastId: "announcement_morning_1789",
      target: "All Classrooms",
      status: "ready",
      audioUrl: "https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/tts?text=Good+Morning..."
    }
  },
  aiChat: {
    method: 'POST',
    url: '/api/student/chat',
    curl: 'curl -X POST https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/api/student/chat \\\n  -H "Content-Type: application/json" \\\n  -d \'{"message": "What is the thought of the day?"}\'',
    response: {
      answer: "Today's inspirational thought is: 'Innovation distinguishes between a leader and a follower.'",
      sources: ["broadcasts/today", "events_calendar"]
    }
  }
};

function initApiExplorer() {
  const tabBtns = document.querySelectorAll('.api-tab-btn');
  const apiMethod = document.getElementById('api-method');
  const apiUrl = document.getElementById('api-url');
  const apiCurl = document.getElementById('api-curl');
  const apiJson = document.getElementById('api-json');

  function showApi(key) {
    const data = API_SCHEMAS[key];
    if (!data) return;
    if (apiMethod) {
      apiMethod.textContent = data.method;
      apiMethod.className = `method-badge method-${data.method.toLowerCase()}`;
    }
    if (apiUrl) apiUrl.textContent = data.url;
    if (apiCurl) apiCurl.textContent = data.curl;
    if (apiJson) apiJson.textContent = JSON.stringify(data.response, null, 2);
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.getAttribute('data-api');
      showApi(key);
    });
  });

  showApi('health');
}
