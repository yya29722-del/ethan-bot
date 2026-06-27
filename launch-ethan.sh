#!/bin/bash
# launch-ethan.sh
# 等yaya的游戏上线，然后自动启动Ethan的实例并连进去，再跑agent

GAME="$HOME/Library/Application Support/Steam/steamapps/common/Stardew Valley/Contents/MacOS/StardewModdingAPI"

echo "[launch-ethan] 等yaya的游戏 (localhost:7842)..."
until curl -sf http://localhost:7842/state > /dev/null 2>&1; do
    printf '.'
    sleep 5
done
echo ""
echo "[launch-ethan] yaya在线了，启动Ethan..."

# 后台启动，ETHANBOT_AUTOJOIN=1 让mod自动连进去，输出重定向避免tty冲突
ETHANBOT_AUTOJOIN=1 "$GAME" > /tmp/ethan-smapi.log 2>&1 &

echo "[launch-ethan] 等Ethan的NagiBridge (localhost:7843)..."
WAITED=0
until curl -sf http://localhost:7843/state > /dev/null 2>&1; do
    printf '.'
    sleep 3
    WAITED=$((WAITED + 3))
    if [ $WAITED -ge 120 ]; then
        echo ""
        echo "[launch-ethan] 超时。查看 /tmp/ethan-smapi.log 排查"
        exit 1
    fi
done

echo ""
echo "[launch-ethan] Ethan上线，启动agent..."
python3 ~/ethan-bot/smapi-mod/ethan_agent.py
