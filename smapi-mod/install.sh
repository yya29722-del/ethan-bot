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

# ── Mods-ethan (separate Mods dir for Ethan's SMAPI, port 7843) ──────────────
echo ""
echo "==> Setting up Ethan's Mods directory (NagiBridge port 7843)..."
ETHAN_MODS="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods-ethan"

mkdir -p "$ETHAN_MODS/NagiBridge/NagiBridge"
mkdir -p "$ETHAN_MODS/EthanBot"

# Copy EthanBot into Mods-ethan
cp "$MODS_DIR/EthanBot/manifest.json" "$ETHAN_MODS/EthanBot/"
cp "$MODS_DIR/EthanBot/EthanBot.dll"  "$ETHAN_MODS/EthanBot/" 2>/dev/null || true

# Copy NagiBridge and patch port 7842 → 7843 in DLL (stored as UTF-16LE in .NET assembly)
cp "$MODS_DIR/NagiBridge/NagiBridge/manifest.json" "$ETHAN_MODS/NagiBridge/NagiBridge/"
cp "$MODS_DIR/NagiBridge/NagiBridge/config.json"   "$ETHAN_MODS/NagiBridge/NagiBridge/"
python3 - <<'PYEOF'
import os
mods = os.path.expanduser(
    "~/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods"
)
src = f"{mods}/NagiBridge/NagiBridge/NagiBridge.dll"
dst = os.path.expanduser(
    "~/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods-ethan/NagiBridge/NagiBridge/NagiBridge.dll"
)
data   = open(src, 'rb').read()
old    = '7842'.encode('utf-16-le')
new    = '7843'.encode('utf-16-le')
count  = data.count(old)
patched = data.replace(old, new)
open(dst, 'wb').write(patched)
print(f"  NagiBridge.dll patched: {count} occurrence(s) of 7842 → 7843")
PYEOF

# ── EthanNPC (Content Patcher — portrait) ────────────────────────────────────
echo ""
echo "==> Installing EthanNPC portrait mod..."
mkdir -p "$MODS_DIR/EthanNPC/assets"
cp "$REPO/smapi-mod/EthanNPC/manifest.json" "$MODS_DIR/EthanNPC/"
cp "$REPO/smapi-mod/EthanNPC/content.json"  "$MODS_DIR/EthanNPC/"
if [ -f "$REPO/smapi-mod/EthanNPC/assets/Ethan.png" ]; then
  cp "$REPO/smapi-mod/EthanNPC/assets/Ethan.png" "$MODS_DIR/EthanNPC/assets/"
  echo "  Portrait installed."
else
  echo "  ⚠  No portrait yet — put Ethan.png in smapi-mod/EthanNPC/assets/ and re-run."
fi

# ── Python deps ───────────────────────────────────────────────────────────────
echo ""
echo "==> Installing Python dependencies..."
pip3 install anthropic requests --quiet

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Done! To use:                                               ║"
echo "║                                                              ║"
echo "║  1. Start YOUR Stardew Valley (host) normally via Steam.    ║"
echo "║  2. In YOUR game: Multiplayer → Host a new farm.            ║"
echo "║  3. Launch Ethan's SMAPI + agent:                           ║"
echo "║       bash ~/ethan-bot/smapi-mod/launch-ethan.sh            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
