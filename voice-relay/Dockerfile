FROM node:22-slim

RUN npm install -g @anthropic-ai/claude-code

# Build context must be the repo root (not voice-relay/), so CLAUDE.md
# ends up in the image and `claude -p` picks up the Ethan persona:
#   docker build -f voice-relay/Dockerfile -t ethan-voice-relay .
WORKDIR /app
COPY . /app

ENV PORT=8788
ENV ETHAN_REPO_DIR=/app
EXPOSE 8788

CMD ["node", "/app/voice-relay/server.mjs"]
