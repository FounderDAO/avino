# ADR-0128 — Health-эндпоинт с реальными проверками PostgreSQL и Redis

## Status

Accepted

## Date

2026-07-05

## Context

DevOps-аудит (DevOps.md, 2026-07-05, P0 №5) выявил, что `GET /api/v1/health`
возвращает статический `{status:'ok'}` без обращения к зависимостям. Повисшая
или недоступная БД давала «healthy» api для docker-compose healthcheck,
деплой-скриптов (health-wait в `deploy/deploy.sh`) и будущего внешнего
uptime-мониторинга (TASK-230). «Слепой прод» — риск №1 аудита.

## Decision

`HealthController` инжектит глобальные `PrismaService` и `RedisService` и на
каждый запрос параллельно проверяет:

- PostgreSQL — `SELECT 1` через `prisma.$queryRaw`;
- Redis — команда `PING`.

Каждая проба ограничена таймаутом 2 секунды (`Promise.race`, таймер очищается).
Обе живы → `200 {status:'ok', service:'avino-api', checks:{database:'up',
redis:'up'}}` — прежние поля ответа сохранены (обратная совместимость с
compose-healthcheck и потребителями). Любая упала → `503
ServiceUnavailableException` с тем же телом (`status:'degraded'`, отказавшая
зависимость — `'down'`).

Специализированный пакет `@nestjs/terminus` сознательно не подключён: две
пробы с таймаутом — ~30 строк без новой зависимости; Terminus станет
оправданным при росте числа проверок (S3, внешние API).

## Consequences

Positive:
- Compose-healthcheck (`r.ok`) и health-wait деплоя честно падают при
  недоступности PG/Redis; внешний монитор (TASK-230) получает реальный сигнал.
- Ответ детализирует, какая именно зависимость упала.

Negative / trade-offs:
- Health-запрос теперь трогает PG и Redis (лёгкие команды; при живых
  зависимостях — доли миллисекунды, при павших — до 2 с на таймаут).
- Эндпоинт публичный: 503 с `checks` раскрывает состояние внутренних
  зависимостей — допустимо, деталей подключения в ответе нет.

## Related files

- apps/api/src/health/health.controller.ts
- apps/api/src/health/health.controller.spec.ts

## Related task

- TASK-231
