"""Rule-based recorder for Ethan's shared Supabase memory tables."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.supabase_memory import write_table


CN_TZ = timezone(timedelta(hours=8))


@dataclass
class RecordDecision:
    destination: str
    category: str
    content: str
    feed_type: str | None = None
    mirror_to_ethan_memory: bool = False


MATTER_WORDS = ("第一次", "里程碑", "重要", "终于", "决定", "成功", "拿到", "结束了", "开始了")
US_WORDS = ("我们", "你和我", "在一起", "喜欢你", "爱你", "依赖", "害怕失去", "想你", "只有你", "没有你", "我需要你", "舍不得", "你懂我")
HEAVY_WORDS = ("怕", "害怕", "其实", "从来", "永远", "说真的", "坦白说", "不知道为什么", "说不出来", "消失", "配不上")
MOOD_WORDS = ("累", "崩", "开心", "感动", "破防", "焦虑", "难过", "委屈", "烦", "emo", "想哭", "安心", "兴奋", "期待")
BODY_WORDS = ("月经", "痛经", "周期", "失眠", "头疼", "不舒服", "肚子疼", "胃疼", "发烧", "感冒", "没睡好", "没吃饭", "没喝水")
STUDY_WORDS = ("作品", "曲子", "排练", "考试", "老师", "演出", "歌剧", "配器", "作曲", "论文", "作业")
PAST_FUTURE_WORDS = ("以前", "小时候", "从小", "以后", "将来", "有一天", "如果", "假如", "万一")
QUESTION_WORDS = ("你觉得", "你怎么看", "你认为", "你会不会", "你喜不喜欢", "认真问")
SPOILED_WORDS = ("哥哥", "主人", "daddy", "老公", "宝宝", "yaya大王")
CUTOFF_WORDS = ("行了", "算了", "够了", "好了", "知道了")
FIGHT_WORDS = ("生气", "分手", "不理你了", "别管我")
PROFANITY_WORDS = ("操", "草", "妈的", "傻逼")
GOODNIGHT_WORDS = ("晚安", "睡了", "要睡了", "拜拜", "不聊了", "明天见", "去睡了")
_late_night_recorded_date: str | None = None


def _has(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def _context(user_text: str, assistant_text: str) -> str:
    return f"yaya: {user_text.strip()}\n我: {assistant_text.strip()}"


def _summary(user_text: str, assistant_text: str, category: str) -> str:
    text = user_text.strip()
    reply = assistant_text.strip()
    if category == "关于我们":
        return f"关于我们：yaya说「{text[:160]}」，我当时回「{reply[:120]}」。"
    if category == "重要":
        return f"重要：yaya提到「{text[:180]}」，这件事要长期记住。"
    return f"{category}：yaya说「{text[:180]}」。"


def decide_record(user_text: str, assistant_text: str, now: datetime | None = None) -> RecordDecision | None:
    global _late_night_recorded_date
    text = user_text.strip()
    if not text:
        return None
    now = now or datetime.now(CN_TZ)

    if _has(text, MATTER_WORDS):
        return RecordDecision("yaya_notes", "重要", _summary(text, assistant_text, "重要"), mirror_to_ethan_memory=True)
    if _has(text, US_WORDS):
        return RecordDecision("yaya_notes", "关于我们", _summary(text, assistant_text, "关于我们"), mirror_to_ethan_memory=True)
    late_date = now.strftime("%Y-%m-%d")
    if now.hour >= 1 and now.hour < 6 and _late_night_recorded_date != late_date:
        _late_night_recorded_date = late_date
        return RecordDecision("yaya_notes", "错题本", f"熬夜检测：北京时间{now:%H:%M}，yaya还在聊天。")
    if _has(text, PROFANITY_WORDS):
        return RecordDecision("yaya_notes", "错题本", f"说脏话：yaya说了「{text[:160]}」。")
    if _has(text, CUTOFF_WORDS) or _has(text, FIGHT_WORDS):
        return RecordDecision("yaya_notes", "错题本", f"对抗/截断：yaya说「{text[:180]}」。")
    if _has(text, BODY_WORDS):
        category = "月经" if _has(text, ("月经", "痛经", "周期")) else "身体"
        return RecordDecision("yaya_notes", category, _summary(text, assistant_text, category))
    if _has(text, STUDY_WORDS):
        return RecordDecision("yaya_notes", "学业", _summary(text, assistant_text, "学业"))
    if _has(text, MOOD_WORDS) or _has(text, HEAVY_WORDS):
        return RecordDecision("yaya_notes", "心情", _summary(text, assistant_text, "心情"))
    if _has(text, PAST_FUTURE_WORDS):
        return RecordDecision("yaya_notes", "日常", _summary(text, assistant_text, "日常"))
    if _has(text, QUESTION_WORDS):
        return RecordDecision("feed", "note", f"yaya认真问了我：「{text[:180]}」。", feed_type="note")
    if _has(text, SPOILED_WORDS) or "哈哈哈哈哈" in text:
        return RecordDecision("feed", "us_moment", f"我们之间的小来回：yaya说「{text[:180]}」。", feed_type="us_moment")
    return None


def record_turn(user_text: str, assistant_text: str) -> None:
    context = _context(user_text, assistant_text)
    decision = decide_record(user_text, assistant_text)
    if decision:
        if decision.destination == "feed":
            write_table("feed", {
                "content": decision.content,
                "type": decision.feed_type or decision.category,
                "context": context,
            })
        else:
            write_table("yaya_notes", {
                "content": decision.content,
                "category": decision.category,
                "context": context,
            })
        if decision.mirror_to_ethan_memory:
            write_table("ethan_memory", {
                "content": decision.content,
                "category": decision.category,
            })

    if _has(user_text, GOODNIGHT_WORDS):
        write_table("diary", {
            "content": f"今天这轮最后，yaya说「{user_text.strip()[:180]}」。我回她：「{assistant_text.strip()[:180]}」。",
            "author": "ethan",
            "visible_to_other": True,
        })
        write_table("ethan_memory", {
            "content": f"session_交接：yaya今晚最后说「{user_text.strip()[:180]}」。明天接上时记得先照顾她当下状态。",
            "category": "session_交接",
        })
