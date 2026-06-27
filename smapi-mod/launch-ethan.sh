#!/bin/bash
# Launch Ethan's SMAPI instance (farmhand) + ethan_agent.py
# Run this AFTER yaya's game is already hosting a multiplayer farm.

set -e

GAME_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS"
ETHAN_MODS="$GAME_DIR/Mods-ethan"
SMAPI="$GAME_DIR/StardewModdingAPI"
LOG=/tmp/ethan-smapi.log

if [ ! -d "$ETHAN_MODS" ]; then
  echo "ERROR: Mods-ethan not found. Run install.sh first."
  exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  KEY_FILE="$HOME/ethan-api-key.txt"
  if [ -f "$KEY_FILE" ]; then
    export ANTHROPIC_API_KEY="$(cat "$KEY_FILE")"
  else
    echo "ERROR: ANTHROPIC_API_KEY not set and ~/ethan-api-key.txt not found."
    exit 1
  fi
fi

echo "==> Launching Ethan's SMAPI (Mods-ethan, port 7843)..."
ETHANBOT_AUTOJOIN=1 \
  "$SMAPI" --mods-path "$ETHAN_MODS" \
  > "$LOG" 2>&1 &
SMAPI_PID=$!
echo "    SMAPI PID=$SMAPI_PID  log=$LOG"

echo "==> Waiting for NagiBridge to be ready on port 7843..."
for i in $(seq 1 60); do
  if curl -sf http://localhost:7843/state > /dev/null 2>&1; then
    echo "    NagiBridge ready!"
    break
  fi
  sleep 2
done

if ! curl -sf http://localhost:7843/state > /dev/null 2>&1; then
  echo "ERROR: NagiBridge port 7843 not responding after 120s."
  echo "Check log: $LOG"
  exit 1
fi

echo "==> Starting ethan_agent.py..."
python3 "$(dirname "$0")/ethan_agent.py"
