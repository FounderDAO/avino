# Avino

Портал недвижимости для Узбекистана. Монорепо на pnpm workspaces.

## Структура

```
avino/
├── apps/
│   ├── api/        # NestJS + Prisma + PostgreSQL/PostGIS + Redis + BullMQ + S3
│   └── web/        # Next.js + TypeScript, API-слой на RTK Query
├── packages/
│   └── shared/     # @avino/shared — общие типы и enum'ы (роли, языки, статусы)
├── docs/           # проектная документация
├── docker-compose.yml  # PostgreSQL+PostGIS, Redis + (профиль `app`) api, web, migrate
├── .env.example
└── CLAUDE.md       # правила проекта и стек
```

## Стек

- **Backend:** Node.js, NestJS, PostgreSQL + PostGIS, Redis, BullMQ, Prisma ORM, S3-compatible storage
- **Frontend:** Next.js, TypeScript, RTK Query (централизованный API-слой)
- **Mobile:** Flutter (отдельный репозиторий; backend API совместим)
- **Внешние сервисы:** Yandex Maps, Eskiz.uz (SMS), Google/Yandex Translate, SMTP

## Требования

- Node.js >= 20
- pnpm >= 9
- Docker + Docker Compose

## Запуск одной командой (Docker)

Поднимает весь стек — Postgres+PostGIS, Redis, миграции+сид, api, web:

```bash
cp .env.example .env                 # заполнить JWT_ACCESS_SECRET / JWT_REFRESH_SECRET (без них api не стартует)
docker compose --profile app up --build   # или: pnpm stack:up
```

- Web (админка): http://localhost:3000/admin/login
- API: http://localhost:4000/api/v1/health
- Локальный вход создаётся сервисом `migrate`: **`admin@avino.uz`**, роль `ADMIN`.
  OTP по email в dev не отправляется по SMTP, а **логируется** — забрать код из логов:
  `docker compose --profile app logs api | grep "код для входа"`.

Остановить: `docker compose --profile app down` (или `pnpm stack:down`).

> Сетевые URL (`DATABASE_URL`/`REDIS_URL`) для контейнеров заданы в `docker-compose.yml`
> и переопределяют `localhost` из `.env`; секреты (`JWT_*`) берутся из `.env`.
> `NEXT_PUBLIC_API_BASE_URL` инлайнится в web-бандл как `http://localhost:4000`
> (его дёргает браузер, не контейнер).

## Запуск на хосте (dev, hot-reload)

```bash
# 1. Зависимости
pnpm install

# 2. Окружение — заполнить DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
cp .env.example .env

# 3. Инфраструктура (Postgres+PostGIS, Redis)
pnpm infra:up

# 4. Сборка общих типов (@avino/shared → dist) + Prisma client
pnpm --filter @avino/shared build
pnpm --filter @avino/api prisma:generate

# 5. Миграции + локальный ADMIN (Prisma CLI читает .env через переменные окружения)
cd apps/api && set -a && . ../../.env && set +a \
  && npx prisma migrate deploy && npx prisma db seed && node prisma/seed-admin.cjs && cd ../..

# 6. Запуск api + web в dev-режиме (shared собирается автоматически перед стартом)
pnpm dev
```

- Web: http://localhost:3000/admin/login · API: http://localhost:4000/api/v1/health

## Команды (корень монорепо)

| Команда | Действие |
|---------|----------|
| `pnpm dev` | собрать `@avino/shared` и поднять api+web в dev-режиме |
| `pnpm build` | сборка всех пакетов (топологически: shared → api/web) |
| `pnpm lint` / `pnpm test` | линт / тесты всех пакетов |
| `pnpm format` | Prettier write |
| `pnpm infra:up` / `pnpm infra:down` | только Postgres + Redis |
| `pnpm stack:up` / `pnpm stack:down` | весь стек в Docker (профиль `app`) |
| `pnpm stack:logs` | логи migrate/api/web |

Для одного пакета используйте `--filter`, напр.: `pnpm --filter @avino/api test`.

## Troubleshooting

- **`Cannot find module 'express'`** при `nest build` — не установлен `@types/express` (в `apps/api`).
- **`ERR_MODULE_NOT_FOUND` в `@avino/shared`** на старте api — не собран пакет: `pnpm --filter @avino/shared build` (он отдаёт `dist/`, а не сырой TS).
- **`JWT_ACCESS_SECRET should not be empty`** — добавьте `JWT_ACCESS_SECRET` и `JWT_REFRESH_SECRET` в `.env` (fail-fast по дизайну).
- **`EADDRINUSE :4000` / `:3000`** — порт занят (часто «зависший» процесс): `lsof -ti tcp:4000 | xargs kill`.
- **Prisma CLI: `Environment variable not found: DATABASE_URL`** — CLI не читает `.env` сам; экспортируйте окружение: `set -a && . .env && set +a`.

## Workflow

Все изменения — через ветку и Pull Request. В `main` напрямую не пушим. Подробнее — `CLAUDE.md`.
