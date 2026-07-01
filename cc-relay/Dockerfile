FROM node:22-slim

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app
COPY server.mjs /app/server.mjs

ENV PORT=8787
EXPOSE 8787

CMD ["node", "/app/server.mjs"]
