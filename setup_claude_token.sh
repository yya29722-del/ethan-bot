#!/bin/bash
# 让 claude setup-token 走本地代理，解决 OAuth 403 问题
# 用法：bash setup_claude_token.sh [代理端口，默认自动检测]

PROXY_PORT="${1:-}"

if [ -z "$PROXY_PORT" ]; then
  for port in 7890 7891 1080 6152 8080 8234 10808; do
    if lsof -i ":$port" -sTCP:LISTEN -n -P 2>/dev/null | grep -q LISTEN; then
      PROXY_PORT=$port
      break
    fi
  done
fi

if [ -z "$PROXY_PORT" ]; then
  echo "未找到本地代理端口，请手动指定：bash setup_claude_token.sh <端口>"
  echo "常见端口：Clash=7890, Surge=6152, V2Ray=10808, Shadowsocks=1080"
  exit 1
fi

echo "使用代理端口：$PROXY_PORT"
export HTTPS_PROXY="http://127.0.0.1:$PROXY_PORT"
export HTTP_PROXY="http://127.0.0.1:$PROXY_PORT"
export NODE_USE_ENV_PROXY=1

claude setup-token
