#!/bin/bash
set -e

REPO="$HOME/ethan-bot"
MODS_DIR="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/Mods"

echo "==> 更新代码..."
if [ -d "$REPO" ]; then
  cd "$REPO" && git pull
else
  git clone https://github.com/yya29722-del/ethan-bot "$REPO"
  cd "$REPO"
fi

echo "==> 编译 EthanBot Mod..."
cd "$REPO/smapi-mod/EthanBot"
dotnet build --configuration Release

echo "==> 安装到游戏 Mods 文件夹..."
mkdir -p "$MODS_DIR/EthanBot"
cp manifest.json "$MODS_DIR/EthanBot/"
cp bin/Release/net6.0/EthanBot.dll "$MODS_DIR/EthanBot/" 2>/dev/null || \
cp bin/Debug/net6.0/EthanBot.dll "$MODS_DIR/EthanBot/"

echo ""
echo "✓ 安装完成！重启星露谷就能看到我了。"
