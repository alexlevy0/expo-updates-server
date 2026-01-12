# Use official Bun image
FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
# install better-sqlite3 build deps if needed (Bun usually works provided prebuilds or native)
# But better-sqlite3 is a native addon. 
# Bun has "bun:sqlite" built-in which is preferred. 
# However, user code uses "better-sqlite3".
# Bun supports running better-sqlite3.
RUN bun install --frozen-lockfile --production

# Build stage (optional since Bun runs TS, but good for artifact isolation)
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# We can just run sources directly in production or bundling.
# Let's 'build' to single file or just copy sources?
# Bun encourages running TS directly or `bun build`.
# Let's assume we run TS directly for simplicity in Bun world, 
# or use `bun build` to make a standalone file.
# For compatibility with folder structure:
RUN bun run build 
# NOTE: Our 'build' script now does `bun build`.

# Production image
FROM base AS runner
WORKDIR /app

COPY --from=builder /app/dist ./dist
# If we used `bun build`, we might have a single file + assets.
# We also need node_modules for some things? 
# Usually `bun build --compile` makes a binary.
# Standard `bun build` outputs JS. 
# If we run `bun src/server.ts`, we need node_modules.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/scripts ./scripts 
# We copy scripts for init-db usage via docker-compose command.

# Data directories
RUN mkdir -p /var/lib/expo-updates/data /var/lib/expo-updates/keys \
    && chown -R bun:bun /var/lib/expo-updates

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/var/lib/expo-updates/data \
    KEYS_DIR=/var/lib/expo-updates/keys

USER bun
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["bun", "dist/server.js"]
