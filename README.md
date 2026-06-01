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
├── docker-compose.yml  # PostgreSQL+PostGIS, Redis
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

## Быстрый старт

```bash
# 1. Зависимости
pnpm install

# 2. Окружение
cp .env.example .env   # заполнить значения

# 3. Инфраструктура (Postgres+PostGIS, Redis)
pnpm infra:up

# 4. Prisma client
pnpm --filter @avino/api prisma:generate

# 5. Запуск всех приложений в dev-режиме
pnpm dev
```

- API: http://localhost:4000/api/v1/health
- Web: http://localhost:3000

## Команды (корень монорепо)

| Команда | Действие |
|---------|----------|
| `pnpm dev` | dev-режим всех приложений (параллельно) |
| `pnpm build` | сборка всех пакетов |
| `pnpm lint` | линт всех пакетов |
| `pnpm test` | тесты всех пакетов |
| `pnpm format` | Prettier write |
| `pnpm infra:up` / `pnpm infra:down` | поднять / остановить Docker-инфраструктуру |

Для одного пакета используйте `--filter`, напр.: `pnpm --filter @avino/api test`.

## Workflow

Все изменения — через ветку и Pull Request. В `main` напрямую не пушим. Подробнее — `CLAUDE.md`.
