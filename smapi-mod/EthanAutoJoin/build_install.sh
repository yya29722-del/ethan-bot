#!/bin/bash
set -e

GAME="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS"
MOD_DIR="$GAME/Mods/EthanAutoJoin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> Building EthanAutoJoin..."
cd "$SCRIPT_DIR"
dotnet build -c Release

echo ""
echo "==> Installing to Mods folder..."
mkdir -p "$MOD_DIR"
cp bin/Release/net6.0/EthanAutoJoin.dll "$MOD_DIR/"
cp manifest.json "$MOD_DIR/"

echo ""
echo "✓ 安装完成：$MOD_DIR"
echo ""
echo "使用方法："
echo "  1. 启动星露谷（SMAPI）"
echo "  2. 进入存档后按 F5 开启 local co-op"
echo "  3. 等 2 秒，mod 自动模拟手柄按键，加入界面会自动跳过"
echo "  4. 进入角色创建界面，用鼠标/键盘给角色起名 Ethan"
echo "  5. 小人就在地图上了，NagiBridge port 7843 接管控制"
echo ""
echo "如果没反应，按 F8 手动触发一次。"
