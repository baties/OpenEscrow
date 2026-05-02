###############################################################################
# apps/web/Dockerfile — OpenEscrow Web Dashboard
#
# Multi-stage build: deps → builder (Next.js build) → runner (standalone output).
# Handles: building and running the Next.js web dashboard.
# Does NOT: serve static assets via CDN — single-server MVP uses Next.js server.
###############################################################################

# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
# python3 + make + g++ required by node-gyp to compile optional native addons
# (e.g. sharp, canvas if added later). Stays in deps stage only — not in runner.
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --filter @open-escrow/web --filter @open-escrow/shared

# ─── Stage 2: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars must be available at build time — Next.js inlines them
# into the client bundle. Passing them as ARG → ENV makes them visible to
# `next build`. They are NOT secrets (all are client-safe public values).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CHAIN_ID
ARG NEXT_PUBLIC_CONTRACT_ADDRESS
ARG NEXT_PUBLIC_USDC_ADDRESS
ARG NEXT_PUBLIC_USDT_ADDRESS
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_CONTRACT_ADDRESS=$NEXT_PUBLIC_CONTRACT_ADDRESS
ENV NEXT_PUBLIC_USDC_ADDRESS=$NEXT_PUBLIC_USDC_ADDRESS
ENV NEXT_PUBLIC_USDT_ADDRESS=$NEXT_PUBLIC_USDT_ADDRESS
ENV NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared first, then web
RUN cd packages/shared && npx tsc
RUN cd apps/web && npx next build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# outputFileTracingRoot=/app (monorepo root) causes Next.js to mirror the
# workspace path structure inside .next/standalone/:
#   standalone/apps/web/server.js   ← entrypoint (relative to tracing root)
#   standalone/apps/web/.next/      ← compiled server files
#   standalone/node_modules/        ← root workspace packages (includes 'next')
# Public and static assets must be placed alongside server.js accordingly.
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
