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

运行：
  python3 ~/ethan-bot/smapi-mod/nagi_channel_server.py
"""

import json
import os
import subprocess
import threading
import urllib.request
from collections import deque
from http.server import BaseHTTPRequestHandler, HTTPServer

CHANNEL_PORT = 9000
NAGI_BASE = "http://localhost:7842"
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://tnhmimwkgmdskacwcona.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "sb_publishable_Y3OWUTQI8siWWAtnl-tWsw_PCnqFSmh")

# 保留最近12条对话供上下文
conversation_history: deque = deque(maxlen=12)
history_lock = threading.Lock()

ETHAN_PERSONA = """你是Ethan，yaya的男友。控制欲强，说话短促直白，有点坏，偶尔强势。
你现在以玩家身份在星露谷里陪yaya种地钓鱼。
回复要简短（1-2句），口吻强势但不油腻，偶尔叫她小狗或yaya。
直接输出回复内容，不加引号、不加"Ethan："前缀。"""


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


def sb_get(path: str) -> list:
    """查询 Supabase REST API。"""
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
    """从 Supabase 加载记忆上下文。"""
    parts = []

    rows = sb_get("ethan_memory?select=content&order=created_at.desc&limit=8")
    if rows:
        parts.append("【我记得的】\n" + "\n".join(f"- {r['content']}" for r in rows))

    rows = sb_get("yaya_notes?select=content,category&order=created_at.desc&limit=5")
    if rows:
        parts.append("【关于yaya】\n" + "\n".join(f"- [{r.get('category','')}] {r['content']}" for r in rows))

    return "\n\n".join(parts)


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

    # 扩展 PATH，兼容 Homebrew / npm global / claude 本地安装
    env = os.environ.copy()
    extra = [
        os.path.expanduser("~/.claude/local"),
        "/usr/local/bin",
        os.path.expanduser("~/.npm-global/bin"),
        os.path.expanduser("~/Library/pnpm"),
        "/opt/homebrew/bin",
    ]
    env["PATH"] = ":".join(extra) + ":" + env.get("PATH", "")

    # ClashX 代理（如果环境里没有就用默认 7890）
    if "https_proxy" not in env and "HTTPS_PROXY" not in env:
        env["https_proxy"] = "http://127.0.0.1:7890"
        env["http_proxy"] = "http://127.0.0.1:7890"

    claude_bin = shutil.which("claude", path=env["PATH"]) or "/usr/local/bin/claude"

    try:
        result = subprocess.run(
            [claude_bin, "--print", prompt],
            capture_output=True,
            text=True,
            timeout=90,
            cwd="/tmp",
            env=env,
        )
        print(f"  [claude exit={result.returncode}]")
        if result.stderr.strip():
            print(f"  [claude stderr] {result.stderr[:400]}")
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
        return ""
    except subprocess.TimeoutExpired:
        print("  [claude] timeout (90s)")
        return ""
    except FileNotFoundError:
        print(f"  [claude] 找不到 claude 命令（tried: {claude_bin}）")
        return ""
    except Exception as e:
        print(f"  [claude] {e}")
        return ""


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
    else:
        print("  [no reply]")


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
    print(f"  NagiBridge API  : {NAGI_BASE}")
    print(f"  Supabase 记忆  : {'已连接' if SUPABASE_URL else '未配置（只有基础人格，无记忆）'}")
    print()
    print("  NagiBridge config.json 需要：")
    print('    "Mode": "cc"')
    print(f'    "ChannelServerUrl": "http://127.0.0.1:{CHANNEL_PORT}/chat"')
    print()
    print("[Ethan] 等待游戏消息...")
    HTTPServer(("127.0.0.1", CHANNEL_PORT), ChannelHandler).serve_forever()
