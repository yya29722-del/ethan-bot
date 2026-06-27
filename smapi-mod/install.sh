#!/bin/bash
set -e

REPO="$HOME/ethan-bot"
MODS_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods"

# Fix git HTTP/2 issues on Mac
git config --global http.version HTTP/1.1

echo "==> Updating repo..."
if [ -d "$REPO" ]; then
  cd "$REPO" && git pull
else
  git clone https://github.com/yya29722-del/ethan-bot "$REPO"
  cd "$REPO"
fi

# ── EthanBot (NPC companion) ──────────────────────────────────────────────────
echo ""
echo "==> Building EthanBot mod..."
cd "$REPO/smapi-mod/EthanBot"
dotnet build --configuration Release

echo "==> Installing EthanBot..."
mkdir -p "$MODS_DIR/EthanBot"
cp manifest.json "$MODS_DIR/EthanBot/"
cp bin/Release/net6.0/EthanBot.dll "$MODS_DIR/EthanBot/" 2>/dev/null || \
cp bin/Debug/net6.0/EthanBot.dll   "$MODS_DIR/EthanBot/"

# ── NagiBridge (HTTP game control API) ───────────────────────────────────────
echo ""
echo "==> Installing NagiBridge mod..."
NAGI_DIR="$MODS_DIR/NagiBridge"
NAGI_ZIP="/tmp/NagiBridge.zip"

if [ ! -f "$NAGI_DIR/NagiBridge.dll" ]; then
  echo "  Downloading NagiBridge v1.0.0..."
  curl -L "https://github.com/anqinou-art/NagiBridge/releases/download/v1.0.0/NagiBridge.zip" \
       -o "$NAGI_ZIP"
  mkdir -p "$NAGI_DIR"
  unzip -o "$NAGI_ZIP" -d "$NAGI_DIR"
  rm "$NAGI_ZIP"
  echo "  NagiBridge installed."
else
  echo "  NagiBridge already installed, skipping."
fi

# ── Python deps ───────────────────────────────────────────────────────────────
echo ""
echo "==> Installing Python dependencies..."
pip3 install anthropic requests --quiet

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Done! Restart Stardew Valley.                       ║"
echo "║                                                      ║"
echo "║  Then start Ethan:                                   ║"
echo "║    export ANTHROPIC_API_KEY=sk-ant-...               ║"
echo "║    python3 ~/ethan-bot/smapi-mod/ethan_agent.py      ║"
echo "╚══════════════════════════════════════════════════════╝"
