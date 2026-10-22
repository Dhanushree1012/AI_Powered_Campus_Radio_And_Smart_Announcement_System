# ESP32 Onboarding - Stage 4: WiFi Audio Streaming Test

In this stage, you will connect the **MAX98357A I2S Amplifier** and speaker to your ESP32, connect the board to your local Wi-Fi router, and stream a test MP3 file from the web directly to the speaker.

---

## 1. Objectives & Outcome
*   **Objective:** Wire the I2S DAC amplifier to the ESP32, compile a sketch with the `ESP32-audioI2S` library, connect to Wi-Fi, and stream an online audio file.
*   **Outcome:** The speaker plays the test audio file clearly, confirming that the DAC wiring, speaker power, and Wi-Fi streaming code are fully functional.

---

## 2. Required Hardware
*   1× ESP32 Development Board
*   1× MAX98357A I2S Amplifier Board
*   1× 3W Speaker (4-ohm or 8-ohm)
*   1× USB Data Cable
*   Female-to-Female jumper wires
*   A local Wi-Fi network (SSID and Password)

---

## 3. Hardware Wiring (DAC to ESP32)

Turn off or unplug your ESP32 before wiring! Connect the MAX98357A amplifier pins to your ESP32 board as follows:

```
    [ESP32 Board]                       [MAX98357A Amp]
    +-------------+                     +-------------+
    |         GND |-------------------->| GND         |
    |          5V |-------------------->| VIN         |
    |     GPIO 25 |-------------------->| LRC (WS)    |
    |     GPIO 26 |-------------------->| BCLK (SCK)  |
    |     GPIO 22 |-------------------->| DIN (SD)    |
    +-------------+                     +-------------+

    Wired directly:
    [MAX98357A Amp] L+ & L-  ---------> [ 3W Speaker ]
```

---

## 4. Step-by-Step Instructions

1.  Wire the hardware exactly as shown in the table.
2.  Open **Arduino IDE**.
3.  Install the required library:
    *   Go to **Tools > Manage Libraries...**
    *   Search for **ESP32-audioI2S** (by Wolle / schreibmann) and click **Install**.
4.  Copy the **Audio Streaming Code** below and paste it into the Arduino IDE.
5.  In the code, update the following placeholders:
    *   `WIFI_SSID` -> Your local Wi-Fi router name.
    *   `WIFI_PASSWORD` -> Your Wi-Fi password.
    *   `testAudioUrl` -> You can keep our sample URL or replace it with the `test_voice.mp3` public link from your Firebase Storage.
6.  Click **Upload** to flash the code to the ESP32.
7.  Once uploaded, open the **Serial Monitor** at **115200 baud**.
8.  The speaker should start playing the audio file as soon as the ESP32 connects to the Wi-Fi.

---

## 5. Audio Streaming Test Code

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include "Audio.h"

// Define I2S Pins matching your wiring
#define I2S_DOUT      22
#define I2S_BCLK      26
#define I2S_LRC       25

// Wi-Fi Credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Public Test MP3 URL (An open audio test stream)
const char* testAudioUrl = "http://codesandtags.github.io/files/samples/speech_sample.mp3";

Audio audio;

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("\nESP32 Audio Streaming Test Initiated.");

    // Set pinouts for the I2S Decoder
    audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
    
    // Set internal volume (scale is 0 to 21)
    audio.setVolume(12); 

    // Connect to your Wi-Fi network
    Serial.printf("Connecting to Wi-Fi: %s\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    
    Serial.println("\nWi-Fi Connected successfully!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    // Connect to the HTTP host and begin decoding and playing the MP3 stream
    Serial.printf("Connecting to host and streaming: %s\n", testAudioUrl);
    audio.connecttohost(testAudioUrl);
}

void loop() {
    // This loops buffer processes to feed data from Wi-Fi to the I2S register.
    // Must be called continuously in the loop!
    audio.loop();
}

// Optional status callbacks for debugging (printed to serial monitor)
void audio_info(const char *info) {
    Serial.printf("Audio Info Log: %s\n", info);
}

void audio_eof_mp3(const char *info) {
    Serial.println("Playback finished! Stream reached End of File.");
}
```

---

## 6. Verification Checklist
*   [ ] Does the ESP32 print `Wi-Fi Connected successfully!` to the Serial Monitor?
*   [ ] Do you hear the spoken audio clearly through the speaker?
*   [ ] If the sound is heavily distorted or static, check your wiring connections and ensure the `5V` pin of the ESP32 is connected to the `VIN` of the MAX98357A.
