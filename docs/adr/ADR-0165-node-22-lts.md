# ADR-0165 — Переход на Node 22 LTS

## Status

Accepted

## Date

2026-10-03

## Context

Проект жил на Node 20: `node:20-slim` в Dockerfile'ах api/web/client,
`node-version: 20` в CI, `engines.node >=20`. Версия при этом нигде не была
закреплена для локальной разработки (`.nvmrc` не было), а `>=20` допускал
любой патч ветки 20.

Расхождение проявилось на тестах `apps/client`: jsdom 29 делает `require()`
ESM-модуля (`@exodus/bytes`), что работает только с Node 20.19+ / 22.12+. В CI
(свежий 20.x) тесты проходили, а на локальном Node 20.0.0 весь прогон vitest
падал с `ERR_REQUIRE_ESM` ещё до запуска тестов — выглядело как поломка кода.

Мажоры `node` в dependabot намеренно игнорируются (бамп на current ломал
прод-сборку, PR #481), поэтому переезд на новый LTS — ручное решение.

## Decision

1. **Единая версия — Node 22 LTS** во всех средах:
   - Docker: `FROM node:22-slim` в build- и runtime-стейджах api/web/client;
   - CI: `node-version: 22` во всех job'ах;
   - `package.json`: `engines.node >=22`;
   - локально: `.nvmrc` со значением `22`;
   - типы: `@types/node ^22` в api/web/client.
2. Правило dependabot (игнор мажоров `node`) не меняется: следующий переезд —
   снова осознанный, на очередной LTS.

## Consequences

Positive:
- Docker, CI и локальная разработка работают на одном мажоре; `nvm use`
  подхватывает версию из `.nvmrc`.
- `require()` ESM-модулей поддерживается на любом патче ветки 22.12+, класс
  ошибок `ERR_REQUIRE_ESM` в тестах уходит.

Negative / trade-offs:
- Прод-образы переезжают на новый мажор: первая выкатка после мержа требует
  внимания к api после рестарта.
- Разработчикам с Node 20 нужно обновиться (`nvm install 22 && nvm use`):
  `engines >=22` больше не пускает старую версию.
- `node:22-slim` — плавающий тег без digest, как и раньше (см. DevOps.md).

## Related files

- apps/api/Dockerfile, apps/web/Dockerfile, apps/client/Dockerfile
- .github/workflows/ci.yml
- package.json, .nvmrc
- apps/api/package.json, apps/web/package.json, apps/client/package.json
- pnpm-lock.yaml

## Related task

- Ad-hoc (PR #518); закрывает часть TASK-245 (`.nvmrc`)
