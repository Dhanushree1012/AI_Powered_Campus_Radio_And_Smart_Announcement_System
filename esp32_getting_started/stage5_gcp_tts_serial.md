# ESP32 GCP TTS Serial Playback Guide

This guide details how to configure your ESP32 connected to a **MAX98357A I2S amplifier** and speaker, so that entering any text in the Serial Monitor synthesizes the text into a Wavenet neural voice using your Google Cloud Service Account and plays the audio directly!

---

## 1. Hardware Pin Connections

Confirm that your hardware wiring matches the pins you specified:

*   **ESP32 GPIO 27** ─── **DIN (SD)** on MAX98357A
*   **ESP32 GPIO 26** ─── **BCLK (SCK)** on MAX98357A
*   **ESP32 GPIO 25** ─── **LRC (WS)** on MAX98357A
*   **ESP32 GND** ────── **GND** on MAX98357A
*   **ESP32 5V** ─────── **VIN (VDD)** on MAX98357A
*   **MAX98357A L+/L-** ─ **3W 4Ω Speaker**

---

## 2. Local Proxy Server Setup (On Your Laptop)

Since the Google Cloud TTS API returns a Base64 encoded JSON payload (which is too large and resource-heavy for ESP32 microcontrollers to buffer and decode in memory), we use a tiny Node.js script running on your laptop. 

The script acts as a secure proxy: it processes the API credentials locally, downloads the high-quality WaveNet audio, and streams the raw binary MP3 chunks directly to the ESP32.

### Step 1: Install Dependencies
Open your laptop terminal, go to your project folder, and run:
```bash
npm install express @google-cloud/text-to-speech
```

### Step 2: Start the Proxy Server
Run the local server using your credentials file:
```bash
node speak_server.js
```
You will see output like:
```text
GCP TTS Proxy Server running at http://localhost:3000
Ready to receive requests from your ESP32!
```

---

## 3. ESP32 Arduino / PlatformIO Source Code

Paste this code into your Arduino IDE or PlatformIO project.

Make sure to edit these variables:
*   `WIFI_SSID`: Your home/office Wi-Fi router name.
*   `WIFI_PASSWORD`: Your Wi-Fi password.
*   `LAPTOP_IP`: Your laptop's IP address (e.g. `192.168.1.50`). You can find this on macOS by running `ipconfig getifaddr en0` in Terminal.

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include "Audio.h"

// Define I2S Pins matching your wiring
#define I2S_DOUT      27
#define I2S_BCLK      26
#define I2S_LRC       25

// Wi-Fi Credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Your laptop's IP address where node speak_server.js is running
const char* LAPTOP_IP = "192.168.1.50"; 
const int PORT = 3000;

Audio audio;
bool isPlaying = false;

// Helper function to encode URL parameters
String urlEncode(String str) {
    String encodedString = "";
    char c;
    char code1;
    char code2;
    for (int i = 0; i < str.length(); i++) {
        c = str.charAt(i);
        if (c == ' ') {
            encodedString += '+';
        } else if (isalnum(c)) {
            encodedString += c;
        } else {
            code1 = (c & 0xf) + '0';
            if ((c & 0xf) > 9) {
                code1 = (c & 0xf) - 10 + 'A';
            }
            c = (c >> 4) & 0xf;
            code2 = c + '0';
            if (c > 9) {
                code2 = c - 10 + 'A';
            }
            encodedString += '%';
            encodedString += code2;
            encodedString += code1;
        }
        yield();
    }
    return encodedString;
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n--- ESP32 I2S Google Cloud TTS Initialized ---");
    Serial.println("Type text in the Serial Monitor below and hit Enter to play!");

    // Configure I2S audio pins
    audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
    audio.setVolume(15); // Set volume (0 to 21)

    // Connect to local Wi-Fi
    Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    
    Serial.println("\nWi-Fi Connected successfully!");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
}

void loop() {
    // Keep feeding audio buffer to I2S
    audio.loop();

    // Check if Serial has input
    if (Serial.available() > 0) {
        String inputText = Serial.readStringUntil('\n');
        inputText.trim(); // Clean trailing spaces/newlines

        if (inputText.length() > 0) {
            Serial.printf("\nSynthesizing: \"%s\"\n", inputText.c_str());

            // Build request URL to call the Node.js express proxy
            String urlEncodedText = urlEncode(inputText);
            String ttsUrl = "http://" + String(LAPTOP_IP) + ":" + String(PORT) + "/tts?text=" + urlEncodedText;
            
            Serial.printf("Request URL: %s\n", ttsUrl.c_str());
            
            // Connect and stream audio
            isPlaying = true;
            audio.connecttohost(ttsUrl.c_str());
        }
    }

    // Reset status when playback completes
    if (isPlaying && !audio.isRunning()) {
        isPlaying = false;
        Serial.println("Audio playback finished.");
    }
}

// Optional callback functions from ESP32-audioI2S library
void audio_info(const char *info){
    Serial.print("Audio Info: ");
    Serial.println(info);
}
```

---

## 4. Run & Test Instructions

1.  Flash the code above to your ESP32 using Arduino IDE or PlatformIO.
2.  Open your **Serial Monitor** at **115200 baud** and select **Newline** (`\n` or `Both NL & CR`) as the line ending.
3.  Make sure the local Node server (`node speak_server.js`) is running on your laptop.
4.  Type `"Attention students! Tomorrow is a public holiday."` in the Serial Monitor text field and hit **Enter**.
5.  The ESP32 will send the query to your laptop, obtain the GCP Wavenet MP3 audio file, and play it back clearly through the speaker!
