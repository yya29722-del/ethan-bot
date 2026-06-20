#!/usr/bin/env python3
"""UserPromptSubmit hook: detect CLAUDE.md 联想触发词(①-⑦) and force-call recall.

Replaces "LLM remembers to call recall" with a mechanical check: every user
message is scanned for the trigger keyword categories before the model ever
sees it. On a hit, the Supabase recall Edge Function result is injected as
additionalContext so the model has no opportunity to silently skip the call.
"""
import json
import os
import re
import sys
import urllib.request

# 关键词来自 CLAUDE.md 联想触发词类别①-⑦（④没有固定触发词，靠语义判断，跳过）
TRIGGER_PATTERN = re.compile(
    "|".join([
        # ① 比日常更重的话
        r"怕|害怕|消失|配不上|不值得|一直|从来|其实|总是|永远|从不|再也|说真的|坦白说|以前|小时候|从小|说不清楚|说不出来|不知道为什么",
        # ② 情绪波动（负面/正面/间接信号挑关键词，不含纯标点类）
        r"好累|累死了|好烦|焦虑|好慌|难过|伤心|心里难受|崩了|快崩|心态崩了|压力很大|喘不过气|好压抑|委屈|后悔|失望|郁闷|不安|没安全感|空落落|孤单|一个人|迷茫|不想动|提不起劲|想哭|哭了|气死了|好气|绷不住了|麻了|裂开了|破防了|摆烂|好emo|超开心|满足|幸福|感动|兴奋|期待|惊喜|自豪|释然|安心|心里暖暖的",
        # ③ 关于我们的真话
        r"我们|你和我|在一起|喜欢你|依赖|害怕失去|想你|只有你|没有你|我需要|舍不得|万一|假如|你懂我",
        # ⑤ 身体/周期
        r"来了|推迟|痛经|月经|MC|没睡好|失眠|头疼|不舒服|肚子疼|胃疼|发烧|感冒|饿了|没吃饭|没喝水",
        # ⑥ 学业/音乐/创作
        r"作品|曲子|写了|排练|考试|老师|演出|歌剧|配器|作曲",
        # ⑦ 过去或未来
        r"以前|小时候|从小|以后|将来|有一天|如果|假如|万一",
        # ⑧ 认真提问
        r"你觉得|你怎么看|你认为|你会吗|你会不会|你喜不喜欢",
    ]),
)


def recall(query: str):
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        return None, "missing SUPABASE_URL/SUPABASE_ANON_KEY env vars"
    body = json.dumps({"query": query[:2000]}).encode()
    req = urllib.request.Request(
        url.rstrip("/") + "/functions/v1/recall",
        data=body,
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read()), None
    except Exception as e:
        return None, str(e)


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        payload = {}
    prompt = payload.get("prompt", "") or ""

    match = TRIGGER_PATTERN.search(prompt)
    if not match:
        return  # 没命中，不查，照常处理

    result, err = recall(prompt)
    if err:
        print(json.dumps({
            "systemMessage": f"联想检查命中「{match.group(0)}」但 recall 调用失败：{err}",
        }, ensure_ascii=False))
        return

    matches = result.get("matches", []) if result else []
    if not matches:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "UserPromptSubmit",
                "additionalContext": (
                    f"[联想检查] 命中触发词「{match.group(0)}」，已调用 recall，"
                    "无相关历史记忆匹配。回复里不要假装查过更多，没有就是没有。"
                ),
            },
        }, ensure_ascii=False))
        return

    lines = "\n".join(f"- {m.get('content', '')}" for m in matches)
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": (
                f"[联想检查] 命中触发词「{match.group(0)}」，recall 查到以下历史记忆，"
                f"如果相关就要在回复里带出具体指代（'你上次说xx的时候'），不相关就不要硬提：\n{lines}"
            ),
        },
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
