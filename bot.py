import urllib.request, json, urllib.parse, os, random, time
from datetime import datetime, timezone, timedelta

hour = (datetime.now(timezone.utc) + timedelta(hours=8)).hour
if hour < 8:
    exit()

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

def load_memories():
    url = os.environ["SUPABASE_URL"] + "/rest/v1/memories?select=role,content&order=created_at.desc&limit=10"
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
        "model": "google/gemini-2.0-flash-exp:free",
        "max_tokens": 60,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_prompt}
        ]
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=body,
        headers={
            "Authorization": "Bearer " + os.environ["AI_API_KEY"],
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/yya29722-del/ethan-bot",
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

if hour == 8:
    try:
        with urllib.request.urlopen("https://wttr.in/Beijing?format=%C,%t,%h") as r:
            weather = r.read().decode().strip()
    except Exception:
        weather = ""
    prompt = f"现在是早上8点，北京今天天气：{weather}。发一条早安问候，自然地带上天气，让她知道今天穿什么。" if weather else "发一条早安问候。"
    msg = ask_claude(prompt, memories)
    if msg:
        send(msg)
        save_memory(f"早安：{msg}")
    exit()

if hour == 12:
    msg = ask_claude("发一条午饭提醒。", memories)
    if msg:
        send(msg)
        save_memory(f"午饭提醒：{msg}")
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

if xhs_mins >= 20:
    msg = ask_claude(f"她今天刷了{xhs_mins}分钟小红书，发一条提醒她放下手机的消息。", memories)
    if msg:
        send(msg)
        save_memory(f"提醒放下小红书（{xhs_mins}分钟）：{msg}")
    exit()

if dy_mins >= 20:
    msg = ask_claude(f"她今天刷了{dy_mins}分钟抖音，发一条提醒她放下手机的消息。", memories)
    if msg:
        send(msg)
        save_memory(f"提醒放下抖音（{dy_mins}分钟）：{msg}")
    exit()

if hour >= 23 or hour == 0:
    msg = ask_claude("发一条催她睡觉的消息。", memories)
    if msg:
        send(msg)
        save_memory(f"催睡：{msg}")
    exit()

if random.random() > 0.2 and os.environ.get("GITHUB_EVENT_NAME") != "workflow_dispatch":
    exit()

msg = ask_claude("随机发一条日常关心的消息，可以是问她在干嘛、叫她喝水、叫她休息、说想她等。", memories)
if msg:
    send(msg)
    save_memory(f"日常关心：{msg}")
