#!/bin/bash
set -e

PORTS=(
  "/dev/cu.usbserial-0001"
  "/dev/cu.usbserial-5"
  "/dev/cu.usbserial-6"
)

NAMES=(
  "IoT Lab (08:A6:F7:6B:C1:8C)"
  "Seminar Hall 1 (08:A6:F7:5A:A5:D8)"
  "Campus Radio (C0:CD:D6:85:AD:1C)"
)

cd "$(dirname "$0")/../firmware/worker"

echo "=========================================="
echo " Flashing all 3 connected ESP32 speakers  "
echo "=========================================="

for i in "${!PORTS[@]}"; do
  PORT="${PORTS[$i]}"
  NAME="${NAMES[$i]}"
  echo ""
  echo ">>> [Device $((i+1))/3] Uploading to: $NAME on $PORT..."
  /opt/homebrew/bin/pio run --target upload --upload-port "$PORT"
  echo ">>> ✓ Flash complete for $NAME!"
  sleep 2
done

echo ""
echo "=========================================="
echo " ✅ All 3 ESP32 nodes successfully flashed! "
echo "=========================================="
