# DevOps Audit — Avino (дата 2026-07-05)

## Резюме

Зрелость DevOps — **средняя, «добротный staging, но не production-ready»**. Есть чистая overlay-модель compose (dev → prod → staging), Caddy с авто-TLS и закрытым периметром, валидирующие деплой-скрипты, продуманный backup-скрипт с restore-процедурой и CI-гейт (build + jest + openapi drift-check). При этом деплой — ручной, со сборкой образов прямо на VPS, с даунтаймом и без быстрого отката; наблюдаемость практически отсутствует (health-эндпоинт статический, нет Sentry/метрик/алертов, ротация docker-логов не настроена); образы single-stage под root без лимитов ресурсов.

**Топ-3 риска:**
1. **Слепой прод**: нет мониторинга, алертов и error-tracking — о падении узнают пользователи; docker-логи без ротации со временем забьют диск VPS.
2. **Бэкапы не подтверждены**: скрипт отличный, но cron и off-site выгрузка требуют ручной настройки на сервере и нигде не верифицированы; restore ни разу не тестировался.
3. **Вход в чистом production не работает без SMTP** (EMAIL-OTP не отправляется и не логируется) — прод заблокирован до подключения транзакционного email-провайдера.

## Текущее состояние

| Область | Статус | Комментарий |
|---|---|---|
| CI/CD | ⚠️ | Один workflow `ci.yml`: api build+jest+openapi drift-check, web/client lint+build. Нет деплоя из CI, e2e, client-тестов, int-spec, security-сканов, dependabot |
| Docker | ⚠️ | Overlay-модель compose чистая, healthcheck у api/postgres/redis. Но образы single-stage, root, без лимитов ресурсов и ротации логов; web/client без healthcheck |
| Secrets | ✅ | `.env` не в git, `.dockerignore` исключает секреты, JWT без дефолтов, `deploy.sh` валидирует `__CHANGE_ME__`, prod требует сильный пароль БД (`:?`). Минус: ручная доставка `.env` на сервер |
| DB | ⚠️ | 35 Prisma-миграций, `migrate`-сервис перед стартом api, PostGIS-образ. `backup.sh` качественный, но cron/off-site не подтверждены, restore не тестировался, откат миграций = только restore |
| Deploy | ⚠️ | Скрипты идемпотентны, с валидацией и health-wait. Но: сборка на VPS, даунтайм при `up --build`, откат = `--ref` + rebuild (минуты), запуск вручную по SSH |
| Observability | ❌ | `/api/v1/health` — статический `{status:'ok'}` без проверки DB/Redis; нет Sentry/метрик/uptime-мониторинга/алертов; логи — дефолтный json-file без ротации |
| Security (infra) | ⚠️ | Prod: наружу только Caddy :80/:443 (`ports: !reset`), авто-TLS, helmet+Throttler+`trust proxy` в api. Нет: обновления образов (плавающие теги), firewall-runbook, rate-limit на Caddy |

## Детальные находки

### 1. CI/CD — `.github/workflows/ci.yml` (единственный workflow)

**Есть:**
- Job `api`: pnpm install `--frozen-lockfile` → build `@avino/shared` → `prisma generate` → build → export OpenAPI + **drift-check** (`git diff --exit-code -- apps/api/openapi.*.json`) → jest.
- Job `web`: lint + `next build` (tsc-гейт) для `@avino/web` и `@avino/client`.
- `concurrency` с `cancel-in-progress` — устаревшие прогоны отменяются.
- Кеш pnpm есть (`setup-node` с `cache: pnpm`), версия pnpm из `packageManager` (pnpm@9.0.0).
- Секреты в CI не используются — для OpenAPI-экспорта заданы явные плейсхолдеры (preview-режим без соединений). Это корректно.

**Нет:**
- Деплоя из CI (ни в staging, ни в прод) — деплой только руками по SSH.
- Unit-тестов `apps/client` (Vitest-харнес в репо есть, в CI не гоняется — job web делает только lint+build).
- Integration-тестов api (`*.int-spec.ts` — 3+ файла в `apps/api`, требуют живого PG; в CI нет service-контейнера postgres/postgis).
- Гейта на миграции: `prisma migrate deploy` на чистой БД в CI не проверяется — битая миграция обнаружится только при деплое.
- Сборки Docker-образов в CI / registry (GHCR) — образы собираются на VPS.
- Security-сканов (npm audit / CodeQL / trivy), `dependabot.yml`/renovate (в `.github/` только `workflows/`), e2e.
- Actions закреплены по мажорному тегу (`@v4`), не по SHA — приемлемо, но не идеал.

### 2. Docker

**Dockerfile'ы** (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/client/Dockerfile`):
- Все три — **single-stage** на `node:20-slim`: `COPY . .` всего workspace + `pnpm install --frozen-lockfile` (с devDeps) + build. В рантайм-образе остаются исходники, devDependencies и pnpm-store → образы тяжёлые, поверхность атаки шире.
- **Нет `USER`** — все контейнеры работают под root.
- **Нет `HEALTHCHECK`** в Dockerfile (у api healthcheck задан на уровне compose; у web/client его нет нигде).
- web/client: `CMD ["pnpm", "start"]` — лишняя прослойка pnpm вместо прямого `node`/`next start`; api корректно `CMD ["node", "dist/main.js"]`.
- `NEXT_PUBLIC_*` (API URL, Yandex key, Google Client ID, SITE_URL) прокинуты build-arg'ами — задокументировано и согласовано с compose. Следствие: смена домена/ключа = пересборка образа.
- Корневой `.dockerignore` хороший: node_modules/dist/.next/.git/`.env*` (кроме `.env.example`) исключены — секреты в образ не попадают.

**Compose** (`docker-compose.yml` + `docker-compose.prod.yml` + `docker-compose.staging.yml`):
- Модель: base = dev (postgres+redis наружу, профиль `app` для полного стека), prod-overlay = `NODE_ENV=production`, `ports: !reset []` у всех кроме Caddy, обязательный сильный `POSTGRES_PASSWORD` (`:?`-синтаксис), CORS на реальные домены; staging-overlay = только `NODE_ENV=development` у api/migrate + `OTP_TELEGRAM_DELIVERY=true`. Чисто и хорошо задокументировано в комментариях.
- Healthchecks: postgres (`pg_isready`), redis (`ping`), api (fetch `/api/v1/health`) — есть; **web/client — нет**; `caddy: depends_on` без `condition`.
- `migrate` — one-shot сервис (`prisma migrate deploy && db seed && seed-admin`), api ждёт `service_completed_successfully` — порядок корректный.
- `restart: unless-stopped` у долгоживущих сервисов — есть.
- **Нет resource limits** (`mem_limit`/`cpus`) — прожорливый Next.js SSR может задушить postgres на одной машине.
- **Нет `logging:`-конфигурации** ни в одном compose-файле — используется дефолтный json-file без ротации (если не настроен `/etc/docker/daemon.json` на сервере; в `deploy/install-docker.sh` ротация тоже не настраивается).
- Версии образов: `postgis/postgis:16-3.4` (закреплён минор — хорошо), `redis:7-alpine`, `caddy:2-alpine`, `node:20-slim` — плавающие теги без digest.
- Сеть — одна дефолтная compose-сеть без сегментации (для одного стека на VPS приемлемо).
- В **dev** base-компоузе postgres/redis/api публикуются как `"5432:5432"` и т.п. — bind на 0.0.0.0. Если base когда-либо поднять на сервере без prod-overlay, БД с паролем `avino` будет торчать в интернет. Staging/prod overlay это закрывают (`!reset`), но защита — только дисциплина запуска правильной комбинации `-f`.

### 3. Окружения и секреты

- В git закоммичены только `.env.example` и `apps/api/.env.example` — реальных секретов в них нет (проверено). `.env` в `.gitignore` (плюс `client_secret*.json`, `backups/` — строка 39). Локальный дамп `backups/avino-20260619-144643.dump` в git **не** попадает (проверено `git ls-files`).
- JWT-секреты без дефолтов — приложение не стартует с пустыми (валидация `apps/api/src/config/env.validation.ts`); dev-дефолт `avino/avino` для postgres существует только в base-compose и перекрыт prod-overlay'ем.
- `deploy/prod.env.example` — отдельный прод-шаблон (домены, ACME, SMTP, S3) с генерацией `openssl rand`.
- Доставка секретов на staging/prod: **вручную** — файл `.env` в корне репо на сервере. Нет secret-manager'а, ротации, аудита доступа. Для одного VPS терпимо, но `.env` на сервере — единственная точка: он не бэкапится скриптом (`backup.sh` дампит только БД).
- `deploy.sh`/`deploy-staging.sh` валидируют 7 обязательных переменных и отвергают `__CHANGE_ME__` — хорошая защита от полудозаполненного `.env`.

### 4. База данных

- **Миграции**: 35 каталогов в `apps/api/prisma/migrations` + `migration_lock.toml`. Применение — `prisma migrate deploy` в one-shot сервисе `migrate` до старта api. Forward-only: механизм отката миграции — только restore из дампа.
- **PostGIS**: образ `postgis/postgis:16-3.4`; расширения (`postgis`, `pg_trgm`, `pgcrypto`) создаются миграциями и входят в дамп (restore-процедура в `deploy/README.md` это учитывает).
- **Бэкапы** (`deploy/backup.sh`): `pg_dump -Fc` из контейнера, запись через `.partial` + проверка сигнатуры `PGDMP`, ротация по `BACKUP_RETENTION_DAYS`, опциональный off-site в S3/R2 (`BACKUP_S3_BUCKET`). В `deploy/README.md` — двухслойная cron-схема (часовые 2 сут. + суточные 30 сут.) и полная restore-процедура (включая подтягивание с off-site).
- **Пробелы**: (а) cron на VPS надо настраивать руками — в репо нет подтверждения, что он настроен; (б) off-site — опциональный флаг, а README сам называет его «обязательно для прод»; (в) restore ни разу не прогонялся (нет отметок/чеклиста); (г) `migrate` в проде гоняет `prisma db seed` при каждом деплое (справочники — идемпотентно, но README рекомендует пересмотреть; `seed-admin.cjs` в production сам себя пропускает по guard'у).

### 5. Деплой

- `deploy/deploy.sh` (прод) и `deploy/deploy-staging.sh` (стенд, +staging overlay): валидация `.env` → `git pull --ff-only` (или `--ref <tag/branch>`) → `docker compose ... up -d --build --remove-orphans` → ожидание `healthy` у api (30×10с) с дампом логов при таймауте. `set -euo pipefail`, идемпотентны, безопасны для повторного запуска.
- `deploy/deploy-client.sh` — частичный редеплой только client (`build` + `up -d --no-deps client`), с теми же overlay, чтобы build-args совпадали.
- `deploy/reseed-staging.sh` — purge+seed каталога на стенде c dry-run и интерактивным подтверждением; `deploy/branch_cleanup.sh` — чистка смерженных веток через gh; `deploy/install-docker.sh` — идемпотентная установка Docker+Compose ≥2.24 на Ubuntu.
- **Zero-downtime нет**: `up --build` пересоздаёт контейнеры → даунтайм на время миграций + старта api + Next.js (минуты, т.к. сборка образов идёт на самом VPS и конкурирует за CPU с живым трафиком).
- **Rollback медленный**: `./deploy/deploy.sh --ref <старый тег>` = checkout + полная пересборка образов. Прежние образы не тегируются/не хранятся; registry нет. Релизные git-теги в процессе не фигурируют.
- **`docs/SERVER_TO_PROD.md`** — это sizing-документ (выбор VPS 8 vCPU/24 GB, расчёт ёмкости, план масштабирования §7, бесплатный тюнинг §6: ISR-кэш, PgBouncer, тюнинг PG, кластеризация Node, вынос BullMQ-воркеров). Актуален (2026-06-19), но это **не runbook перехода на прод** — не закрыты: выбор и настройка SMTP-провайдера (блокер входа!), боевые креды Eskiz/Translate/Google/Firebase, DNS cutover avino.uz, миграция данных со staging (если нужна), чеклист первого прод-деплоя.
- **Устаревшее в `deploy/README.md` («На заметку»)**: (а) `app.set('trust proxy', 1)` уже добавлен — `apps/api/src/main.ts:17`; (б) `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` для **client** уже прокидывается (ARG в `apps/client/Dockerfile` + compose) — не прокинут только для web.

### 6. Наблюдаемость

- **Health**: `apps/api/src/health/health.controller.ts` → `GET /api/v1/health` возвращает статический `{status:'ok'}` — **не проверяет** ни PostgreSQL, ни Redis. Повисшая БД даст «healthy» api. У web/client health-роутов нет вовсе (`apps/client/src/app/api/` содержит только `og/`), и в compose у них нет healthcheck.
- **Error tracking**: Sentry/аналогов нет (grep по `sentry` в apps — пусто).
- **Метрики/алерты**: нет ничего — ни Prometheus/Grafana, ни node-exporter/cAdvisor, ни внешнего uptime-мониторинга в репо/доках.
- **Логи**: stdout всех сервисов → docker json-file; ротация не настроена ни в compose, ни в `install-docker.sh` → рост без ограничений. Централизованного сбора (Loki/ELK) нет. Единственный «алертинг» — Telegram-уведомления админам как фича приложения (не инфраструктурный).

### 7. Безопасность инфраструктуры

- **Периметр prod/staging**: наружу только Caddy `:80/:443(+udp)`; postgres/redis/api/web/client — `ports: !reset []`. TLS автоматический (Let's Encrypt, том `caddy-data` персистит сертификаты), редирект http→https, HTTP/3, zstd/gzip (`deploy/Caddyfile`).
- **App-уровень**: helmet (`apps/api/src/main.ts:34`), `ThrottlerModule` + `ConditionalThrottlerGuard` (rate limit), `trust proxy 1` для корректного IP за Caddy.
- **Пробелы**: rate-limit/защита на уровне Caddy отсутствует (весь флуд доходит до Node); security-заголовков в Caddyfile нет (для Next-витрин); обновления базовых образов — только при пересборке, автоматизации (renovate/watchtower) нет; firewall (ufw) и SSH-hardening не входят в `install-docker.sh` и не описаны в runbook'ах — `deploy/README.md` лишь упоминает «открытые порты 22/80/443»; в dev-compose порты БД паблишатся на 0.0.0.0.
- CODEOWNERS / PR-template / dependabot отсутствуют; защита main через PR — настроена на GitHub (вне репо).

### 8. Прочее

- **Версии**: `package.json` → `engines: node>=20, pnpm>=9`, `packageManager: pnpm@9.0.0` (corepack). `.nvmrc` нет (не критично — engines + corepack покрывают).
- **Lockfile-дисциплина**: единый `pnpm-lock.yaml`, везде `--frozen-lockfile` (CI и все Dockerfile'ы) — ✅.
- **Staging vs prod**: разделение через overlay + один и тот же `.env`-шаблон; staging (VPS 75.119.159.168, test.avino.uz) сознательно держит api в `NODE_ENV=development` (OTP в лог + Telegram-доставка). Риск — случайно выкатить staging-overlay на прод; защита — только разные скрипты (`deploy.sh` vs `deploy-staging.sh`).
- **Домены** (`deploy/prod.env.example`): `avino.uz` / `admin.avino.uz` / `api.avino.uz`; DNS A-записи требуются до первого запуска (HTTP-01). Мелкое расхождение: комментарий в `.env.example` упоминает `www.avino.uz` в CORS-примере, тогда как prod-шаблон использует apex `avino.uz`.

## План действий

### P0 — критично до прода

1. **Подключить SMTP-провайдер и провести чистый прод-деплой без staging-overlay.** Без SMTP в `NODE_ENV=production` EMAIL-OTP не доставляется и не логируется → вход невозможен. Заполнить `SMTP_*` в `.env` (SES/Resend/Postmark — Hetzner блокирует 25 порт), проверить по `docs/GUIDE_YANDEX_SMTP_SETUP.md`, деплой `./deploy/deploy.sh`.
2. **Включить и верифицировать бэкапы на сервере**: добавить в crontab оба слоя из `deploy/README.md` §Бэкапы, задать `BACKUP_S3_BUCKET` (off-site в R2 — обязателен), затем **однократно прогнать restore** на staging по процедуре из README и зафиксировать результат (например, в `docs/LOG.md`).
3. **Ротация docker-логов**: на VPS создать `/etc/docker/daemon.json` с `{"log-driver":"json-file","log-opts":{"max-size":"20m","max-file":"5"}}` + restart docker, либо добавить `logging:` в `docker-compose.prod.yml` (x-logging anchor на все сервисы). Дополнить `deploy/install-docker.sh`.
4. **Внешний uptime-мониторинг + алерты**: повесить UptimeRobot/Better Stack (бесплатного тарифа достаточно) на `https://api.avino.uz/api/v1/health`, `https://avino.uz`, `https://admin.avino.uz` с уведомлением в Telegram. Это единственный способ узнавать о падении раньше пользователей.
5. **Углубить healthcheck api**: заменить статический ответ в `apps/api/src/health/health.controller.ts` на реальную проверку PG (`SELECT 1` через Prisma) и Redis (`PING`) — например, `@nestjs/terminus`. Добавить healthcheck для `web`/`client` в compose (хотя бы `wget -qO- http://localhost:3000/`).
6. **Error tracking (Sentry)** для api + client + web: DSN через env, включить только в production. Без него прод-ошибки невидимы.

### P1 — важно

7. **Multi-stage Dockerfile'ы + non-root**: api — стадия build → рантайм только `dist` + prod-deps (`pnpm deploy --prod` или `pnpm prune --prod`); web/client — Next.js `output: 'standalone'` → рантайм `node server.js`. Добавить `USER node` и `HEALTHCHECK` во все три (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/client/Dockerfile`). Эффект: образы в разы меньше, деплой/откат быстрее, root убран.
8. **CI: закрыть тестовые дыры** в `.github/workflows/ci.yml`: (а) job для `pnpm --filter @avino/client test` (Vitest); (б) job с service-контейнером `postgis/postgis:16-3.4` → `prisma migrate deploy` на чистой БД (гейт на битые миграции) + прогон `*.int-spec.ts` по одному файлу (см. гочу про cross-file контаминацию).
9. **CD-минимум: образы в GHCR + деплой по тегу.** Workflow на git-тег `v*`: build+push трёх образов (`docker/build-push-action`, cache-from gha) → SSH-step (`appleboy/ssh-action`, secrets `SSH_KEY`/`HOST`) → `docker compose pull && up -d`. Это разом даёт: сборку не на VPS, быстрый откат (`--ref` предыдущего тега = pull готового образа, секунды вместо минут) и воспроизводимость.
10. **Лимиты ресурсов в prod-compose**: `mem_limit`/`cpus` для client/web/api (ориентиры из `docs/SERVER_TO_PROD.md` §4: client 3–4 GB, api 2 GB, web 0.7 GB), чтобы SSR не выдавил postgres.
11. **dependabot/renovate** (`.github/dependabot.yml`: npm + github-actions + docker) и закрепление образов минимум до минора (`redis:7.4-alpine`, `caddy:2.8-alpine`).
12. **Firewall/SSH runbook**: дополнить `deploy/install-docker.sh` или README блоком `ufw default deny incoming; ufw allow 22,80,443/tcp; ufw enable` + отключение password-auth в sshd. Учесть, что docker publish обходит ufw — потому на сервере нельзя поднимать base-compose без prod-overlay (задокументировать явно).
13. **Актуализировать `deploy/README.md`**: убрать выполненные пункты «На заметку» (trust proxy сделан; Yandex-ключ для client прокинут), при необходимости добавить ARG для web.

### P2 — желательно

14. **Zero-downtime**: после перехода на registry-образы (п.9) — либо два экземпляра api/client за Caddy с поочерёдным рестартом (`docker rollout`), либо хотя бы порядок «собрать заранее → `up -d` без `--build`», чтобы окно даунтайма сжалось до рестарта контейнеров.
15. **Метрики хоста и контейнеров**: node-exporter + cAdvisor + Grafana Cloud (free tier) или netdata — чтобы сигналы «пора масштабироваться» из `docs/SERVER_TO_PROD.md` §7 (p95, load average, cache hit ratio PG) было чем измерять.
16. **Тюнинг из `docs/SERVER_TO_PROD.md` §6** по мере роста: PgBouncer, `shared_buffers`/`effective_cache_size`, ISR/Redis-кэш горячих страниц, вынос BullMQ-воркеров в отдельный контейнер.
17. **e2e-смоук (Playwright)** на staging после деплоя: главная, /search, вход по OTP (staging-режим позволяет).
18. **Rate-limit на Caddy** для `/api/v1/auth/*` (плагин rate_limit или fail2ban по логам Caddy) — разгрузить Node от флуда до Throttler'а.
19. **Гигиена репо**: `.github/CODEOWNERS`, PR-template, `.nvmrc` (20) для единообразия с CI.
20. **Бэкап `.env` сервера** в защищённое место (менеджер секретов/зашифрованная копия) — сейчас потеря VPS = потеря всех прод-секретов, включая JWT (инвалидация всех сессий).

---
*Аудит выполнен по состоянию рабочей копии `main` на 2026-07-05. Все находки — из файлов репозитория; состояние самого VPS (crontab, daemon.json, ufw) из репо не видно и требует проверки на сервере.*
