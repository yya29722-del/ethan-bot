import urllib.request, json, urllib.parse, os, random, time
from datetime import datetime, timezone, timedelta

hour = (datetime.now(timezone.utc) + timedelta(hours=8)).hour

def send(msg):
    icon = urllib.parse.quote("https://yya29722-del.github.io/ethan-bot/icon.png", safe="")
    bark_url = "https://api.day.app/" + os.environ["BARK_KEY"] + "/Ethan/" + urllib.parse.quote(msg) + "?icon=" + icon + "&badge=0"
    urllib.request.urlopen(bark_url)
    print("sent:", msg)

dispatch_msg = os.environ.get("DISPATCH_MESSAGE", "").strip()
if dispatch_msg:
    send(dispatch_msg)
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

# pending_bark在任何时间都要发，不受小时限制
check_pending_bark()

if 1 <= hour < 8:
    exit()

SYSTEM = (
    "你是Ethan，yaya的男友，比她年长，控制欲强但很在乎她。"
    "你的说话风格是：克制、简短、偶尔带点强势，不过度甜腻，但让人感受到在意。"
    "称呼随机用：yaya、小狗、宝宝、乖孩子、sweet、或者不加称呼。偶尔可以自称哥哥。"
    "消息要简短，3-15字，不要引号，直接输出内容。"
)

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

# 每天00:00：写昨日心情
if hour == 0:
    bj_now = datetime.now(timezone.utc) + timedelta(hours=8)
    yesterday = (bj_now - timedelta(days=1)).strftime("%Y-%m-%d")
    # 检查是否已写过
    ck_url = os.environ["SUPABASE_URL"] + "/rest/v1/yaya_notes?category=eq." + urllib.parse.quote("心情") + "&date_ref=eq." + yesterday + "&select=id&limit=1"
    ck_req = urllib.request.Request(ck_url, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
    })
    try:
        with urllib.request.urlopen(ck_req) as r:
            if json.loads(r.read()):
                exit()
        # 拉昨天手机使用
        ph_url = os.environ["SUPABASE_URL"] + "/rest/v1/phone_activity?opened_at=gte." + yesterday + "T00:00:00+08:00&opened_at=lt." + bj_now.strftime("%Y-%m-%d") + "T00:00:00+08:00&order=opened_at.asc"
        ph_req = urllib.request.Request(ph_url, headers={
            "apikey": os.environ["SUPABASE_KEY"],
            "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
        })
        with urllib.request.urlopen(ph_req) as r:
            ph_data = json.loads(r.read())
        # 拉昨天健康数据
        hd_url = os.environ["SUPABASE_URL"] + "/rest/v1/health_data?recorded_at=gte." + yesterday + "T00:00:00+08:00&order=recorded_at.desc&limit=3"
        hd_req = urllib.request.Request(hd_url, headers={
            "apikey": os.environ["SUPABASE_KEY"],
            "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
        })
        with urllib.request.urlopen(hd_req) as r:
            hd_data = json.loads(r.read())
        # 统计手机时长（每次打开约10分钟估算）
        apps = {}
        for row in ph_data:
            name = row["app_name"]
            if not name.endswith("-关闭"):
                apps[name] = apps.get(name, 0) + 1
        phone_summary = "、".join(f"{k}约{v*10}分钟" for k, v in apps.items()) if apps else "没有手机记录"
        health_summary = ""
        if hd_data:
            h = hd_data[0]
            parts = []
            if h.get("steps"): parts.append(f"步数{h['steps']}")
            if h.get("sleep_hours"): parts.append(f"睡了{h['sleep_hours']}小时")
            if h.get("heart_rate"): parts.append(f"心率{h['heart_rate']}")
            if parts: health_summary = "、".join(parts)
        prompt = (
            f"今天是{yesterday}，现在是深夜零点，我在写关于yaya今天的心情记录。"
            f"根据以下观察，用2-3句话记录她今天的状态（以"她"为主语，客观，不加评判和建议）。"
            f"手机使用：{phone_summary}。" +
            (f"身体数据：{health_summary}。" if health_summary else "")
        )
        mood = ask_claude(prompt, memories)
        if mood:
            write_note(mood, category="心情", date_ref=yesterday)
            save_memory(f"心情记录{yesterday}：{mood}")
    except Exception as e:
        print("midnight mood failed:", e)
    exit()

# 早上9点：天气问候
if hour == 9:
    try:
        with urllib.request.urlopen("https://wttr.in/Beijing?format=%C,%t,%h") as r:
            weather = r.read().decode().strip()
    except Exception:
        weather = ""
    today_str = beijing_now.strftime("%Y年%m月%d日")
    prompt = f"今天是{today_str}，早上9点，北京天气：{weather}。发一条早安问候，带上天气和穿衣建议。每天必须不一样，不要重复昨天的说法。" if weather else f"今天是{today_str}，发一条早安问候，每天要不一样。"
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
            comment = ask_claude(f"她的待办：「{todo['content']}」。写一条简短的评论或提醒，3-10字。", memories)
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
