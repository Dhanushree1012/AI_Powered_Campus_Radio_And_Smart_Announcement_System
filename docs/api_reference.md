# REST API Reference Manual
## AI-Powered Campus Radio & Announcement Gateway

---

## 1. Overview & Base Configurations

The **API Gateway** (`speak_server.js`) runs by default on port `3000` and serves as the central orchestration layer for text-to-speech synthesis, Google Gemini 3.8 Flash RAG assistance, automated campus radio scheduling, multimodal document analysis, and system telemetry.

* **Base URL (Local):** `http://localhost:3000`
* **Base URL (LAN):** `http://<LAN_IP>:3000` (e.g., `http://192.168.1.100:3000`)
* **Content-Type:** `application/json` (for JSON endpoints) / `audio/mpeg` (for streaming endpoints)
* **CORS Support:** Enabled (`Access-Control-Allow-Origin: *`, `Methods: GET, POST, OPTIONS, PUT, DELETE`)

---

## 2. Authentication & Headers

Standard requests from the Flutter client and administrative tools include:

| Header | Type | Description |
| :--- | :---: | :--- |
| `Content-Type` | `string` | `application/json` for data payloads. |
| `Accept` | `string` | `application/json` or `audio/mpeg`. |
| `Authorization` | `string` | `Bearer <Firebase_ID_Token>` (Optional for local dev, enforced in production). |

---

## 3. Core Endpoint Catalog

```
+--------------------------------------------------------------------------------------------------------+
|                                         REST API ENDPOINT MATRIX                                       |
+--------------------------------+--------+--------------------------------------------------------------+
| Route                          | Method | Purpose                                                      |
+--------------------------------+--------+--------------------------------------------------------------+
| /health                        | GET    | Health check, Azure Speech status, and system metrics        |
| /tts                           | GET    | Direct text-to-speech MP3 stream with custom text/voice      |
| /thought-of-the-day.mp3        | GET    | Returns today's inspirational quote as high-clarity MP3      |
| /dept/:deptCode.mp3            | GET    | Continuous departmental kiosk audio stream (e.g. /dept/CSE)  |
| /radio/preview/:showType       | GET    | Previews generated script for morning/afternoon/evening      |
| /radio/stream/:showType        | GET    | Streams synthesized MP3 audio for the given show             |
| /radio/trigger/:showType       | POST   | Triggers broadcast, writes to Firestore, dispatches to audio |
| /api/student/chat              | POST   | Student Campus AI Assistant powered by Gemini 3.8 Flash RAG  |
| /api/admin/chat                | POST   | Admin AI Copilot (Announcement drafter, ticket analyzer)     |
| /api/process/image             | POST   | Multimodal OCR of event posters/flyers to radio script       |
| /api/process/pdf               | POST   | Multimodal PDF circular parser and voice summarizer          |
| /api/process/publish-to-radio  | POST   | Immediately queues extracted document into broadcast queue   |
| /api/events                    | GET    | Fetches academic calendar events & submission deadlines      |
| /api/events                    | POST   | Creates new academic calendar event                          |
| /api/events/trigger-reminders  | POST   | Dispatches 3-channel event reminders (Radio/Email/In-App)    |
| /telemetry/azure-tts           | GET    | Real-time character counts, quota limits, and usage metrics  |
+--------------------------------+--------+--------------------------------------------------------------+
```

---

## 4. Detailed Endpoint Specifications

### 4.1. System Health Probe
* **Endpoint:** `GET /health`
* **Description:** Verifies that the gateway is operational and Azure Cognitive Services can be contacted.

**Response (`200 OK`):**
```json
{
  "status": "ok",
  "service": "AI Campus Radio & Speech Hub",
  "version": "2.4.0",
  "ttsEngine": "Azure Cognitive Services Neural TTS",
  "defaultVoice": "en-IN-NeerjaNeural",
  "activePort": 3000,
  "timestamp": "2026-09-30T12:00:00.000Z"
}
```

---

### 4.2. Direct Text-to-Speech Streaming
* **Endpoint:** `GET /tts`
* **Query Parameters:**
  * `text` *(string, required)*: Spoken script (URL-encoded).
  * `voice` *(string, optional)*: Target voice (defaults to `en-IN-NeerjaNeural`).
  * `speed` *(string, optional)*: Playback rate (e.g., `1.0`, `1.15`).

**Sample Request:**
```bash
curl -G "http://localhost:3000/tts" \
  --data-urlencode "text=Welcome to the Computer Science Department." \
  --data-urlencode "voice=en-IN-NeerjaNeural" \
  --output welcome.mp3
```
* **Response Header:** `Content-Type: audio/mpeg`
* **Response Body:** Binary MP3 audio stream (24kHz, 48kbps, mono).

---

### 4.3. Radio Show Script Preview
* **Endpoint:** `GET /radio/preview/:showType`
* **Path Parameters:**
  * `showType`: `morning` | `afternoon` | `evening` | `cse` | `ise` | `ece` | `me`

**Response (`200 OK`):**
```json
{
  "success": true,
  "showType": "morning",
  "title": "Scheduled Morning Radio",
  "timeSlot": "08:30 AM",
  "voice": "en-IN-NeerjaNeural",
  "script": "Good morning Vemana IT! Here is your Morning Campus Chronicle...",
  "generatedAt": "2026-09-30T08:30:00.000Z"
}
```

---

### 4.4. Trigger Immediate Live Broadcast
* **Endpoint:** `POST /radio/trigger/:showType`
* **Path Parameters:** `showType` (`morning`, `afternoon`, `evening`, `cse`, `ise`, `ece`, `me`, etc.)
* **Request Body (Optional):**
```json
{
  "targetClassroom": "All Classrooms",
  "priority": "HIGH",
  "customNote": "Special guest lecture notice included"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Broadcast triggered successfully",
  "broadcastId": "radio_broadcast_1790666852",
  "showType": "morning",
  "audioUrl": "http://192.168.1.100:3000/audio/radio_broadcast_1790666852.mp3",
  "status": "ready"
}
```

---

### 4.5. Student AI Campus Assistant (Gemini 3.8 RAG)
* **Endpoint:** `POST /api/student/chat`
* **Description:** Grounds user questions against live notices, faculty lists, lab manuals, and timetables.

**Request Body:**
```json
{
  "message": "When is the last date to register for the IEEE Hackathon?",
  "history": [
    { "role": "user", "parts": [{ "text": "Hi" }] },
    { "role": "model", "parts": [{ "text": "Hello! How can I help you today?" }] }
  ],
  "userId": "student_12345"
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "reply": "### IEEE Hackathon Registration\n\nThe last date to register for the **2026 Campus Innovators Hackathon** is **October 15, 2026** at 5:00 PM IST.\n\n--- \n\n* Eligibility: Open to all 2nd, 3rd, and 4th-year engineering students.\n* Venue: IoT Centre of Excellence, Room 302.",
  "groundingSources": [
    { "type": "announcement", "id": "ann_ieee_2026", "title": "IEEE Hackathon Circular" }
  ]
}
```

---

### 4.6. Multimodal Poster / Flyer Processing
* **Endpoint:** `POST /api/process/image`
* **Request Body:**
```json
{
  "imageBase64": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "instructions": "Extract event date, eligibility, and generate a 30-second broadcast script."
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "extractedData": {
    "title": "National Technical Symposium 2026",
    "date": "2026-11-04",
    "venue": "Main Auditorium",
    "eligibility": "All Engineering Branches",
    "category": "Events",
    "priority": "HIGH"
  },
  "radioScript": "Attention students! The National Technical Symposium 2026 will be held on November 4th at the Main Auditorium. Registration is now open on the college portal."
}
```

---

### 4.7. Azure Neural TTS Telemetry
* **Endpoint:** `GET /telemetry/azure-tts`
* **Description:** Monitors character consumption against the 500,000 free-tier allowance.

**Response (`200 OK`):**
```json
{
  "service": "Azure Cognitive Speech Services",
  "monthlyQuota": 500000,
  "charactersUsed": 18450,
  "charactersRemaining": 481550,
  "cachedSavingsCharacters": 94200,
  "utilizationPercentage": 3.69,
  "healthy": true,
  "lastRequestTimestamp": "2026-09-30T11:42:15.000Z"
}
```

---

## 5. Standard Error Responses

All endpoints adhere to standardized JSON error envelopes:

```json
{
  "success": false,
  "error": "ResourceNotFound",
  "message": "The requested audio file or show script does not exist.",
  "statusCode": 404,
  "timestamp": "2026-09-30T12:00:00.000Z"
}
```

| HTTP Status | Meaning | Typical Cause |
| :---: | :--- | :--- |
| `400` | Bad Request | Missing required parameters (`text`, `showType`, or image payload). |
| `403` | Forbidden | Insufficient permissions for administrative action. |
| `404` | Not Found | Target document ID or audio file does not exist. |
| `429` | Rate Limited | Azure TTS or Gemini API monthly/minutely limits exceeded. |
| `500` | Internal Error | Network timeout or unhandled exception during TTS synthesis. |
