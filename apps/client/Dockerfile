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

COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @avino/shared build \
 && pnpm --filter @avino/client build

WORKDIR /repo/apps/client
EXPOSE 3001
CMD ["pnpm", "start"]
