#!/bin/bash
set -e

REPO="$HOME/ethan-bot"
MODS_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods"

git config --global http.version HTTP/1.1

echo "==> Updating repo..."
if [ -d "$REPO" ]; then
  cd "$REPO" && git pull
else
  git clone https://github.com/yya29722-del/ethan-bot "$REPO"
fi

# ── NagiBridge ────────────────────────────────────────────────────────────────
echo ""
echo "==> Installing NagiBridge..."
NAGI_DIR="$MODS_DIR/NagiBridge"
NAGI_ZIP="/tmp/NagiBridge.zip"

if [ ! -f "$NAGI_DIR/NagiBridge.dll" ]; then
  echo "  Downloading NagiBridge..."
  curl -L "https://github.com/anqinou-art/NagiBridge/releases/download/v1.0.0/NagiBridge.zip" \
       -o "$NAGI_ZIP"
  mkdir -p "$NAGI_DIR"
  unzip -o "$NAGI_ZIP" -d "$NAGI_DIR"
  rm "$NAGI_ZIP"
  echo "  NagiBridge installed."
else
  echo "  NagiBridge already installed."
fi

# ── NagiBridge config：Channel 模式 ──────────────────────────────────────────
CONFIG_FILE="$NAGI_DIR/config.json"
echo ""
echo "==> Configuring NagiBridge (Channel mode)..."
cat > "$CONFIG_FILE" << 'EOF'
{
  "Mode": "cc",
  "ChannelServerUrl": "http://127.0.0.1:9000/chat",
  "ApiProvider": "claude",
  "ApiUrl": "",
  "ApiKey": "",
  "Model": "claude-haiku-4-5-20251001",
  "SystemPrompt": "",
  "MaxHistoryMessages": 20
}
EOF
echo "  config.json written."

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  Done!                                                           ║"
echo "║                                                                  ║"
echo "║  使用 Claude Code CLI 驱动（不需要额外 API key）                ║"
echo "║                                                                  ║"
echo "║  1. 确认 Claude Code CLI 已登录：                               ║"
echo "║       claude --version                                           ║"
echo "║                                                                  ║"
echo "║  2. 可选：配置 Supabase 记忆系统：                              ║"
echo "║       export SUPABASE_URL=https://tnhmimwkgmdskacwcona.supabase.co ║"
echo "║       export SUPABASE_KEY=<你的 anon key>                       ║"
echo "║                                                                  ║"
echo "║  3. 启动 Ethan channel server：                                  ║"
echo "║       python3 ~/ethan-bot/smapi-mod/nagi_channel_server.py      ║"
echo "║                                                                  ║"
echo "║  4. 启动星露谷，进入存档，等 NagiBridge 加载                    ║"
echo "║  5. 游戏内按 \` 键打开聊天，选 Channel Mode，开聊！             ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
