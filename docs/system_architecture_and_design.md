# System Architecture & Technical Design Specification
## AI-Powered Campus Radio & Smart Announcement System

---

## 1. Executive Summary & Architectural Goals

The **AI-Powered Campus Radio & Smart Announcement System** is an enterprise-grade, IoT-driven audio broadcasting and multimodal intelligence platform designed for higher education campuses. It bridges administrative announcements, automated daily campus radio shows, Google Gemini 3.8 Flash RAG AI assistance, multimodal circular/poster digitization, and decentralized ESP32 I2S hardware speaker nodes over low-latency Wi-Fi.

### Core Architectural Principles
* **Low Latency & High Availability (HA):** Sub-second dispatching of voice alerts across campus nodes.
* **Dual-Band State Synchronization:** Real-time reactive sync across admin consoles, student apps, and hardware nodes using Firestore and dual-stream broadcast controllers.
* **Cost & Quota Efficiency:** Azure Neural TTS optimization with intelligent caching, token budgeting, and real-time telemetry against free-tier (500k char/month) limits.
* **Hardware Resilience:** Decentralized ESP32 firmware running non-blocking FreeRTOS audio pipelines with structured JSON `documents:runQuery` REST polling to prevent heap exhaustion.
* **Strict Role-Based Access Control (RBAC):** Principle of Least Privilege across Superadmin, Admin/Faculty, and Student tiers.

---

## 2. End-to-End System Block Diagram

```mermaid
graph TB
    subgraph ClientLayer["1. CLIENT & PRESENTATION TIER"]
        A1["📱 Flutter Student App<br/>(Radio Player, Thought of Day, AI Copilot)"]
        A2["💻 Flutter Admin Console<br/>(Studio, Multi-Channel Announce, Settings)"]
        A3["🖥️ Department Kiosk / Web Player<br/>(Continuous Audio Stream)"]
    end

    subgraph GatewayLayer["2. API GATEWAY & MICROSERVICES (speak_server.js)"]
        B1["🛡️ Auth & RBAC Interceptor"]
        B2["🎙️ Radio Studio Engine<br/>(Morning, Mid-Day, Evening Automation)"]
        B3["🤖 Gemini 3.8 Flash RAG Assistant<br/>(Student Assistant & Admin Copilot)"]
        B4["📄 Multimodal Doc Processor<br/>(Poster OCR & Circular Summarizer)"]
        B5["📅 Multi-Channel Reminder Engine<br/>(Calendar, Email, In-App, Radio)"]
        B6["📊 Azure TTS Telemetry & Quota Monitor"]
    end

    subgraph CloudLayer["3. CLOUD PLATFORM & AI SERVICES"]
        C1[("🗄️ Google Cloud Firestore<br/>(announcements, settings, events, queries)")]
        C2["☁️ Firebase Cloud Storage<br/>(Synthesized .mp3 Audio & Circular Files)"]
        C3["🧠 Google Gemini 3.8 Flash API<br/>(RAG Embeddings & Vision Processing)"]
        C4["🔊 Azure Cognitive Speech Services<br/>(en-IN-NeerjaNeural Neural TTS)"]
        C5["📧 SMTP Mail Relay<br/>(Automated Student Alerts)"]
    end

    subgraph HardwareLayer["4. HARDWARE IOT TIER (ESP32 Nodes)"]
        D1["🔊 Seminar Hall 1 Node<br/>(MAC: 08:A6:F7:5A:A5:D8)"]
        D2["🔊 IoT & Embedded Systems Lab<br/>(MAC: 08:A6:F7:5A:B2:10)"]
        D3["🔊 CSE Department Auditorium<br/>(MAC: 08:A6:F7:5A:C4:77)"]
        D4["🔊 Mechanical Workshop Kiosk<br/>(MAC: 08:A6:F7:5A:D9:33)"]
    end

    %% Inter-layer connections
    A1 & A2 & A3 -->|HTTPS / WSS / REST| B1
    B1 --> B2 & B3 & B4 & B5 & B6
    B2 & B3 & B4 & B5 & B6 <-->|Real-time Streams & Queries| C1
    B2 & B4 -->|MP3 Binary Upload| C2
    B3 & B4 -->|Prompt & Multimodal Payload| C3
    B2 & B4 & B6 -->|SSML / Text-to-Speech| C4
    B5 -->|HTML Templates| C5

    C1 -->|documents:runQuery Polling| D1 & D2 & D3 & D4
    C2 -->|Direct HTTPS Audio Stream| D1 & D2 & D3 & D4
```

---

## 3. High-Level Announcement & Audio Processing Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Admin / Faculty
    participant App as Flutter Admin Console
    participant Gateway as API Gateway (Node.js)
    participant Gemini as Google Gemini 3.8 Flash
    participant Azure as Azure Neural Speech (TTS)
    participant Storage as Firebase Storage
    participant DB as Google Cloud Firestore
    participant ESP as ESP32 Classroom Speaker

    Admin->>App: Submits announcement (Target: "Seminar Hall 1", Priority: "URGENT")
    App->>DB: Writes doc to announcements/ (status: "published")
    App->>Gateway: Triggers audio synthesis pipeline
    
    alt Optional AI Expansion
        Gateway->>Gemini: Generates natural broadcast script
        Gemini-->>Gateway: Returns radio-optimized text
    end

    Gateway->>Azure: Synthesize speech (Voice: en-IN-NeerjaNeural, 24kHz/48kbps MP3)
    Azure-->>Gateway: Returns MP3 binary buffer
    Gateway->>Storage: Uploads MP3 to /announcements/{id}.mp3
    Gateway->>DB: Updates doc (audioUrl: "https://...", status: "ready")
    
    loop Every 3 seconds (Non-blocking HTTP GET)
        ESP->>DB: Polling documents:runQuery for target room where status == 'ready'
    end

    DB-->>ESP: Returns matching payload with audioUrl
    ESP->>DB: Sets status = 'broadcasting'
    ESP->>Storage: Streams MP3 chunks over HTTPS
    ESP->>ESP: I2S DMA Buffer -> MAX98357A DAC -> Speaker Playback
    ESP->>DB: Sets status = 'completed' & updates classroom heartbeat timestamp
```

---

## 4. Multi-Channel Campus Radio Architecture

The Campus Radio engine operates as an autonomous multi-schedule broadcast hub with manual administrative override capabilities:

### Daily Program Schedule Matrix
```
+-----------------------------------------------------------------------------------------+
|                               CAMPUS RADIO DAILY AUTOMATION                             |
+---------------------+-------------------+-----------------------+-----------------------+
| Show Type           | Scheduled Time    | Primary Content       | Target Outputs        |
+---------------------+-------------------+-----------------------+-----------------------+
| Morning Chronicle   | 08:30 AM IST      | Thought of the Day,   | All Classroom Nodes,  |
|                     |                   | Timetable, Deadlines  | Student Mobile App    |
+---------------------+-------------------+-----------------------+-----------------------+
| Mid-Day Pulse       | 01:15 PM IST      | Placement Drives,     | Campus Kiosks,        |
|                     |                   | Hackathons, Alerts    | In-App Live Stream    |
+---------------------+-------------------+-----------------------+-----------------------+
| Evening Roundup     | 04:30 PM IST      | Next-Day Previews,    | Department Speakers,  |
|                     |                   | Lab Schedules, Recap  | Mobile Web Player     |
+---------------------+-------------------+-----------------------+-----------------------+
```

### Real-Time State Synchronization Engine

To guarantee zero discrepancy between the **Radio Studio**, **Admin Settings**, **Student UI**, and **Classroom Speakers**, a dual-layer synchronization pipeline is implemented:

```mermaid
flowchart LR
    subgraph UI_Events["User Actions"]
        E1["Admin toggles switch in Radio Studio"]
        E2["Admin activates Exam Mode in Settings"]
    end

    subgraph Service["FirestoreService Singleton"]
        S1["radioBroadcastStatusStream (StreamController)"]
        S2["announcementsAudioStatusStream (StreamController)"]
        S3["dualSyncToFirestore(broadcast, system)"]
    end

    subgraph Storage["Firestore Real-time Documents"]
        D1["radio_settings/broadcast { isBroadcastEnabled: bool }"]
        D2["settings/system { radioBroadcastEnabled, examModeActive }"]
    end

    subgraph Consumers["Subscribed Viewpoints"]
        C1["Campus Radio Studio Page (Immediate UI update)"]
        C2["Admin Settings View (Immediate UI update)"]
        C3["Student Campus Radio Player (Live / Off-Air badge)"]
        C4["ESP32 Audio Gatekeeper (Mute / Unmute stream)"]
    end

    E1 & E2 --> S1 & S2
    S1 & S2 --> S3
    S3 --> D1 & D2
    D1 & D2 --> C1 & C2 & C3 & C4
```

---

## 5. Google Gemini 3.8 Flash RAG & Multimodal Pipeline

The intelligence subsystem combines Retrieval-Augmented Generation (RAG) with multimodal computer vision:

```mermaid
flowchart TD
    subgraph Input["Multimodal User Inputs"]
        I1["Student Natural Language Query (Voice/Text)"]
        I2["Admin Circular Upload (PDF Document)"]
        I3["Event Poster Upload (JPEG/PNG Image)"]
    end

    subgraph Gateway["Backend AI Gateway (gemini_assistant.js & doc_processor.js)"]
        P1["Query Pre-processor & Context Sanitizer"]
        P2["RAG Knowledge Vector Aggregator (Firestore Notices & Faculty DB)"]
        P3["Gemini 3.8 Flash Multimodal Vision Engine"]
    end

    subgraph Gemini["Google Gemini 3.8 Flash Inference"]
        G1["Context-Grounded Query Answering"]
        G2["Structured JSON OCR & Radio Script Drafter"]
        G3["Admin Copilot Announcement Synthesizer"]
    end

    subgraph Output["Processed Outputs"]
        O1["Rendered Markdown + Speech Audio for Student"]
        O2["Draft Announcement Form with Pre-filled Metadata"]
        O3["Auto-Queued MP3 Voice Broadcast for Classrooms"]
    end

    I1 --> P1 --> P2 --> G1 --> O1
    I2 & I3 --> P3 --> G2 --> O2 & O3
```

---

## 6. Hardware & Audio Pipeline Specification

### ESP32 I2S DAC Pinout Mapping
* **Microcontroller:** ESP32-WROOM-32D / ESP32-DevKitC (240MHz Dual-Core, 520KB SRAM).
* **Audio DAC Amplifier:** MAX98357A (Mono 3.2W Class D) or PCM5102 (Stereo Hi-Fi).

| ESP32 Pin (GPIO) | DAC Signal Name | Description |
| :--- | :---: | :--- |
| **GPIO 25** | `LRC` / `WS` | Left/Right Word Select Clock |
| **GPIO 26** | `BCLK` / `SCK` | Continuous Bit Clock Line |
| **GPIO 27** | `DIN` / `SDATA`| Serial Audio Data Stream |
| **5V / VIN** | `VDD` / `VIN` | Regulated Power Supply |
| **GND** | `GND` | Common Ground Reference |
| **GPIO 0** | `BOOT` | Wi-Fi Provisioning Trigger (Hold 5s) |
| **GPIO 2** | `STATUS LED` | System Health Indicator (Blink: Setup, Solid: Online) |

### Memory & Execution Profiling on ESP32
* **Heap Allocation Strategy:** Pre-allocated 32KB circular DMA audio ring buffer.
* **Network Query Footprint:** `documents:runQuery` payload is constrained to **1.5 KB** per poll cycle, avoiding the memory crash typical of unbounded 300KB Firestore collection dumps.
* **Watchdog Integration:** FreeRTOS task watchdog resets audio tasks upon connection dropouts.

---

## 7. Security, Access Control & Compliance

1. **Authentication:** Firebase Authentication with token expiration and JWT claim verification.
2. **Firestore Rules:** Strict collection isolation:
   * `/announcements/{id}`: Read public; Write restricted to authenticated faculty/admin.
   * `/settings/{id}`: Read/Write restricted to `superadmin`.
   * `/queries/{id}`: Read/Write scoped to student author and admin responders.
3. **Wi-Fi Provisioning Security:**
   * Hotspot disabled during standard operation.
   * Physical button hold (5 seconds) required to activate WPA2 captive portal (`CampusRadio-Setup-<MAC>`).
   * 180-second automatic timeout watchdog.
