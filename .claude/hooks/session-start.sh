#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# 这个仓库没有 package.json / requirements.txt 之类的依赖清单：
# bot.py 只用标准库，前端是单文件静态 HTML，Supabase 函数由 Deno 远程托管。
# 这里只做语法检查，确保环境里的 python3 能正常跑这个仓库的代码。
python3 -m py_compile "$CLAUDE_PROJECT_DIR"/*.py
echo "ok: python3 available, *.py syntax-checked"
