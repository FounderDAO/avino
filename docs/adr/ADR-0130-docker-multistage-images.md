# ADR-0130 — Multi-stage Docker-образы и non-root рантайм (api, web, client)

## Status

Accepted

## Date

2026-07-05

## Context

DevOps-аудит (DevOps.md, 2026-07-05, §P1 п.7) зафиксировал: все три образа
(api, web, client) — single-stage на `node:20-slim` под root. В рантайм попадал
весь workspace: исходники, devDependencies, кеш pnpm. Итог — образы ~2 GB
каждый, медленные деплой/откат и лишняя поверхность атаки (root + компиляторы
и dev-тулинг в проде).

Особенности, которые нельзя было сломать:

- compose-сервис `migrate` исполняет `prisma migrate deploy && prisma db seed
  && node prisma/seed-admin.cjs` внутри образа api — ему нужны prisma CLI,
  ts-node и seed-скрипты (это devDeps);
- Prisma-клиент генерируется в pnpm virtual store — в prod-срез он сам по себе
  не попадает;
- у web/client NEXT_PUBLIC_* инлайнятся на `next build` (build-args), а
  API_INTERNAL_URL у client читается в рантайме (SSR);
- client использует next-intl: messages подтягиваются динамическим import'ом
  и должны попасть в серверный бандл.

## Decision

1. **api — два стейджа.** `build` — полный workspace (install по манифестам
   отдельным слоем → кеш; shared build → prisma generate → nest build), затем
   `pnpm --filter @avino/api deploy --prod /prod/api` и повторный
   `prisma generate` уже в deploy-дереве (CLI берётся из workspace-стейджа).
   `runtime` — `node:20-slim` + openssl/ca-certificates, копия `/prod/api`,
   `USER node`, HEALTHCHECK (зеркало compose), `CMD node dist/main.js`.
2. **Сервис `migrate` переведён на `target: build`** (образ `avino-api-build`):
   рантайм-образ api больше не содержит prisma CLI / ts-node / seed-скрипты,
   а миграции и сиды продолжают работать из полного workspace-стейджа. Стейдж
   общий, поэтому дополнительной сборки почти нет.
3. **web/client — `output: 'standalone'`** (`outputFileTracingRoot` = корень
   монорепо) + два стейджа: рантайм = `.next/standalone` + `.next/static`
   (+ `public` у client), `USER node`, HEALTHCHECK (зеркало compose),
   `CMD node apps/<app>/server.js` (прослойка `pnpm start` убрана; PORT/
   HOSTNAME заданы ENV).
4. Во всех трёх build-стейджах манифесты копируются до исходников — слой
   `pnpm install --frozen-lockfile` кешируется между сборками, пока не
   меняются зависимости.

## Consequences

Positive:

- Размер образов: api 2.02 GB → 675 MB; web/client — standalone-бандл вместо
  полного workspace (замер в PR). Быстрее push/pull, деплой и откат (TASK-235).
- Рантайм-процессы работают под `node`, без исходников и dev-тулинга.
- HEALTHCHECK встроен в образы — `unhealthy` виден даже вне compose.
- Кеш install-слоя ускоряет повторные сборки на VPS.

Negative / trade-offs:

- Dockerfile'ы сложнее (два стейджа, ручное копирование static/public у Next).
- Схема «prisma generate в deploy-дереве» — тонкое место: при апгрейде
  Prisma/pnpm проверять, что клиент в runtime-образе инициализируется.
- `migrate` тянет тяжёлый build-стейдж — приемлемо: он общий с build рантайма
  и живёт только на время миграций.
- standalone-сервер Next не поддерживает `next start`-флаги; порт задаётся
  только через ENV PORT.

## Related files

- apps/api/Dockerfile
- apps/web/Dockerfile, apps/web/next.config.mjs
- apps/client/Dockerfile, apps/client/next.config.mjs
- docker-compose.yml (migrate → target: build)

## Related task

- TASK-233
