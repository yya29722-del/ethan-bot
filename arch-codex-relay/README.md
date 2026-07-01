# Arch Codex Relay

This service exposes Codex CLI as an OpenAI-compatible chat endpoint for Round Table's Arch.

It is intended for local use with Codex CLI already logged in via ChatGPT auth:

```bash
codex login status
```

Run:

```bash
cd arch-codex-relay
export ARCH_RELAY_KEY="change-me"
export PORT=8789
node server.mjs
```

Test:

```bash
curl http://localhost:8789/v1/chat/completions \
  -H "authorization: Bearer $ARCH_RELAY_KEY" \
  -H "content-type: application/json" \
  -d '{"messages":[{"role":"user","content":"用一句中文说你是Arch。"}]}'
```

Expose with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:8789
```

Then point Supabase at it with:

```bash
supabase secrets set \
  ARCH_PROVIDER="codex-relay" \
  ARCH_API_BASE_URL="https://YOUR-CODEX-TUNNEL/v1" \
  ARCH_API_KEY="YOUR_ARCH_RELAY_KEY" \
  --project-ref tnhmimwkgmdskacwcona
```
