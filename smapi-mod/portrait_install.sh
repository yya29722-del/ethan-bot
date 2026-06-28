#!/bin/bash
# Usage: bash portrait_install.sh /path/to/Ethan.png
set -e

SRC="${1:-$HOME/Desktop/Ethan.png}"
MODS_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods"
DEST="$MODS_DIR/EthanNPC/assets/Ethan.png"

if [ ! -f "$SRC" ]; then
  echo "Error: file not found: $SRC"
  echo "Usage: bash portrait_install.sh /path/to/Ethan.png"
  exit 1
fi

echo "==> Resizing portrait to 128x128..."
python3 - "$SRC" "$DEST" <<'PYEOF'
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGBA")
img = img.resize((128, 128), Image.LANCZOS)
img.save(dst)
print(f"  Saved to: {dst}")
PYEOF

echo "==> Also saving to repo for git..."
REPO_DEST="$HOME/ethan-bot/smapi-mod/EthanNPC/assets/Ethan.png"
python3 - "$SRC" "$REPO_DEST" <<'PYEOF'
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGBA")
img = img.resize((128, 128), Image.LANCZOS)
img.save(dst)
PYEOF

echo ""
echo "Done! Restart the game to see Ethan's portrait."
echo "(If Pillow is missing: pip3 install Pillow)"
