# Multi-stage: build static SPA in stage 1, ship slim runtime in stage 2.

# ---- builder ----
FROM oven/bun:1.3 AS builder
WORKDIR /app

COPY package.json bun.lock* ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY cli/package.json cli/
RUN bun install --frozen-lockfile

COPY shared/ shared/
COPY server/ server/
COPY web/ web/
COPY tsconfig.json ./

RUN bun run --cwd web build

# ---- runtime ----
FROM oven/bun:1.3-slim
WORKDIR /app

# Only the bits the server actually needs at runtime.
COPY --from=builder /app/package.json ./
COPY --from=builder /app/bun.lock* ./
COPY --from=builder /app/shared shared
COPY --from=builder /app/server server
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/web/dist web/dist

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV SPEAKING_REVIEW_DATA=/data
ENV SPEAKING_REVIEW_DIST=/app/web/dist

VOLUME ["/data"]
EXPOSE 3000

CMD ["bun", "run", "--cwd", "server", "src/index.ts"]
