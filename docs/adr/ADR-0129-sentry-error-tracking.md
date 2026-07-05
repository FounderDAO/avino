# ADR-0129 — Sentry error tracking (api + client + web)

## Status

Accepted

## Date

2026-07-05

## Context

DevOps-аудит (DevOps.md, 2026-07-05, P0 №6): в проекте нет error tracking —
прод-ошибки видны только в docker-логах на VPS, т.е. фактически невидимы.
«Слепой прод» — риск №1 аудита. Нужен инструмент, который собирает
исключения со стеками, группирует их и алертит.

## Decision

Sentry во всех трёх приложениях, тремя отдельными PR (границы app-папок,
CLAUDE.md §0). Общие принципы:

- **Config-gated**: инициализация только при заданном DSN
  (`SENTRY_DSN` для api, `NEXT_PUBLIC_SENTRY_DSN` для Next-приложений).
  Без DSN поведение бит-в-бит прежнее — dev/CI/стенды без аккаунта Sentry
  ничего не замечают; код мержится до заведения аккаунта.
- **Только ошибки**: `tracesSampleRate: 0`, перформанс-трейсинг и session
  replay сознательно за скоупом (P0 — видимость ошибок; трейсинг — отдельное
  решение при необходимости).
- `SENTRY_ENVIRONMENT` задаёт окружение событий (staging держит api в
  `NODE_ENV=development` — по нему окружение не определить).

**api** (`@sentry/nestjs`):
- `src/instrument.ts` — `Sentry.init`, импортируется первой строкой `main.ts`
  (до Nest/express, требование SDK).
- Отчёт об ошибке — в `AllExceptionsFilter` по тому же критерию, что и
  error-лог: только подлинные INTERNAL_ERROR 5xx. Осознанные доменные 5xx
  (например, 503 AUTH_PROVIDER_UNAVAILABLE) и 4xx в Sentry не летят — иначе
  штатная работа выглядит потоком ошибок.
- `SentryModule.forRoot()`/`@nestjs/terminus`-стиль интеграции не подключаем:
  явный `captureException` в одном фильтре проще, тестируемее и не меняет
  порядок фильтров.

**client / web** (`@sentry/nextjs`) — отдельные PR: server/edge-конфиги через
`instrumentation.ts`, browser через `instrumentation-client.ts`; DSN браузера
инлайнится на build (та же механика, что остальные `NEXT_PUBLIC_*` build-args).

## Consequences

Positive:
- Прод-ошибки со стеками, группировкой и алертами видны в реальном времени.
- Нулевое влияние на окружения без DSN; секретов в репо не появляется.
- `request_id` в тегах события связывает ошибку Sentry с логами api.

Negative / trade-offs:
- Новая внешняя зависимость и SaaS-сервис (данные ошибок уходят в Sentry;
  PII в событиях не отправляем — тело запроса не прикладываем).
- +1 пакет в каждом приложении (размер образа вырастет незначительно).
- Активация требует аккаунта Sentry и DSN (задача Team Lead); до этого код
  «спит».

## Related files

- apps/api/src/instrument.ts
- apps/api/src/main.ts
- apps/api/src/common/filters/all-exceptions.filter.ts
- apps/client/sentry.server.config.ts, apps/client/sentry.edge.config.ts
- apps/client/src/instrumentation.ts, apps/client/src/instrumentation-client.ts
- apps/client/Dockerfile, docker-compose.yml (build-args NEXT_PUBLIC_SENTRY_*)
- apps/web/sentry.server.config.ts, apps/web/sentry.edge.config.ts
- apps/web/src/instrumentation.ts, apps/web/src/instrumentation-client.ts
- apps/web/Dockerfile
- .env.example, deploy/prod.env.example

## Related task

- TASK-232
