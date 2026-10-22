# 🔊 ESP32 Speaker Node Firmware

This directory contains the production firmware for the **AI-Powered Campus Radio & Announcement System** classroom smart speaker nodes.

Each ESP32 node connects directly to campus Wi-Fi, matches its hardware MAC address to a Firestore classroom document, and streams high-quality Azure Neural TTS audio through an I2S digital-to-analog converter (MAX98357A / PCM5102 DAC).

---

## 📖 First-Time Setup & Flashing Instructions

For complete step-by-step instructions with driver downloads, Arduino IDE library installation, and partition configuration, see the **[ESP32 First-Time Flashing & Firmware Upload Guide](../docs/esp32_first_time_flashing_guide.md)**.

---

## 📌 Hardware Pinout & Wiring

Connect the **MAX98357A** or **PCM5102** I2S DAC to the ESP32 as follows:

| I2S DAC Pin | ESP32 GPIO Pin | Description |
| :--- | :--- | :--- |
| **LRC (WS)** | **GPIO 25** | Left/Right Word Select Clock |
| **BCLK (BCK)** | **GPIO 26** | Continuous Bit Clock |
| **DIN (DOUT)** | **GPIO 27** | Serial Audio Data Input |
| **GND** | **GND** | Ground Plane |
| **VIN / VCC** | **5V** (or 3.3V) | Clean Power Supply Rail |
| **LED** | **GPIO 2** | Blue Status LED (Solid = Online, Blink = Setup) |
| **BOOT** | **GPIO 0** | Hold 5s to open WPA2 captive portal |

---

## 🚀 How to Flash & Run

### Option A: PlatformIO / Terminal CLI (Recommended)
```bash
cd firmware/worker
pio run --target upload
pio device monitor --baud 115200
```

### Option B: Arduino IDE (GUI)
1. Open [`worker/worker.ino`](worker/worker.ino) in Arduino IDE 2.x.
2. In **Tools → Manage Libraries...**, install:
   - **`ESP32-audioI2S`** (by *schreibfaul1*, v3.0.12+)
   - **`WiFiManager`** (by *tzapu*, v2.0.17+)
3. In **Tools Menu**, configure:
   - **Board**: `ESP32 Dev Module`
   - **Partition Scheme**: `Huge APP (3MB No OTA / 1MB SPIFFS)` *(CRITICAL)*
   - **Upload Speed**: `460800`
   - **Port**: Select your ESP32 USB Port (`/dev/cu.usbserial-XXXX` or `COMx`)
4. Click **Upload (➡️)** and open Serial Monitor at **`115200 baud`**.

---

## 📶 Secure Dynamic Wi-Fi Configuration
To change Wi-Fi credentials on-demand without re-flashing:
1. Hold the physical **BOOT button (GPIO 0) for 5 seconds**.
2. Connect your phone/laptop to `CampusRadio-Setup-<MAC>` (Password: `CampusAdmin@2026`).
3. Select your target Wi-Fi network from the scan list and tap **Save**.
4. The ESP32 reboots, connects to the new Wi-Fi, and turns the **Blue LED solid ON (🔵)**.

See [docs/wifi_provisioning_guide.md](../docs/wifi_provisioning_guide.md) for full architecture details.

---

## 🏢 Classroom MAC Address Mapping (Configured in Firestore)

| Classroom Name | Hardware MAC Address |
| :--- | :--- |
| **Seminar Hall 1** | `08:A6:F7:5A:A5:D8` |
| **IoT Lab** | `08:A6:F7:6B:C1:8C` |
| **Lecture Hall 201** | `30:AE:A4:8F:2A:10` |
| **CSE Seminar Hall** | `50:AE:A4:8F:2A:30` |
