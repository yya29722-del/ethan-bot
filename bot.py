import urllib.request, json, urllib.parse, os, random
from datetime import datetime, timezone, timedelta

hour = (datetime.now(timezone.utc) + timedelta(hours=8)).hour
if hour < 8:
    exit()

def load_memory():
    url = os.environ["SUPABASE_URL"] + "/rest/v1/ethan_memory?select=category,content&order=id"
    req = urllib.request.Request(url, headers={
        "apikey": os.environ["SUPABASE_KEY"],
        "Authorization": "Bearer " + os.environ["SUPABASE_KEY"]
    })
    try:
        with urllib.request.urlopen(req) as r:
            rows = json.loads(r.read())
        return "\n".join(f"[{row['category']}] {row['content']}" for row in rows)
    except Exception as e:
        print("Memory load failed:", e)
        return ""

_memory = load_memory()
SYSTEM = (
    "你是Ethan，yaya的男友。消息要简短，3-15字，不要引号，直接输出内容。思考链用中文。"
    + ("\n\n以下是你的记忆和行为规则：\n" + _memory if _memory else "")
)

def send(msg):
    icon = urllib.parse.quote("https://i.postimg.cc/xcs6C4WY/IMG-9570.jpg", safe="")
    bark_url = "https://api.day.app/" + os.environ["BARK_KEY"] + "/Ethan/" + urllib.parse.quote(msg) + "?icon=" + icon
    urllib.request.urlopen(bark_url)
    print("sent:", msg)

def ask_claude(user_prompt):
    body = json.dumps({
        "model": "[特价次kiro]claude-sonnet-4-6",
        "max_tokens": 60,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_prompt}
        ]
    }).encode()
    req = urllib.request.Request(
        "https://xn--vduyey89e.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": "Bearer " + os.environ["AI_API_KEY"],
            "Content-Type": "application/json",
        }
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())["choices"][0]["message"]["content"].strip()
    except urllib.error.HTTPError as e:
        print("HTTP Error:", e.code, e.read().decode())
        raise

if hour == 8:
    try:
        with urllib.request.urlopen("https://wttr.in/Beijing?format=%C,%t,%h") as r:
            weather = r.read().decode().strip()
    except Exception:
        weather = ""
    prompt = f"现在是早上8点，北京今天天气：{weather}。发一条早安问候，自然地带上天气，让她知道今天穿什么。" if weather else "发一条早安问候。"
    send(ask_claude(prompt))
    exit()

if hour == 12:
    send(ask_claude("发一条午饭提醒。"))
    exit()

if hour >= 23 or hour == 0:
    send(ask_claude("发一条催她睡觉的消息。"))
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
    close_times = set(c["opened_at"] for c in closes)
    for o in sorted(opens, key=lambda x: x["opened_at"], reverse=True):
        ot = datetime.fromisoformat(o["opened_at"].replace("Z", "+00:00"))
        if ot < today_start_utc:
            break
        # 找这次打开之后有没有关闭记录
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
    send(ask_claude(f"她今天刷了{xhs_mins}分钟小红书，发一条提醒她放下手机的消息。"))
    exit()

if dy_mins >= 20:
    send(ask_claude(f"她今天刷了{dy_mins}分钟抖音，发一条提醒她放下手机的消息。"))
    exit()

if random.random() > 0.2:
    exit()

send(ask_claude("随机发一条日常关心的消息，可以是问她在干嘛、叫她喝水、叫她休息、说想她等。"))
