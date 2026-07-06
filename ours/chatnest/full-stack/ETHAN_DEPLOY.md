# Ethan Full-Stack 部署说明

这份目录就是 ChatNest 的完整后端版本，包含：

- `/api/chat` 流式回复
- 会话历史
- 工具状态和工具结果摘要
- thinking summary
- Profile / Saved memories / Preferences
- 上传文件
- 可选本地记忆检索
- 自动记忆触发词

## 1. 放到 VPS

```bash
cd /srv
git clone https://github.com/yya29722-del/ethan-bot.git
cd /srv/ethan-bot/ours/chatnest/full-stack
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp env.example .env
```

生成密钥：

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(32))
PY
```

编辑 `.env`：

```bash
CHAT_PASSWORD=你自己设置的入口密码
CHAT_SECRET=上面生成的随机密钥
AUTO_MEMORY_TRIGGERS=你们定好的词1,你们定好的词2
AUTO_MEMORY_PREFIX=yaya 触发自动记录：
```

## 2. 启动

```bash
./run.sh
```

默认地址：

```text
http://127.0.0.1:8787/
```

如果要给外网访问，建议用 Nginx/Caddy/Cloudflare Tunnel 反代到 `127.0.0.1:8787`，不要直接裸奔公网端口。

## 3. 自动记录怎么工作

当 yaya 的消息里包含 `.env` 里的任意 `AUTO_MEMORY_TRIGGERS`，后端会把这条消息自动写入：

```text
Profile -> Saved memories
```

这一步是后端硬逻辑，不依赖模型“愿不愿意记”。所以它比单纯 prompt 更稳。

## 4. 工具和安全

这套 full-stack 默认允许 Claude Agent SDK 使用：

```text
Read, Grep, Glob, Write, Edit, Bash, WebSearch, WebFetch, TodoWrite
```

`Bash` 会拦截明显危险命令。正式公网部署前，建议先只给自己使用，并用强密码保护。

## 5. 连接前端

跑起来以后，前端应该打开这个 VPS 地址，而不是 GitHub Pages 的纯 demo 地址。GitHub Pages 只能展示静态文件，不能承载这些后端能力。
