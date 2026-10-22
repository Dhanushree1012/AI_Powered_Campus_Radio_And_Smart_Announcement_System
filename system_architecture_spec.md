# AI Campus Radio & Smart Announcement System
## System Architecture Specification

---

## 1. System Architecture Overview

The system operates across four primary architectural tiers:
1. **Presentation & Client Tier:** Flutter-based multi-platform application (Web, Android, iOS, macOS).
2. **API Gateway & Microservices Tier:** Node.js Express server orchestrating AI models, audio conversion, and event dispatchers.
3. **Cloud & AI Subsystems Tier:** Firebase Auth, Google Cloud Firestore, Firebase Storage, Google Gemini 3.8 Flash RAG, and Azure Cognitive Neural Speech.
4. **IoT & Edge Hardware Tier:** Decentralized ESP32 microcontrollers with I2S DACs (MAX98357A / PCM5102) and hardware speakers.

---

## 2. End-to-End System Flowchart

```text
                      +-----------------------------+
                      |  1. Admin App (Flutter UI)  |
                      +-----------------------------+
                                     |
                                     | (Writes Text & Target Class)
                                     v
                      +-----------------------------+
                      |    2. Firestore Database    |
                      +-----------------------------+
                                     |
                                     | (Triggers Cloud Event / Direct API)
                                     v
                      +-----------------------------+       +-------------------------------+
                      | 3. Cloud Function (Node.js) | <===> | Azure Speech Services TTS API |
                      +-----------------------------+       | (Converts Text to MP3)        |
                                     |                      +-------------------------------+
                                     | (Uploads MP3 & sets status: ready)
                                     v
                      +-----------------------------+
                      | 4. Firebase Storage (.mp3)  |
                      +-----------------------------+
                                     ^
                                     |
                                     | (Pulls audio stream over Wi-Fi)
                                     |
                      +-----------------------------+
                      | 5. ESP32 Worker Speaker     | <===> [ MAX98357A Amp + Speaker ]
                      +-----------------------------+
```

---

## 3. Detailed Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin User (Web/Desktop/Mobile)
    participant Flutter as Flutter Admin App
    participant Auth as Firebase Auth
    participant Firestore as Firestore Database
    participant Functions as Backend Hub (speak_server.js)
    participant Azure as Azure Cognitive Speech (TTS)
    participant Storage as Firebase Storage
    participant ESP32 as ESP32 I2S Speaker (MAX98357A)

    Admin->>Flutter: Log in (admin@vemanait.edu.in)
    Flutter->>Auth: Authenticate & retrieve role
    Admin->>Flutter: Create Announcement ("Seminar Hall 1")
    Flutter->>Firestore: Create document in announcements/ (status: "published")
    Flutter->>Functions: Trigger audio synthesis
    Functions->>Azure: Synthesize speech (en-IN-NeerjaNeural, 24kHz/48kbps MP3)
    Azure-->>Functions: Return MP3 audio binary
    Functions->>Storage: Upload MP3 to announcements/{id}.mp3
    Functions->>Firestore: Update doc with audioUrl & status = "ready"
    loop Every 3-5 seconds
        ESP32->>Firestore: Polling via lightweight documents:runQuery (status: "ready")
    end
    Firestore-->>ESP32: Return announcement with audioUrl
    ESP32->>Storage: Stream MP3 via HTTPS
    ESP32->>ESP32: Decode MP3 & stream output to I2S DAC (MAX98357A / PCM5102)
    ESP32->>Firestore: Update doc status = "completed"
    ESP32->>Firestore: Send active heartbeat timestamp to classrooms/{room}
```

---

## 4. Real-Time State Synchronization Flow

```mermaid
flowchart TD
    subgraph UI["Admin / Studio UI Interaction"]
        A1["Admin toggles Radio Broadcast Switch"]
        A2["Admin toggles Exam Mode / Silence Broadcasts"]
    end

    subgraph Service["FirestoreService (Stream Controllers)"]
        B1["radioBroadcastStatusStream (0ms Reactive Stream)"]
        B2["announcementsAudioStatusStream (0ms Reactive Stream)"]
        B3["setRadioBroadcastEnabled(val) & setExamMode(val)"]
    end

    subgraph Storage["Cloud Firestore Database"]
        C1["radio_settings/broadcast { isBroadcastEnabled: bool }"]
        C2["settings/system { radioBroadcastEnabled, examModeActive }"]
    end

    subgraph Listeners["Synchronized Listeners"]
        D1["Radio Studio Header & Banners"]
        D2["Admin Settings View Switches"]
        D3["Student Radio Screen Status Badge"]
        D4["ESP32 Speaker Audio Pipeline Gate"]
    end

    A1 & A2 --> B3 --> B1 & B2
    B3 --> C1 & C2
    C1 & C2 --> D1 & D2 & D3 & D4
```

---

## 5. Hardware Specifications & Pinout Configuration

### ESP32 I2S DAC Pinout Mapping
* **Microcontroller:** ESP32 Dev Module (Dual Core 240MHz).
* **I2S DAC:** MAX98357A / PCM5102.
  * `LRC / WS`: **GPIO 25**
  * `BCLK`: **GPIO 26**
  * `DIN / DOUT`: **GPIO 27**
* **Audio Library:** `ESP32-audioI2S` (stable v3.0.12).
* **Memory Footprint:** RAM ~15.3% (50KB used), Flash ~93.8% (1.2MB).
* **Firestore Polling Engine:** Uses structured `documents:runQuery` REST API (1.5KB payload vs 290KB unbounded GET) for leak-free, non-blocking queue execution.

---

## 6. Full Documentation References

* [System Architecture & Technical Design Specification](file:///Users/junaid/Desktop/AT/Announcement-system/docs/system_architecture_and_design.md)
* [REST API Reference Manual](file:///Users/junaid/Desktop/AT/Announcement-system/docs/api_reference.md)
* [Hardware Engineering & ESP32 Firmware Guide](file:///Users/junaid/Desktop/AT/Announcement-system/docs/hardware_and_firmware_guide.md)
* [Production Deployment & Operations Runbook](file:///Users/junaid/Desktop/AT/Announcement-system/docs/deployment_and_operations_guide.md)
* [AI RAG & Multimodal Intelligence Pipeline](file:///Users/junaid/Desktop/AT/Announcement-system/docs/ai_rag_and_multimodal_pipeline.md)
* [ESP32 Secure Wi-Fi Provisioning Guide](file:///Users/junaid/Desktop/AT/Announcement-system/docs/wifi_provisioning_guide.md)
