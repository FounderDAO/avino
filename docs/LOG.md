# SWAGGER https://test-api.avino.uz/api/docs

# http://localhost:3001/en/legal/terms#contacts


# URL: https://developer.tech.yandex.ru/keys

# BUILD LOCAL MODE 
docker compose --profile app up -d --build

cd /path/to/avino          # каталог, куда клонировали репо

# 2. подтянуть смёрженный код
git pull --ff-only

# 3. удобный алиас (3 overlay = staging-режим)
dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app'

# 4. пересобрать и поднять (идемпотентно — пересоздаёт только изменившиеся контейнеры)
$dc up -d --build --remove-orphans


SWAGGER_ENABLED=true
SWAGGER_USER=admin
SWAGGER_PASS=avino-dev

# USERS:
chat-seller@demo.avino.uz
chat-buyer@demo.avino.uz
# GET OTP CODE
docker compose logs api | grep "DEV EMAIL", потом аккаунт → «Сообщения».

# DOCS
http://localhost:4000/api/docs — публичный Swagger UI (то, что увидит мобайл; без admin/*)
http://localhost:4000/api/docs-json — сырой OpenAPI (для codegen)
http://localhost:4000/api/docs/internal — полный, со всеми контроллерами; спросит Basic-auth → логин admin, пароль avino-dev

# OTP code from container log
docker compose logs api | grep -iE "otp|код" | tail

Полная прод-команда (с overlay и профилем app) — пересобрать и перезапустить только client:
  
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app up -d --build client

Запускать из корня репозитория (/Users/founder/Desktop/2026/avino, а на сервере — из папки клонированного репо), где лежат оба docker-compose*.yml.

Нюансы:
- Прод-бандл client инлайнит публичный URL API на этапе сборки, поэтому в .env должны быть заданы DOMAIN_* (иначе соберётся со старым/localhost-URL). Это та же причина, по которой нужен именно --build.
- Чтобы Yandex-карта попала в бандл, в .env должен быть NEXT_PUBLIC_YANDEX_MAPS_API_KEY (он подставляется как build-arg).
- Проще и идемпотентнее — штатный скрипт: ./deploy/deploy.sh --no-pull (соберёт всё, прогонит health-check). Но если нужно точечно только витрину — команда выше.

Если это локальный dev-стек (без prod-overlay), то короче:

docker compose --profile app up -d --build client
docker compose --profile app build client && up -d client


Redaktirovat qilib save qilsa xam /listings error 
Redaktirovat otmen qilsa xam /listings error  


Ключевое: приватный ключ Apple не нужен (только Service ID как audience, как у Google); линковка по верифицированному email — без миграции БД; всё config-gated (без креды приложение работает как раньше).

Что нужно от тебя/владельца перед продом (вне кода):
1. Платное членство Apple Developer Program.
2. App ID c Sign in with Apple + Service ID с привязанным доменом портала и зарегистрированным return URL (HTTPS).
3. Прописать APPLE_CLIENT_ID / NEXT_PUBLIC_APPLE_CLIENT_ID / NEXT_PUBLIC_APPLE_REDIRECT_URI в deploy-env. 
4. End-to-end проверка Apple возможна только на HTTPS-хосте (на localhost Apple не работает) — локально покрыто unit-тестами.

Мелкие follow-up (не блокируют, для паритета с Google) описал в PR: тот же cleanup для GoogleSignInButton и @ApiBody на auth-роутах.

DOMAIN_CLIENT=test.avino.uz
DOMAIN_ADMIN=test-admin.avino.uz
DOMAIN_API=test-api.avino.uz
ACME_EMAIL=admin@avino.uz
POSTGRES_PASSWORD=$(openssl rand -hex 24)   # вписать сильный пароль



Часть A — только ты (Yandex 360 + DNS)

По гайду §2:
1. Yandex 360 для бизнеса → добавить домен avino.uz, подтвердить (TXT-запись).
2. Создать ящик no-reply@avino.uz.
3. DNS на avino.uz:

┌─────────────┬─────────────────┬──────────────────────────────────────────────────┬──────┐
│     Тип     │      Хост       │                     Значение                     │ Прио │
├─────────────┼─────────────────┼──────────────────────────────────────────────────┼──────┤
│ MX          │ @               │ mx.yandex.net                                    │ 10   │
├─────────────┼─────────────────┼──────────────────────────────────────────────────┼──────┤
│ TXT (SPF)   │ @               │ v=spf1 redirect=_spf.yandex.net                  │ —    │
├─────────────┼─────────────────┼──────────────────────────────────────────────────┼──────┤
│ TXT (DKIM)  │ mail._domainkey │ (ключ из админки Yandex)                         │ —    │
├─────────────┼─────────────────┼──────────────────────────────────────────────────┼──────┤
│ TXT (DMARC) │ _dmarc          │ v=DMARC1; p=none; rua=mailto:postmaster@avino.uz │ —    │
└─────────────┴─────────────────┴──────────────────────────────────────────────────┴──────┘

4. В ящике включить доступ по IMAP/SMTP → создать пароль приложения для «Почта» (основной пароль аккаунта не подойдёт).

Часть B — на сервере: вписать SMTP в .env

В ~/avino/.env (пустые ранее SMTP_*):
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465                 # SSL; для STARTTLS — 587
SMTP_USER=no-reply@avino.uz   
SMTP_PASSWORD=<пароль приложения>
SMTP_FROM=no-reply@avino.uz   # обязан совпадать с SMTP_USER, иначе Yandex отклонит

Часть C — переход на чистый прод

Чистый прод = тот же стек, но без -f docker-compose.staging.yml (тогда api/migrate уходят в NODE_ENV=production). Это ровно то, что делает штатный скрипт:
cd ~/avino
./deploy/deploy.sh --no-pull        # = base + prod (без staging-overlay), up -d --build + health-check
SMTP-конфиг подхватится в рантайме, OTP пойдёт реальными письмами.

⚠️  Главная гоча — вход админа. В чистом проде логин идёт только реальным письмом (dev-OTP в логах больше нет). Демо-admin@avino.uz и chat-*@demo.avino.uz — не настоящие ящики, кода они не получат. Нужен ADMIN на твоём реальном email.
Одной идемпотентной командой (временно сняв prod-гейт у seed-admin только для неё):
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app \
exec -e NODE_ENV=development -e ADMIN_EMAIL=<твой-реальный-email> api \ 
node prisma/seed-admin.cjs
После этого входишь по <твой-реальный-email> — код придёт письмом.

Часть D — live-verify (по гайду §3)

pc='docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile app'
# 1) запросить OTP на тестовый/свой email через портал или:
curl -fsS -X POST https://test-api.avino.uz/api/v1/auth/otp/request \
-H 'content-type: application/json' -d '{"email":"<куда>"}'
# 2) в логах воркера ждём SENT:
$pc logs api | grep -E "Email job|SENT|SKIPPED"
- SENT (messageId=...) → отправлено. SKIPPED_NOT_CONFIGURED → SMTP не подхватился (проверь .env + был ли рестарт api).
- Прод-доставляемость: отправь на временный адрес с mail-tester.com → должно быть SPF=pass / DKIM=pass / DMARC=pass, и письмо во «Входящих», не в спаме.

Подводные камни (из гайда)

- 535 Authentication failed → используется основной пароль, а не пароль приложения / не включён SMTP-доступ.
- Sender address rejected → SMTP_FROM ≠ SMTP_USER.
- Коннект висит → неверный порт vs secure (465↔587) или фаервол VPS блокирует исходящий 465/587 (проверь у провайдера).
- FYI: модерационные/промо-письма пока не доставляются (нет воркера, гайд §5) — на вход по OTP не влияет.

---
Двигаемся так: сделай Часть A (Yandex + DNS) и впиши SMTP_* (Часть B) — секрет мне не присылай. Потом дай знать (или пришли вывод $pc logs api | grep -E "SENT|SKIPPED" после live-verify), и я помогу добить, если что-то не так.

Опционально, по желанию (отдельным PR): из гайда §5 — добавить boot-проверку SMTP, чтобы мисконфиг в проде не был «тихим» (сейчас без SMTP прод молча не шлёт письма и нигде не падает). Скажи, если нужно — сделаю.


Без аргумента создаст 36 объявлений — это дефолт в скрипте:

const N = Math.min(60, Math.max(1, parseInt(process.env.SEED_N || '36', 10)));

Аргумент не обязателен. Хочешь другое число — передай SEED_N (зажат в диапазон 1..60):

docker compose -f docker-compose.staging.yml exec -T -e SEED_N=40 api \
node < apps/api/prisma/seed-catalog.cjs

Что важно знать:
- 36 = ~31 ACTIVE (видны на публичном портале) + 3 NEW (очередь модерации) + 2 DRAFT.
- Плюс один раз зальётся пул ~26 фото в R2 (при повторных прогонах — пропускается, HeadObject-skip).
- Идемпотентно: повторный запуск с тем же SEED_N не плодит дубли — обновляет те же записи (UUID привязаны к индексу 1..N).
- Объявления нумеруются 1..N, поэтому если сначала прогнать SEED_N=36, а потом SEED_N=40 — добавятся ещё 4 (№37–40). Меньшее число потом ничего не удаляет — лишние останутся.

Для нормального наполнения стенда просто запусти как есть, без аргумента → 36 объявлений с фото.



Теперь это невозможно — три слоя защиты (PR #213):

1. Префикс среды S3_KEY_PREFIX — структурная гарантия. Каждая среда пишет в {prefix}/listings/... и сметает только своё поддерево. Локаль (dev/...) и сервер (staging/...) на одном бакете физически не видят фото друг друга. Upload и sweep
читают один источник префикса — разойтись не могут. Чтение не тронуто, старые фото в безопасности.
2. Dry-run (по умолчанию ВКЛ) — сначала логирует, что удалил бы, не удаляя. Смотришь лог, потом включаешь боевой режим.
3. Circuit-breaker — если «сиротами» выглядит >50% (не та/пустая база) — прерывается и алармит, ничего не трогает.

Что тебе сделать (операционно)

Перед включением боевого удаления — прописать разный S3_KEY_PREFIX на каждую среду в её .env:
- локаль → S3_KEY_PREFIX=dev
- сервер/staging → S3_KEY_PREFIX=staging
- prod → свой бакет, можно пусто или prod

Безопасный рецепт включения (в ENV.md §6.2): задать префикс → MEDIA_CLEANUP_ENABLED=true при DRY_RUN=true → проверить [DRY-RUN]-лог → только потом DRY_RUN=false.

Статус

- PR #213 (base main, apps/api) — мёржишь ты (main защищён).
- 514 тестов зелёные, build чистый, opus-ревью «Ready to merge — Yes».
- ⚠️  Важно: фото, загруженные до установки S3_KEY_PREFIX, лежат в плоском listings/... — cleanup с заданным префиксом их не сметает (безопасно), но и не чистит. Если нужно — отдельная разовая миграция ключей (могу сделать), но это не
срочно.

Хочешь — после мёржа пересоберу api и покажу в логах строку Media cleanup worker started (dryRun=…), чтобы убедиться, что режим правильный.


====================================================================
 deploy.sh зашит под прод-overlay — проверю, можно ли ему скормить staging-overlay, или для стенда обновлять только ручной командой.

  Read 1 file (ctrl+o to expand)

⏺ Всё прозрачно. Главный нюанс: deploy/deploy.sh зашит только под прод-overlay (строка 22 — без docker-compose.staging.yml). Если запустить его на стенде, фронты/api пересоберутся с NODE_ENV=production, и dev-OTP перестанет логироваться →
  войти не сможешь. Поэтому на staging обновляйся ручной командой с тремя overlay, а не скриптом.

  Обновление стенда — пошагово

  # 1. на сервере, из корня репозитория
  ssh <user>@75.119.159.168


  Миграции БД накатятся сами — их гонит сервис migrate при старте (prisma migrate + db seed + seed-admin.cjs). Отдельно ничего запускать не надо.

  Быстрее: пересобирать только то, что менялось

  up --build собирает все образы. Если PR трогал только фронт или только API — собери точечно:

  $dc up -d --build client          # менялся только публичный портал (apps/client)
  $dc up -d --build web             # менялась только админка (apps/web)
  $dc up -d --build api migrate     # менялся backend (apps/api) — миграции через migrate

  ⚠️  Помни про baked-сборку: NEXT_PUBLIC_API_BASE_URL и прочие NEXT_PUBLIC_* вшиваются в браузерный бандл web/client на этапе сборки — поэтому любое изменение фронта требует именно --build, не просто рестарт.

  Проверка после выката

  $dc ps                                   # все ли healthy
  $dc logs -f api caddy                    # хвост логов
  # войти: открыть https://$DOMAIN_CLIENT, ввести email, забрать код:
  $dc logs api | grep "DEV EMAIL"          # dev-OTP из лога

  Кратко

  - Стенд → ручная команда с 3 overlay (docker-compose.staging.yml обязателен, иначе нет dev-OTP).
  - deploy.sh — только для чистого прода (когда подключите SMTP по docs/GUIDE_YANDEX_SMTP_SETUP.md, overlay уйдёт и можно будет гонять ./deploy/deploy.sh).
  - Демо-контент (seed-demo.cjs / seed-chat.cjs) — разово после первого подъёма; на повторных обновлениях не нужен (идемпотентен по фикс. UUID, но и не теряется).



Что сделано

deploy/deploy-staging.sh (исполняемый, bash -n чист) — зеркало deploy.sh, но с третьим overlay docker-compose.staging.yml. Делает то же: git pull → --build → up -d → ждёт api healthy → печатает URL и команду для dev-OTP. Те же флаги:

./deploy/deploy-staging.sh              # git pull + сборка + up + health-check
./deploy/deploy-staging.sh --no-pull    # деплой текущего дерева, без git pull
./deploy/deploy-staging.sh --ref <ref>  # выкатить конкретную ветку/тег/коммит
./deploy/deploy-staging.sh --help

В шапке — предупреждение: для чистого прода (с SMTP) использовать deploy.sh, не этот скрипт.

deploy/README.md — в staging-секции добавил «одной командой» с отсылкой на скрипт, ручную команду оставил как эквивалент.

Теперь обновление стенда

ssh <user>@75.119.159.168
cd /path/to/avino
./deploy/deploy-staging.sh

.env-валидация, миграции (через сервис migrate) и health-check — внутри скрипта. Точечная пересборка одного сервиса по-прежнему через ручную команду с алиасом dc (скрипт всегда собирает весь стек, как и deploy.sh).


# NOTIFICATION SETUP 

Что нужно от тебя для прода (PR не блокируют)

1. SMTP Yandex — SMTP_* (гайд docs/GUIDE_YANDEX_SMTP_SETUP.md уже есть).
2. Firebase service account → FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY (новый гайд docs/GUIDE_FIREBASE_PUSH_SETUP.md).
3. Применить миграцию 20260622000000_notification_deliveries в staging/CI (локально нет DATABASE_URL).
4. После мёржа — пересобрать avino-web/avino-client (baked-образы); live-verify реальной отправки.



# 1) выставить флаг (перезапишет, если строка уже есть; иначе допишет)
grep -q '^TELEGRAM_INCLUDE_OTP_CODE=' .env \
  && sed -i 's/^TELEGRAM_INCLUDE_OTP_CODE=.*/TELEGRAM_INCLUDE_OTP_CODE=true/' .env \
  || printf '\nTELEGRAM_INCLUDE_OTP_CODE=true\n' >> .env

# 2) пересоздать ТОЛЬКО api — env_file читается при создании контейнера
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app \
  up -d --force-recreate api

⚠️ Важно: restart не подойдёт — он переиспользует старый контейнер со старым env. Нужен именно up -d --force-recreate (образ не пересобирается, только пересоздаётся контейнер с новым env). --build тоже не нужен.

Проверка

# флаг долетел?
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app \
  exec api printenv TELEGRAM_INCLUDE_OTP_CODE        # → true

Затем запроси OTP ещё раз — в Telegram-алерте снова появится строка КОД: ….

Бонус (нашёл в deploy/deploy-staging.sh)

Для email-входа на стенде код в любом случае пишется в лог api (dev-фолбэк без SMTP) — можно даже без Telegram:

docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app \
  logs api | grep "DEV EMAIL"



Так у нас еще есть не сколько улучшения:
1-Если я создаль обьявления и увидел в ленте нужно как то помететь что это моя или хотя бы когда приходить в detail page место контактов и чатов нужно писать что это ваше обьявления 
2- для номер телефона +998902793100 нужен заглушка ОТП мы этот аккаунт будет отдать для IOS Developers and Android Developers чтобы они  смогли с любыми ОТП кодом для проверку ultrathink



Понял — это git на сервере: при деплое git pull идёт по HTTPS к приватному репо, а аутентификацию там, судя по всему, отдаёт gh (его прописал gh auth setup-git как credential-helper). Раз gh на стенде нет — pull падает.

Самый чистый путь — не чинить gh вообще, а обновить код одноразовым токеном и запустить деплой с --no-pull.

Решение (на сервере, из корня репозитория avino)

# 1. подтянуть ветку напрямую, аутентификация токеном из файла (в history попадёт
#    подстановка $(cat ...), не само значение)
git fetch https://x-access-token:$(cat ~/.gh_token)@github.com/FounderDAO/avino.git feat/days-badge-compact-units

# 2. переключиться на неё
git checkout -B feat/days-badge-compact-units FETCH_HEAD

# 3. деплой БЕЗ git pull (код уже на месте) — пересоберёт client-образ
./deploy/deploy-staging.sh --no-pull

Если ~/.gh_token на сервере нет — скопируй с локали (с твоей машины):

scp ~/.gh_token root@75.119.159.168:~/.gh_token

Альтернатива — вернуть штатный flow (поставить gh)

Если хочешь, чтобы ./deploy/deploy-staging.sh --ref ... снова работал сам (Debian/Ubuntu):

type -p curl >/dev/null || apt update && apt install curl -y
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list
apt update && apt install gh -y
gh auth login --with-token < ~/.gh_token
gh auth setup-git

Рекомендую первый путь — он не трогает окружение и нужен ровно для этого выката. После проверки бейджа на стенде, когда смёржишь #261, обычный ./deploy/deploy-staging.sh вернёт стенд на main.

Дальше отвечу на русском по CLAUDE.md, но один момент: команды устанавливать/деплоить выполняешь ты на сервере — мне туда доступа нет. Сказать, как глянуть бейдж вживую после выката?

# GENERATE SEED 
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml \
  exec -T api npx prisma migrate deploy

docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml \
  exec -T -e SEED_PER_REGION=4 -e SEED_TASHKENT=20 api node < apps/api/prisma/seed-all.cjs


# DELETE ALL ORDERS
Готово. Скрипт: apps/api/prisma/purge-listings.cjs

Что он делает

Удаляет все объявления на staging и всё, что к ним привязано, оставляя пользователей, настройки (app_settings), регионы/районы, сохранённые поиски и аудит нетронутыми.

Ключевой момент, который я проверил в schema.prisma: все 9 внешних ключей на listings объявлены onDelete: Cascade, включая вложенный ChatThread → ChatMessage. Поэтому одного prisma.listing.deleteMany({}) хватает — Postgres сам каскадно снесёт переводы, медиа, промо, логи промо/модерации, избранное, чат-треды+сообщения, жалобы и заявки на просмотр. Никаких ручных порядков удаления не нужно.

Запуск (тот же паттерн, что у seed-скриптов)

# 1) DRY-RUN — покажет, что удалится, ничего не трогая:
docker compose -f docker-compose.staging.yml exec -T api \
  node < apps/api/prisma/purge-listings.cjs

# 2) Реальное удаление (предохранитель CONFIRM_PURGE):
docker compose -f docker-compose.staging.yml exec -T -e CONFIRM_PURGE=yes \
  api node < apps/api/prisma/purge-listings.cjs

# 3) Удалить И почистить файлы в R2 (нужны S3_* env в контейнере):
docker compose -f docker-compose.staging.yml exec -T \
  -e CONFIRM_PURGE=yes -e PURGE_R2=yes \
  api node < apps/api/prisma/purge-listings.cjs

Что заложил по безопасности

- Предохранитель: без CONFIRM_PURGE=yes это dry-run — печатает счётчики и выходит. Случайно ничего не снесёт.
- Отчёт до/после: показывает, сколько объявлений и потомков по каждой таблице удаляется, и проверяет, что после очистки 0 строк-потомков (иначе предупреждает).
- Идемпотентность: повторный запуск на пустом каталоге просто скажет «чистить нечего».

На что обратить внимание

1. Орфаны R2: по умолчанию файлы в Cloudflare R2 не удаляются — DELETE FROM listings чистит только БД. Это безвредно (новый seed грузит свои ключи, воркер чистки orphan R2 из #211 подберёт старые). Если хочешь чистый бакет — флаг PURGE_R2=yes (собирает storage_key до удаления строк и батчами шлёт DeleteObjects).
2. Stale-уведомления: notifications и saved_searches ссылаются на listing_id только внутри JSON (без FK), поэтому переживут очистку и могут указывать на несуществующие id. Для staging это безобидно; скажи, если хочешь их тоже подчистить.
3. После очистки засевай новый каталог через seed-all.cjs или seed-catalog.cjs — уже с новыми параметрами.

Хочешь, добавлю в скрипт опциональную чистку stale-уведомлений или сразу свяжу его с пере-сидом (purge + seed одной командой)?


# RESET DB LISTING AND GENERATE NEW 


Зададим алиас стека (канонический набор overlay'ев — как в deploy-staging.sh, а не одиночный -f docker-compose.staging.yml из шапки purge-скрипта)

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml --profile app"
Шаг 0. Прогрев / проверки

# api жив и healthy?
$COMPOSE ps api

# (опц.) свежий код, если чистишь под новый сид:
#   ./deploy/deploy-staging.sh        # git pull + build + up + миграции

Шаг 1. Dry-run очистки (безопасно, ничего не удаляет)

Без CONFIRM_PURGE скрипт только покажет, что будет снесено:

$COMPOSE exec -T api node < apps/api/prisma/purge-listings.cjs

Посмотри строку listings ... N и потомков — это то, что уйдёт.

Шаг 2. Реальная очистка каталога

$COMPOSE exec -T -e CONFIRM_PURGE=yes api node < apps/api/prisma/purge-listings.cjs

Опционально, чтобы снести и файлы фото в R2 (а не плодить orphan-объекты — их потом и так подберёт воркер #211, но можно сразу):

$COMPOSE exec -T -e CONFIRM_PURGE=yes -e PURGE_R2=yes api node < apps/api/prisma/purge-listings.cjs

В конце ждём ✓ Каталог пуст. Можно засеивать заново.

Шаг 3. Seed-all (каталог по всем 14 регионам)

$COMPOSE exec -T \
  -e SEED_PER_REGION=4 -e SEED_TASHKENT=20 \
  api node < apps/api/prisma/seed-all.cjs

- SEED_PER_REGION — сколько объявлений в каждом регионе (дефолт 4).
- SEED_TASHKENT — отдельно для Ташкента (дефолт 20).
- Итого при дефолтах ≈ 13×4 + 20 = 72 карточки с разбросом по bathrooms/parking/lotArea/amenities, USD/UZS, возрасту (DaysBadge), промо TOP/VIP и очередью модерации.

Требования (иначе сид упадёт на preflight): у контейнера api заданы S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY (+S3_ENDPOINT) и есть исходящий интернет — фото реально качаются (loremflickr→picsum) и грузятся в R2 как storage_key (без этого sign-on-read даст заглушки «AVINO»).

Шаг 4. Проверка

# пробежать клиента — карточки с фото, бейджи, фильтры
$COMPOSE logs api | grep "DEV EMAIL"     # вытащить OTP для входа, если нужно

Открой публичный портал (https://<DOMAIN_CLIENT>): /search должен показать карточки по разным регионам с рабочими фото, гистограмму цен и Zillow-фильтры.

## 
Проверил — доки живые на staging.

Ссылка для мобильного разработчика

Swagger UI (публичный API):
https://test-api.avino.uz/api/docs
✅ отдаёт 200 — можно смотреть прямо в браузере.

Raw OpenAPI JSON (для импорта в Postman / генерации SDK):
https://test-api.avino.uz/api/docs-json

Здесь весь публичный контракт: auth (OTP/Google/Apple), listings, search, geo, favorites, saved-searches, promotions, notifications, chat, complaints, exchange-rate, settings, users. Bearer JWT — кнопка Authorize (токен из POST /auth/otp/request → /auth/otp/verify).

Если нужен полный контракт (включая admin/*)

https://test-api.avino.uz/api/docs/internal        (UI)
https://test-api.avino.uz/api/docs/internal-json   (JSON)
За HTTP Basic-auth (сейчас отдаёт 401 без креденшелов). Логин admin, пароль — SWAGGER_PASS из деплой-окружения (в репозитории его нет, он секрет). Мобильщику обычно хватает публичного /api/docs — internal давать только если ему реально нужны админ-роуты.

⚠️ Прод (api.avino.uz) отдавать не стоит — там SWAGGER_ENABLED=false (production), доки не смонтированы. Для ознакомления — только staging-ссылка выше.

Хочешь, выгружу текущий docs-json в файл (openapi.json), чтобы скинуть ему статикой, если staging будет недоступен?


1-Order price changed history list changed_date changed_percentage 
3-xojatxona 1 1.5 2 3 4+

Order create fieds dan turar maydoni, noturar maydoni va Order title kerak emas xozircha shuning uchun ularni berkirib qo'yamiz client app dan Yani create voqtidaxam ko'rinmasligi kerak va order detail daxam ko'rinmasligi kerak ultrathink

4- Order title olib tashlash kk 


2-Create voqtida address tilni barcha tilda qilish kerak 

Tour logik ni ko'rib chiqish kk 
Order create uchun phone number REQUIRED 

Map ga click qilganda Popup modal chiqish kk 
Map change bo'lgan voqt Property card 
User profile da FirstName LastName required 



P0 — блокеры прода, но это server/ops, не код в репо (нужен доступ к VPS / Team Lead):
1. SMTP-провайдер + чистый прод-деплой — без него EMAIL-OTP не уходит, вход невозможен. Главный блокер. Нужны боевые креды.
2. Бэкапы на сервере — включить cron + off-site R2 + однократно прогнать restore. Нужен SSH к VPS.
3. Внешний uptime-мониторинг + алерты (UptimeRobot/Better Stack → Telegram). Нужен аккаунт сервиса.

P1 — ещё открыты, из них код-задачи я могу взять прямо сейчас:
- #10 Лимиты ресурсов (mem_limit/cpus) в docker-compose.prod.yml — чисто код, быстро.
- #11 dependabot.yml (npm+actions+docker) + закрепить образы до минора (redis:7.4, caddy:2.8) — чисто код.
- #13 Актуализировать deploy/README.md (убрать выполненные «На заметку») — чисто доки.
- #12 Firewall/SSH runbook (ufw + sshd) — доки/скрипт.
- #9 CD: образы в GHCR + деплой по тегу — код (новый workflow), но нужны secrets SSH_KEY/HOST/GHCR.

P2 — полировка (#14-20): zero-downtime, метрики хоста, тюнинг PG, e2e-смоук Playwright, rate-limit на Caddy, CODEOWNERS/.nvmrc, бэкап .env.

---
Что предлагаю: закрыть тройку чистых код/доки-задач #10 + #11 + #13 одним заходом (без внешних зависимостей, безопасно) — это доводит P1 почти до конца. P0-блокеры (#1/#2/#4) и #9 требуют серверного доступа/кредов/секретов — их лучше за тобой.

# TASK: REQUIRED

```bash
Одно замечание для тебя как оператора: перед запуском harden-server.sh на боевом VPS убедись, что вход по SSH-ключу работает (ssh-copy-id + проверка) — иначе скрипт по гарду пропустит отключение пароля, но это и есть защита от локаута.

```


```bash
Ты сеньор-разработчик в этом проекте (CryptoSignalV2). Новая задача из бэклога Фазы 0.

Следующая — F0-5 (K5, S): починить сбор/ретеншн свечей, чтобы измерение перестало
врать на усечённой истории.
  - crontab(minute=1) для 1h и crontab(minute=2, hour='*/4') для 4h вместо интервалов
    от старта beat (сейчас «закрытые» свечи усечены);
  - добавить fetch 1d + индикаторы 1d (сейчас 4h-пайплайн и regime мёртвы без 1d);
  - ретеншн 1h ≥1000 свечей (или не удалять 1h) — сейчас ~20 дней, EMA200 без
    вышедшего seed, трендовый фильтр срабатывает не там, где тестировалось;
  - детекция gaps + backfill.
  Файлы: config/celery_schedule.py:185-200, apps/asset/tasks.py:1384-1404,
  universal_data_service.py:151-155.

Контекст: только что закрыт F0-2 (net-издержки в бэктест, ADR-039, PR #5 в main).
Перегон журнала под издержками показал: эджа нет ни на 1h, ни на 4h — НО 1h-выборка
была усечена ретеншном до ~20 дней (n=9/14), поэтому вердикт направленный, не
окончательный. F0-5 снимает именно это ограничение — после него имеет смысл
перезамерить эдж (P1-1). См. docs/tuner-runs/f0-2-costs-2026-07-06.md и ADR-039.

Протокол проекта: одна задача = одна ветка (fix/f0-5) = один PR; фикс → GREEN-тест →
ADR в backend/docs/DECISION.md → перенос строки в tasks/DONE.md. Тесты гоняются в
docker: `docker compose exec -T backend python manage.py test <path>`.

ultrathink
```

PropertyCard da shaxar va manzil tuliq chiqish 
Buy default Toshketn ko'rsatsin

===========================================================
7-Yandex pochta ochish kk company nomiga @timurkw  
8-Eskizga tasdiqlab to'lovq qilib yuborish kk @timurkw 
===========================================================
2-Buy default Toshketn ko'rsatsin Mapdaxam : DONE
10-Favorites bilan shate rasm tepasiga chiqadi Detail Modal page : DONE
26-Navbardan Map page olib tashlash kerak : DONE
1-PropertyCard birlamchi da shaxar va manzil tuliq chiqish : DONE
4-Rasm to'g'ri ko'rsatish kerak Grid xolatda: DONE
9-Detail pagedan Mapda ko'rish bosganda YandexMap da pointer turgan bo'lishi kerak new pageda : DONE
13-Price change history date format tug'irlash kk 11.08.2023: DONE
14-Клиент могут создать 2 активный Обьявления лучше добавить админку контроллер чтобы можно было управлять с количество лимитов  : DONE
22-Price filter qayta check qiladi Ipoteka olib calculate olib tashlandi : DONE
28-Profil page dan tilni olib tashlash kk : DONE
27-https://test.avino.uz/ru/sell find agent button disabled qilish kerak "Comming soon" ko'rsatamiz : DONE
29-My tour page ga tab qilib qo'yish kerak IN/OUT uchun : DONE
30- /ru/sell page da Сдать в аренду bosganda ARENTA TYPE selected xolatda da bo'lish kerak forma : DONE
18-Detail page grid image tug'irlash kerak : DONE
17-Rent mapdati qizil emas orange da ko'rsatish kerak :DONE 
20-Umumiy filterdagi Button fixed qilib qo'yish kk : DONE
21-Oylik to'lov currency price dan olib tashlaymiz : DONE
6-Garaj qulaylik bo'limidi chiqish kk Detail model page da : DONE 
23-Filter save bir nechta saqlay oladi va qanday saqlagan bo'lsa shu xolatda ochish kk : DONE 
5-Detail page da price tagida etaj o'rnida SELL/RENT turish kk 
11-Sanuzel soni dublaj bo'lib qolgan 
12-Asosiy ma'lumotlarga uy turi chiqishi kerak
16-Qimmat arzon filter ishlamadi 
24-Navbardan NEW BUILDINGS  olib tashlanadi ?
25-Yangi bino -> Yangi qurilish va filter qurilgan voqti 3 dan kam bo'lsa shu categoryga kiradi 


31-Convertatsiya qilganda USD->1k da yaxlidlash kk 
32-Admin Обьявления page da SELL/RENT filter qo'shish kk 
33-Admin page listings da Rasm yonidan address ko'rishi kk 
34-Admin dashboar page malumotlar dynamik real bo'lish kerak

# Bu uzi ishlar ekan by default
25- Navbardan NEW BUILDINGS  olib tashlanadi ?  Yangi bino -> Yangi qurilish va filter qurilgan voqti 3 dan kam bo'lsa shu categoryga kiradi 

15-Production uchun server tanlab shunga olib utishimiz kk 

1-Комната Санузель Убераем  
2- место него будет Площадь, Год постройки, Квартира/Home/Apartment и сколько стоит м²  Price/м² если частный дом посчитаем от Цена/жилой помешения
3-Гараж уходить на удобству 