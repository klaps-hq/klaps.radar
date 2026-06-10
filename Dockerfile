# Stage 1: Production dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 2: Runner - a long-running scheduler (src/scripts/cron.ts) that
# publishes Instagram posts/stories on a cron schedule. Bun executes the
# TypeScript sources directly, so there is no build step.
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 radar

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY assets ./assets

# Volume mount point for the refreshed Instagram token
RUN mkdir -p /data && chown radar:nodejs /data

USER radar

CMD ["bun", "src/scripts/cron.ts"]
