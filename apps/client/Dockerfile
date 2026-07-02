# syntax=docker/dockerfile:1
# Avino Client — публичный Next.js портал. Build context = repo root (pnpm workspace).
#   docker build -f apps/client/Dockerfile -t avino-client .
# NEXT_PUBLIC_API_BASE_URL инлайнится на этапе сборки и используется БРАУЗЕРОМ,
# поэтому указывает на host-порт api (http://localhost:4000), а не на сервис-имя.
FROM node:20-slim AS base
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

COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @avino/shared build \
 && pnpm --filter @avino/client build

WORKDIR /repo/apps/client
EXPOSE 3001
CMD ["pnpm", "start"]
