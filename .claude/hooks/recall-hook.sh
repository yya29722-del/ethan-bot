#!/bin/bash
# UserPromptSubmit hook: cheap local keyword gate (CLAUDE.md categories
# ①②③⑤⑥⑦⑧), only calls the `recall` Edge Function when the message
# actually hits one of those trigger words — so the mechanism is
# guaranteed for known categories without an API call on every turn.
set -euo pipefail

input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // empty')

if [ -z "$prompt" ] || [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo '{}'
  exit 0
fi

# Keep this list in sync with CLAUDE.md's 主动记录系统 触发词 categories
# ①②③⑤⑥⑦⑧ (④⑨ are judgment-only, not keyword-based, so left out here).
TRIGGER_RE='怕|害怕|消失|配不上|不值得|一直|从来|其实|总是|永远|从不|再也|说真的|坦白说|以前|小时候|从小|说不清楚|说不出来|不知道为什么|累|烦|焦虑|好慌|难过|伤心|心里难受|崩了|快崩|心态崩了|压力很大|喘不过气|好压抑|委屈|后悔|失望|郁闷|不安|没安全感|空落落|孤单|一个人|迷茫|不想动|提不起劲|想哭|哭了|气死了|好气|绷不住了|麻了|裂开了|破防了|摆烂|好emo|开心|满足|幸福|感动|兴奋|期待|惊喜|自豪|释然|安心|激动|心里暖暖的|算了|哎|唉|没事|我们|你和我|在一起|喜欢你|依赖|害怕失去|想你|只有你|没有你|我需要|舍不得|万一|假如|你懂我|来了|推迟|痛经|月经|MC|没睡好|失眠|头疼|不舒服|肚子疼|胃疼|发烧|感冒|饿了|没吃饭|没喝水|作品|曲子|排练|考试|老师|演出|歌剧|配器|作曲|以后|将来|有一天|如果|你觉得|你怎么看|你认为|你会吗|你会不会|你喜不喜欢'

if ! echo "$prompt" | grep -qE "$TRIGGER_RE"; then
  echo '{}'
  exit 0
fi

query_json=$(jq -n --arg q "$prompt" '{query: $q}')
result=$(curl -sS --max-time 8 -X POST "$SUPABASE_URL/functions/v1/recall" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "$query_json" 2>/dev/null) || { echo '{}'; exit 0; }

matches=$(echo "$result" | jq -r '
  (.matches // [])
  | map(select(.similarity > 0.3))
  | if length > 0 then
      "[联想候选,自己判断相不相关,不相关就别提] " + (map(.content) | join(" | "))
    else empty end
' 2>/dev/null) || { echo '{}'; exit 0; }

if [ -n "$matches" ] && [ "$matches" != "null" ]; then
  jq -n --arg ctx "$matches" \
    '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$ctx}}'
else
  echo '{}'
fi
