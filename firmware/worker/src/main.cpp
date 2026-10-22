#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiManager.h>
#include <WebServer.h>
#include <Update.h>
#include "Audio.h"
#include "esp_system.h"
#include <time.h>

// ==========================================
// User Wi-Fi & Firebase Configuration
// ==========================================
#define DEFAULT_WIFI_SSID       "Excitel_AARIV TECHNOLOGY "
#define DEFAULT_WIFI_PASSWORD   "1286793808"
#define SETUP_AP_PASSWORD       "CampusAdmin@2026"
#define SETUP_TIMEOUT_SECONDS   180  // 3 minutes auto-timeout watchdog

#define FIREBASE_PROJECT_ID "ai-powered-campus-radio"
#define API_KEY             "AIzaSyBUXhQBeUgO1h3rqBlGg9Dp6JkmL8nLXVw"

// ==========================================
// Hardware Pinout Configuration (I2S DAC, LED & Button)
// ==========================================
#define I2S_DOUT          27   // DIN on MAX98357A
#define I2S_BCLK          26   // BCLK on MAX98357A
#define I2S_LRC           25   // LRC / WSEL on MAX98357A
#define LED_PIN           2    // Onboard Blue LED (ON when Wi-Fi connected & ready)
#define BOOT_BUTTON_PIN   0    // Onboard BOOT Button (Active LOW)

// Polling and heartbeat intervals in milliseconds
#define POLL_INTERVAL       5000   // 5 seconds announcement check
#define HEARTBEAT_INTERVAL  90000  // 90 seconds keep-alive heartbeat

// ==========================================
// Global Variables & State
// ==========================================
WiFiManager wm;
WebServer webServer(80);
Audio audio;

String myMacStr = "";
String myClassroomName = ""; 
String myDocId = "";
String myDepartment = "";
bool resolvedClassroom = false;
unsigned long lastPollTime = 0;
unsigned long lastHeartbeatTime = 0;
bool isPlaying = false;
String currentPlayingDocId = "";
volatile bool trackFinishedNaturally = false;
volatile bool streamConnected = false;
unsigned long playStartTime = 0;

String lastExecutedTaskId = "";

// In-Memory Ring Buffer to Prevent Loop Playback (32 items)
String recentPlayedDocs[32];
int recentPlayedCount = 0;

bool hasPlayedRecently(const String& docId) {
    for (int i = 0; i < recentPlayedCount; i++) {
        if (recentPlayedDocs[i] == docId) return true;
    }
    return false;
}

void markPlayedRecently(const String& docId) {
    if (hasPlayedRecently(docId)) return;
    if (recentPlayedCount < 32) {
        recentPlayedDocs[recentPlayedCount++] = docId;
    } else {
        for (int i = 0; i < 31; i++) recentPlayedDocs[i] = recentPlayedDocs[i+1];
        recentPlayedDocs[31] = docId;
    }
}

// Autonomous AP State
unsigned long wifiDisconnectedSince = 0;
bool softAPActive = false;

// Forward declarations
void updateFirestoreStatus(const String& docId, const String& status);
void checkForNewAnnouncements();
void fetchClassroomName();
void updateClassroomHeartbeat();
void startSecureConfigPortal();
void checkPhysicalSetupButton();
void connectToWiFi();
void setupWebServer();

// ==========================================
// Ultra-Lightweight HTML Stored in Flash Memory (0 Heap RAM)
// ==========================================
static const char INDEX_HTML[] PROGMEM = 
"<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
"<title>Speaker Console</title>"
"<style>"
"body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#f8fafc;padding:16px;margin:0;max-width:420px;margin:auto;}"
".box{background:#1e293b;padding:16px;border-radius:12px;margin-bottom:12px;border:1px solid #334155;}"
"h2{margin:0 0 10px 0;font-size:15px;color:#a855f7;display:flex;align-items:center;gap:6px;}"
".icon{width:16px;height:16px;fill:currentColor;flex-shrink:0;}"
"p{margin:6px 0;font-size:13px;line-height:1.5;color:#cbd5e1;}"
"b{color:#fff;}"
"input{width:100%;box-sizing:border-box;padding:10px;margin:6px 0 10px 0;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#fff;font-size:13px;}"
"button,.btn{display:block;width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:none;background:#7c3aed;color:#fff;font-weight:600;text-align:center;text-decoration:none;margin-top:6px;cursor:pointer;font-size:13px;}"
".btn-red{background:#dc2626;}"
".btn-green{background:#059669;}"
"</style></head><body>"
"<div class='box'>"
"<h2><svg class='icon' viewBox='0 0 24 24'><path d='M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-.83-.51-1.57-1.24-1.85L12 2.5 3.24 6.15zM4 9h16v10H4V9zm3 2a2 2 0 100 4 2 2 0 000-4zm10 0a2 2 0 100 4 2 2 0 000-4z'/></svg> Campus Smart Speaker</h2>"
"<p><b>Classroom:</b> %ROOM%<br><b>MAC:</b> %MAC%<br><b>IP:</b> %IP%<br><b>Wi-Fi:</b> %SSID% (%RSSI% dBm)</p>"
"</div>"
"<div class='box'>"
"<h2><svg class='icon' viewBox='0 0 24 24'><path d='M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98A16.88 16.88 0 0012 4zm0 4.5c3.27 0 6.27 1.25 8.54 3.29L12 20.35 3.46 11.79A12.44 12.44 0 0112 8.5z'/></svg> Change Wi-Fi</h2>"
"<form method='POST' action='/wifi'>"
"<input type='text' name='ssid' placeholder='Wi-Fi Name (SSID)' required>"
"<input type='password' name='password' placeholder='Wi-Fi Password' required>"
"<button type='submit'>Save & Reconnect</button>"
"</form>"
"</div>"
"<div class='box'>"
"<h2><svg class='icon' viewBox='0 0 24 24'><path d='M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z'/></svg> Wireless Firmware Update (OTA)</h2>"
"<form method='POST' action='/update' enctype='multipart/form-data'>"
"<input type='file' name='update' accept='.bin' required style='padding:6px;font-size:12px'>"
"<button type='submit' class='btn btn-green' onclick='return confirm(\"Upload and flash firmware binary OTA?\")'>Flash Firmware OTA</button>"
"</form>"
"</div>"
"<div class='box'>"
"<a href='/reboot' class='btn btn-red' onclick='return confirm(\"Reboot speaker?\")'>Reboot Speaker</a>"
"</div>"
"</body></html>";

// ==========================================
// ESP32-audioI2S Callbacks
// ==========================================

void audio_info(const char *info) {
    Serial.printf("[Audio Info] %s\n", info);
    if (strstr(info, "Connect to") || strstr(info, "HTTP response header") || strstr(info, "stream ready")) {
        streamConnected = true;
    }
}

void audio_bitrate(const char *info) {
    Serial.printf("[Audio Bitrate] %s kbit/s\n", info);
}

void audio_eof_mp3(const char *info) {
    Serial.printf("[Audio EOF] Playback naturally finished: %s\n", info);
    trackFinishedNaturally = true;
}

void audio_showstation(const char *info) {
    Serial.printf("[Audio Station] %s\n", info);
}

// ==========================================
// Wi-Fi Connection & Dual-Mode Provisioning
// ==========================================

void connectToWiFi() {
    Serial.println("\n[Wi-Fi] Initializing network connection...");
    WiFi.mode(WIFI_AP_STA);
    
    wm.setConnectTimeout(15);
    wm.setEnableConfigPortal(false);
    
    Serial.println("Attempting connection with saved Wi-Fi credentials from NVS...");
    bool connected = wm.autoConnect();
    
    // Fallback: If saved Wi-Fi in NVS failed, try the default lab Wi-Fi
    if (!connected && WiFi.status() != WL_CONNECTED) {
        Serial.printf("\n⚠️ Saved Wi-Fi unreachable. Trying default fallback SSID: \"%s\"...\n", DEFAULT_WIFI_SSID);
        WiFi.disconnect();
        delay(500);
        WiFi.begin(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASSWORD);
        int tries = 0;
        while (WiFi.status() != WL_CONNECTED && tries < 20) {
            delay(500);
            Serial.print(".");
            tries++;
        }
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        digitalWrite(LED_PIN, HIGH);
        wifiDisconnectedSince = 0;
        Serial.println("\n✓ Wi-Fi Connected successfully! 🔵 Blue LED is ON.");
        Serial.printf("ESP32 IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("Active SSID: \"%s\"\n", WiFi.SSID().c_str());
    } else {
        digitalWrite(LED_PIN, LOW);
        wifiDisconnectedSince = millis();
        Serial.println("\n⚠️ Wi-Fi connection failed. Device is offline.");
    }
}

// ==========================================
// Embedded Password-Protected Web Console & OTA
// ==========================================

void handleRoot() {
    if (!webServer.authenticate("admin", SETUP_AP_PASSWORD)) {
        return webServer.requestAuthentication();
    }

    String page = String(INDEX_HTML);
    page.replace("%ROOM%", myClassroomName != "" ? myClassroomName : myMacStr);
    page.replace("%MAC%", myMacStr);
    page.replace("%IP%", WiFi.localIP().toString());
    page.replace("%SSID%", WiFi.SSID());
    page.replace("%RSSI%", String(WiFi.RSSI()));

    webServer.send(200, "text/html; charset=utf-8", page);
}

void handleWifiSave() {
    if (!webServer.authenticate("admin", SETUP_AP_PASSWORD)) {
        return webServer.requestAuthentication();
    }

    String newSsid = webServer.arg("ssid");
    String newPass = webServer.arg("password");

    if (newSsid.length() > 0) {
        webServer.send(200, "text/html; charset=utf-8", "<!DOCTYPE html><html><head><meta charset='UTF-8'></head><body style='background:#0f172a;color:#fff;text-align:center;padding:20px;font-family:sans-serif'><h2>Saving Wi-Fi...</h2><p>Rebooting speaker to connect.</p></body></html>");
        delay(1000);

        WiFi.disconnect();
        WiFi.begin(newSsid.c_str(), newPass.c_str());
        ESP.restart();
    } else {
        webServer.send(400, "text/plain; charset=utf-8", "Invalid SSID");
    }
}

void handleReboot() {
    if (!webServer.authenticate("admin", SETUP_AP_PASSWORD)) {
        return webServer.requestAuthentication();
    }

    webServer.send(200, "text/html; charset=utf-8", "<!DOCTYPE html><html><head><meta charset='UTF-8'></head><body style='background:#0f172a;color:#fff;text-align:center;padding:20px;font-family:sans-serif'><h2>Rebooting ESP32...</h2></body></html>");
    delay(1000);
    ESP.restart();
}

void setupWebServer() {
    webServer.on("/", HTTP_GET, handleRoot);
    webServer.on("/wifi", HTTP_POST, handleWifiSave);
    webServer.on("/reboot", HTTP_GET, handleReboot);

    // Wireless Firmware Update (OTA) Route
    webServer.on("/update", HTTP_POST, []() {
        if (!webServer.authenticate("admin", SETUP_AP_PASSWORD)) {
            return webServer.requestAuthentication();
        }
        bool success = !Update.hasError();
        String msg = success ? 
            "<!DOCTYPE html><html><head><meta charset='UTF-8'></head><body style='background:#0f172a;color:#10b981;font-family:sans-serif;text-align:center;padding:24px'><h2>✓ OTA Update Successful!</h2><p>Rebooting speaker into updated firmware...</p></body></html>" : 
            "<!DOCTYPE html><html><head><meta charset='UTF-8'></head><body style='background:#0f172a;color:#ef4444;font-family:sans-serif;text-align:center;padding:24px'><h2>✗ OTA Update Failed!</h2><p>Please check the binary file and try again.</p><br><a href='/' style='color:#a855f7;text-decoration:none'>Back to Console</a></body></html>";
        
        webServer.sendHeader("Connection", "close");
        webServer.send(200, "text/html; charset=utf-8", msg);
        if (success) {
            delay(1000);
            ESP.restart();
        }
    }, []() {
        if (!webServer.authenticate("admin", SETUP_AP_PASSWORD)) {
            return;
        }
        HTTPUpload& upload = webServer.upload();
        if (upload.status == UPLOAD_FILE_START) {
            Serial.printf("\n🚀 [OTA] Receiving new firmware: \"%s\"...\n", upload.filename.c_str());
            if (!Update.begin(UPDATE_SIZE_UNKNOWN)) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_WRITE) {
            if (Update.write(upload.buf, upload.currentSize) != upload.currentSize) {
                Update.printError(Serial);
            }
        } else if (upload.status == UPLOAD_FILE_END) {
            if (Update.end(true)) {
                Serial.printf("✓ [OTA] Flash complete! Total size: %u bytes. Rebooting...\n", upload.totalSize);
            } else {
                Update.printError(Serial);
            }
        }
    });

    webServer.begin();
    Serial.println("✓ Password-Protected Web Console & OTA Server running on port 80 (User: admin / Pass: " SETUP_AP_PASSWORD ")");
}

void startSecureConfigPortal() {
    Serial.println("\n========================================================");
    Serial.println("  🔒 SECURE WI-FI CONFIGURATION PORTAL ACTIVATED       ");
    Serial.println("========================================================");
    
    wm.setConfigPortalTimeout(SETUP_TIMEOUT_SECONDS);
    
    String macSuffix = WiFi.macAddress();
    macSuffix.replace(":", "");
    if (macSuffix.length() >= 4) {
        macSuffix = macSuffix.substring(macSuffix.length() - 4);
    }
    String apSSID = "CampusRadio-Setup-" + macSuffix;
    
    Serial.printf("Hotspot SSID: %s\n", apSSID.c_str());
    Serial.printf("Hotspot WPA2: %s\n", SETUP_AP_PASSWORD);
    Serial.printf("Portal IP:    192.168.4.1\n");
    Serial.printf("Auto-Timeout: %d seconds\n", SETUP_TIMEOUT_SECONDS);
    Serial.println("--------------------------------------------------------");
    
    for (int i = 0; i < 6; i++) {
        digitalWrite(LED_PIN, i % 2 == 0 ? HIGH : LOW);
        delay(100);
    }
    
    bool res = wm.startConfigPortal(apSSID.c_str(), SETUP_AP_PASSWORD);
    
    if (res && WiFi.status() == WL_CONNECTED) {
        Serial.println("\n✅ New Wi-Fi credentials saved to NVS Flash memory!");
        Serial.printf("Connected to new SSID: \"%s\"\n", WiFi.SSID().c_str());
        digitalWrite(LED_PIN, HIGH);
        Serial.println("Restarting ESP32 into normal mode...");
        delay(1000);
        ESP.restart();
    } else {
        Serial.println("\n⏱️ Setup portal closed or timed out.");
        connectToWiFi();
    }
}

void checkPhysicalSetupButton() {
    if (digitalRead(BOOT_BUTTON_PIN) == LOW) {
        Serial.println("\n🔘 [BUTTON] BOOT button pressed! Checking 5-second physical hold...");
        unsigned long pressStart = millis();
        bool heldFor5s = false;
        
        while (digitalRead(BOOT_BUTTON_PIN) == LOW) {
            if (millis() - pressStart >= 5000) {
                heldFor5s = true;
                break;
            }
            digitalWrite(LED_PIN, ((millis() - pressStart) / 150) % 2 == 0 ? HIGH : LOW);
            delay(50);
        }
        
        if (heldFor5s) {
            Serial.println("\n✓ 5-second hold confirmed! Opening Secure Setup Portal...");
            startSecureConfigPortal();
        } else {
            Serial.println("Button released before 5 seconds. Normal operation continues.");
            digitalWrite(LED_PIN, WiFi.status() == WL_CONNECTED ? HIGH : LOW);
        }
    }
}

// ==========================================
// Arduino Setup & Main Loop
// ==========================================

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n========================================================");
    Serial.println("  ESP32 I2S Campus Radio Speaker (Pure Firestore Audio)");
    Serial.println("  Dual-Mode Password-Protected Web Console & OTA Active ");
    Serial.println("========================================================");

    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);
    pinMode(BOOT_BUTTON_PIN, INPUT_PULLUP);

    audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
    audio.setVolume(21);
    audio.setBufsize(8192, 0);

    connectToWiFi();

    myMacStr = WiFi.macAddress();
    myMacStr.toUpperCase();
    Serial.printf("ESP32 Local MAC: %s\n", myMacStr.c_str());

    // Start Web Server immediately on port 80 (accessible via local IP)
    setupWebServer();

    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("Synchronizing time via NTP (pool.ntp.org)...");
        configTime(19800, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
        time_t now = 0;
        int ntpTries = 0;
        while (time(&now) < 1000000000 && ntpTries < 20) {
            delay(250);
            Serial.print(".");
            ntpTries++;
        }
        if (now >= 1000000000) {
            Serial.printf("\n✓ NTP Time Synchronized: Epoch %ld\n", (long)now);
        } else {
            Serial.println("\n⚠️ NTP sync pending, will retry in background.");
        }

        Serial.println("Connecting to Firestore Project: " FIREBASE_PROJECT_ID "...");
        fetchClassroomName();
        resolvedClassroom = true;
        
        updateClassroomHeartbeat();

        // Play System Startup Welcome Audio Chime & Greeting
        Serial.printf("\n🔊 Classroom node online: \"%s\"\n", myClassroomName.c_str());
        String roomName = (myClassroomName != "" && myClassroomName != myMacStr && myClassroomName.indexOf(":") == -1) ? myClassroomName : myDocId;
        if (roomName == "" || roomName == myMacStr || roomName.indexOf(":") != -1) {
            roomName = "Campus Radio";
        }
        roomName.replace(" ", "%20");
        String bootUrl = "https://campus-radio-tts-epbrgtdvatdtcsb5.centralindia-01.azurewebsites.net/tts?text="
                         "Welcome%20to%20Vemana%20Institute%20of%20Technology%20Smart%20Campus%20Audio%20System.%20" +
                         roomName + "%20is%20online%20and%20ready.&voice=en-IN-NeerjaNeural";
        isPlaying = true;
        currentPlayingDocId = "";
        trackFinishedNaturally = false;
        streamConnected = false;
        playStartTime = millis();
        audio.connecttohost(bootUrl.c_str());
    }
}

void loop() {
    checkPhysicalSetupButton();

    // Serve Web Console & OTA requests
    webServer.handleClient();

    // Autonomous AP Fallback Watchdog (if WiFi disconnected > 30 seconds)
    if (WiFi.status() != WL_CONNECTED) {
        digitalWrite(LED_PIN, LOW);
        if (wifiDisconnectedSince == 0) {
            wifiDisconnectedSince = millis();
        } else if (!softAPActive && (millis() - wifiDisconnectedSince > 30000)) {
            softAPActive = true;
            String macSuffix = myMacStr;
            macSuffix.replace(":", "");
            if (macSuffix.length() >= 4) {
                macSuffix = macSuffix.substring(macSuffix.length() - 4);
            }
            String apSSID = "CampusRadio-Speaker-" + macSuffix;
            WiFi.mode(WIFI_AP_STA);
            WiFi.softAP(apSSID.c_str(), SETUP_AP_PASSWORD);
            Serial.printf("\n🚨 [Autonomous AP Watchdog] Wi-Fi lost > 30s. Emergency hotspot \"%s\" active on 192.168.4.1\n", apSSID.c_str());
        }
    } else {
        digitalWrite(LED_PIN, HIGH);
        wifiDisconnectedSince = 0;
        if (softAPActive && !isPlaying) {
            softAPActive = false;
        }
    }

    // Periodically re-check classroom name if unresolved (every 60s, NOT every loop cycle)
    static unsigned long lastClassroomCheck = 0;
    if ((myClassroomName == "" || myClassroomName == myMacStr || !resolvedClassroom) && (millis() - lastClassroomCheck > 60000)) {
        lastClassroomCheck = millis();
        fetchClassroomName();
        if (myClassroomName != "" && myClassroomName != myMacStr) {
            resolvedClassroom = true;
            updateClassroomHeartbeat();
        }
    }

    audio.loop();

    if (isPlaying) {
        if (trackFinishedNaturally) {
            isPlaying = false;
            trackFinishedNaturally = false;
            streamConnected = false;
            audio.stopSong();

            if (currentPlayingDocId != "") {
                Serial.printf("\n✓ Announcement [%s] playback COMPLETED!\n", currentPlayingDocId.c_str());
                markPlayedRecently(currentPlayingDocId);
                updateFirestoreStatus(currentPlayingDocId, "completed");
                currentPlayingDocId = "";
            }
            updateClassroomHeartbeat();
            Serial.println("Resuming cloud announcement listener...\n");
        }
        else if (streamConnected && !audio.isRunning() && (millis() - playStartTime > 4000)) {
            Serial.println("\n✓ Audio stream playback completed.");
            isPlaying = false;
            streamConnected = false;
            audio.stopSong();

            if (currentPlayingDocId != "") {
                markPlayedRecently(currentPlayingDocId);
                updateFirestoreStatus(currentPlayingDocId, "completed");
                currentPlayingDocId = "";
            }
            updateClassroomHeartbeat();
            Serial.println("Resuming cloud announcement listener...\n");
        }
        else if (!streamConnected && (millis() - playStartTime > 25000)) {
            Serial.println("\n⚠️ Audio stream connection timed out after 25s.");
            isPlaying = false;
            streamConnected = false;
            audio.stopSong();

            if (currentPlayingDocId != "") {
                markPlayedRecently(currentPlayingDocId);
                updateFirestoreStatus(currentPlayingDocId, "completed");
                currentPlayingDocId = "";
            }
            updateClassroomHeartbeat();
            Serial.println("Resuming cloud announcement listener...\n");
        }
        return;
    }

    if (millis() - lastPollTime >= POLL_INTERVAL) {
        lastPollTime = millis();
        checkForNewAnnouncements();
    }

    if (millis() - lastHeartbeatTime >= HEARTBEAT_INTERVAL) {
        lastHeartbeatTime = millis();
        updateClassroomHeartbeat();
    }
}

// ==========================================
// Firestore Classroom Mapping & Heartbeat
// ==========================================

void fetchClassroomName() {
    for (int retry = 0; retry < 3; retry++) {
        WiFiClientSecure client;
        client.setInsecure();
        
        HTTPClient http;
        String url = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/classrooms?key=" API_KEY;
        
        if (http.begin(client, url)) {
            int httpCode = http.GET();
            if (httpCode == HTTP_CODE_OK) {
                String payload = http.getString();
                int macIdx = payload.indexOf(myMacStr);
                if (macIdx != -1) {
                    int docStart = payload.lastIndexOf("\"name\": \"projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/classrooms/", macIdx);
                    if (docStart != -1) {
                        int idStart = docStart + strlen("\"name\": \"projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/classrooms/");
                        int idEnd = payload.indexOf("\"", idStart);
                        if (idEnd != -1) {
                            myDocId = payload.substring(idStart, idEnd);
                        }
                    }

                    int docEnd = payload.indexOf("\"name\": \"projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/classrooms/", macIdx + 1);
                    String docChunk = (docEnd == -1) ? (docStart != -1 ? payload.substring(docStart) : payload) : payload.substring(docStart != -1 ? docStart : 0, docEnd);

                    // Extract fields object safely
                    int fieldsIdx = docChunk.indexOf("\"fields\":");
                    if (fieldsIdx != -1) {
                        // Extract human-readable name inside fields.name
                        int fieldNameIdx = docChunk.indexOf("\"name\":", fieldsIdx);
                        if (fieldNameIdx != -1) {
                            int nameValStart = docChunk.indexOf("\"stringValue\": \"", fieldNameIdx);
                            if (nameValStart != -1 && (nameValStart - fieldNameIdx < 60)) {
                                nameValStart += 16;
                                int nameValEnd = docChunk.indexOf("\"", nameValStart);
                                if (nameValEnd != -1) {
                                    myClassroomName = docChunk.substring(nameValStart, nameValEnd);
                                }
                            }
                        }

                        // Extract department if present inside fields.department
                        int deptIdx = docChunk.indexOf("\"department\":", fieldsIdx);
                        if (deptIdx != -1) {
                            int deptValStart = docChunk.indexOf("\"stringValue\": \"", deptIdx);
                            if (deptValStart != -1 && (deptValStart - deptIdx < 60)) {
                                deptValStart += 16;
                                int deptValEnd = docChunk.indexOf("\"", deptValStart);
                                if (deptValEnd != -1) {
                                    myDepartment = docChunk.substring(deptValStart, deptValEnd);
                                }
                            }
                        }
                    }

                    // Default to clean document ID if fields.name was absent
                    if (myClassroomName == "" && myDocId != "") {
                        myClassroomName = myDocId;
                    }

                    resolvedClassroom = true;
                    Serial.printf("🎯 Hardware MAC [%s] mapped to Room: \"%s\" (ID: %s, Dept: %s)\n",
                                  myMacStr.c_str(), myClassroomName.c_str(), myDocId.c_str(), myDepartment.c_str());
                    http.end();
                    client.stop();
                    return;
                }
            }
            http.end();
            client.stop();
        }
        delay(1000);
    }
    
    if (myClassroomName == "" && myDocId != "") {
        myClassroomName = myDocId;
    }
}

void updateClassroomHeartbeat() {
    String targetId = (myDocId != "") ? myDocId : myClassroomName;
    if (targetId == "" || targetId == myMacStr) return;
    
    time_t now = 0;
    time(&now);
    
    if (now < 1577836800) {
        configTime(19800, 0, "pool.ntp.org", "time.google.com", "time.nist.gov");
        time(&now);
        if (now < 1577836800) {
            return;
        }
    }
    
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    String encodedId = targetId;
    encodedId.replace(" ", "%20");
    String url = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/classrooms/" + encodedId + "?updateMask.fieldPaths=lastActive&updateMask.fieldPaths=ipAddress&updateMask.fieldPaths=rssi&updateMask.fieldPaths=ssid&key=" API_KEY;
    
    if (http.begin(client, url)) {
        http.addHeader("Content-Type", "application/json");
        char jsonBody[256];
        snprintf(jsonBody, sizeof(jsonBody),
            "{\"fields\":{\"lastActive\":{\"integerValue\":\"%ld\"},\"ipAddress\":{\"stringValue\":\"%s\"},\"rssi\":{\"integerValue\":\"%d\"},\"ssid\":{\"stringValue\":\"%s\"}}}",
            (long)now, WiFi.localIP().toString().c_str(), WiFi.RSSI(), WiFi.SSID().c_str());
        
        http.PATCH(jsonBody);
        http.end();
        client.stop();
    }
}

// ==========================================
// ==========================================
// Smart Cloud Dedicated Mailbox & Announcement Listener
// ==========================================

void checkForNewAnnouncements() {
    time_t now = 0;
    time(&now);

    WiFiClientSecure client;
    client.setInsecure();
    HTTPClient http;

    // 1. PRIORITY 1: Check Dedicated Classroom Node Task Mailbox (/classrooms/{myDocId})
    String targetId = (myDocId != "") ? myDocId : myClassroomName;
    if (targetId != "" && targetId != myMacStr) {
        String encodedId = targetId;
        encodedId.replace(" ", "%20");
        String nodeUrl = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/classrooms/" + encodedId + "?key=" API_KEY;
        
        if (http.begin(client, nodeUrl)) {
            int code = http.GET();
            if (code == HTTP_CODE_OK) {
                String payload = http.getString();
                int taskIdx = payload.indexOf("\"pendingTask\":");
                if (taskIdx != -1) {
                    int idIdx = payload.indexOf("\"taskId\":", taskIdx);
                    int audioIdx = payload.indexOf("\"audioUrl\":", taskIdx);
                    int timeIdx = payload.indexOf("\"timestamp\":", taskIdx);

                    if (idIdx != -1 && audioIdx != -1) {
                        int idValStart = payload.indexOf("\"stringValue\": \"", idIdx) + 16;
                        int idValEnd = payload.indexOf("\"", idValStart);
                        String incomingTaskId = payload.substring(idValStart, idValEnd);

                        int audioValStart = payload.indexOf("\"stringValue\": \"", audioIdx) + 16;
                        int audioValEnd = payload.indexOf("\"", audioValStart);
                        String audioUrl = payload.substring(audioValStart, audioValEnd);

                        long taskTime = 0;
                        if (timeIdx != -1) {
                            int tValStart = payload.indexOf("\"integerValue\": \"", timeIdx);
                            if (tValStart != -1) {
                                tValStart += 17;
                                int tValEnd = payload.indexOf("\"", tValStart);
                                taskTime = payload.substring(tValStart, tValEnd).toInt();
                            }
                        }

                        // Execute if new task ID and age < 300 seconds
                        if (incomingTaskId != "" && incomingTaskId != lastExecutedTaskId && audioUrl != "") {
                            if (taskTime == 0 || now < 1577836800 || (now - taskTime < 300)) {
                                Serial.printf("\n🎯 [Dedicated Node Task] Received Task [%s] for Room [%s]\n", incomingTaskId.c_str(), myClassroomName.c_str());
                                Serial.printf("Streaming Audio URL: %s\n", audioUrl.c_str());

                                lastExecutedTaskId = incomingTaskId;
                                currentPlayingDocId = incomingTaskId;
                                isPlaying = true;
                                trackFinishedNaturally = false;
                                streamConnected = false;
                                playStartTime = millis();

                                http.end();
                                client.stop();
                                audio.connecttohost(audioUrl.c_str());
                                return;
                            }
                        }
                    }
                }
            }
            http.end();
            client.stop();
        }
    }

    // 2. PRIORITY 2: Check Global Broadcast Channel (/channels/global_broadcast)
    String globalUrl = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/channels/global_broadcast?key=" API_KEY;
    if (http.begin(client, globalUrl)) {
        int code = http.GET();
        if (code == HTTP_CODE_OK) {
            String payload = http.getString();
            int taskIdx = payload.indexOf("\"pendingTask\":");
            if (taskIdx != -1) {
                int idIdx = payload.indexOf("\"taskId\":", taskIdx);
                int audioIdx = payload.indexOf("\"audioUrl\":", taskIdx);
                int timeIdx = payload.indexOf("\"timestamp\":", taskIdx);

                if (idIdx != -1 && audioIdx != -1) {
                    int idValStart = payload.indexOf("\"stringValue\": \"", idIdx) + 16;
                    int idValEnd = payload.indexOf("\"", idValStart);
                    String incomingTaskId = payload.substring(idValStart, idValEnd);

                    int audioValStart = payload.indexOf("\"stringValue\": \"", audioIdx) + 16;
                    int audioValEnd = payload.indexOf("\"", audioValStart);
                    String audioUrl = payload.substring(audioValStart, audioValEnd);

                    long taskTime = 0;
                    if (timeIdx != -1) {
                        int tValStart = payload.indexOf("\"integerValue\": \"", timeIdx);
                        if (tValStart != -1) {
                            tValStart += 17;
                            int tValEnd = payload.indexOf("\"", tValStart);
                            taskTime = payload.substring(tValStart, tValEnd).toInt();
                        }
                    }

                    if (incomingTaskId != "" && incomingTaskId != lastExecutedTaskId && audioUrl != "") {
                        if (taskTime == 0 || now < 1577836800 || (now - taskTime < 300)) {
                            Serial.printf("\n🌐 [Global Broadcast Task] Received Global Task [%s]\n", incomingTaskId.c_str());
                            Serial.printf("Streaming Audio URL: %s\n", audioUrl.c_str());

                            lastExecutedTaskId = incomingTaskId;
                            currentPlayingDocId = incomingTaskId;
                            isPlaying = true;
                            trackFinishedNaturally = false;
                            streamConnected = false;
                            playStartTime = millis();

                            http.end();
                            client.stop();
                            audio.connecttohost(audioUrl.c_str());
                            return;
                        }
                    }
                }
            }
        }
        http.end();
        client.stop();
    }

    // 3. PRIORITY 3: Fallback RunQuery on /announcements
    String queryUrl = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents:runQuery?key=" API_KEY;
    if (http.begin(client, queryUrl)) {
        http.addHeader("Content-Type", "application/json");
        
        const char* postData = "{"
            "\"structuredQuery\":{"
                "\"from\":[{\"collectionId\":\"announcements\"}],"
                "\"where\":{"
                    "\"fieldFilter\":{"
                        "\"field\":{\"fieldPath\":\"status\"},"
                        "\"op\":\"EQUAL\","
                        "\"value\":{\"stringValue\":\"ready\"}"
                    "}"
                "},"
                "\"limit\":10"
            "}"
        "}";

        int httpCode = http.POST(postData);
        if (httpCode == HTTP_CODE_OK) {
            String payload = http.getString();
            
            int docSearchIdx = 0;
            while (true) {
                int docIdx = payload.indexOf("\"document\":", docSearchIdx);
                if (docIdx == -1) break;
                
                int nextDocIdx = payload.indexOf("\"document\":", docIdx + 11);
                String docChunk = (nextDocIdx == -1) ? payload.substring(docIdx) : payload.substring(docIdx, nextDocIdx);
                docSearchIdx = (nextDocIdx == -1) ? payload.length() : nextDocIdx;
                
                int audioUrlIdx = docChunk.indexOf("\"audioUrl\":");
                if (audioUrlIdx != -1) {
                    int valStart = docChunk.indexOf("\"stringValue\": \"", audioUrlIdx) + 16;
                    int valEnd = docChunk.indexOf("\"", valStart);
                    String audioUrl = docChunk.substring(valStart, valEnd);
                    
                    int nameIdx = docChunk.indexOf("\"name\": \"");
                    String docId = "unknown";
                    if (nameIdx != -1) {
                        int idStart = docChunk.indexOf("/announcements/", nameIdx) + 15;
                        int idEnd = docChunk.indexOf("\"", idStart);
                        docId = docChunk.substring(idStart, idEnd);
                    }

                    if (hasPlayedRecently(docId)) {
                        continue;
                    }
                    
                    bool isTargetedToMe = false;
                    int roomsIdx = docChunk.indexOf("\"targetRooms\":");
                    if (roomsIdx == -1) roomsIdx = docChunk.indexOf("\"classes\":");
                    if (roomsIdx == -1) roomsIdx = docChunk.indexOf("\"rooms\":");

                    if (roomsIdx == -1) {
                        isTargetedToMe = true;
                    } else {
                        int arrStart = docChunk.indexOf("\"values\": [", roomsIdx);
                        int arrEnd = (arrStart != -1) ? docChunk.indexOf("]", arrStart) : -1;
                        if (arrStart == -1 || arrEnd == -1) {
                            isTargetedToMe = true;
                        } else {
                            String roomsArrayStr = docChunk.substring(arrStart, arrEnd);
                            if (roomsArrayStr.indexOf("\"All\"") != -1 ||
                                roomsArrayStr.indexOf("\"all\"") != -1 ||
                                roomsArrayStr.indexOf("\"All Classrooms\"") != -1 ||
                                roomsArrayStr.indexOf("\"Campus\"") != -1) {
                                isTargetedToMe = true;
                            } else if (myClassroomName != "" && roomsArrayStr.indexOf("\"" + myClassroomName + "\"") != -1) {
                                isTargetedToMe = true;
                            } else if (myDocId != "" && roomsArrayStr.indexOf("\"" + myDocId + "\"") != -1) {
                                isTargetedToMe = true;
                            } else if (myDepartment != "" && myDepartment != "All" && roomsArrayStr.indexOf("\"" + myDepartment + "\"") != -1) {
                                isTargetedToMe = true;
                            } else if (roomsArrayStr.indexOf("\"" + myMacStr + "\"") != -1) {
                                isTargetedToMe = true;
                            }
                        }
                    }
                    
                    if (isTargetedToMe) {
                        Serial.printf("\n📢 [Announcement Query Match] Playing audio for doc [%s] in [%s]...\n", docId.c_str(), myClassroomName.c_str());
                        Serial.printf("Audio URL: %s\n", audioUrl.c_str());
                        
                        currentPlayingDocId = docId;
                        isPlaying = true;
                        trackFinishedNaturally = false;
                        streamConnected = false;
                        playStartTime = millis();
                        
                        http.end();
                        client.stop();
                        audio.connecttohost(audioUrl.c_str());
                        return;
                    }
                }
            }
        }
        http.end();
        client.stop();
    }
}

void updateFirestoreStatus(const String& docId, const String& status) {
    WiFiClientSecure client;
    client.setInsecure();
    
    HTTPClient http;
    String url = "https://firestore.googleapis.com/v1/projects/" FIREBASE_PROJECT_ID "/databases/(default)/documents/announcements/" + docId + "?updateMask.fieldPaths=status&key=" API_KEY;
    
    if (http.begin(client, url)) {
        http.addHeader("Content-Type", "application/json");
        String jsonBody = "{\"fields\":{\"status\":{\"stringValue\":\"" + status + "\"}}}";
        http.PATCH(jsonBody);
        http.end();
        client.stop();
    }
}
