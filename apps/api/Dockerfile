# syntax=docker/dockerfile:1
# Avino API — NestJS + Prisma. Build context = repo root (pnpm workspace).
#   docker build -f apps/api/Dockerfile -t avino-api .
#
# Два стейджа:
#   build   — полный workspace c devDeps: сборка shared/dist, prisma generate,
#             api/dist. Этот же стейдж использует compose-сервис `migrate`
#             (target: build): ему нужны prisma CLI, ts-node и prisma/seed*.
#   runtime — только прод-зависимости (pnpm deploy --prod) + dist, под USER node.

FROM node:20-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
# openssl + ca-certificates — Prisma engines need them on debian-slim.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /repo

# Сначала только манифесты — слой pnpm install кешируется, пока не меняются
# зависимости (правки исходников не приводят к переустановке node_modules).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

# Build only what the api needs: @avino/shared (CJS dist) → Prisma client → api dist.
COPY . .
RUN pnpm --filter @avino/shared build \
 && pnpm --filter @avino/api prisma:generate \
 && pnpm --filter @avino/api build

# Прод-срез: pnpm deploy кладёт в /prod/api только prod-deps (+ физическую копию
# @avino/shared) и файлы пакета (dist, prisma). Prisma-клиент генерируется
# повторно уже В deploy-дереве (CLI берём из workspace — в prod-deps его нет).
RUN pnpm --filter @avino/api deploy --prod /prod/api \
 && cd /prod/api \
 && /repo/apps/api/node_modules/.bin/prisma generate

WORKDIR /repo/apps/api
EXPOSE 4000
# build-стейдж исполняем только как `migrate` (compose переопределяет command).
CMD ["node", "dist/main.js"]

# ── Runtime: dist + prod-deps, non-root ──────────────────────────────────────
FROM node:20-slim AS runtime
ENV NODE_ENV=production
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Сохраняем layout /repo/apps/api: скомпилированный dist импортирует
# @avino/shared ОТНОСИТЕЛЬНЫМ путём ../../packages/shared/dist (tsc paths),
# поэтому shared/dist кладём рядом, на то же место, что и в build-стейдже.
WORKDIR /repo/apps/api
COPY --from=build --chown=node:node /prod/api /repo/apps/api
COPY --from=build --chown=node:node /repo/packages/shared/dist /repo/packages/shared/dist
USER node
EXPOSE 4000
# Зеркало compose-healthcheck (docker-compose.yml → services.api.healthcheck).
HEALTHCHECK --interval=10s --timeout=5s --retries=10 \
  CMD ["node", "-e", "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Default command runs the compiled server; the migrate service overrides it.
CMD ["node", "dist/main.js"]
