#!/usr/bin/env python3
"""
LoverConnect -> Supabase bridge.

Runs on yaya's phone (Termux), not in the cloud — LoverConnect's MCP server
only listens on http://127.0.0.1:5000/mcp, so this has to poll from the same
device. Replaces whatever automation currently writes to phone_activity /
health_data with a live pull from LoverConnect's tools.

First run: use --dry-run to print the raw tool responses before anything
gets written to Supabase. The exact field names inside get_app_timeline /
get_steps are guessed from the README, not verified against a live app —
check --dry-run output and fix TIMELINE_APP_KEY / TIMELINE_START_KEY /
TIMELINE_END_KEY / STEPS_KEY below if they don't match.

Requires: pip install mcp httpx  (inside Termux: pkg install python, then pip)

Env vars required: SUPABASE_URL, SUPABASE_KEY (same names bot.py uses).
"""
import argparse
import asyncio
import json
import os
from datetime import datetime, timezone

import httpx
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

LC_URL = os.environ.get("LOVERCONNECT_URL", "http://127.0.0.1:5000/mcp")
POLL_SECONDS = int(os.environ.get("LC_POLL_SECONDS", "300"))
STATE_FILE = os.path.join(os.path.dirname(__file__), ".lc_sync_state.json")

# Guessed response field names — verify against --dry-run output on first run.
TIMELINE_APP_KEY = "app_name"
TIMELINE_START_KEY = "start"
TIMELINE_END_KEY = "end"
STEPS_KEY = "steps"


def sb_req(path, method="GET", body=None):
    url = os.environ["SUPABASE_URL"] + "/rest/v1/" + path
    headers = {
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
    }
    with httpx.Client(timeout=15) as client:
        if body is not None:
            headers["Content-Type"] = "application/json"
            headers["Prefer"] = "return=minimal"
            r = client.request(method, url, headers=headers, content=json.dumps(body))
        else:
            r = client.request(method, url, headers=headers)
        r.raise_for_status()
        return r.json() if method == "GET" and r.text else None


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"last_timeline_ts": None}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


async def call_tool(session, name, args=None):
    result = await session.call_tool(name, args or {})
    # MCP tool results come back as content blocks; try to parse text as JSON.
    for block in result.content:
        if getattr(block, "type", None) == "text":
            try:
                return json.loads(block.text)
            except json.JSONDecodeError:
                return block.text
    return None


async def sync_once(dry_run: bool, state: dict):
    async with streamablehttp_client(LC_URL) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            timeline = await call_tool(session, "get_app_timeline")
            steps = await call_tool(session, "get_steps")

    if dry_run:
        print("=== get_app_timeline raw ===")
        print(json.dumps(timeline, ensure_ascii=False, indent=2))
        print("=== get_steps raw ===")
        print(json.dumps(steps, ensure_ascii=False, indent=2))
        return state

    # --- app timeline -> phone_activity ---
    entries = timeline if isinstance(timeline, list) else timeline.get("items", [])
    last_ts = state.get("last_timeline_ts")
    new_last_ts = last_ts
    rows = []
    for entry in entries:
        app = entry.get(TIMELINE_APP_KEY)
        start = entry.get(TIMELINE_START_KEY)
        end = entry.get(TIMELINE_END_KEY)
        if not app or not start:
            continue
        if last_ts and start <= last_ts:
            continue
        rows.append({"app_name": app, "opened_at": start})
        if end:
            rows.append({"app_name": f"{app}-关闭", "opened_at": end})
        newest = end or start
        if not new_last_ts or newest > new_last_ts:
            new_last_ts = newest

    if rows:
        sb_req("phone_activity", "POST", rows)
        print(f"synced {len(rows)} phone_activity rows")

    # --- steps -> health_data ---
    step_count = steps.get(STEPS_KEY) if isinstance(steps, dict) else steps
    if step_count is not None:
        sb_req("health_data", "POST", {
            "steps": str(step_count),
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"synced steps={step_count}")

    state["last_timeline_ts"] = new_last_ts
    return state


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="print raw tool output, write nothing")
    parser.add_argument("--once", action="store_true", help="run a single sync instead of looping")
    args = parser.parse_args()

    state = load_state()
    while True:
        try:
            state = await sync_once(args.dry_run, state)
            if not args.dry_run:
                save_state(state)
        except Exception as e:
            print("sync failed:", e)
        if args.once or args.dry_run:
            break
        await asyncio.sleep(POLL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
