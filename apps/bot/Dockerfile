###############################################################################
# apps/bot/Dockerfile — OpenEscrow Telegram Bot
#
# Multi-stage build: builder (compile TypeScript) → runner (minimal runtime).
# Handles: building and running the Telegraf Telegram bot.
# Does NOT: communicate with DB directly — all state accessed via API.
###############################################################################

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
# python3 + make + g++ required by node-gyp to compile native addons:
#   bufferutil, utf-8-validate (telegraf → ws → optional native bindings)
# These stay in the deps stage only — they do NOT appear in the final runner image.
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter @open-escrow/bot --filter @open-escrow/shared

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/bot/node_modules ./apps/bot/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/bot ./apps/bot

RUN cd packages/shared && npx tsc && cd /app
RUN cd apps/bot && npx tsc

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 telegraf

COPY --from=builder --chown=telegraf:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=telegraf:nodejs /app/apps/bot/dist ./apps/bot/dist
COPY --from=deps --chown=telegraf:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=telegraf:nodejs /app/apps/bot/node_modules ./apps/bot/node_modules

USER telegraf

CMD ["node", "apps/bot/dist/src/index.js"]
