# syntax=docker/dockerfile:1
# Avino API — NestJS + Prisma. Build context = repo root (pnpm workspace).
#   docker build -f apps/api/Dockerfile -t avino-api .
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
# openssl + ca-certificates — Prisma engines need them on debian-slim.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /repo

# Install the whole workspace from the frozen lockfile, then build only what the
# api needs: @avino/shared (CJS dist) → Prisma client → api dist.
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @avino/shared build \
 && pnpm --filter @avino/api prisma:generate \
 && pnpm --filter @avino/api build

WORKDIR /repo/apps/api
EXPOSE 4000
# Default command runs the compiled server; the migrate service overrides it.
CMD ["node", "dist/main.js"]
