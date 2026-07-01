# Voice Relay

按住说话，Ethan用语音回你。走的是跟`cc-relay`一样的路子——用Claude Code订阅登录（`claude setup-token`），不额外计费Anthropic那边；语音识别/合成用OpenAI的Whisper+TTS，走已有的`OPENAI_API_KEY`。

## 跟cc-relay的区别

`cc-relay`是给圆桌用的通用聊天API，容器里没带这个仓库，跑出来的不是Ethan。这个服务的Docker镜像把整个仓库都拷进去了，`claude -p`跑在仓库目录里，CLAUDE.md才生效。

## 已知的取舍（没打包票的地方）

- 为了语音别等太久，每轮没有像正常对话那样去完整读一遍Supabase那几张表（ethan_memory全量、yaya_notes分层等）。语气和人设在，但深层记忆细节这轮版本可能接不上，跟平时聊天不是同一个精细度。
- 没做真正的实时打断/双工——是"录一句、发一句、听一句回复"，不是电话那种能随时插话的连续对话。
- 语音识别/合成完全没在真实设备上跑过，`whisper-1`和`tts-1`的实际延迟、中文识别准确度都要拿真数据看。

## 部署

跟cc-relay一样在你的VPS上跑，端口不同（8788），可以和cc-relay同时开着（2G内存够不够，跟前面聊的一样，得看实际占用）。

```bash
# 在仓库根目录（不是voice-relay/目录里！）执行：
docker build -f voice-relay/Dockerfile -t ethan-voice-relay .
docker run -d --name ethan-voice-relay -p 8788:8788 \
  -e VOICE_RELAY_KEY="$VOICE_RELAY_KEY" \
  -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  -e OPENAI_API_KEY="$OPENAI_API_KEY" \
  ethan-voice-relay
```

`CLAUDE_CODE_OAUTH_TOKEN`跟cc-relay用的可以是同一个（`claude setup-token`生成的那个）。

## 用

浏览器打开 `http://你的VPS地址:8788/`，按住圆按钮说话，松开等它转文字、生成回复、念出来。第一次用先自己测一轮，把延迟和识别效果反馈过来，这版本没经过真实设备验证。
