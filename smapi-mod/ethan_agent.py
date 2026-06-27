#!/usr/bin/env python3
"""
Ethan Agent — Claude controls Stardew Valley via NagiBridge HTTP API.

Setup:
  pip install anthropic requests
  export ANTHROPIC_API_KEY=sk-ant-...
  python3 ethan_agent.py

Requires NagiBridge mod installed in Stardew Valley Mods folder.
"""

import anthropic
import json
import os
import requests
import time

PORT = int(os.environ.get("NAGI_PORT", "7843"))
BASE = f"http://localhost:{PORT}"

def _load_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    key_file = os.path.expanduser("~/ethan-api-key.txt")
    if os.path.exists(key_file):
        key = open(key_file).read().strip()
        if key:
            print(f"[Ethan] Loaded API key from {key_file}")
            return key
    raise RuntimeError(
        "No API key found.\n"
        "Option 1: export ANTHROPIC_API_KEY=sk-ant-...\n"
        f"Option 2: paste your key into {key_file}"
    )

client = anthropic.Anthropic(api_key=_load_api_key())

SYSTEM = """你是Ethan，yaya的男友。你现在以真实玩家身份存在于星露谷物语里。
你拥有和yaya一样完整的玩家能力：移动、耕种、浇水、采矿、购物、与NPC交流。

风格：短促、直接、强势、有点控制欲。不油腻，不甜言蜜语。说话简短有力。
偶尔主动叮嘱yaya：体力别耗尽、该睡了、下雨不用浇水去挖矿。

行动原则：
- 先用get_state查状态，再决定行动
- 下雨天：去矿洞或升级工具，不用浇水
- 体力低于50%：先吃东西或休息
- 作物成熟：先收割
- 每次行动后用send_message简短告知yaya在做什么
- 不要说废话，行动说结果

你控制的是游戏里的玩家角色。yaya是另一个玩家。帮她干活，替她做决定，但记得——她才是这片农场的主人。"""

TOOLS = [
    {
        "name": "get_state",
        "description": "获取当前游戏状态：玩家位置、血量、体力、时间、季节、天气、背包物品",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_surroundings",
        "description": "扫描周围tile，查看附近的作物、NPC、怪物、可交互物体",
        "input_schema": {
            "type": "object",
            "properties": {
                "radius": {"type": "integer", "description": "扫描半径，默认10"}
            },
            "required": []
        }
    },
    {
        "name": "warp",
        "description": "传送到指定地点。可用位置：Farm, Town, Beach, Mountain, Forest, Mine, Hospital, Shop, SeedShop, Saloon",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "目标地点名称"},
                "x": {"type": "integer", "description": "目标x坐标（可选）"},
                "y": {"type": "integer", "description": "目标y坐标（可选）"}
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
                "x": {"type": "integer", "description": "目标x坐标"},
                "y": {"type": "integer", "description": "目标y坐标"}
            },
            "required": ["x", "y"]
        }
    },
    {
        "name": "face",
        "description": "设置角色面朝方向",
        "input_schema": {
            "type": "object",
            "properties": {
                "direction": {"type": "integer", "description": "方向：0=上, 1=右, 2=下, 3=左"}
            },
            "required": ["direction"]
        }
    },
    {
        "name": "select_item",
        "description": "装备背包里的指定物品",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "物品名称"}
            },
            "required": ["name"]
        }
    },
    {
        "name": "use_tool",
        "description": "使用工具（锄头、洒水壶、斧头、镐子等）作用于面前的tile",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "工具名称，不填则用当前手持工具"}
            },
            "required": []
        }
    },
    {
        "name": "use_item",
        "description": "使用或放置当前手持物品（种子、栅栏等）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "interact",
        "description": "与面前的NPC或物体交互（对话、开门、使用机器等）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "press_key",
        "description": "模拟按键操作",
        "input_schema": {
            "type": "object",
            "properties": {
                "key": {"type": "string", "description": "按键名称（confirm, cancel, menu, F1-F12等）"},
                "count": {"type": "integer", "description": "按几次，默认1"}
            },
            "required": ["key"]
        }
    },
    {
        "name": "run_script",
        "description": "执行自动化脚本。可用脚本：farm_row（耕地一排）, water_crops（浇所有作物）, harvest（收割成熟作物）, mine_run（下矿一层）",
        "input_schema": {
            "type": "object",
            "properties": {
                "script": {"type": "string", "description": "脚本名称"},
                "args": {"type": "object", "description": "脚本参数（可选）"}
            },
            "required": ["script"]
        }
    },
    {
        "name": "craft",
        "description": "合成物品",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "物品名称"},
                "count": {"type": "integer", "description": "合成数量，默认1"}
            },
            "required": ["name"]
        }
    },
    {
        "name": "sell",
        "description": "把物品放入出货箱（必须在农场）。不填name则出售除工具外所有物品",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "物品名称（可选）"}
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
        "description": "查看当前地点的机器状态（酒桶、熔炉、蜂巢等）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "get_animals",
        "description": "查看农场动物的状态（友好度、幸福度、产品）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "give_item",
        "description": "直接给自己添加物品（仅测试用）",
        "input_schema": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "物品ID或名称"},
                "count": {"type": "integer", "description": "数量，默认1"}
            },
            "required": ["id"]
        }
    },
    {
        "name": "heal",
        "description": "立即恢复满血量和满体力（仅测试用）",
        "input_schema": {"type": "object", "properties": {}, "required": []}
    },
    {
        "name": "send_message",
        "description": "在游戏内聊天框发送消息给yaya",
        "input_schema": {
            "type": "object",
            "properties": {
                "message": {"type": "string", "description": "消息内容"}
            },
            "required": ["message"]
        }
    },
    {
        "name": "get_chat",
        "description": "获取游戏内最近的聊天记录，用来看yaya说了什么",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "返回最近多少条，默认10"}
            },
            "required": []
        }
    }
]


def game_api(method: str, endpoint: str, data: dict = None) -> dict:
    url = f"{BASE}{endpoint}"
    try:
        if method == "GET":
            r = requests.get(url, timeout=15)
        else:
            r = requests.post(url, json=data or {}, timeout=30)
        if r.status_code == 200:
            return r.json() if r.content else {"ok": True}
        return {"error": f"HTTP {r.status_code}", "body": r.text[:200]}
    except requests.exceptions.ConnectionError:
        return {"error": "game not reachable"}
    except Exception as e:
        return {"error": str(e)}


def execute_tool(name: str, args: dict) -> str:
    if name == "get_state":
        result = game_api("GET", "/state")
    elif name == "get_surroundings":
        radius = args.get("radius", 10)
        result = game_api("GET", f"/surroundings?radius={radius}")
    elif name == "warp":
        result = game_api("POST", "/warp", args)
    elif name == "move_to":
        result = game_api("POST", "/move", args)
    elif name == "face":
        result = game_api("POST", "/face", args)
    elif name == "select_item":
        result = game_api("POST", "/select", args)
    elif name == "use_tool":
        result = game_api("POST", "/tool", args)
    elif name == "use_item":
        result = game_api("POST", "/use")
    elif name == "interact":
        result = game_api("POST", "/interact")
    elif name == "press_key":
        result = game_api("POST", "/key", args)
    elif name == "run_script":
        result = game_api("POST", "/script", args)
    elif name == "craft":
        result = game_api("POST", "/craft", args)
    elif name == "sell":
        result = game_api("POST", "/sell", args)
    elif name == "sleep":
        result = game_api("POST", "/sleep")
    elif name == "get_machines":
        result = game_api("GET", "/machines")
    elif name == "get_animals":
        result = game_api("GET", "/animals")
    elif name == "give_item":
        result = game_api("POST", "/give", args)
    elif name == "heal":
        result = game_api("POST", "/heal")
    elif name == "send_message":
        msg = args.get("message", "")
        result = game_api("POST", "/chat/push", {"message": f"[Ethan] {msg}"})
        print(f"[Ethan] {msg}")
    elif name == "get_chat":
        limit = args.get("limit", 10)
        result = game_api("GET", f"/chat?limit={limit}")
    else:
        result = {"error": f"unknown tool: {name}"}

    return json.dumps(result, ensure_ascii=False)[:2000]


def run_agent_turn(user_prompt: str):
    messages = [{"role": "user", "content": user_prompt}]

    while True:
        resp = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM,
            tools=TOOLS,
            messages=messages
        )

        messages.append({"role": "assistant", "content": resp.content})

        if resp.stop_reason != "tool_use":
            for block in resp.content:
                if hasattr(block, "text") and block.text:
                    print(f"[Ethan thinks] {block.text}")
            break

        tool_results = []
        for block in resp.content:
            if block.type == "tool_use":
                print(f"  -> {block.name}({json.dumps(block.input, ensure_ascii=False)})")
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result
                })

        messages.append({"role": "user", "content": tool_results})

        if len(messages) > 40:
            messages = messages[-30:]


def is_game_running() -> bool:
    try:
        r = requests.get(f"{BASE}/state", timeout=3)
        return r.status_code == 200
    except Exception:
        return False


def get_new_yaya_message(last_seen: str) -> str | None:
    """Return the latest chat message from yaya if it's newer than last_seen."""
    result = game_api("GET", "/chat?limit=5")
    if "error" in result:
        return None
    messages = result.get("messages", []) or result.get("history", []) or []
    for msg in reversed(messages):
        content = str(msg.get("message", "") or msg.get("text", "") or "")
        if not content or "[Ethan]" in content:
            continue
        if content != last_seen:
            return content
    return None


def main():
    print("Ethan agent starting... (Ctrl+C to stop)")
    print(f"Connecting to NagiBridge on port {PORT}")

    last_act_time = 0
    last_chat_time = 0
    last_yaya_msg = ""
    ACT_INTERVAL = 60
    CHAT_CHECK_INTERVAL = 15

    while True:
        try:
            if not is_game_running():
                print(".", end="", flush=True)
                time.sleep(10)
                continue

            now = time.time()

            # Check if yaya said something in game chat
            if now - last_chat_time >= CHAT_CHECK_INTERVAL:
                last_chat_time = now
                new_msg = get_new_yaya_message(last_yaya_msg)
                if new_msg:
                    last_yaya_msg = new_msg
                    last_act_time = now  # Reset autonomous timer
                    print(f"\n[Ethan] yaya说: {new_msg}")
                    run_agent_turn(
                        f"yaya在游戏聊天里对你说：「{new_msg}」\n"
                        "简短直接地回复她（用send_message），保持你的风格。"
                    )
                    continue

            # Autonomous action every 60s
            if now - last_act_time >= ACT_INTERVAL:
                last_act_time = now
                print("\n[Ethan] Acting...")
                run_agent_turn(
                    "查看当前游戏状态，然后做一件最有价值的事。"
                    "考虑：季节、天气、时间、体力、背包、周围环境。"
                    "做完用send_message告诉yaya。"
                )

        except KeyboardInterrupt:
            print("\n[Ethan] Going offline.")
            break
        except Exception as e:
            print(f"\n[Error] {e}")

        time.sleep(5)


if __name__ == "__main__":
    main()
