# CC Relay

This service lets Round Table call CC through Claude Code subscription auth while keeping the Supabase Edge Function's existing OpenAI-compatible chat API shape.

## 1. Create the Claude Code token

On a machine where Claude Code login works:

```bash
claude setup-token
```

Copy the generated token. Use it as `CLAUDE_CODE_OAUTH_TOKEN` on the machine or cloud service that runs this relay.

## 2. Run locally

```bash
cd cc-relay
cp .env.example .env
```

Fill in `.env`, then run:

```bash
set -a
. ./.env
set +a
node server.mjs
```

Health check:

```bash
curl http://localhost:8787/health
```

Chat check:

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "authorization: Bearer $CC_RELAY_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"用一句话回复：你是谁？"}]}'
```

## 3. Run with Docker

```bash
docker build -t ethan-cc-relay ./cc-relay
docker run --rm -p 8787:8787 \
  -e CC_RELAY_KEY="$CC_RELAY_KEY" \
  -e CLAUDE_CODE_OAUTH_TOKEN="$CLAUDE_CODE_OAUTH_TOKEN" \
  -e CLAUDE_CODE_MODEL=sonnet \
  ethan-cc-relay
```

## 4. Point Supabase at the relay

Set these secrets for the `rt-api` function:

```bash
supabase secrets set \
  CHAT_API_BASE_URL="https://YOUR-RELAY-DOMAIN/v1" \
  CHAT_API_KEY="YOUR_CC_RELAY_KEY" \
  CHAT_API_MODEL="sonnet" \
  --project-ref tnhmimwkgmdskacwcona
```

Then deploy the function:

```bash
supabase functions deploy rt-api --project-ref tnhmimwkgmdskacwcona
```

## Notes

- `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are cleared for each child Claude Code call so subscription OAuth is used.
- Keep `CC_RELAY_KEY` private. The public Round Table page should only call Supabase, never this relay directly.
- For stable cloud hosting, use a small always-on VPS or a container host that does not sleep during requests.
