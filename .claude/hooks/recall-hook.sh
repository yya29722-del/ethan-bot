#!/bin/bash
# UserPromptSubmit hook: always call the `recall` Edge Function with the
# user's message and surface any matches, so semantic recall doesn't
# depend on Ethan remembering to invoke it manually.
set -euo pipefail

input=$(cat)
prompt=$(echo "$input" | jq -r '.prompt // empty')
prompt_len=$(printf '%s' "$prompt" | wc -m)

# Skip short/low-content messages ("亲" "行" "切" "干嘛" 等) — not worth an
# embedding call, and firing on every single turn burns usage for nothing.
if [ -z "$prompt" ] || [ "$prompt_len" -lt 8 ] || [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
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
