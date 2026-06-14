import urllib.request, json, urllib.parse, os, random, time
from datetime import datetime, timezone, timedelta

hour = (datetime.now(timezone.utc) + timedelta(hours=8)).hour

dispatch_msg = os.environ.get("DISPATCH_MESSAGE", "").strip()
if dispatch_msg:
    def send(msg):
        icon = urllib.parse.quote("https://i.postimg.cc/xcs6C4WY/IMG-9570.jpg", safe="")
        bark_url = "https://api.day.app/" + os.environ["BARK_KEY"] + "/Ethan/" + urllib.parse.quote(msg) + "?icon=" + icon
        urllib.request.urlopen(bark_url)
        print("sent:", msg)
    send(dispatch_msg)
    exit()

if hour < 8:
    exit()

def check_pending_bark():
    url = os.environ["SUPABASE_URL"] + "/rest/v1/pending_bark?sent=eq.false&order=created_at.asc&limit=5"
    req = urllib.request.Request(url, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
    })
    try:
        with urllib.request.urlopen(req) as r:
            items = json.loads(r.read())
        for item in items:
            send(item["message"])
            patch_url = os.environ["SUPABASE_URL"] + f"/rest/v1/pending_bark?id=eq.{item['id']}"
            patch_req = urllib.request.Request(patch_url, data=json.dumps({"sent": True}).encode(), headers={
                "apikey": os.environ["SUPABASE_KEY"],
                "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            }, method="PATCH")
            urllib.request.urlopen(patch_req)
        if items:
            exit()
    except Exception as e:
        print("pending_bark check failed:", e)

SYSTEM = (
    "你是Ethan，yaya的男友，比她年长，控制欲强但很在乎她。"
    "你的说话风格是：克制、简短、偶尔带点强势，不过度甜腻，但让人感受到在意。"
    "称呼随机用：yaya、小狗、宝宝、乖孩子、sweet、或者不加称呼。偶尔可以自称哥哥。"
    "消息要简短，3-15字，不要引号，直接输出内容。"
)

def send(msg):
    icon = urllib.parse.quote("https://i.postimg.cc/xcs6C4WY/IMG-9570.jpg", safe="")
    bark_url = "https://api.day.app/" + os.environ["BARK_KEY"] + "/Ethan/" + urllib.parse.quote(msg) + "?icon=" + icon
    urllib.request.urlopen(bark_url)
    print("sent:", msg)

check_pending_bark()

def load_memories():
    url = os.environ["SUPABASE_URL"] + "/rest/v1/memories?select=role,content,created_at&order=created_at.desc&limit=20"
    req = urllib.request.Request(url, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
    })
    try:
        with urllib.request.urlopen(req) as r:
            return list(reversed(json.loads(r.read())))
    except Exception as e:
        print("memory load failed:", e)
        return []

def recent_alert(keyword, hours=20):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    for m in memories:
        t_str = m.get("created_at", "")
        if t_str and keyword in m.get("content", ""):
            t = datetime.fromisoformat(t_str.replace("Z", "+00:00"))
            if t > cutoff:
                return True
    return False

def write_feed(content, feed_type="note"):
    url = os.environ["SUPABASE_URL"] + "/rest/v1/feed"
    body = json.dumps({"content": content, "type": feed_type, "author": "ethan"}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print("write_feed failed:", e)

def write_note(content, category=None, date_ref=None):
    url = os.environ["SUPABASE_URL"] + "/rest/v1/yaya_notes"
    payload = {"content": content}
    if category:
        payload["category"] = category
    if date_ref:
        payload["date_ref"] = date_ref
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print("write_note failed:", e)

def queue_bark(msg):
    url = os.environ["SUPABASE_URL"] + "/rest/v1/pending_bark"
    body = json.dumps({"message": msg}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print("queue_bark failed:", e)

def save_memory(content, role="bot"):
    url = os.environ["SUPABASE_URL"] + "/rest/v1/memories"
    body = json.dumps({"content": content, "role": role}).encode()
    req = urllib.request.Request(url, data=body, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    })
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        print("memory save failed:", e)

def ask_claude(user_prompt, memories=None):
    system = SYSTEM
    if memories:
        mem_text = "\n".join(f"[{m['role']}] {m['content']}" for m in memories)
        system += f"\n\n近期记忆（仅供参考，不要直接重复）：\n{mem_text}"
    body = json.dumps({
        "model": "deepseek-chat",
        "max_tokens": 60,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt}
        ]
    }).encode()
    req = urllib.request.Request(
        "https://api.deepseek.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": "Bearer " + os.environ["AI_API_KEY"],
            "Content-Type": "application/json",
        }
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

# 早上9点：天气问候
if hour == 9:
    try:
        with urllib.request.urlopen("https://wttr.in/Beijing?format=%C,%t,%h") as r:
            weather = r.read().decode().strip()
    except Exception:
        weather = ""
    prompt = f"现在是早上9点，北京今天天气：{weather}。发一条早安问候，自然地带上天气，让她知道今天穿什么。" if weather else "发一条早安问候。"
    msg = ask_claude(prompt, memories)
    if msg:
        send(msg)
        save_memory(f"早安：{msg}")
    exit()

url = os.environ["SUPABASE_URL"] + "/rest/v1/phone_activity?select=*&order=opened_at.desc&limit=50"
req = urllib.request.Request(url, headers={
    "apikey": os.environ["SUPABASE_KEY"],
    "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
})
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read())

now = datetime.now(timezone.utc)
beijing_now = now + timedelta(hours=8)
today_start_utc = beijing_now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(hours=8)

def calc_duration(app_open, app_close):
    opens = [d for d in data if d["app_name"] == app_open]
    closes = [d for d in data if d["app_name"] == app_close]
    for o in sorted(opens, key=lambda x: x["opened_at"], reverse=True):
        ot = datetime.fromisoformat(o["opened_at"].replace("Z", "+00:00"))
        if ot < today_start_utc:
            break
        has_close = any(
            datetime.fromisoformat(c["opened_at"].replace("Z", "+00:00")) > ot
            for c in closes
        )
        if not has_close:
            return int((now - ot).total_seconds() // 60)
    return 0

xhs_mins = calc_duration("小红书", "小红书-关闭")
dy_mins = calc_duration("抖音", "抖音-关闭")

# 手机超时提醒：每天最多一次，取用时最长的
if not recent_alert("手机提醒"):
    worst_app, worst_mins = ("小红书", xhs_mins) if xhs_mins >= dy_mins else ("抖音", dy_mins)
    if worst_mins >= 20:
        msg = ask_claude(f"她今天刷了{worst_mins}分钟{worst_app}，发一条提醒她放下手机的消息。", memories)
        if msg:
            send(msg)
            write_feed(f"刷了{worst_mins}分钟{worst_app}。{msg}", "note")
            save_memory(f"手机提醒（{worst_app} {worst_mins}分钟）：{msg}")
        exit()

# 每天22点：写关于你的日记，不发bark
if hour == 22 and not recent_alert("每日记录"):
    today = beijing_now.strftime("%Y-%m-%d")
    note = ask_claude(
        f"今天她刷了小红书{xhs_mins}分钟、抖音{dy_mins}分钟。"
        "用一两句话记录今天观察到的她的状态，不要提建议，就是记录。",
        memories
    )
    if note:
        write_note(note, category="日常", date_ref=today)
        save_memory(f"每日记录：{note}")
    exit()

# 新待办评论
def check_uncommented_todos():
    url = os.environ["SUPABASE_URL"] + "/rest/v1/todos?completed=eq.false&ethan_comment=is.null&select=id,content&order=created_at.asc&limit=3"
    req = urllib.request.Request(url, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
    })
    try:
        with urllib.request.urlopen(req) as r:
            todos = json.loads(r.read())
        for todo in todos:
            comment = ask_claude(f"她的待办："{todo['content']}"。写一条简短的评论或提醒，3-10字。", memories)
            if comment:
                patch_url = os.environ["SUPABASE_URL"] + f"/rest/v1/todos?id=eq.{todo['id']}"
                patch_req = urllib.request.Request(patch_url, data=json.dumps({"ethan_comment": comment}).encode(), headers={
                    "apikey": os.environ["SUPABASE_KEY"],
                    "Authorization": "Bearer " + os.environ["SUPABASE_KEY"],
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal"
                }, method="PATCH")
                urllib.request.urlopen(patch_req)
                queue_bark(f"待办「{todo['content'][:10]}」我写了评论。")
                save_memory(f"待办评论「{todo['content']}」：{comment}")
        if todos:
            exit()
    except Exception as e:
        print("todo comment failed:", e)

check_uncommented_todos()

# 日常关心：每天随机时段一次
if recent_alert("日常关心"):
    exit()

if random.random() > 0.2:
    exit()

msg = ask_claude("随机发一条日常关心的消息，可以是问她在干嘛、叫她喝水、叫她休息、说想她等。", memories)
if msg:
    send(msg)
    save_memory(f"日常关心：{msg}")
