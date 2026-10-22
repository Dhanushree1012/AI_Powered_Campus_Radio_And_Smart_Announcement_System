# ESP32 Onboarding - Stage 2: Reading the MAC Address

This stage shows how to read the unique hardware MAC address of your ESP32. You will need to record the MAC address of all your boards because ESP-NOW routes packets directly to physical MAC addresses.

---

## 1. Objectives & Outcome
*   **Objective:** Upload a diagnostic sketch to fetch the unique hardware ID (MAC Address) of the ESP32 Wi-Fi chip.
*   **Outcome:** The ESP32 prints its MAC address to the Serial Monitor at boot. You record this address to register the board in the database.

---

## 2. Required Hardware
*   1× ESP32 Development Board
*   1× USB Data Cable
*   1× Computer with Arduino IDE

---

## 3. Step-by-Step Instructions

1.  Connect your ESP32 board to your computer.
2.  Open **Arduino IDE**.
3.  Ensure your Board is set to **ESP32 Dev Module** and the correct **Port** is selected under the **Tools** menu.
4.  Copy the code below and paste it into the IDE editor window.
5.  Click the **Upload** button.
6.  Once the upload is complete, open the **Serial Monitor** (magnifying glass icon in top right, or **Tools > Serial Monitor**).
7.  Set the speed dropdown in the bottom right corner of the Serial Monitor to **115200 baud**.
8.  Press the physical **EN** or **RST** button on your ESP32 chip.
9.  The chip will reboot and display its MAC address in the monitor.
10. Copy and write down the MAC address and label the physical board with tape (e.g. "Board A: 24:0A:C4:8A:2B:10").

---

## 4. Onboarding Code (Read MAC Address)

```cpp
#include <Arduino.h>
#include <WiFi.h>

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n---------------------------------");
  Serial.println("ESP32 MAC Address Reader Diagnostic");
  Serial.println("----------------------------------");

  // CRITICAL: Initialize the Wi-Fi hardware to load MAC from eFuse registers
  WiFi.mode(WIFI_STA);
  delay(500);

  // Read and print the unique MAC address
  String macStr = WiFi.macAddress();
  Serial.print("SUCCESS! Your ESP32 MAC Address is: ");
  Serial.println(macStr);
  Serial.println("----------------------------------");
}

void loop() {}
```

---

## 5. Verification Checklist
*   [ ] Does the serial monitor output read: `SUCCESS! Your ESP32 MAC Address is: XX:XX:XX:XX:XX:XX`?
*   [ ] Have you recorded this address? (Note: It must be exactly 6 pairs of hex digits separated by colons).
