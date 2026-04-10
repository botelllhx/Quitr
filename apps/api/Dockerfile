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
COPY apps/api/package.json               apps/api/package.json

RUN pnpm install

# ── Dev (hot reload com tsx watch) ───────────────────────────────────────────
FROM deps AS dev
WORKDIR /app

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY turbo.json tsconfig.json ./

RUN pnpm --filter=@repo/db generate

EXPOSE 3001
CMD ["pnpm", "--filter=@repo/api", "dev"]

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/ packages/
COPY apps/api/ apps/api/
COPY turbo.json tsconfig.json ./

RUN pnpm --filter=@repo/db generate
RUN pnpm --filter=@repo/api build

# ── Production ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
