# syntax=docker/dockerfile:1
# Avino Client — публичный Next.js портал. Build context = repo root (pnpm workspace).
#   docker build -f apps/client/Dockerfile -t avino-client .
# NEXT_PUBLIC_API_BASE_URL инлайнится на этапе сборки и используется БРАУЗЕРОМ,
# поэтому указывает на host-порт api (http://localhost:4000), а не на сервис-имя.
#
# Два стейджа: build (полный workspace + devDeps → `next build`) и runtime —
# только standalone-бандл Next (output: 'standalone', next.config.mjs) под
# USER node; рантайм = `node server.js`, без pnpm и node_modules workspace'а.
# Рантайм-переменные (API_INTERNAL_URL для SSR) читаются standalone-сервером
# как раньше — из environment контейнера.

FROM node:25-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Ключ Yandex JS API — тоже NEXT_PUBLIC (инлайнится в браузерный бандл на этапе
# `next build`). Прокидываем через build-arg, т.к. .env.local исключён
# .dockerignore. Пусто → карта/гео-подсказки деградируют (no-key), не падают.
ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY=
ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$NEXT_PUBLIC_YANDEX_MAPS_API_KEY

# Базовый публичный URL сайта (BASE в @/lib/seo/base). Нужен для АБСОЛЮТНЫХ
# og:image/twitter:image (→ route /api/og/listing/:id), canonical/hreflang и og:url.
# NEXT_PUBLIC → инлайнится на build. Дефолт — прод-домен; на staging переопределяется
# build-arg в https://${DOMAIN_CLIENT}. Без него BASE дефолтит в avino.uz, и на staging
# og:image указывает на нерабочий прод-хост → Telegram не тянет картинку превью.
ARG NEXT_PUBLIC_SITE_URL=https://avino.uz
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Google Sign-In Client ID — тоже NEXT_PUBLIC (инлайнится в бандл на этапе
# `next build`). Пусто → кнопка Google просто не рендерится (GoogleSignInButton),
# вход по OTP работает как прежде. Значение должно совпадать с GOOGLE_CLIENT_ID
# на api, иначе верификация ID-token отдаёт 401 (docs/GUIDE_GOOGLE_AUTH_SETUP.md).
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

# Sign in with Apple — тоже NEXT_PUBLIC (инлайнится на build). Оба значения
# нужны кнопке (AppleSignInButton): нет любого → кнопка не рендерится, OTP
# работает как прежде. CLIENT_ID = Service ID веба (aud id-token'а, должен
# входить в APPLE_CLIENT_ID на api). REDIRECT_URI зарегистрирован в Apple.
ARG NEXT_PUBLIC_APPLE_CLIENT_ID=
ENV NEXT_PUBLIC_APPLE_CLIENT_ID=$NEXT_PUBLIC_APPLE_CLIENT_ID
ARG NEXT_PUBLIC_APPLE_REDIRECT_URI=
ENV NEXT_PUBLIC_APPLE_REDIRECT_URI=$NEXT_PUBLIC_APPLE_REDIRECT_URI

# Sentry DSN портала — тоже NEXT_PUBLIC (инлайнится на build, ADR-0129).
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
 && pnpm --filter @avino/client build

# ── Runtime: standalone-бандл, non-root ──────────────────────────────────────
FROM node:25-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
# standalone-бандл сохраняет структуру монорепо: server.js лежит в apps/client/.
# Статику и public Next в standalone не копирует — добираем их руками.
COPY --from=build --chown=node:node /repo/apps/client/.next/standalone /app
COPY --from=build --chown=node:node /repo/apps/client/.next/static /app/apps/client/.next/static
COPY --from=build --chown=node:node /repo/apps/client/public /app/apps/client/public
USER node
EXPOSE 3001
# Зеркало compose-healthcheck (docker-compose.yml → services.client.healthcheck).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD ["node", "-e", "fetch('http://localhost:3001/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/client/server.js"]
