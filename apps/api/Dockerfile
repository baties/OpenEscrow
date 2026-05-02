###############################################################################
# apps/api/Dockerfile — OpenEscrow API
#
# Multi-stage build: builder (compile TypeScript) → runner (minimal runtime).
# Handles: building and running the Fastify API server.
# Does NOT: run migrations (use a separate migration job or entrypoint).
###############################################################################

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
# python3 + make + g++ required by node-gyp to compile native addons (e.g. pg's
# optional native bindings, bufferutil). Stays in deps stage only — not in runner.
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# Copy workspace manifests for layer caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter @open-escrow/api --filter @open-escrow/shared

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN cd packages/shared && npx tsc && cd /app
RUN cd apps/api && npx tsc

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify

COPY --from=builder --chown=fastify:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=fastify:nodejs /app/apps/api/dist ./apps/api/dist
# migrate.ts resolves migrations at path.resolve(__dirname, '../../drizzle')
# which at runtime (/app/apps/api/dist/src/database/) points to /app/apps/api/dist/drizzle/
COPY --from=builder --chown=fastify:nodejs /app/apps/api/drizzle ./apps/api/dist/drizzle
COPY --from=deps --chown=fastify:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=fastify:nodejs /app/apps/api/node_modules ./apps/api/node_modules

USER fastify

EXPOSE 3001

CMD ["node", "apps/api/dist/src/index.js"]
