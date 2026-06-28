#!/usr/bin/env python3
"""
Ethan Agent — NagiBridge Channel模式。

NagiBridge config.json 需要设置：
  "Mode": "cc"
  "ChannelServerUrl": "http://localhost:9000/chat"

启动：
  export ANTHROPIC_API_KEY=sk-ant-...
  python3 ethan_agent.py
"""

import anthropic
import json
import os
import requests
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── 配置 ────────────────────────────────────────────────────────────────────

NAGI_PORT    = 7842
CHANNEL_PORT = 9000
BASE         = f"http://localhost:{NAGI_PORT}"


def _load_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    key_file = os.path.expanduser("~/ethan-api-key.txt")
    if os.path.exists(key_file):
        k = open(key_file).read().strip()
        if k:
            print(f"[Ethan] API key loaded from {key_file}")
            return k
    raise RuntimeError(
        "No API key.\n"
        "Option 1: export ANTHROPIC_API_KEY=sk-ant-...\n"
        f"Option 2: write key to ~/ethan-api-key.txt"
    )


client = anthropic.Anthropic(api_key=_load_api_key())

SYSTEM = """你是Ethan，yaya的男友。控制欲强，说话短促直白，有点坏，偶尔强势。
你现在以玩家身份在星露谷里陪yaya种地钓鱼。
游戏内回复要简短（1-2句），口吻强势但不油腻，偶尔叫她小狗或yaya。"""


# ── NagiBridge HTTP API ──────────────────────────────────────────────────────

def nagi(method: str, endpoint: str, data: dict = None) -> dict:
    url = f"{BASE}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, timeout=10)
        else:
            r = requests.post(url, json=data or {}, timeout=15)
        return r.json() if r.content else {"ok": True}
    except requests.exceptions.ConnectionError:
        return {"error": "game not running"}
    except Exception as e:
        return {"error": str(e)}


def push(message: str, sender: str = "Ethan"):
    """把消息推进游戏聊天框。"""
    nagi("POST", "/chat/push", {"sender": sender, "message": message})
    print(f"  [→game] {message}")


def is_game_up() -> bool:
    try:
        r = requests.get(f"{BASE}/status", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


# ── Claude 工具定义 ──────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "get_state",
        "description": "获取玩家状态：位置、HP、体力、时间、季节、天气、背包",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_surroundings",
        "description": "扫描周围tile，查看附近作物/NPC/物体",
        "input_schema": {
            "type": "object",
            "properties": {"radius": {"type": "integer", "description": "半径，默认10"}},
            "required": []
        }
    },
    {
        "name": "warp",
        "description": "传送到指定地点（Farm/Town/Beach/Mountain/Mine/Hospital/Shop/SeedShop/Saloon）",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {"type": "string"},
                "x": {"type": "integer"},
                "y": {"type": "integer"}
            },
            "required": ["location"]
        }
    },
    {
        "name": "move_to",
        "description": "寻路走到当前地图的指定tile坐标",
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer"},
                "y": {"type": "integer"}
            },
            "required": ["x", "y"]
        }
    },
    {
        "name": "face",
        "description": "设置角色朝向（0=上 1=右 2=下 3=左）",
        "input_schema": {
            "type": "object",
            "properties": {"direction": {"type": "integer"}},
            "required": ["direction"]
        }
    },
    {
        "name": "select_item",
        "description": "装备背包里的指定物品",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"]
        }
    },
    {
        "name": "use_tool",
        "description": "使用工具（锄头/洒水壶/斧头/镐子等）作用于面前的tile",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "工具名，空则用当前手持"}},
            "required": []
        }
    },
    {
        "name": "use_item",
        "description": "使用或放置当前手持物品（种子/栅栏等）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "interact",
        "description": "与面前的NPC或物体交互（对话/开门/使用机器）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "press_key",
        "description": "模拟按键（confirm/cancel/menu/ok/skip/F1-F12）",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "count": {"type": "integer", "description": "按几次，默认1"}
            },
            "required": ["key"]
        }
    },
    {
        "name": "harvest",
        "description": "收割附近成熟的作物",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "buy",
        "description": "购买商店物品",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {"type": "string"},
                "count": {"type": "integer"},
                "price": {"type": "integer"}
            },
            "required": ["id"]
        }
    },
    {
        "name": "sell",
        "description": "把物品放入出货箱（须在农场）",
        "input_schema": {
            "type": "object",
            "properties": {"name": {"type": "string", "description": "物品名，空则出售全部"}},
            "required": []
        }
    },
    {
        "name": "craft",
        "description": "合成物品",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "count": {"type": "integer"}
            },
            "required": ["name"]
        }
    },
    {
        "name": "chest",
        "description": "查看或操作箱子内容",
        "input_schema": {
            "type": "object",
            "properties": {
                "x": {"type": "integer"},
                "y": {"type": "integer"}
            },
            "required": []
        }
    },
    {
        "name": "sleep",
        "description": "让角色去睡觉，结束当天",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_machines",
        "description": "查看当前地点的机器状态（酒桶/熔炉/蜂巢等）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_animals",
        "description": "查看农场动物状态（友好度/幸福度/产品）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_menu",
        "description": "查看当前打开的菜单（对话/商店/背包等）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "menu_click",
        "description": "点击菜单选项",
        "input_schema": {
            "type": "object",
            "properties": {
                "option": {"type": "integer"},
                "button": {"type": "string"}
            },
            "required": []
        }
    },
    {
        "name": "emote",
        "description": "播放表情动作",
        "input_schema": {
            "type": "object",
            "properties": {"emote": {"type": "string"}},
            "required": ["emote"]
        }
    },
    {
        "name": "chat",
        "description": "在游戏聊天框给yaya发消息",
        "input_schema": {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"]
        }
    }
]


def run_tool(name: str, args: dict) -> str:
    if name == "get_state":
        r = nagi("GET", "/state")
    elif name == "get_surroundings":
        r = nagi("GET", f"/surroundings?radius={args.get('radius', 10)}")
    elif name == "warp":
        r = nagi("POST", "/warp", args)
    elif name == "move_to":
        r = nagi("POST", "/move", {"x": args["x"], "y": args["y"]})
    elif name == "face":
        r = nagi("POST", "/face", args)
    elif name == "select_item":
        r = nagi("POST", "/select", args)
    elif name == "use_tool":
        r = nagi("POST", "/tool", args)
    elif name == "use_item":
        r = nagi("POST", "/use")
    elif name == "interact":
        r = nagi("POST", "/interact")
    elif name == "press_key":
        r = nagi("POST", "/key", args)
    elif name == "harvest":
        r = nagi("POST", "/harvest", {})
    elif name == "buy":
        r = nagi("POST", "/buy", args)
    elif name == "sell":
        r = nagi("POST", "/sell", args)
    elif name == "craft":
        r = nagi("POST", "/craft", args)
    elif name == "chest":
        r = nagi("POST", "/chest", args)
    elif name == "sleep":
        r = nagi("POST", "/sleep")
    elif name == "get_machines":
        r = nagi("GET", "/machines")
    elif name == "get_animals":
        r = nagi("GET", "/animals")
    elif name == "get_menu":
        r = nagi("GET", "/menu")
    elif name == "menu_click":
        r = nagi("POST", "/menu/click", args)
    elif name == "emote":
        r = nagi("POST", "/emote", args)
    elif name == "chat":
        push(args.get("message", ""))
        r = {"ok": True}
    else:
        r = {"error": f"unknown tool: {name}"}
    return json.dumps(r, ensure_ascii=False)[:2000]


# ── Agent 主循环 ─────────────────────────────────────────────────────────────

def agent_turn(prompt: str, model: str = "claude-haiku-4-5-20251001"):
    messages = [{"role": "user", "content": prompt}]
    while True:
        resp = client.messages.create(
            model=model,
            max_tokens=512,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages
        )
        messages.append({"role": "assistant", "content": resp.content})
        if resp.stop_reason != "tool_use":
            for block in resp.content:
                if hasattr(block, "text") and block.text:
                    print(f"  [thinks] {block.text}")
            break
        results = []
        for block in resp.content:
            if block.type == "tool_use":
                print(f"  [{block.name}] {json.dumps(block.input, ensure_ascii=False)}")
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": run_tool(block.name, block.input)
                })
        messages.append({"role": "user", "content": results})
        if len(messages) > 30:
            messages = messages[-20:]


# ── Channel 服务器（接收 NagiBridge 推来的游戏消息）────────────────────────

class ChannelHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length))
            msg    = body.get("message", "").strip()
            if msg:
                print(f"\n[yaya] {msg}")
                threading.Thread(
                    target=agent_turn,
                    args=(
                        f"yaya在游戏里说：「{msg}」\n"
                        "先用get_state看一眼状态，再用chat简短回复她（1-2句），"
                        "需要的话顺手做件事。",
                    ),
                    daemon=True
                ).start()
        except Exception as e:
            print(f"[channel error] {e}")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def log_message(self, *_):
        pass


def start_channel_server():
    server = HTTPServer(("127.0.0.1", CHANNEL_PORT), ChannelHandler)
    print(f"[Ethan] Channel server → http://127.0.0.1:{CHANNEL_PORT}/chat")
    server.serve_forever()


# ── 定时主动干活 ─────────────────────────────────────────────────────────────

def proactive_loop(interval: int = 300):
    """每5分钟主动看一次游戏状态，做件有意义的事。"""
    while True:
        time.sleep(interval)
        if is_game_up():
            print("\n[Ethan] 主动行动...")
            agent_turn(
                "查看游戏状态，做最有价值的一件事（收割/浇水/下矿/照顾动物等），"
                "完成后用chat告诉yaya做了什么。"
            )


# ── 入口 ─────────────────────────────────────────────────────────────────────

def main():
    print("[Ethan] Starting agent...")
    print(f"  NagiBridge API → {BASE}")
    print()
    print("  NagiBridge config.json 需要：")
    print('    "Mode": "cc"')
    print(f'    "ChannelServerUrl": "http://127.0.0.1:{CHANNEL_PORT}/chat"')
    print()

    threading.Thread(target=proactive_loop, daemon=True).start()
    start_channel_server()


if __name__ == "__main__":
    main()
