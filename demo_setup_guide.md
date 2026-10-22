# AI-Powered Campus Radio & Smart Announcement System
## End-to-End Setup & Deployment Guide

This repository contains the complete system architecture for the **AI Powered Campus Radio and Smart Announcement System**.

---

## 📁 Repository Structure

```
Announcement-system/
├── admin_app/                     # Flutter App (Admin & Student Portal)
│   ├── lib/                       # Screens, widgets, and services
│   ├── lib/firebase_options.dart  # Firebase configuration for ai-powered-campus-radio
│   └── android/app/google-services.json
│
├── backend/                       # Firebase Backend & Cloud Functions
│   ├── functions/
│   │   ├── index.js               # Azure Speech Neural TTS & streamTTS Functions
│   │   ├── play_tts_local.js      # Local Azure TTS test utility (plays on laptop)
│   │   ├── test_azure_tts.js      # Azure Neural Voice synthesizer test
│   │   ├── seed_firestore.js      # Seeds all departments, classrooms & radio programmes
│   │   └── queue_test_announcements.js # Automated 4-announcement sequential test
│   ├── firestore.rules            # Firestore security rules
│   ├── storage.rules              # Storage security rules
│   ├── firebase.json              # Deployment configuration
│   └── .firebaserc                # Target Firebase project: ai-powered-campus-radio
│
├── firmware/                      # Embedded Firmware (PlatformIO & Arduino IDE)
│   └── worker/                    # ESP32 I2S DAC Cloud Speaker Node
│       ├── platformio.ini         # PlatformIO build configuration
│       ├── src/main.cpp           # Main C++ source code
│       └── worker.ino             # Arduino IDE source code
│
└── speak_server.js                # Local Azure Speech Proxy Server (direct HTTP streaming)
```

---

## 🚀 Quick Start Guide

### 1. Backend & Firebase Deployment
Target Project: **`ai-powered-campus-radio`**

```bash
# Navigate to backend
cd backend

# Deploy Cloud Functions and Security Rules
npx firebase deploy --only functions,firestore:rules,storage

# Seed the Firestore database with classrooms, departments, and radio programmes
node functions/seed_firestore.js
```

### 2. Testing Azure Speech TTS Locally
Verify your Azure Speech credentials and synthesize audio directly on your Mac/PC:

```bash
# Option A: Interactive CLI (plays synthesized audio on your laptop speakers)
node backend/functions/play_tts_local.js

# Option B: Run Local LAN Proxy Server (stream to ESP32 over local Wi-Fi)
node speak_server.js
# Test in browser: http://localhost:3000/tts?text=Welcome+to+Campus+Radio
```

### 3. Flashing ESP32 Firmware

#### Worker Node (Speaker with MAX98357A / PCM5102 I2S DAC)
- **Pins:** `BCLK -> GPIO 26`, `LRC (WS) -> GPIO 25`, `DOUT (DIN) -> GPIO 27`, `GND -> GND`, `VIN -> 5V`
- Open `firmware/worker` in PlatformIO / VS Code:
  ```bash
  cd firmware/worker
  pio run --target upload
  pio device monitor --baud 115200
  ```
- **📶 Secure Dynamic Wi-Fi Setup**:
  - To change Wi-Fi on-demand without re-flashing: hold the physical **BOOT button (GPIO 0) for 5 seconds**.
  - Connect phone to WPA2 Hotspot: `CampusRadio-Setup-<MAC>` (Password: `CampusAdmin@2026`).
  - Configure target network and tap Save (see [docs/wifi_provisioning_guide.md](docs/wifi_provisioning_guide.md)).

### 4. Running the Flutter Admin & Student App
```bash
cd admin_app
flutter run -d chrome      # Run on Web
flutter run -d macos       # Run on macOS Desktop
flutter run -d android     # Run on Android Device / Emulator
```

#### Admin Login Credentials:
- **Super Admin:** `admin@vemanait.edu.in` / `Admin@12345`
- **Principal Admin:** `principal@vemanait.edu.in` / `Principal@123`

---

## ⚙️ Key Technical Fixes Applied

1. **Azure Speech Neural TTS**: Migrated from GCP to Azure Speech Services (`Central India` / `en-IN-NeerjaNeural`) with optimized `audio-24khz-48kbitrate-mono-mp3` audio.
2. **Firestore Structured Polling**: Replaced unbounded GET requests with `documents:runQuery` queries, cutting payload sizes from 290KB to 1.5KB and permanently resolving ESP32 heap exhaustion.
3. **Sequential Audio Queueing**: Full FIFO order preservation ensuring multiple consecutive announcements play back seamlessly.
4. **Natural EOF Callback**: The ESP32 worker relies on `audio_eof_mp3` to mark announcements as `"completed"` only when playback genuinely finishes.
