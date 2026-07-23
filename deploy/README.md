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
| `backup.sh` | дамп БД (`pg_dump -Fc`) + ротация + опц. off-site выгрузка в S3/R2 |
| `install-docker.sh` | установка Docker Engine + Compose plugin + ротация docker-логов |
| `harden-server.sh` | firewall (ufw) + отключение парольного SSH-входа (opt-in) |
| `compute-limits.sh` | авторасчёт лимитов Node + PG-тюнинга под RAM/CPU хоста (PG-first) |

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

## Лимиты ресурсов (авторасчёт под размер хоста)

`deploy.sh` перед сборкой запускает `compute-limits.sh`: тот читает RAM и vCPU
сервера и **под конкретный бокс** вычисляет лимиты Node-сервисов (`mem_limit` /
`cpus`) и тюнинг PostgreSQL (`shared_buffers`, `effective_cache_size`,
`maintenance_work_mem`). Приоритет — **PostgreSQL**: чем больше горячей выборки
влезает в RAM, тем быстрее гео-запросы. Node-потолки берутся поверх с
гарантированным резервом под БД и ОС (формула и таблица — `docs/adr/ADR-0132`).

- Значения печатаются в лог деплоя — видно, что и почему получил бокс.
- Ручной `docker compose up` (без `deploy.sh`) использует **дефолты** из
  `${VAR:-...}` — они рассчитаны на 24 GB / 8 vCPU.
- Зафиксировать значение вручную: задать переменную в `.env`/окружении
  (см. закомментированный блок в `prod.env.example`) — env имеет приоритет над
  авторасчётом.

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

## Firewall и SSH hardening

Базовый hardening сервера — отдельный **opt-in** скрипт (не входит в
`install-docker.sh`, чтобы не отключить парольный вход неожиданно):

```bash
# сначала заведите SSH-ключ и проверьте вход по нему:
ssh-copy-id user@server
sudo bash deploy/harden-server.sh
```

Что делает `harden-server.sh` (идемпотентно):

- **ufw**: `allow 22,80,443/tcp` → `default deny incoming` / `allow outgoing`
  → `enable`. Наружу остаются только SSH и Caddy (HTTP/HTTPS).
- **sshd**: `PasswordAuthentication no` + `PermitRootLogin prohibit-password`
  через drop-in `/etc/ssh/sshd_config.d/99-avino-hardening.conf`.
  **Анти-локаут**: этот шаг выполняется только если в `authorized_keys` найден
  хотя бы один ключ; иначе пропускается с предупреждением.

> ⚠ **Docker публикует порты в обход ufw.** Docker вписывает свои правила в
> iptables **до** цепочек ufw, поэтому `deny incoming` не закроет порты,
> которые опубликовал контейнер. Отсюда правило: на сервере **никогда не
> поднимать базовый `docker-compose.yml` без прод-overlay** — только
> `-f docker-compose.yml -f docker-compose.prod.yml`. В overlay `ports: !reset`
> снимает публикацию `postgres/redis/api/web/client`, и наружу смотрит только
> Caddy. Без overlay БД/Redis окажутся открыты в интернет, и ufw их не спасёт.

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

## Тестовый стенд (staging)

Тест-стенд = «как прод» (реальные домены + авто-TLS + закрытый периметр +
прод-сборка фронтов), но **без настроенного SMTP**. Чтобы войти по EMAIL-OTP без
почтового провайдера, дополнительный overlay `../docker-compose.staging.yml`
возвращает сервис `api` в `NODE_ENV=development` — тогда код OTP пишется в лог
(в чистом production без SMTP письмо не отправляется и не логируется → войти
нельзя).

```bash
# .env: те же DOMAIN_* / ACME_EMAIL / POSTGRES_PASSWORD / JWT_*, что и для прод.
# DNS A-записи тест-доменов должны указывать на IP стенда ДО первого запуска.
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               -f docker-compose.staging.yml --profile app up -d --build

# войти: открыть https://$DOMAIN_CLIENT, ввести email, забрать код из лога api:
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               -f docker-compose.staging.yml --profile app logs api | grep "DEV EMAIL"
```

Когда подключите реальный SMTP (`docs/GUIDE_YANDEX_SMTP_SETUP.md`) — overlay
больше не нужен: разворачивайте чистый прод (без `-f docker-compose.staging.yml`).

### Seed-данные на стенде

- **Справочники — автоматически** (`migrate` → `prisma db seed`): роли, тарифы
  TOP/VIP, курс USD→UZS, app-settings. Нужны приложению при любом окружении.
- **Локальный ADMIN — автоматически на staging.** `seed-admin.cjs` пропускается
  при `NODE_ENV=production`, поэтому staging-overlay держит `migrate` в `dev` —
  тогда создаётся `admin@avino.uz` с ролью ADMIN (вход через dev-OTP из лога).
- **Демо-контент — вручную** (не для прод, идемпотентно по фикс. UUID). После
  поднятия стека:
  ```bash
  dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app'
  $dc exec api node prisma/seed-demo.cjs   # объявления NEW/ACTIVE/DRAFT, районы, фото (picsum), жалобы
  $dc exec api node prisma/seed-chat.cjs   # треды и сообщения чата
  ```

## Бэкапы

Дампы делает `deploy/backup.sh`: `pg_dump -Fc` (сжатый custom-формат) из
контейнера `avino-postgres` в каталог `backups/` (в git не коммитится),
с проверкой целостности, ротацией по сроку и опциональной off-site выгрузкой.

```bash
./deploy/backup.sh                 # один дамп + ротация
./deploy/backup.sh --no-rotate     # дамп без удаления старых
./deploy/backup.sh --list          # показать имеющиеся копии
./deploy/backup.sh --help          # справка по всем env-переменным
```

### Расписание (cron): два слоя

Схема «дед-отец-сын»: частые часовые копии для свежего отката + редкие суточные
для долгого хранения. Откройте `crontab -e` на сервере и добавьте:

```cron
# Часовой слой: хранить 2 суток (BACKUP_RETENTION_DAYS=2)
0  * * * *  cd /path/to/avino && BACKUP_RETENTION_DAYS=2 ./deploy/backup.sh >> /var/log/avino-backup.log 2>&1

# Суточный слой: отдельный каталог, хранить 30 суток (своя ротация)
30 3 * * *  cd /path/to/avino && BACKUP_DIR=/path/to/avino/backups/daily BACKUP_RETENTION_DAYS=30 ./deploy/backup.sh >> /var/log/avino-backup.log 2>&1
```

Разные `BACKUP_DIR` → слои не затирают ротацию друг друга: часовые живут 2 сут.
в `backups/`, суточные — 30 сут. в `backups/daily/`.

### Off-site (S3/R2) — обязательно для прод

Копия на том же VPS бесполезна при гибели диска/сервера. Включается заданием
`BACKUP_S3_BUCKET` (креды и endpoint берутся из `.env`: `S3_ENDPOINT`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`). Нужен `aws` cli на сервере.

```cron
0 * * * *  cd /path/to/avino && BACKUP_RETENTION_DAYS=2 BACKUP_S3_BUCKET=avino-backups ./deploy/backup.sh >> /var/log/avino-backup.log 2>&1
```

Срок хранения в самом бакете задавайте lifecycle-политикой провайдера (R2/S3),
а не скриптом.

### Откат на последний бэкап (restore)

> Перед откатом снимите свежий дамп (`./deploy/backup.sh`) — чтобы неудачное
> восстановление можно было отменить.

```bash
cd /path/to/avino
dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app'

# 0. (если локальных копий нет) подтянуть последнюю с off-site:
#    LATEST_KEY=$(aws s3 ls s3://avino-backups/db/ --endpoint-url "$S3_ENDPOINT" | sort | tail -1 | awk '{print $4}')
#    aws s3 cp "s3://avino-backups/db/$LATEST_KEY" backups/ --endpoint-url "$S3_ENDPOINT"

# 1. выбрать самый свежий дамп
LATEST=$(ls -t backups/avino-*.dump | head -1); echo "Откат на: $LATEST"

# 2. отключить сервисы, держащие соединения с БД (postgres оставляем поднятым)
$dc stop api web client migrate

# 3. пересоздать БД с нуля и восстановить (гарантированно чистое состояние;
#    дамп содержит CREATE EXTENSION postgis/pg_trgm/pgcrypto — поднимутся сами)
docker exec -i avino-postgres psql -U avino -d postgres \
  -c "DROP DATABASE IF EXISTS avino WITH (FORCE);" \
  -c "CREATE DATABASE avino OWNER avino;"
docker exec -i avino-postgres pg_restore -U avino -d avino --no-owner < "$LATEST"

# 4. поднять стек обратно
$dc up -d
```

Быстрый вариант без пересоздания БД (откат «поверх», объекты DROP+CREATE из
дампа) — когда схема совпадает и нужно лишь вернуть данные:

```bash
$dc stop api web client migrate
docker exec -i avino-postgres pg_restore -U avino -d avino --clean --if-exists --no-owner < "$LATEST"
$dc up -d
```

Том `caddy-data` (сертификаты Let's Encrypt) и `avino-postgres-data` (данные БД)
тоже критичны — держите их в бэкап-плане наряду с дампами.

## Диагностика

| Симптом | Что проверить |
|---------|---------------|
| Не выпускается сертификат | DNS A-записи → IP сервера; порты `80/443` открыты; верный `ACME_EMAIL` |
| `api` не стал `healthy` | `... logs api migrate` — обычно миграции/БД/секреты в `.env` |
| 502 от Caddy | поднялся ли upstream (`... ps`); совпадают ли домены в `.env` и `Caddyfile` |
| Браузер бьёт в `localhost:4000` | `web`/`client` собраны со старым `DOMAIN_API` → пересобрать (`--build`) |

## На заметку (вне этих файлов)

- Сервис `migrate` в проде дополнительно гоняет `prisma db seed` +
  `seed-admin.cjs` (создаёт локального ADMIN). Для первого деплоя ок; если не
  нужно — переопределите `command` сервиса `migrate`.
- Yandex Maps key (`NEXT_PUBLIC_YANDEX_MAPS_API_KEY`) прокидывается build-арг'ом
  только в `apps/client/Dockerfile` (+ compose). Для `apps/web` (админка) он НЕ
  прокинут — добавьте по аналогии с `NEXT_PUBLIC_API_BASE_URL`, если карта нужна
  и там.
