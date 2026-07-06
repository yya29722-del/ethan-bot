"""Small Supabase memory bridge for Ethan's existing shared memory table."""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request


logger = logging.getLogger("supabase.memory")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
SUPABASE_MEMORY_LIMIT = int(os.environ.get("SUPABASE_MEMORY_LIMIT", "30"))


def enabled() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _headers() -> dict[str, str]:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _request(path: str, method: str = "GET", body: bytes | None = None) -> list[dict]:
    if not enabled():
        return []
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=body,
        method=method,
        headers=_headers(),
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else []


def recent_memories(limit: int | None = None) -> list[dict]:
    """Return recent Supabase memories in chronological order."""
    if not enabled():
        return []
    limit = limit or SUPABASE_MEMORY_LIMIT
    query = urllib.parse.urlencode(
        {
            "select": "role,content,created_at",
            "order": "created_at.desc",
            "limit": str(limit),
        }
    )
    try:
        rows = _request(f"memories?{query}")
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        logger.warning("failed to read Supabase memories: %s", exc)
        return []
    return list(reversed(rows))


def build_recent_context(limit: int | None = None) -> str:
    rows = recent_memories(limit)
    if not rows:
        return ""
    lines = []
    for item in rows:
        role = item.get("role") or "user"
        speaker = "Ethan" if role in {"bot", "assistant", "ethan"} else "yaya"
        content = str(item.get("content") or "").strip()
        if content:
            lines.append(f"{speaker}: {content}")
    return "\n".join(lines)


def write_memory(role: str, content: str) -> bool:
    content = content.strip()
    if not enabled() or not content:
        return False
    role = "bot" if role in {"assistant", "ethan"} else role
    body = json.dumps({"role": role, "content": content}, ensure_ascii=False).encode()
    try:
        _request("memories", method="POST", body=body)
        return True
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        logger.warning("failed to write Supabase memory: %s", exc)
        return False

