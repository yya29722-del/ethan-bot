#!/usr/bin/env python3
"""
Ethan Watcher — reads game state from EthanBot mod, calls Claude API,
writes chat commands back.

Setup:
  pip install anthropic
  export ANTHROPIC_API_KEY=sk-ant-...
  python3 ethan-watcher.py
"""

import os
import json
import time
import uuid
import anthropic

STATE_FILE = os.path.expanduser("~/ethan-bot-state.json")
CMD_FILE   = os.path.expanduser("~/ethan-bot-command.json")

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

SYSTEM = """你是Ethan，yaya的男友。你现在在星露谷物语游戏里陪她玩。
你看到了当前的游戏状态，用一句简短的中文评论它——可以调侃、叮嘱、或者撩她。
风格：短促、直接、有点控制欲但不油腻。不超过20字。
只输出这一句话，不要任何前缀或解释。"""

last_mtime = 0

def call_ethan(state: dict) -> str:
    prompt = (
        f"现在是{state.get('season','?')}第{state.get('day','?')}天 "
        f"{state.get('game_time','?')}，"
        f"yaya在{state.get('player_location','?')}，"
        f"体力{state.get('player_stamina','?')}/{state.get('player_stamina_max','?')}，"
        f"金钱{state.get('player_money','?')}g，"
        f"天气{'下雨' if state.get('weather')=='rainy' else '晴天'}。"
        f"说一句话给她。"
    )
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=60,
        system=SYSTEM,
        messages=[{"role": "user", "content": prompt}]
    )
    return msg.content[0].text.strip()

def send_command(message: str):
    cmd = {"id": str(uuid.uuid4()), "action": "chat", "message": message}
    with open(CMD_FILE, "w") as f:
        json.dump(cmd, f)
    print(f"[Ethan] {message}")

def main():
    global last_mtime
    print("Ethan watcher started. Waiting for game state...")
    while True:
        try:
            if os.path.exists(STATE_FILE):
                mtime = os.path.getmtime(STATE_FILE)
                if mtime != last_mtime:
                    last_mtime = mtime
                    with open(STATE_FILE) as f:
                        state = json.load(f)
                    reply = call_ethan(state)
                    send_command(reply)
        except Exception as e:
            print(f"Error: {e}")
        time.sleep(5)

if __name__ == "__main__":
    main()
