# AI RAG & Multimodal Intelligence Pipeline
## Google Gemini 3.8 Flash & Azure Cognitive Neural TTS

---

## 1. Subsystem Architecture Overview

The system incorporates dual generative AI pipelines:
1. **Gemini 3.8 Flash Retrieval-Augmented Generation (RAG):** Contextual reasoning over campus databases, notices, timetables, and department faculty directories.
2. **Multimodal Computer Vision Engine:** OCR and structured entity extraction from physical event posters, circulars, and administrative PDFs.
3. **Azure Cognitive Neural Text-to-Speech:** High-clarity Indian English (`en-IN-NeerjaNeural`) voice synthesis optimized for indoor classroom acoustics.

```mermaid
flowchart TB
    subgraph DataSources["1. KNOWLEDGE SOURCES & INPUTS"]
        D1[("Firestore Notices & Announcements")]
        D2[("Department Faculty & Lab Database")]
        D3[("Academic Calendar & Timetable")]
        D4["Uploaded Event Poster (JPEG/PNG)"]
        D5["Uploaded Circular Document (PDF)"]
    end

    subgraph Pipeline["2. INGESTION & PROCESSING ENGINE"]
        P1["Context Aggregator & Token Pruner"]
        P2["Multimodal Vision Ingestion (Gemini 3.8 Flash)"]
        P3["Dynamic Prompt Composer & Guardrails"]
    end

    subgraph LLM["3. GENERATIVE INFERENCE LAYER"]
        L1["Student Campus Assistant (Q&A)"]
        L2["Admin Copilot (Announcement Drafter)"]
        L3["30-Second Radio Script Generator"]
    end

    subgraph AudioSynth["4. AUDIO CONVERSION & STREAMING"]
        S1["SSML Speech Optimizer"]
        S2["Azure Neural TTS (en-IN-NeerjaNeural)"]
        S3["Firebase Storage MP3 Publisher"]
    end

    D1 & D2 & D3 --> P1
    D4 & D5 --> P2
    P1 & P2 --> P3 --> L1 & L2 & L3
    L3 --> S1 --> S2 --> S3
```

---

## 2. Gemini RAG Grounding Strategy

To prevent hallucinations, the backend queries the most recent Firestore collections on each request and constructs a dynamically grounded system prompt.

### Prompt Template Construction
```
================ SYSTEM PROMPT (CAMPUS ASSISTANT) ================
You are the official AI Campus Assistant for Vemana Institute of Technology.
Answer student questions accurately using ONLY the verified context below.
Format your responses in clean GitHub Markdown with clear headings (###),
bold text for dates/deadlines, and bullet points.

VERIFIED CAMPUS CONTEXT:
1. Active Notices:
   - [NOTICE #1] {title}: {content} (Date: {date})
   - [NOTICE #2] {title}: {content} (Date: {date})
2. Campus Radio Schedule:
   - Morning Show (08:30 AM IST)
   - Afternoon Pulse (01:15 PM IST)
   - Evening Recap (04:30 PM IST)
3. Faculty & Departments:
   - CSE HOD: Dr. ...
   - ISE HOD: Dr. ...
==================================================================
```

---

## 3. Multimodal Document Processing Flowchart

When an administrator uploads an image flyer or official college PDF:

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrator
    participant UI as Flutter Admin Console
    participant Server as Backend (doc_processor.js)
    participant Gemini as Gemini 3.8 Flash Vision
    participant Azure as Azure Neural TTS
    participant Storage as Firebase Storage

    Admin->>UI: Uploads Event Poster (e.g., "TechFest2026.png")
    UI->>Server: POST /api/process/image (Base64 payload)
    Server->>Gemini: Multimodal prompt requesting JSON entity extraction
    Gemini-->>Server: Returns structured JSON (Title, Date, Venue, Rules, Radio Script)
    Server-->>UI: Pre-fills Announcement Form with extracted data
    
    Admin->>UI: Reviews, edits & clicks "Publish & Broadcast"
    UI->>Server: POST /api/process/publish-to-radio
    Server->>Azure: Synthesizes 30s radio script into MP3
    Azure-->>Server: Returns binary MP3 buffer
    Server->>Storage: Uploads to announcements/{id}.mp3
    Server-->>UI: Broadcast active & queued for classroom speakers
```

---

## 4. UI Markdown Rendering Best Practices

To ensure flawless typographic presentation in the Flutter UI without raw formatting symbols:

1. **Headings (`#`, `##`, `###`):** Rendered as distinct typographic blocks with bold primary colors (`#1E1B4B`), increased font size (`15.5px`–`17.5px`), and vertical padding.
2. **Dividers (`---`, `***`):** Rendered as clean, subtle horizontal rules (`Divider(color: #E5E7EB)`).
3. **Numbered & Bulleted Lists:** Rendered with custom icon badges or bullet circles with aligned text.
4. **Emoji Sanitization:** All raw emoji characters are stripped from speech synthesis pipelines and converted into standard vector icons in the UI to prevent synthesis artifacts.
