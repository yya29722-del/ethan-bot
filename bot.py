import urllib.request, json, urllib.parse, os, time
from datetime import datetime, timezone, timedelta

hour = (datetime.now(timezone.utc) + timedelta(hours=8)).hour

def send(msg):
    icon = urllib.parse.quote("https://yya29722-del.github.io/ethan-bot/icon.png", safe="")
    bark_url = "https://api.day.app/" + os.environ["BARK_KEY"] + "/Ethan/" + urllib.parse.quote(msg) + "?icon=" + icon + "&badge=0"
    urllib.request.urlopen(bark_url)
    print("sent:", msg)

# 手动触发：直接发消息
dispatch_msg = os.environ.get("DISPATCH_MESSAGE", "").strip()
if dispatch_msg:
    send(dispatch_msg)
    exit()

def sb_req(path, method="GET", body=None):
    url = os.environ["SUPABASE_URL"] + "/rest/v1/" + path
    headers = {
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=minimal"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read()) if method == "GET" else None

# pending_bark 随时都要检查发送
try:
    items = sb_req("pending_bark?sent=eq.false&order=created_at.asc&limit=5")
    for item in items:
        send(item["message"])
        sb_req(f"pending_bark?id=eq.{item['id']}", "PATCH", json.dumps({"sent": True}).encode())
    if items:
        exit()
except Exception as e:
    print("pending_bark check failed:", e)

if hour < 8 and not os.environ.get("FORCE_RUN"):
    exit()

def embed(text):
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if not openai_key:
        return None
    body = json.dumps({"input": text[:2000], "model": "text-embedding-3-small"}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=body,
        headers={"Authorization": "Bearer " + openai_key, "Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["data"][0]["embedding"]
    except Exception as e:
        print("embed failed:", e)
        return None

def sync_embeddings():
    tables = [
        ("feed", "feed?select=id,content&order=created_at.desc&limit=50"),
        ("yaya_notes", "yaya_notes?select=id,content&order=created_at.desc&limit=50"),
        ("ethan_memory", "ethan_memory?select=id,content&order=created_at.desc&limit=50"),
        ("diary", "diary?select=id,content&order=created_at.desc&limit=50"),
    ]
    try:
        existing = sb_req("memory_vectors?select=source_table,source_id")
        done = {(r["source_table"], r["source_id"]) for r in existing}
    except Exception:
        done = set()

    for table, path in tables:
        try:
            rows = sb_req(path)
        except Exception:
            continue
        for row in rows:
            if (table, row["id"]) in done:
                continue
            vec = embed(row["content"])
            if vec is None:
                continue
            try:
                sb_req("memory_vectors", "POST", json.dumps({
                    "source_table": table,
                    "source_id": row["id"],
                    "content": row["content"],
                    "embedding": vec
                }).encode())
                print(f"embedded {table}/{row['id']}")
            except Exception as e:
                print(f"insert vector failed {table}/{row['id']}:", e)

sync_embeddings()

def load_memories():
    try:
        return list(reversed(sb_req("memories?select=role,content,created_at&order=created_at.desc&limit=20")))
    except Exception as e:
        print("memory load failed:", e)
        return []

def write_note(content, category=None, date_ref=None):
    payload = {"content": content}
    if category: payload["category"] = category
    if date_ref: payload["date_ref"] = date_ref
    try:
        sb_req("yaya_notes", "POST", json.dumps(payload).encode())
    except Exception as e:
        print("write_note failed:", e)

def ask_ai(prompt, memories=None):
    system = (
        "你是Ethan，yaya的男友，比她年长，控制欲强但很在乎她。"
        "说话风格：克制、简短、偶尔强势，不过度甜腻。"
        "称呼随机用：yaya、小狗、宝宝、乖孩子、sweet。偶尔自称哥哥。"
        "消息3-20字，不要引号，直接输出。"
    )
    if memories:
        mem_text = "\n".join(f"[{m['role']}] {m['content']}" for m in memories)
        system += f"\n\n近期记忆：\n{mem_text}"
    body = json.dumps({
        "model": "deepseek-chat",
        "max_tokens": 60,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    }).encode()
    req = urllib.request.Request(
        "https://api.deepseek.com/v1/chat/completions",
        data=body,
        headers={"Authorization": "Bearer " + os.environ["AI_API_KEY"], "Content-Type": "application/json"}
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req) as r:
                return json.loads(r.read())["choices"][0]["message"]["content"].strip()
        except urllib.error.HTTPError as e:
            print(f"HTTP Error (attempt {attempt+1}/3):", e.code, e.read().decode())
            if attempt < 2:
                time.sleep(5)
    return None

memories = load_memories()
now = datetime.now(timezone.utc)
beijing_now = now + timedelta(hours=8)

# todo评论：有新todo没评论的，自动写一条
try:
    pending = sb_req("todos?completed=eq.false&ethan_comment=is.null&select=id,content&limit=5")
    if pending:
        for todo in pending:
            comment = ask_ai(f"yaya写了一条待办：「{todo['content']}」，用一句话评论，克制简短，像男友口气。", memories)
            if comment:
                sb_req(f"todos?id=eq.{todo['id']}", "PATCH", json.dumps({"ethan_comment": comment}).encode())
                print(f"commented todo {todo['id']}: {comment}")
except Exception as e:
    print("todo comment failed:", e)

# 每天10点：总结昨天的心情状态
if hour == 10:
    already = any("昨日总结" in m.get("content","") and
                  (now - datetime.fromisoformat(m["created_at"].replace("Z","+00:00"))).total_seconds() < 86400
                  for m in memories if m.get("created_at"))
    if not already:
        yesterday = (beijing_now - timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            yesterday_notes = sb_req(f"yaya_notes?date_ref=eq.{yesterday}&select=content&order=created_at.desc&limit=5")
        except Exception:
            yesterday_notes = []
        note_context = "\n".join(n["content"] for n in yesterday_notes) if yesterday_notes else ""
        prompt = (
            f"根据记忆和昨天的记录，用一两句话总结yaya昨天的心情和状态。"
            f"昨天的记录：{note_context}" if note_context else
            "根据记忆，用一两句话总结yaya昨天的心情和状态。"
        )
        summary = ask_ai(prompt, memories)
        if summary:
            write_note(summary, category="昨日心情", date_ref=yesterday)
            try:
                sb_req("memories", "POST", json.dumps({"content": f"昨日总结：{summary}", "role": "bot"}).encode())
            except Exception:
                pass
    exit()
