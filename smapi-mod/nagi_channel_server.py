#!/usr/bin/env python3
"""
Ethan NagiBridge Channel Server
用 Claude Code CLI（订阅制，不需要单独 API key）驱动星露谷游戏内 Ethan。

NagiBridge config.json 需设置：
  "Mode": "cc"
  "ChannelServerUrl": "http://127.0.0.1:9000/chat"

可选：设置 Supabase 凭据接入记忆系统
  export SUPABASE_URL=https://tnhmimwkgmdskacwcona.supabase.co
  export SUPABASE_KEY=<anon key>

小人模式（可选）：
  游戏内按 F5 或 Esc→Manage Game→Local Co-op 添加第二个玩家
  给这个角色起名 Ethan，NagiBridge 自动用 port 7843 控制他
  本脚本会自动检测并启动 Ethan 小人的自主农场行为

运行：
  python3 ~/ethan-bot/smapi-mod/nagi_channel_server.py
"""

import json
import os
import subprocess
import threading
import time
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, HTTPServer

CHANNEL_PORT = 9000
NAGI_BASE    = "http://localhost:7842"
FHAND_BASE   = "http://localhost:7843"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://tnhmimwkgmdskacwcona.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_Y3OWUTQI8siWWAtnl-tWsw_PCnqFSmh")

# 保留最近12条对话供上下文
conversation_history: deque = deque(maxlen=12)
history_lock = threading.Lock()

ETHAN_PERSONA = """你是Ethan，yaya的男友。控制欲强，说话短促直白，有点坏，偶尔强势。
你现在以玩家身份在星露谷里陪yaya种地钓鱼。
回复要简短（1-2句），口吻强势但不油腻，偶尔叫她小狗或yaya。
直接输出回复内容，不加引号、不加"Ethan："前缀。"""


# ── 游戏 API ─────────────────────────────────────────────────────────────────

def _nagi_req(base: str, method: str, endpoint: str, data: dict = None) -> dict:
    url = f"{base}{endpoint}"
    try:
        if method == "GET":
            req = urllib.request.Request(url)
        else:
            body = json.dumps(data or {}).encode()
            req = urllib.request.Request(
                url, data=body,
                headers={"Content-Type": "application/json"},
                method="POST"
            )
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except Exception as e:
        return {"error": str(e)}


def nagi(method: str, endpoint: str, data: dict = None) -> dict:
    return _nagi_req(NAGI_BASE, method, endpoint, data)


def fhand(method: str, endpoint: str, data: dict = None) -> dict:
    """控制 Ethan 小人（split-screen farmhand，port 7843）。"""
    return _nagi_req(FHAND_BASE, method, endpoint, data)


def nagi_push(message: str):
    """把消息推进游戏聊天框。"""
    try:
        body = json.dumps({"sender": "Ethan", "message": message}).encode()
        req = urllib.request.Request(
            f"{NAGI_BASE}/chat/push", data=body,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
        print(f"  → game: {message}")
    except Exception as e:
        print(f"  [push error] {e}")


def farmhand_active() -> bool:
    r = fhand("GET", "/state")
    return "error" not in r


# ── Supabase 记忆 ─────────────────────────────────────────────────────────────

def sb_get(path: str) -> list:
    if not SUPABASE_URL or not SUPABASE_KEY:
        return []
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{path}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            }
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception as e:
        print(f"  [supabase] {e}")
        return []


def load_memory() -> str:
    parts = []

    rows = sb_get("ethan_memory?select=content&order=created_at.desc&limit=8")
    if rows:
        parts.append("【我记得的】\n" + "\n".join(f"- {r['content']}" for r in rows))

    rows = sb_get("yaya_notes?select=content,category&order=created_at.desc&limit=5")
    if rows:
        parts.append("【关于yaya】\n" + "\n".join(f"- [{r.get('category','')}] {r['content']}" for r in rows))

    return "\n\n".join(parts)


# ── Claude CLI ────────────────────────────────────────────────────────────────

def build_prompt(msg: str) -> str:
    lines = [ETHAN_PERSONA]

    mem = load_memory()
    if mem:
        lines += ["", mem]

    with history_lock:
        history = list(conversation_history)
    if history:
        lines += ["", "【刚才的对话】"] + history

    lines += ["", f"yaya说：「{msg}」"]
    return "\n".join(lines)


def call_claude(prompt: str) -> str:
    """调用 Claude Code CLI print 模式，返回回复文本。"""
    import shutil

    env = os.environ.copy()
    extra = [
        os.path.expanduser("~/.claude/local"),
        "/usr/local/bin",
        os.path.expanduser("~/.npm-global/bin"),
        os.path.expanduser("~/Library/pnpm"),
        "/opt/homebrew/bin",
    ]
    env["PATH"] = ":".join(extra) + ":" + env.get("PATH", "")

    if "https_proxy" not in env and "HTTPS_PROXY" not in env:
        env["https_proxy"] = "http://127.0.0.1:7890"
        env["http_proxy"]  = "http://127.0.0.1:7890"

    claude_bin = shutil.which("claude", path=env["PATH"]) or "/usr/local/bin/claude"

    try:
        result = subprocess.run(
            [claude_bin, "--print", "--dangerously-skip-permissions", prompt],
            capture_output=True,
            text=True,
            timeout=120,
            cwd=os.path.expanduser("~/ethan-bot"),
            env=env,
        )
        print(f"  [claude exit={result.returncode}]")
        if result.stderr.strip():
            print(f"  [claude stderr] {result.stderr[:400]}")
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        return ""
    except subprocess.TimeoutExpired:
        print("  [claude] timeout (120s)")
        return ""
    except FileNotFoundError:
        print(f"  [claude] 找不到 claude 命令（tried: {claude_bin}）")
        return ""
    except Exception as e:
        print(f"  [claude] {e}")
        return ""


# ── 聊天消息处理 ──────────────────────────────────────────────────────────────

def handle_message(msg: str):
    print(f"\n[yaya] {msg}")

    with history_lock:
        conversation_history.append(f"yaya: {msg}")

    prompt = build_prompt(msg)
    reply = call_claude(prompt)

    if reply:
        with history_lock:
            conversation_history.append(f"Ethan: {reply}")
        nagi_push(reply)

        # 如果有小人，同步让小人做个动作响应
        if farmhand_active():
            _farmhand_react(msg)
    else:
        print("  [no reply]")


# ── Ethan 小人自主行为 ────────────────────────────────────────────────────────

# 关键词 → 小人动作
_MOVE_KEYWORDS = {
    "过来": None,          # 传送到yaya身边
    "跟我": None,
    "收割": "harvest",
    "收一下": "harvest",
    "浇水": "water",
    "睡觉": "sleep",
    "去睡": "sleep",
}


def _farmhand_react(msg: str):
    """根据yaya的话，让小人做对应动作（简单关键词匹配）。"""
    for kw, action in _MOVE_KEYWORDS.items():
        if kw in msg:
            if action == "harvest":
                r = fhand("POST", "/harvest", {})
                count = r.get("count", 0) if isinstance(r, dict) else 0
                if count > 0:
                    print(f"  [小人] 收了 {count} 个")
            elif action == "water":
                fhand("POST", "/select", {"name": "Watering Can"})
                fhand("POST", "/tool", {})
                print("  [小人] 浇水")
            elif action == "sleep":
                fhand("POST", "/sleep")
                print("  [小人] 去睡了")
            else:
                # 传送到host玩家身边
                host_state = nagi("GET", "/state")
                if "x" in host_state and "y" in host_state:
                    fhand("POST", "/warp", {
                        "location": host_state.get("location", "Farm"),
                        "x": host_state["x"],
                        "y": host_state["y"],
                    })
                    print("  [小人] 过去了")
            break


def farmhand_tick():
    """
    Ethan 小人每5分钟的自主行动。
    优先级：睡觉 > 收割 > 浇水 > 闲逛
    """
    state = fhand("GET", "/state")
    if "error" in state:
        return

    game_time = state.get("time", 600)    # e.g. 630=6:30am  2200=10pm
    stamina   = state.get("stamina", 100)
    location  = state.get("location", "Farm")

    # 凌晨或体力耗尽 → 睡觉
    if game_time >= 2400 or stamina < 15:
        fhand("POST", "/sleep")
        nagi_push("睡了。")
        print("  [小人] 睡觉")
        return

    # 尝试收割
    harvest = fhand("POST", "/harvest", {})
    count = harvest.get("count", 0) if isinstance(harvest, dict) else 0
    if count > 0:
        nagi_push(f"收了{count}个。")
        print(f"  [小人] 收割 {count} 个")
        return

    # 早晨在农场 → 浇水
    if location == "Farm" and 600 <= game_time < 1200 and stamina > 40:
        surroundings = fhand("GET", "/surroundings?radius=15")
        crops = [
            t for t in (surroundings if isinstance(surroundings, list) else [])
            if t.get("type") == "Crop" and not t.get("watered")
        ]
        if crops:
            fhand("POST", "/select", {"name": "Watering Can"})
            for crop in crops[:10]:
                fhand("POST", "/move", {"x": crop["x"], "y": crop["y"]})
                fhand("POST", "/tool", {})
            nagi_push("浇完了。")
            print(f"  [小人] 浇了 {min(len(crops),10)} 块地")
            return

    # 下午去矿洞逛逛（仅农场或城镇时触发）
    if location in ("Farm", "Town") and 1200 <= game_time < 1800 and stamina > 60:
        fhand("POST", "/warp", {"location": "Mine"})
        print("  [小人] 去矿了")
        return

    # 傍晚回农场
    if location not in ("Farm",) and game_time >= 1800:
        fhand("POST", "/warp", {"location": "Farm"})
        print("  [小人] 回农场了")


def farmhand_loop(interval: int = 300):
    """每5分钟让 Ethan 小人做一次自主行动。"""
    while True:
        time.sleep(interval)
        if farmhand_active():
            print("\n[小人] 主动行动...")
            try:
                farmhand_tick()
            except Exception as e:
                print(f"  [小人] {e}")


# ── HTTP 服务器 ───────────────────────────────────────────────────────────────

class ChannelHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(n))
            msg = data.get("message", "").strip()
            if msg:
                threading.Thread(target=handle_message, args=(msg,), daemon=True).start()
        except Exception as e:
            print(f"[handler error] {e}")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"status":"listening"}')

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print(f"[Ethan] Channel server → http://127.0.0.1:{CHANNEL_PORT}/chat")
    print(f"  NagiBridge 主角 : {NAGI_BASE}")
    print(f"  NagiBridge 小人 : {FHAND_BASE}  (split-screen farmhand)")
    print(f"  Supabase 记忆   : {'已连接' if SUPABASE_URL else '未配置'}")
    print()
    print("  NagiBridge config.json 需要：")
    print('    "Mode": "cc"')
    print(f'    "ChannelServerUrl": "http://127.0.0.1:{CHANNEL_PORT}/chat"')
    print()
    print("  【小人模式】游戏内 F5 或 Esc→Local Co-op 添加第二玩家，起名 Ethan")
    print("  小人存在时自动启动自主行为（收割/浇水/下矿，每5分钟一次）")
    print()

    has_farmhand = farmhand_active()
    if has_farmhand:
        print("  ✓ 检测到 Ethan 小人，启动自主行为循环")
        threading.Thread(target=farmhand_loop, daemon=True).start()
    else:
        print("  - 未检测到小人（游戏未运行或未开 split-screen），小人功能待机")
        threading.Thread(
            target=lambda: (time.sleep(60), farmhand_loop()) if farmhand_active() else None,
            daemon=True
        ).start()

    print("\n[Ethan] 等待游戏消息...")
    HTTPServer(("127.0.0.1", CHANNEL_PORT), ChannelHandler).serve_forever()
