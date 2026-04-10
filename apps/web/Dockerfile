# syntax=docker/dockerfile:1
# Build context: monorepo root (docker compose sets context: .)

FROM node:20-alpine AS base
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ── Dependências (camada cacheada) ───────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/db/package.json            packages/db/package.json
COPY packages/types/package.json         packages/types/package.json
COPY packages/utils/package.json         packages/utils/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY apps/web/package.json               apps/web/package.json

RUN pnpm install

# ── Dev (Next.js dev server) ─────────────────────────────────────────────────
FROM deps AS dev
WORKDIR /app

COPY packages/ packages/
COPY apps/web/ apps/web/
COPY turbo.json tsconfig.json ./

RUN pnpm --filter=@repo/db generate

EXPOSE 3000
CMD ["pnpm", "--filter=@repo/web", "dev"]

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/ packages/
COPY apps/web/ apps/web/
COPY turbo.json tsconfig.json ./

RUN pnpm --filter=@repo/db generate

ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_API_URL

RUN pnpm --filter=@repo/web build

# ── Production ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]
