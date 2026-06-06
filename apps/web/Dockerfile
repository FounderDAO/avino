# syntax=docker/dockerfile:1
# Avino Web — Next.js. Build context = repo root (pnpm workspace).
#   docker build -f apps/web/Dockerfile -t avino-web .
# NEXT_PUBLIC_API_BASE_URL is inlined at build time and used by the BROWSER,
# so it must point at the host-mapped api port (http://localhost:4000), not the
# in-network service name.
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @avino/shared build \
 && pnpm --filter @avino/web build

WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
