# ESP32 Onboarding - Stage 1: The Blink Test

This stage verifies that your ESP32 board is fully functional, your computer has the correct USB-to-UART drivers, and you can compile and upload programs.

---

## 1. Objectives & Outcome
*   **Objective:** Connect the ESP32 to your computer, compile a basic sketch, and upload it.
*   **Outcome:** The small onboard LED (usually blue) on the ESP32 board blinks on and off every 1 second, confirming the processor and board power systems are working.

---

## 2. Required Hardware
*   1× ESP32 Development Board (e.g. ESP32 DevKit V1)
*   1× Micro-USB or USB-C cable (Must support **data transfer**, not just power/charging)
*   1× Computer (Mac/Windows/Linux)

---

## 3. Step-by-Step Instructions

### Step 1: Install USB Drivers (If Board is Not Detected)
Most ESP32 boards use either the **CP210x** or **CH340** bridge chip to communicate via USB.
*   Connect the ESP32 to your Mac/PC.
*   If your system does not show a new serial port (e.g., `/dev/cu.usbserial-...` on Mac or `COM3` on Windows), download and install the drivers:
    *   [CP210x USB to UART Bridge VCP Drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
    *   [CH340 Driver Download](https://sparks.gogo.co.nz/ch340.html)

### Step 2: Configure Arduino IDE
1.  Open **Arduino IDE**.
2.  Go to **Arduino IDE > Settings** (or **File > Preferences**).
3.  In the "Additional boards manager URLs" field, paste this URL:
    `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
4.  Go to **Tools > Board > Boards Manager...**
5.  Search for **esp32** (by Espressif Systems) and click **Install**.

### Step 3: Select Board & Port
1.  Go to **Tools > Board > esp32 > ESP32 Dev Module** (or your specific board model).
2.  Go to **Tools > Port** and select your connected ESP32 serial port (e.g., `/dev/cu.usbserial-1410`).

### Step 4: Paste & Upload the Code
1.  Copy the code below.
2.  Paste it into the Arduino IDE editor window.
3.  Click the **Upload** button (the arrow pointing right in the top left corner).

---

## 4. Onboarding Code (Blink Test)

```cpp
#include <Arduino.h>

// On most ESP32 boards, the onboard LED is connected to GPIO pin 2.
// If your board does not have a built-in LED on pin 2, replace this number 
// with the correct GPIO pin, or connect an external LED to GPIO 2 with a resistor.
#define ONBOARD_LED 2

void setup() {
    // Configure the LED pin as an OUTPUT
    pinMode(ONBOARD_LED, OUTPUT);
    
    // Start serial communications for debugging
    Serial.begin(115200);
    delay(1000);
    Serial.println("ESP32 Blink Test Initiated!");
}

void loop() {
    // Turn the LED on (HIGH voltage level)
    digitalWrite(ONBOARD_LED, HIGH);
    Serial.println("LED State: ON");
    delay(1000); // Wait for 1 second
    
    // Turn the LED off by making the voltage LOW
    digitalWrite(ONBOARD_LED, LOW);
    Serial.println("LED State: OFF");
    delay(1000); // Wait for 1 second
}
```

---

## 5. Verification Checklist
*   [ ] Did the compilation finish with "Done uploading"?
*   [ ] Is the blue LED blinking?
*   [ ] If you open the Serial Monitor (**Tools > Serial Monitor** and set speed to **115200 baud**), do you see "LED State: ON" and "LED State: OFF" printing in real time?
