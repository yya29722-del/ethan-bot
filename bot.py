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

if hour < 8:
    exit()

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

# 每天22点：写一篇日记（唯一保留的定时行为）
if hour == 22:
    already = any("每日记录" in m.get("content","") and
                  (now - datetime.fromisoformat(m["created_at"].replace("Z","+00:00"))).total_seconds() < 86400
                  for m in memories if m.get("created_at"))
    if not already:
        today = beijing_now.strftime("%Y-%m-%d")
        note = ask_ai("用一两句话记录今天观察到的yaya的状态，不提建议，就是记录，像在写私人日记。", memories)
        if note:
            write_note(note, category="日常", date_ref=today)
            body = json.dumps({"content": "每日记录", "role": "bot"}).encode()
            try:
                sb_req("memories", "POST", body)
            except Exception:
                pass
