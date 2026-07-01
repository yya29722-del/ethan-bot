# LoverConnect → Supabase 桥

替掉现在写 `phone_activity` / `health_data` 的那套自动化，改成从 LoverConnect（手机本地 MCP App）实时拉数据同步进 Supabase。

## 为什么要跑在手机上

LoverConnect 的 MCP 服务只监听 `http://127.0.0.1:5000/mcp`，只有手机本机能连，云端连不到。所以这个脚本必须跑在手机上，不是跑在 GitHub Actions 或者这边的会话里。

## 装起来

在 Termux 里：

```bash
pkg install python
pip install mcp httpx
```

把 `loverconnect_sync.py` 传到手机上，设置环境变量（跟 bot.py 用的是同一对）：

```bash
export SUPABASE_URL="..."
export SUPABASE_KEY="..."
```

## 先跑一次 dry-run

在 LoverConnect App 打开、权限都给了之后：

```bash
python loverconnect_sync.py --dry-run
```

这一步只打印 `get_app_timeline` 和 `get_steps` 的原始返回，不会写 Supabase。脚本里 `TIMELINE_APP_KEY` / `TIMELINE_START_KEY` / `TIMELINE_END_KEY` / `STEPS_KEY` 这几个字段名是照 README 猜的，没实测过——把 dry-run 打印的原始 JSON 发过来，字段名不对的话改一下常量就行。

## 确认字段名没问题之后

```bash
python loverconnect_sync.py
```

默认每 5 分钟同步一次（`LC_POLL_SECONDS` 可调），持续跑。想常驻后台，配合 Termux:Boot 或者 `tmux`/`nohup` 自己保活。

## 范围

只动 `phone_activity` 和 `health_data` 的写入源，不碰 `ethan_memory`、`yaya_notes`、`diary`、`feed`、情绪系统这些——那些还是走原来的路。
