# Production Deployment & Operations Runbook
## AI-Powered Campus Radio & Announcement System

---

## 1. System Prerequisites

| Component | Minimum Version | Recommended Environment |
| :--- | :--- | :--- |
| **Node.js Runtime** | Node v18.16.0 LTS or v20+ | Ubuntu 22.04 LTS / macOS Sonoma / Debian 12 |
| **Flutter SDK** | Flutter 3.22.x+ (Dart 3.4+) | Stable Channel with Chrome/Web & Android Toolchains |
| **Firebase CLI** | `firebase-tools` v13.0+ | Authenticated via `firebase login` |
| **PlatformIO Core** | PlatformIO CLI v6.1+ | For ESP32 C++ firmware builds and flashing |
| **Azure Speech** | Cognitive Speech Resource | Standard (S0) or Free (F0 - 500k char/month) |
| **Google Gemini API** | Google AI Studio / Vertex AI | API Key enabled for `gemini-1.5-flash` / `gemini-2.0-flash` |

---

## 2. Environment Configuration Matrix

Create or verify the following configuration files before launching services:

### A. Backend AI & Cloud Config (`backend/gemini_config.json`)
```json
{
  "apiKey": "YOUR_GEMINI_API_KEY",
  "model": "gemini-1.5-flash",
  "temperature": 0.4,
  "topP": 0.95,
  "topK": 40,
  "maxOutputTokens": 2048
}
```

### B. Speech Server Environment (`.env` in root)
```env
PORT=3000
NODE_ENV=production
AZURE_SPEECH_KEY=YOUR_AZURE_SPEECH_KEY
AZURE_SPEECH_REGION=centralindia
FIREBASE_PROJECT_ID=ai-powered-campus-radio
DEFAULT_TTS_VOICE=en-IN-NeerjaNeural
ENABLE_TELEMETRY=true
```

---

## 3. Deployment Procedures

### 3.1. Firebase Security Rules & Indexes Deployment
Deploy the hardened Firestore rules from [backend/firestore.rules](file:///Users/junaid/Desktop/AT/Announcement-system/backend/firestore.rules):

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

### 3.2. Node.js API Gateway Deployment (PM2 Production Service)

Install PM2 globally for automatic process restart, load clustering, and log rotation:

```bash
npm install -g pm2
npm install
```

Start the service daemon using PM2:
```bash
pm2 start speak_server.js --name "campus-radio-gateway" -i 1 --max-memory-restart 300M
pm2 save
pm2 startup
```

**Useful PM2 Operations Commands:**
```bash
pm2 status                        # View real-time cluster health
pm2 logs campus-radio-gateway     # Stream combined system logs
pm2 restart campus-radio-gateway  # Gracefully restart server
```

---

### 3.3. Systemd Service Alternative (Linux Servers)

For native Linux systemd management, create `/etc/systemd/system/campus-radio.service`:

```ini
[Unit]
Description=AI Campus Radio & Announcement Gateway
After=network.target

[Service]
Type=simple
User=campusadmin
WorkingDirectory=/var/www/Announcement-system
ExecStart=/usr/bin/node /var/www/Announcement-system/speak_server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=campus-radio-gateway
Environment=NODE_ENV=production PORT=3000

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable campus-radio.service
sudo systemctl start campus-radio.service
```

---

### 3.4. Flutter Admin & Student Client Deployment

#### Web Production Build
```bash
cd admin_app
flutter clean
flutter pub get
flutter build web --release --web-renderer canvaskit
```
The optimized bundle is output to `admin_app/build/web/` and can be hosted via Firebase Hosting, Nginx, or Cloudflare Pages.

#### Deploying to Firebase Hosting:
```bash
firebase deploy --only hosting
```

#### Android APK Production Build
```bash
flutter build apk --release --split-per-abi
```

---

### 3.5. ESP32 Firmware Compilation & Flashing

Connect the ESP32 node via USB and flash using PlatformIO:

```bash
cd firmware/worker
pio run --target upload
pio device monitor --baud 115200
```

---

## 4. Telemetry, Quotas & Monitoring Runbook

```
+-----------------------------------------------------------------------------------------+
|                               QUOTA & TELEMETRY THRESHOLDS                              |
+---------------------+-------------------+-----------------------+-----------------------+
| Subsystem           | Free / Baseline   | Warning Threshold     | Operational Action    |
+---------------------+-------------------+-----------------------+-----------------------+
| Azure Neural TTS    | 500,000 Chars/Mo  | 80% (400,000 Chars)   | Check cache ratio;    |
|                     |                   |                       | upgrade to S0 Tier    |
+---------------------+-------------------+-----------------------+-----------------------+
| Google Gemini API   | 15 RPM / Free     | 12 RPM                | Enable queue debounce |
|                     | Tier              |                       | in API gateway        |
+---------------------+-------------------+-----------------------+-----------------------+
| Firestore Reads     | 50,000 Reads/Day  | 35,000 Reads          | Verify ESP32 polling  |
|                     |                   |                       | interval (5000ms)     |
+---------------------+-------------------+-----------------------+-----------------------+
```

### Telemetry Health Check Endpoint
Query `GET /telemetry/azure-tts` periodically via Prometheus or Uptime Kuma to track usage trends.

---

## 5. Backup, Disaster Recovery & Failover

1. **Firestore Automated Backups:**
   Schedule daily Firestore exports to Google Cloud Storage:
   ```bash
   gcloud firestore export gs://campus-radio-backups/$(date +%Y%m%d)
   ```
2. **Audio Cache Recovery:**
   Cached announcement MP3s stored in Firebase Storage (`announcements/`) are immutable and automatically backed up by Google Cloud multi-region replication.
3. **Hardware Node Swapping:**
   If a classroom speaker node fails physically, replace the ESP32 and update the new MAC address in the `/classrooms` collection. The new node will automatically begin receiving announcements without firmware reconfiguration.
