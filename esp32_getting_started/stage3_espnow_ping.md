# ESP32 Onboarding - Stage 3: ESP-NOW LED Command & Ack

In this stage, you will establish peer-to-peer wireless communication between two ESP32 boards using **ESP-NOW**. 

Board A (the **Master**) will send a command packet over the air to toggle the onboard LED of Board B (the **Worker**). Board B will receive the command, toggle its LED, and return an acknowledgment packet back to Board A.

---

## 1. Objectives & Outcome
*   **Objective:** Wirelessly connect two ESP32s directly without a Wi-Fi router. Send commands and receive verification handshakes.
*   **Outcome:** Tapping the boot button or waiting 3 seconds triggers the Master to send a command. The Worker’s LED toggles, and the Master’s Serial Monitor prints "ACK Received: SUCCESS!".

---

## 2. Required Hardware
*   2× ESP32 Development Boards (Board A = Master, Board B = Worker)
*   2× USB Data Cables (connected to separate ports or separate computers)
*   Recorded MAC Addresses for both boards from **Stage 2**.

---

## 3. Step-by-Step Instructions

### Step 1: Collect MAC Addresses
Let's assume:
*   **Master MAC Address:** `00:11:22:33:44:AA`
*   **Worker MAC Address:** `00:11:22:33:44:BB`

### Step 2: Configure and Upload Master Code (Board A)
1.  Copy the **Master Code** below.
2.  In the code, find the `workerMac` byte array:
    `uint8_t workerMac[] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00};`
3.  Replace those hex values with your physical **Worker** MAC Address. (e.g. if the Worker MAC is `24:0A:C4:8A:2B:10`, use `{0x24, 0x0A, 0xC4, 0x8A, 0x2B, 0x10}`).
4.  Connect Board A (Master) to your computer and upload the Master Code. Keep the Serial Monitor open at **115200 baud**.

### Step 3: Configure and Upload Worker Code (Board B)
1.  Copy the **Worker Code** below.
2.  In the code, find the `masterMac` byte array:
    `uint8_t masterMac[] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00};`
3.  Replace those hex values with your physical **Master** MAC Address.
4.  Connect Board B (Worker) to your computer and upload the Worker Code. Keep this Serial Monitor open at **115200 baud** (using another window or computer).

---

## 4. Master Node Code (Board A)

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>

// REPLACE THIS WITH YOUR WORKER'S PHYSICAL MAC ADDRESS
uint8_t workerMac[] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

// Command struct matching the worker
struct __attribute__((packed)) LedCommand {
    bool turnOn;
};

// Response struct matching the worker
struct __attribute__((packed)) AckMessage {
    bool success;
};

bool ledState = false;

// Callback when data is sent to the peer
void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
    Serial.print("ESP-NOW Packet Send Status: ");
    Serial.println(status == ESP_NOW_SEND_SUCCESS ? "SUCCESS (Delivered to Radio)" : "FAIL");
}

// Callback when acknowledgment is received back from the worker
void onDataRecv(const uint8_t * mac_addr, const uint8_t *incomingData, int len) {
    if (len != sizeof(AckMessage)) return;
    
    AckMessage ack;
    memcpy(&ack, incomingData, sizeof(ack));
    
    Serial.print(">>> HANDSHAKE ACK RECEIVED FROM WORKER: ");
    Serial.println(ack.success ? "LED TOGGLED SUCCESSFULLY!" : "ERROR");
    Serial.println("----------------------------------------");
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("ESP-NOW Master Controller Initiated.");
    
    // Set WiFi to Station mode
    WiFi.mode(WIFI_STA);
    
    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    
    // Register callbacks
    esp_now_register_send_cb(onDataSent);
    esp_now_register_recv_cb(esp_now_recv_cb_t(onDataRecv));
    
    // Register the Worker as a peer
    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, workerMac, 6);
    peerInfo.channel = 0;  
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add peer");
        return;
    }
}

void loop() {
    // Toggle the target LED state every 3 seconds
    ledState = !ledState;
    
    LedCommand cmd;
    cmd.turnOn = ledState;
    
    Serial.printf("\nSending command: Turn LED %s...\n", cmd.turnOn ? "ON" : "OFF");
    
    // Send command payload over the air directly to the Worker's MAC Address
    esp_err_t result = esp_now_send(workerMac, (uint8_t *) &cmd, sizeof(cmd));
    
    if (result != ESP_OK) {
        Serial.println("Error initiating send command.");
    }
    
    delay(3000); // Send every 3 seconds
}
```

---

## 5. Worker Node Code (Board B)

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>

#define ONBOARD_LED 2

// REPLACE THIS WITH YOUR MASTER'S PHYSICAL MAC ADDRESS
uint8_t masterMac[] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00};

// Command struct matching the master
struct __attribute__((packed)) LedCommand {
    bool turnOn;
};

// Response struct matching the master
struct __attribute__((packed)) AckMessage {
    bool success;
};

// Callback when command is received from the Master
void onDataRecv(const uint8_t * mac_addr, const uint8_t *incomingData, int len) {
    if (len != sizeof(LedCommand)) {
        Serial.println("Received invalid command package size.");
        return;
    }
    
    LedCommand cmd;
    memcpy(&cmd, incomingData, sizeof(cmd));
    
    Serial.printf("\nReceived Command: Turn LED %s\n", cmd.turnOn ? "ON" : "OFF");
    
    // Toggle the physical LED pin
    digitalWrite(ONBOARD_LED, cmd.turnOn ? HIGH : LOW);
    
    // Send back an acknowledgment packet to the Master
    AckMessage ack;
    ack.success = true;
    
    esp_now_send(masterMac, (uint8_t *) &ack, sizeof(ack));
    Serial.println("Sent Ack response back to Master.");
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("ESP-NOW Worker Node Initiated.");
    
    pinMode(ONBOARD_LED, OUTPUT);
    digitalWrite(ONBOARD_LED, LOW); // Start with LED OFF
    
    // Set WiFi to Station mode
    WiFi.mode(WIFI_STA);
    
    // Initialize ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("Error initializing ESP-NOW");
        return;
    }
    
    // Register receive callback
    esp_now_register_recv_cb(esp_now_recv_cb_t(onDataRecv));
    
    // Register the Master as a peer to send Ack responses back
    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    memcpy(peerInfo.peer_addr, masterMac, 6);
    peerInfo.channel = 0;
    peerInfo.encrypt = false;
    
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.println("Failed to add Master peer configuration.");
        return;
    }
}

void loop() {
    // Keep loop empty. Everything is handled asynchronously in the callback.
}
```

---

## 6. Verification Checklist
*   [ ] Does the Worker’s onboard blue LED turn ON and OFF every 3 seconds?
*   [ ] Does the Master’s Serial Monitor print `>>> HANDSHAKE ACK RECEIVED FROM WORKER: LED TOGGLED SUCCESSFULLY!`?
*   [ ] If you turn off the Worker node (unplug it), does the Master's monitor display `ESP-NOW Packet Send Status: FAIL`?
