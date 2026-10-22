#!/usr/bin/env bash
# ==============================================================================
# ESP32 Wireless OTA (Over-The-Air) Firmware Flasher
# Vemana Institute of Technology - Campus Radio & Announcement System
# ==============================================================================

set -e

ESP_IP="$1"
PASSWORD="${2:-Admin@123}"
BINARY_PATH="$(cd "$(dirname "$0")" && pwd)/build/firmware.bin"

if [ -z "$ESP_IP" ]; then
  echo "❌ Error: ESP32 IP address is required."
  echo "Usage: $0 <ESP_IP_ADDRESS> [PASSWORD]"
  echo "Example: $0 192.168.1.150 Admin@123"
  echo ""
  echo "💡 Tip: You can find the IP address of any ESP on the Admin Portal (/classrooms) or local router."
  exit 1
fi

if [ ! -f "$BINARY_PATH" ]; then
  echo "⚙️ Binary not found. Building firmware with PlatformIO..."
  (cd "$(dirname "$0")" && pio run)
  mkdir -p "$(dirname "$0")/build"
  cp "$(dirname "$0")/.pio/build/esp32dev/firmware.bin" "$BINARY_PATH"
fi

echo "=========================================================="
echo "🚀 Starting Wireless OTA Update to ESP32: http://$ESP_IP"
echo "📦 Binary: $BINARY_PATH ($(ls -lh "$BINARY_PATH" | awk '{print $5}'))"
echo "=========================================================="

# Check if ESP is reachable
echo "📡 Pinging ESP32 at $ESP_IP..."
if ! curl -s --connect-timeout 4 "http://$ESP_IP/" > /dev/null 2>&1; then
  echo "⚠️ Warning: ESP32 at $ESP_IP is not responding on HTTP Port 80."
  echo "Please verify the IP and ensure the ESP is powered on and connected to Wi-Fi."
  exit 1
fi

echo "⚡ Uploading and flashing firmware OTA..."
HTTP_RESPONSE=$(curl -w "\n%{http_code}" -s -u "admin:$PASSWORD" \
  -F "update=@$BINARY_PATH;filename=firmware.bin;type=application/octet-stream" \
  "http://$ESP_IP/update")

HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -n1)
BODY=$(echo "$HTTP_RESPONSE" | head -n -1)

if [ "$HTTP_CODE" -eq 200 ]; then
  echo ""
  echo "✅ OTA Update Successful! HTTP 200 OK"
  echo "🔄 The ESP32 is now rebooting into the new firmware."
  echo "🔵 Heartbeat and mailbox listener will resume in ~5 seconds."
else
  echo ""
  echo "❌ OTA Update Failed (HTTP $HTTP_CODE):"
  echo "$BODY"
  exit 1
fi
