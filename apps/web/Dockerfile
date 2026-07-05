# syntax=docker/dockerfile:1
# Avino Web — Next.js. Build context = repo root (pnpm workspace).
#   docker build -f apps/web/Dockerfile -t avino-web .
# NEXT_PUBLIC_API_BASE_URL is inlined at build time and used by the BROWSER,
# so it must point at the host-mapped api port (http://localhost:4000), not the
# in-network service name.
#
# Два стейджа: build (полный workspace + devDeps → `next build`) и runtime —
# только standalone-бандл Next (output: 'standalone', next.config.mjs) под
# USER node; рантайм = `node server.js`, без pnpm и node_modules workspace'а.

FROM node:20-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Sentry DSN админки — NEXT_PUBLIC (инлайнится на build, ADR-0129).
# Пусто → Sentry полностью выключен. DSN — публичный ключ, не секрет;
# смена DSN/окружения = пересборка образа (как у остальных NEXT_PUBLIC_*).
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT=
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT

# Сначала только манифесты — слой pnpm install кешируется, пока не меняются
# зависимости (правки исходников не приводят к переустановке node_modules).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/client/package.json apps/client/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @avino/shared build \
 && pnpm --filter @avino/web build

# ── Runtime: standalone-бандл, non-root ──────────────────────────────────────
FROM node:20-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# standalone-бандл сохраняет структуру монорепо: server.js лежит в apps/web/.
# Статику и public Next в standalone не копирует — добираем их руками.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /repo/apps/web/.next/static /app/apps/web/.next/static
USER node
EXPOSE 3000
# Зеркало compose-healthcheck (docker-compose.yml → services.web.healthcheck).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD ["node", "-e", "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
