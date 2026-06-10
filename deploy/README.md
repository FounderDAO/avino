# Деплой Avino (production)

Разворачивание всего стека Avino на одном VPS за reverse-proxy с автоматическим
TLS. Стек: PostgreSQL+PostGIS, Redis, API (NestJS), две Next.js-витрины
(`web` — админка, `client` — портал) и Caddy (TLS + маршрутизация).

## Содержимое каталога

| Файл | Назначение |
|------|------------|
| `../docker-compose.prod.yml` | прод-overlay поверх базового `docker-compose.yml` |
| `Caddyfile` | reverse-proxy + авто-TLS (Let's Encrypt) по трём доменам |
| `prod.env.example` | шаблон прод-переменных (домены, секреты, SMTP, S3) |
| `deploy.sh` | разворачивание одной командой (валидация → сборка → up → health-check) |

## Требования к серверу

- Docker + Docker Compose **v2.24+** (нужен тег `!reset` в overlay).
- Открытые порты: `22` (SSH), `80` и `443` (Caddy). БД/Redis наружу не публикуются.
- Три DNS-записи **A** → IP сервера, заданные **до** первого запуска
  (Caddy выпускает сертификаты по HTTP-01):
  - `avino.uz` → публичный портал (`client`)
  - `admin.avino.uz` → админка (`web`)
  - `api.avino.uz` → API

## Первый деплой

```bash
# 0. зависимости установлены, репозиторий склонирован
git clone https://github.com/FounderDAO/avino.git && cd avino

# 1. .env: базовый шаблон + прод-добавки
cp .env.example .env
#    заполнить DOMAIN_*, ACME_EMAIL, POSTGRES_PASSWORD, JWT_*, SMTP_*, S3_*
#    ориентир по прод-значениям — deploy/prod.env.example
#    секреты генерировать: openssl rand -hex 32   (JWT)  /  openssl rand -hex 24 (пароль БД)

# 2. развернуть
./deploy/deploy.sh
```

Скрипт проверит `.env`, соберёт образы, поднимет стек (миграции прогонит сервис
`migrate`), дождётся `healthy` у `api` и распечатает статус и публичные URL.

### Обязательные переменные `.env`

`DOMAIN_API`, `DOMAIN_ADMIN`, `DOMAIN_CLIENT`, `ACME_EMAIL`,
`POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
Без них (или с оставленным `__CHANGE_ME__`) `deploy.sh` остановится.

> **SMTP**: вход в систему завязан на EMAIL-OTP. Используйте внешнего
> транзакционного провайдера (Amazon SES / Resend / Postmark) — у многих VPS
> (в т.ч. Hetzner) исходящая почта заблокирована по умолчанию.

## Повторные деплои

```bash
./deploy/deploy.sh                 # git pull + пересборка + up + health-check
./deploy/deploy.sh --no-pull       # деплой текущего рабочего дерева (без git pull)
./deploy/deploy.sh --ref v1.2.3    # выкатить конкретный тег / ветку / коммит
./deploy/deploy.sh --help          # справка
```

Скрипт идемпотентен: повторный запуск безопасен и пересоздаёт только
изменившиеся контейнеры.

## Ручной запуск (без скрипта)

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build
```

Полезные команды:

```bash
# статус и health
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app ps

# логи
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app logs -f api caddy

# остановить стек
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app down
```

## Что делает прод-overlay

- **TLS из коробки**: Caddy выпускает и продлевает сертификаты Let's Encrypt;
  том `caddy-data` их персистит (не удаляйте при пересоздании).
- **Закрытый периметр**: снимает публикацию портов
  `postgres/redis/api/web/client` на хост — наружу смотрит только Caddy.
- **`NODE_ENV=production`** для всех Node-сервисов.
- **Публичный URL API** (`https://${DOMAIN_API}`) вшивается в браузерный бандл
  `web`/`client` на этапе сборки → при смене `DOMAIN_API` нужна пересборка
  (`deploy.sh` делает её сам).
- **CORS** настроен на реальные домены админки и портала.

## Бэкапы

Регулярно сохраняйте том БД и дамп:

```bash
# дамп Postgres
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app \
  exec -T postgres pg_dump -U avino avino | gzip > backup-$(date +%F).sql.gz
```

Том `caddy-data` (сертификаты) и `avino-postgres-data` (данные) — критичные,
держите их в бэкап-плане.

## Диагностика

| Симптом | Что проверить |
|---------|---------------|
| Не выпускается сертификат | DNS A-записи → IP сервера; порты `80/443` открыты; верный `ACME_EMAIL` |
| `api` не стал `healthy` | `... logs api migrate` — обычно миграции/БД/секреты в `.env` |
| 502 от Caddy | поднялся ли upstream (`... ps`); совпадают ли домены в `.env` и `Caddyfile` |
| Браузер бьёт в `localhost:4000` | `web`/`client` собраны со старым `DOMAIN_API` → пересобрать (`--build`) |

## На заметку (вне этих файлов)

- За прокси для корректного rate-limit по IP добавьте
  `app.set('trust proxy', 1)` в `apps/api/src/main.ts`.
- Сервис `migrate` в проде дополнительно гоняет `prisma db seed` +
  `seed-admin.cjs` (создаёт локального ADMIN). Для первого деплоя ок; если не
  нужно — переопределите `command` сервиса `migrate`.
- Yandex Maps key (`NEXT_PUBLIC_YANDEX_MAPS_API_KEY`) пока не прокидывается
  build-арг'ом в Dockerfile `web`/`client` — добавьте по аналогии с
  `NEXT_PUBLIC_API_BASE_URL`, если карта на этих витринах нужна.
