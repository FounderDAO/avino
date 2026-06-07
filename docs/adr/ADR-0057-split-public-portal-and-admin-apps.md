# ADR-0057 — Разделение публичного портала и админки на отдельные Next.js apps

## Status

Accepted

## Date

2026-06-08

## Context

До этого момента весь фронтенд жил в одном Next.js-приложении `apps/web`.
Фактически в нём собрана только админка (всё под route group `(admin)`,
`admin*` RTK Query-слайсы, admin-компоненты, RoleGuard на роли MODERATOR/ADMIN).

С TASK-140 начинается пользовательский (публичный) фронтенд: поиск, объявления,
карта, избранное, чат, профиль. Объединять публичный портал и админку в одном
app нежелательно:

- разные аудитории и модели доступа (гость/USER vs MODERATOR/ADMIN);
- разный размер бандла и набор зависимостей;
- независимый деплой и масштабирование;
- разные дизайн-системы (Zillow-подобный публичный UI vs TailAdmin-админка).

Team Lead принял решение вынести публичный портал в отдельную директорию.

## Decision

Публичный пользовательский фронтенд создаётся как отдельный workspace-пакет
`@avino/client` в `apps/client` (Next.js 15 + React 19 + TypeScript + Tailwind 4),
по тем же конвенциям сборки, что и `apps/web`.

- `apps/web` (`@avino/web`) — остаётся **только админкой**, порт 3000.
- `apps/client` (`@avino/client`) — публичный портал, порт 3001.
- `apps/api` (`@avino/api`) — общий backend для обоих и для будущего Flutter.

Подключение:
- pnpm workspace уже покрывает `apps/*` — отдельной правки `pnpm-workspace.yaml`
  не требуется;
- root-скрипт `dev` запускает api + web + client параллельно;
- добавлен `apps/client/Dockerfile` и сервис `client` в `docker-compose.yml`
  (profile `app`), по образцу `web`.

RTK Query (CLAUDE.md §4) и versioned API `/api/v1` (§14) применяются к `apps/client`
так же, как к `apps/web`; RTK-слой добавляется в TASK-141.

## Consequences

Positive:
- Чёткое разделение публичной и админ-частей: доступ, бандл, деплой независимы.
- Админка не тянет публичные зависимости и наоборот.
- Возможность независимого релизного цикла и масштабирования.

Negative / trade-offs:
- Два Next.js-приложения вместо одного → дублирование части конфигов
  (tsconfig, postcss, next.config) и рост числа сервисов в compose.
- Общий UI/утилиты в будущем потребуют вынесения в `packages/*`
  (сейчас сознательно не делаем — преждевременно).

## Related files

- apps/client/package.json
- apps/client/next.config.mjs
- apps/client/tsconfig.json
- apps/client/postcss.config.mjs
- apps/client/Dockerfile
- apps/client/src/app/layout.tsx
- apps/client/src/app/page.tsx
- apps/client/src/app/globals.css
- package.json (root dev/stack:logs scripts)
- docker-compose.yml (service `client`)

## Related task

- TASK-140
