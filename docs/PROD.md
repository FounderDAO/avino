# PROD.md — выбор production-сервера и локации для Avino

**Дата исследования: 2026-07-12.** Все цены актуальны на эту дату и подлежат
проверке на сайте провайдера перед заказом. Курс для пересчёта: ~12 900 UZS/$
(оценка, уточнить по ЦБУ).

---

## 1. Требования и исходные данные

### Продукт
Сайт недвижимости для Узбекистана (аудитория — Ташкент и регионы).
Требования владельца: работа без отказов (разумная HA для одного проекта)
и быстрая отдача клиентам в Узбекистане.

### Стек (из репозитория)
| Компонент | Детали |
|---|---|
| API | NestJS (`apps/api`), порт 4000 |
| Публичный портал | Next.js SSR (`apps/client`), самый нагруженный сервис (лимит по умолчанию 4 GB / 3 CPU) |
| Админка | Next.js (`apps/web`), лёгкая (768 MB / 1 CPU) |
| БД | PostgreSQL 16 + PostGIS 3.4 (`postgis/postgis:16-3.4`) — гео-поиск, кластеры, trigram; **PG-first тюнинг**: `shared_buffers` ≈ 25 % RAM, `effective_cache_size` ≈ 65 % (см. `deploy/compute-limits.sh`, ADR-0132) |
| Кэш | Redis 7.4 |
| Realtime | socket.io namespace `/rt` (ADR-0138): тонкие инвалидации, JWT-auth на connection, Redis-adapter уже подключён (`RedisIoAdapter` в `main.ts`); клиенты web+Flutter — долгоживущие WS, детали в §6 |
| Прокси/TLS | Caddy 2.8 (Let's Encrypt, HTTP/3), единственный сервис с портами 80/443 наружу |
| Медиа | Cloudflare R2 (CDN-слой для фото уже закрыт) |
| Ошибки | Sentry (3 приложения, config-gated) |
| Деплой | Docker Compose (prod-overlay `docker-compose.prod.yml`), multi-stage образы ~0.6 GB, `deploy/deploy.sh` идемпотентен |
| Бэкап | `deploy/backup.sh`: `pg_dump -Fc` + ротация + опциональный off-site в S3/R2 |

Дефолты compose и `compute-limits.sh` откалиброваны под **24 GB RAM / 8 vCPU**;
скрипт автоматически пересчитывает лимиты под любой другой бокс.

### Юридический контекст (важно)
Закон «О персональных данных» № ЗРУ-547 требовал с 2021 г. обработки ПД
граждан Узбекистана на серверах внутри страны. **Поправки ЗРУ-1125 от
26.03.2026 смягчили требование**: обязательная локализация осталась только для
биометрических, генетических данных и данных абонентов телеком-операторов.
Прочие ПД можно хранить за рубежом при одном из условий: адекватная защита в
стране размещения / стандартные договорные условия / соответствие
международным стандартам ([обзор Serverspace](https://serverspace.uz/about/blog/lokalizacziya-personalnyh-dannyh-v-uzbekistane-chto-vazhno-znat-biznesu-v-2026-godu/amp/),
[Servercore](https://servercore.com/ru/blog/articles/uz-zakon-o-personalnyh-dannyh/)).
Для Avino (аккаунты, телефоны, объявления — не биометрия) зарубежный хостинг
легален; зафиксировать в политике конфиденциальности механизм трансграничной
передачи. **Проконсультироваться с юристом перед запуском.**

---

## 2. Сравнение локаций: задержки до Ташкента и риски

RTT из Ташкента по данным [WonderNetwork](https://wondernetwork.com/pings/Tashkent)
(снимок 2026-07-12; перед заказом прогнать `ping`/`mtr` с реальных UZ-провайдеров —
Uztelecom, Beeline, Ucell):

| Локация | RTT из Ташкента | Комментарий / риски |
|---|---|---|
| **Ташкент (TAS-IX/UZ-IX)** | ~1–5 ms | Идеальная задержка, данные в стране. Минусы: цена ×5–6 к Европе, менее зрелые облачные инструменты (снапшоты/API), меньше конкуренции |
| **Москва** | ~55 ms | Хорошая задержка, но **исключаем**: оплата из-за рубежа затруднена, санкционные риски, риски блокировок трафика в обе стороны |
| **Хельсинки (Hetzner hel1)** | ~70 ms | Лучшая европейская задержка (транзит через RU/фин. стык), зрелый провайдер, дешёво |
| **Алматы (PS.kz, Kazteleport, Serverspace)** | ~81 ms (WonderNetwork) | Географически близко, но межстрановая маршрутизация UZ↔KZ часто идёт через Москву/Франкфурт — фактическая задержка не лучше Хельсинки. Проверять mtr отдельно |
| **Франкфурт** | ~88 ms | Стандартный евро-хаб |
| **Нюрнберг / Фалькенштайн (Hetzner)** | ~97–99 ms | Основные ДЦ Hetzner, на ~30 ms хуже Хельсинки |
| **Стамбул** | ~156 ms | Хуже Европы, не рассматриваем |
| **Дубай / Бахрейн (AWS me-south-1, Azure UAE)** | ~211 ms | Вопреки географии — худшая маршрутизация из UZ. Исключаем |

**Выводы по локации:**
1. Для аудитории UZ реально борются три варианта: **Ташкент (1–5 ms)**,
   **Хельсинки (~70 ms)**, **Алматы (~80 ms, нестабильная маршрутизация)**.
2. 70 ms RTT для SSR-сайта приемлемы, если статика/HTML кешируются на edge:
   Cloudflare заявляет PoP в Ташкенте ([cloudflare.com/network](https://www.cloudflare.com/network/) —
   проверить фактическое кеширование с UZ-провайдеров через `cf-ray`-заголовок).
   Медиа уже на R2 → тяжёлый контент и так отдаётся с edge.
3. Ближний Восток и Стамбул отпадают по маршрутизации, Москва — по
   операционным рискам.

---

## 3. Сравнение провайдеров

| Провайдер / локация | Конфигурация под Avino | Цена/мес | Надёжность | Оплата из UZ | Snapshot/Backup | DDoS |
|---|---|---|---|---|---|---|
| **Hetzner Cloud CX53**, Хельсинки | 16 shared vCPU / 32 GB / 320 GB NVMe / 20 TB | **€21.49** (после повышения 15.06.2026; [источник](https://comparedge.com/tools/hetzner/pricing)) | Очень высокая (SLA 99.9 %, live-миграция при отказе хоста) | Карта Visa/MC, PayPal | Снапшоты + Backups (+20 % ≈ €4.3) | Базовая L3/L4 включена |
| **Hetzner AX42** (dedicated), Хельсинки/Фалькенштайн | Ryzen 7 PRO 8700GE 8c/16t / 64 GB / 2×512 GB NVMe RAID1 | **€46.52** ([источник](https://www.hetzner.com/dedicated-rootserver/ax42/); возможен разовый setup — проверить) | Высокая; выделенное железо, RAID1; но нет снапшотов — восстановление только из бэкапов | Карта, PayPal | Storage Box для бэкапов (доп.) | Базовая включена |
| **Hetzner CX43**, Хельсинки | 8 shared vCPU / 16 GB / 160 GB NVMe | **€15.99** | Как CX53 | Карта, PayPal | Да | Базовая |
| **Contabo VPS L**, Нюрнберг | 8 vCPU / 30 GB / 800 GB NVMe | **~€20–25** ([источник](https://contabo.com/en-us/vps-server/)) | Средняя: репутация «дёшево, но овербукинг», медленный саппорт | Карта, PayPal | Снапшоты ограничены | Базовая |
| **UzCloud (Uzbektelecom)**, Ташкент Tier III | 8 vCPU / 24 GB / 200 GB NVMe / IP (юнитовая тарификация: vCPU 85k, RAM 12k/GB, NVMe 3.3k/GB сум) | **≈1.68 млн сум ≈ $130** ([калькулятор](https://uzcloud.uz/prices)) | Tier III ДЦ, данные в стране; облачные функции скромнее (уточнить снапшоты/API) | UZS, локальные карты — проще всего | Уточнить при заказе | TAS-IX, уточнить |
| **Ahost.uz VDS Cloud 400**, Ташкент | 6 vCPU / 8 GB / 400 GB SSD | 1.04 млн сум ≈ $80 ([тарифы](https://www.ahost.uz/vds)) | Локальный хостер с 2010 г.; **8 GB RAM мало** для PG-first стека — только с доп. RAM | UZS | Не заявлены | Не заявлена |
| **PS.kz / Serverspace (Kazteleport)**, Алматы | VPS от 3 120 тг / от €4.1; Tier III, SLA 99.9 % ([Serverspace](https://serverspace.io/services/vps-server/vps-in-kazakhstan/)) | ~$40–70 за 8/24 | Tier III ДЦ (Kazteleport — дочка Halyk Bank) | Карта | Есть у Serverspace | У PS.kz нет anti-DDoS |
| **Mevspace** (dedicated), Варшава | Ryzen 5 3600 / 64 GB / 2×500 GB NVMe от ~$61; Ryzen 9 5950X / 64–128 GB от ~$112 ([тарифы](https://mevspace.com/dedicated-servers/amd)); VPS есть, но слабые (от €3.95) | **~$61–112** | Спорная: отзывы полярные — [Trustpilot смешанный](https://www.trustpilot.com/review/mevspace.com), [whtop 1.4/10](https://www.whtop.com/review/mevspace.com); жалобы на саппорт (до 96 ч без ответа); аудитория MEV/крипто-ботов → abuse-соседи, риск репутации IP | Карта, PayPal, **крипта** (BitPay) | На dedicated снапшотов нет — только свои бэкапы | Заявлена бесплатной, по отзывам слабая |
| AWS Бахрейн / Azure UAE / GCP | аналог 8/32 | $150–250+ | Максимальная | Карта + валютный контроль | Полный набор | Продвинутая |

Замечания:
- **Hetzner июнь 2026**: линейки CPX/CCX подорожали на 113–204 %
  ([Northflank](https://northflank.com/blog/hetzner-cloud-server-price-increases)) —
  их не рассматриваем; Intel-линейка CX подорожала умеренно (~30 %) и остаётся
  лучшей ценой рынка. Существующие контракты повышение не затронуло.
- Гиперскейлеры (AWS/Azure/GCP) дают худшую задержку из UZ (Бахрейн/UAE
  ~211 ms) и цену ×6–10 — избыточны для одного проекта.
- Москва (Selectel, Timeweb и т.п.) исключена: оплата иностранным аккаунтом и
  санкционные риски.

---

## 4. Рекомендуемая конфигурация сервера

### Минимальная (старт, низкий трафик)
- **4 vCPU / 16 GB RAM / 160 GB NVMe** (Hetzner CX43 — 8 vCPU / 16 GB, €15.99).
- `compute-limits.sh` посчитает: PG shared_buffers 4 GB, client ~3 GB, api 2 GB.
- Хватит на тысячи объявлений и сотни одновременных пользователей.

### Рекомендуемая (целевая, headroom под рост) ✅
- **8+ vCPU / 32 GB RAM / 320 GB NVMe** (Hetzner CX53: 16 shared vCPU / 32 GB / 320 GB).
- PG получает shared_buffers 8 GB + effective_cache ~21 GB — вся горячая
  выборка (гео-индексы, trigram) в RAM; client SSR — до 6 GB.
- Диск 320 GB: БД с фото-метаданными и историей цен займёт единицы GB,
  остальное — образы, логи, локальные дампы. Медиа-файлы на R2 диск не едят.

### Путь масштабирования (по порядку, по мере роста)
1. **Вертикально**: CX53 → dedicated AX42 (64 GB, Ryzen, RAID1, €46.52) —
   пересчёт лимитов автоматический, миграция = restore дампа + `deploy.sh`.
2. **Разделить БД и приложения** (при устойчивом >60 % CPU от PG): второй
   сервер под PostgreSQL в той же локации (private network Hetzner бесплатна),
   compose-переменная `DATABASE_URL` уже это позволяет.
3. **Read-реплика PG + LB**: streaming-реплика для тяжёлых гео-выборок /search;
   Caddy → несколько экземпляров `client` (или Hetzner Load Balancer €5.39+).
4. Горизонтальное масштабирование Node-сервисов (stateless; для socket.io
   Redis-adapter УЖЕ подключён, клиент websocket-only → sticky sessions не
   обязательны — подробности в §6).

---

## 5. Итоговая рекомендация

### 🥇 Основной вариант: Hetzner Cloud CX53, Хельсинки (hel1) + Cloudflare proxy
**€21.49/мес + Cloud Backups ≈ €4.3 → ~€26/мес (~$28)** · цены на 2026-07-12, проверить на hetzner.com

Почему:
- **Задержка**: ~70 ms из Ташкента — лучшая в Европе, а с Cloudflare-proxy
  (PoP в Ташкенте) кешируемая статика/страницы отдаются за 5–30 ms; медиа уже
  на R2. Для сайта недвижимости (не realtime-игра) это неотличимо от локального
  хостинга по ощущениям.
- **Надёжность**: SLA 99.9 %, автоматическая миграция VM при отказе хоста,
  снапшоты перед рискованными релизами, авто-бэкапы (7 шт., +20 % цены),
  rescale вверх без переустановки. Это лучший «HA для одного сервера».
- **Цена/качество**: 16 vCPU / 32 GB за €21.49 — недостижимо ни в UZ (×6),
  ни в KZ, ни у гиперскейлеров.
- **Оплата**: карта Visa/MC или PayPal, инвойсы в EUR — работает из UZ.
- **Эксплуатация**: deploy-скрипты репозитория писались под именно такой
  сценарий (один бокс, ufw+docker-overlay, Caddy TLS); у staging уже
  европейский VPS — миграция тривиальна.

Обязательное дополнение — **Cloudflare (free plan) proxy перед всеми тремя
доменами**: кеш на Ташкентском PoP, скрытие IP origin, бесплатная защита от
DDoS L7 (у Hetzner — только L3/L4). Внимание: Caddy при проксировании через CF
должен выпускать сертификаты по DNS-01 или использовать CF Origin CA;
режим SSL — Full (strict). WebSocket `/rt` через Cloudflare работает, но с
нюансами (idle-таймаут 100 c, Under Attack Mode) — разобрано в §6; на выбор
провайдера/локации realtime не влияет.

### 🥈 Бюджетная альтернатива: Hetzner CX43, Хельсинки — €15.99/мес
Те же гарантии, 8 vCPU / 16 GB. Стартовать можно на нём и rescale в CX53 одной
кнопкой (диск растёт без даунтайма, вниз — нет). Contabo VPS L (~€20–25,
Нюрнберг) даёт больше диска, но хуже задержку (~97 ms), репутацию стабильности
и саппорт — не рекомендуется как прод для «работы без отказов».

### 🥉 «Максимальная надёжность/скорость для UZ»: UzCloud, Ташкент (Tier III)
**≈1.68 млн сум ≈ $130/мес** за 8 vCPU / 24 GB / 200 GB NVMe.
Выбирать если: (а) юрист потребует локализацию ПД, (б) нужен маркетинговый
аргумент «данные в Узбекистане», (в) критичны единицы миллисекунд (TAS-IX).
ДЦ Tier III Uzbektelecom, оплата в сумах. Минусы: цена ×5, менее развитые
облачные функции (снапшоты/API уточнить при заказе), один вендор = один
регион (off-site бэкап в R2 обязателен вдвойне).

Гибрид на вырост: прод в Hetzner + дешёвый warm-standby (или только
бэкап-приёмник) в UzCloud — закрывает и латентность DNS-failover-сценария, и
географическое разнесение.

### ❌ Рассмотрено и отклонено: Mevspace (Варшава)

Владелец спрашивал про [Mevspace](https://mevspace.com/) — польский хостер
дешёвых dedicated-серверов (Ryzen 5 3600 / 64 GB / 2×500 GB NVMe от ~$61,
Ryzen 9 5950X от ~$112; VPS от €3.95, но конфигурации слабые; данные
2026-07-12, проверить на сайте). **Для прода Avino не подходит**:

1. **Задержка**: единственная локация — Варшава, **~126 ms** из Ташкента
   ([WonderNetwork](https://wondernetwork.com/pings/Tashkent)) — почти вдвое
   хуже Хельсинки (~70 ms) и заметно хуже Франкфурта (~88 ms).
2. **Надёжность и саппорт**: при заявленных 99.99 % uptime отзывы полярные —
   жалобы на 96 ч молчания саппорта и «легко пробиваемую» DDoS-защиту
   ([Trustpilot](https://www.trustpilot.com/review/mevspace.com),
   [whtop 1.4/10 по 18 отзывам](https://www.whtop.com/review/mevspace.com),
   [LowEndTalk про DDoS](https://lowendtalk.com/discussion/174995/how-good-is-dos-protection-at-mevspace)).
   Для требования «работа без отказов» это дисквалифицирующий фактор.
3. **Репутация соседей**: провайдер позиционируется под MEV/крипто-ботов и
   принимает крипту (BitPay) — abuse-плотные IP-диапазоны повышают риск
   попадания origin-IP в блэклисты (почтовые фильтры, антифрод, гео-сервисы).
4. **Эксплуатация**: на dedicated нет снапшотов/managed-бэкапов и rescale
   (замена железа = переезд с restore), API беднее Hetzner Cloud. При этом
   по цене/железу не выигрывает у Hetzner AX42 (€46.52: Ryzen PRO / 64 GB /
   NVMe RAID1 в локации с задержкой на ~56 ms меньше).

Вердикт: **не альтернатива ни одному из вариантов выше** — проигрывает
Hetzner по задержке, надёжности и эксплуатации при сравнимой цене. Разумная
ниша Mevspace — некритичные стенды/эксперименты (есть 48-часовой тест за €1),
не прод.

---

## 6. Realtime / WebSocket (`/rt`)

В проде работает socket.io-шлюз (namespace `/rt`, ADR-0138): JWT-auth на этапе
connection, персональные комнаты `user:<id>`, payload — **тонкие инвалидации**
(клиент по сигналу дёргает REST). Подключаются web-клиент и мобильное
Flutter-приложение (контракт — `docs/API.md` §20). Ниже — что это меняет для
прод-инфраструктуры.

### 6.1. Cloudflare proxy и WebSocket

- **WS проксируется на всех планах**, включая Free
  ([Cloudflare Docs — WebSockets](https://developers.cloudflare.com/network/websockets/)).
- **Idle-таймаут: Free/Pro ≈ 100 секунд** без данных в любую сторону →
  Cloudflare закрывает соединение; Business/Enterprise — до 600 c
  ([websocket.org — Cloudflare guide](https://websocket.org/guides/infrastructure/cloudflare/)).
  Keepalive закрывается штатным ping/pong socket.io: в коде Avino параметры
  не переопределены → действуют дефолты **`pingInterval: 25000` /
  `pingTimeout: 20000`** (сервер шлёт ping каждые 25 c — с запасом ×4 внутри
  100-секундного окна). Рекомендация: зафиксировать эти значения **явно** в
  `@WebSocketGateway({ namespace: '/rt', pingInterval: 25000, pingTimeout: 20000 })`,
  чтобы будущий апгрейд socket.io или «оптимизация» не вывели ping за лимит CF.
  Не поднимать `pingInterval` выше ~45 c при работе через Cloudflare Free.
- **Under Attack Mode / челленджи**: WS-handshake — это обычный HTTP GET c
  `Upgrade`, поэтому он проходит через WAF/челленджи как любой запрос.
  Браузер с уже пройденным challenge (cookie `cf_clearance`) обычно
  подключается; **non-browser клиенты (Flutter) JS-challenge пройти не могут —
  их WS отвалится**. Уже установленные соединения challenge не рвёт — ломаются
  только новые handshake (то есть и все reconnect'ы). Bot Fight Mode
  документированно ломает WS-handshake ([tests.ws](https://tests.ws/guides/cloudflare-websocket),
  [кейс bad handshake](https://www.answeroverflow.com/m/1476134307482439823)).
  **Обязательная настройка**: WAF custom rule «Skip managed challenge» для
  `api.avino.uz` (минимум — для пути `/rt/*`); Under Attack Mode при атаке
  включать только на зоны `avino.uz`/`admin.avino.uz`, не на api-домен;
  Bot Fight Mode на зоне не включать. Деградация в любом случае мягкая:
  клиент по ADR-0138 падает обратно в 60-секундный REST-поллинг.

### 6.2. Reverse-proxy на сервере (Caddy)

В `deploy/` стоит **Caddy 2.8** — для WS ничего дописывать не нужно:
`reverse_proxy` распознаёт `Upgrade`/`Connection: upgrade` и проксирует WS
автоматически, а таймауты проксируемых стримов по умолчанию **не ограничены**
(в отличие от nginx, где пришлось бы руками ставить `proxy_http_version 1.1`,
заголовки Upgrade/Connection, `proxy_read_timeout`/`proxy_send_timeout` ≥ 90 c
— больше `pingInterval+pingTimeout` = 45 c — и `proxy_buffering off`).

Единственная гоча: **при reload конфига Caddy по умолчанию закрывает
проксируемые WS-соединения**. Добавить в блок API в `Caddyfile`:

```caddyfile
{$DOMAIN_API} {
	encode zstd gzip
	reverse_proxy api:4000 {
		stream_close_delay 12h
	}
}
```

— тогда изменение Caddyfile (добавление домена и т.п.) не устроит массовый
reconnect ([Caddy docs — reverse_proxy streaming](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming)).
Рестарт контейнера api это, разумеется, не спасает — см. 6.5.

### 6.3. Ёмкость: сколько соединений тянет рекомендованный CX53

- Память: официальный замер socket.io — **~1.8 GB RSS на 10 000 подключений**
  на дефолтном ws-движке (~180 KB/соединение)
  ([socket.io/docs/v4/memory-usage](https://socket.io/docs/v4/memory-usage/));
  сторонние замеры дают 35–75 KB ([пример](https://www.zigpoll.com/blog/max-concurrent-socket-connections-node-express)).
  Консервативная оценка: **100–200 KB на соединение**.
- На CX53 (32 GB) `compute-limits.sh` даст api `mem_limit ≈ 3 GB`; минус
  baseline NestJS+REST (~0.5–1 GB) → бюджет ~2 GB на сокеты =
  **≈ 10 000–20 000 одновременных WS** на одном инстансе api.
- CPU: idle-сокеты почти бесплатны (ping-фреймы раз в 25 c); полезная нагрузка
  Avino — редкие крошечные emit-инвалидации, не стриминг.
- Реальная потребность: сокет открывают только **авторизованные** пользователи
  (auth обязателен на connection) — это сотни/низкие тысячи одновременно даже
  при успешном росте. **Запас CX53 ≈ ×10 — рекомендация не меняется.**
  `perMessageDeflate` в socket.io v4 выключен по умолчанию — не включать
  (память и CPU).
- **Файловые дескрипторы**: 1 сокет = 1 fd. В современных Docker/systemd
  дефолтный `LimitNOFILE` контейнера высокий (обычно 1048576), но полагаться
  на дефолт не стоит — зафиксировать в prod-overlay для api:
  `ulimits: { nofile: { soft: 65536, hard: 65536 } }` (задача деплой-PR).
- **sysctl на хосте** (в `harden-server.sh` или руками): `net.core.somaxconn=4096`,
  `net.ipv4.tcp_max_syn_backlog=4096` — под всплеск одновременных reconnect
  после рестарта. Системные `tcp_keepalive_*` трогать не нужно — живость
  держит прикладной ping socket.io.

### 6.4. Масштабирование на >1 инстанс api

- **Redis-adapter уже в проде**: `RedisIoAdapter` в `main.ts`
  (`@socket.io/redis-adapter` поверх существующего ioredis) — emit из любого
  инстанса долетает до сокетов на всех остальных. Цена: +2 постоянных
  redis-соединения (pub/sub пара) на инстанс.
- **Sticky sessions НЕ обязательны**: web-клиент подключается с
  `transports: ['websocket']` (без long-polling fallback, ADR-0138) — сессия
  живёт в одном TCP-соединении, балансировка любая. Условие: Flutter-клиент
  (socket_io_client) настроить так же websocket-only. Если когда-либо
  понадобится polling-fallback (корпоративные прокси) — включить sticky на
  Caddy (`lb_policy ip_hash`) ([socket.io — using multiple nodes](https://socket.io/docs/v4/using-multiple-nodes/)).

### 6.5. Деплой без обрыва соединений

- `docker compose up` пересоздаёт контейнер api → **все сокеты рвутся. Это
  штатный сценарий**, протокол его самозалечивает: авто-reconnect + при
  `connect` полная инвалидация realtime-тегов (gap-fill — пропущенные события
  не теряются, данные всегда из REST) + деградация в 60-секундный поллинг,
  пока сокет мёртв (ADR-0138). Flutter-клиент обязан реализовать тот же
  контракт: reconnect с backoff + рефетч на connect (`docs/API.md` §20).
- Рекомендации для мягкого drain: `app.enableShutdownHooks()` в Nest +
  `stop_grace_period: 30s` для api в prod-overlay — на SIGTERM сервер отдаёт
  корректный close-фрейм, клиенты уходят в reconnect сразу, а не по
  20-секундному pingTimeout. Деплоить в часы минимального онлайна; reconnect-шторм
  «тысячи handshake за секунды» CX53 переваривает без настройки.
- Zero-downtime (blue-green для api за Caddy) на текущем масштабе не окупается —
  вернуться к нему при >1 инстансе api.

### 6.6. Мониторинг realtime

- **Gauge активных соединений**: `io.of('/rt').sockets.size` — логировать раз
  в 60 c и/или отдать в Prometheus (`socket.io-prometheus` / свой gauge в
  `/metrics`); вывести на тот же Grafana Cloud дашборд, что хост-метрики.
- **Алерт на массовые дисконнекты**: падение gauge >50 % за минуту вне окна
  деплоя = проблема (Cloudflare-правило, упавший Redis pub/sub, сеть).
  Дополнительно: счётчик `connect_error` на клиенте уже попадает в Sentry.
- **Синтетическая проверка handshake**: HTTP-чекер (UptimeRobot) на
  `https://api.avino.uz/rt/?EIO=4&transport=polling` — открытие engine.io-сессии
  вернёт 200 с session-payload; падение = сломан именно realtime-слой при
  живом REST `/health`.

---

## 7. Отказоустойчивость, бэкапы, восстановление

### Целевые показатели
- **RPO ≤ 24 ч** (стартовый уровень, ежедневные дампы) → **≤ 15 мин** после
  включения WAL-архивации.
- **RTO ≤ 2 ч** — полное восстановление на чистом сервере по `deploy.sh`.

### Бэкапы (три уровня)
1. **Ежедневный `pg_dump -Fc`** — уже реализован (`deploy/backup.sh`):
   cron 03:00 Asia/Tashkent, ротация локальных копий, **обязательно включить
   off-site в R2** (`BACKUP_S3_BUCKET=avino-backups`, отдельный бакет от медиа,
   креды с write-only политикой). R2 — другая инфраструктура, чем Hetzner →
   настоящий off-site.
2. **Hetzner Cloud Backups** (+20 % ≈ €4.3/мес): 7 автоматических снимков
   всей VM — быстрый откат «сервер целиком», в т.ч. после неудачного апгрейда ОС.
3. **(Фаза 2) WAL-архивация** `wal-g`/`pgbackrest` → R2: PITR c RPO ~5–15 мин.
   Включать, когда появятся платные операции/промо, где потеря суток данных
   станет дорогой.

Снапшот вручную перед каждым рискованным релизом (миграции с DROP и т.п.).

### Мониторинг
- **Sentry** — уже стоит (ошибки 3 приложений).
- **Внешний uptime**: UptimeRobot / BetterStack free — HTTPS-проверки
  `avino.uz`, `api.avino.uz/health`, `admin.avino.uz` с алертом в Telegram.
  Обязательно проверка **из региона, близкого к UZ**, а не только US.
- **Хост-метрики**: node_exporter + Grafana Cloud free tier (или `netdata`)
  — диск/RAM/CPU; алерт на диск >80 % (docker-образы и дампы копятся).
- **Realtime**: gauge активных WS-соединений + алерт на массовые дисконнекты +
  синтетический handshake-чекер — детали в §6.6.
- Логи: ротация уже настроена в prod-overlay (json-file 20m×5).

### Нужен ли standby-сервер?
На старте — **нет**. Один Hetzner Cloud-инстанс с бэкапами двух уровней даёт
фактические ~99.9 %; простой при аварии хоста Hetzner закрывает live-миграцией,
при аварии VM — восстановлением из backup (минуты). Дешевле и надёжнее, чем
самодельный failover, который сам становится источником отказов.

Когда появится SLA-требование выше (реклама, платные размещения):
warm-standby CX33 (€8.49) в Фалькенштайне или UzCloud со streaming-репликой PG
и переключением DNS через Cloudflare (TTL 60 c) — RTO ~10–15 мин.

### Восстановление (runbook)
1. Новый сервер → `deploy/install-docker.sh` → `harden-server.sh`.
2. Склонировать репо, восстановить `.env` из менеджера секретов
   (**завести 1Password/Bitwarden-запись — .env нигде в git нет, это
   единственная незабэкапленная критичная вещь; добавить копию .env в
   зашифрованный бэкап**).
3. `pg_restore` последнего дампа из R2.
4. `./deploy/deploy.sh` → DNS A-записи на новый IP (через Cloudflare — мгновенно).
5. Прогнать smoke: /health, логин по OTP, поиск с гео-фильтром, WS `/rt`.
Раз в квартал — учебное восстановление на временном CX23 (пара часов, ~€0.1).

---

## 8. План миграции со staging (75.119.159.168)

Staging остаётся тестовым контуром; прод поднимается с нуля — чище, чем
«переименовывать» staging.

1. **Заказ**: Hetzner Cloud → проект `avino-prod` → CX53, Хельсинки (hel1),
   Ubuntu 24.04 LTS, SSH-ключ (пароли выключены), включить Backups.
2. **База**: `install-docker.sh` (Docker + ротация логов) → `harden-server.sh`
   (ufw 22/80/443 + запрет паролей SSH; docker-обход ufw уже учтён prod-overlay —
   порты БД/Redis наружу не публикуются).
3. **Cloudflare**: домен avino.uz → NS Cloudflare; A-записи `avino.uz`,
   `api`, `admin` → IP сервера, proxy ON; SSL Full (strict) + Origin CA cert
   в Caddy (или DNS-01). До выпуска сертификатов можно временно включить
   «серую тучку» (DNS-only) для HTTP-01. **Для realtime**: WAF custom rule
   «Skip managed challenge» на `api.avino.uz` (или путь `/rt/*`), Bot Fight
   Mode не включать; в Caddyfile — `stream_close_delay 12h` для api (§6.2).
4. **Секреты**: `.env` по `deploy/prod.env.example` — новые
   `POSTGRES_PASSWORD`, `JWT_*` (`openssl rand -hex 32`), прод-DSN Sentry,
   S3_* (R2), SMTP (SES/Resend — исходящий SMTP у Hetzner по умолчанию
   закрыт, нужен внешний транзакционный провайдер), TELEGRAM_*.
   **`TELEGRAM_INCLUDE_OTP_CODE` в прод не включать.**
5. **Деплой**: `./deploy/deploy.sh` (сам вызовет `compute-limits.sh` →
   на 32 GB боксе PG получит shared_buffers 8 GB). Health-check встроен.
6. **Данные**: прод стартует с чистой БД (staging-сиды не переносить);
   справочники регионов/районов — миграциями/сидом продовых данных.
7. **Бэкапы**: cron `backup.sh` + `BACKUP_S3_BUCKET` → проверить появление
   дампа в R2; сделать тестовый `pg_restore` локально.
8. **Мониторинг**: UptimeRobot на 3 домена + `/health`; алерты в Telegram.
9. **Smoke-тест с UZ-провайдеров**: `ping`/`mtr` + реальный обход сайта из
   Ташкента (мобильный интернет и Uztelecom), проверить `cf-cache-status`;
   отдельно — WS `/rt`: соединение живёт >5 мин через Cloudflare (ping держит
   100-секундное окно), после рестарта api клиент сам переподключается и
   дотягивает данные; то же с Flutter-клиента.
10. **Freeze staging-канала**: убедиться, что cron/CI деплоят staging на
    staging, а прод — только вручную по тегу (`deploy.sh --ref vX.Y.Z`).
11. **Разовая операция: сид юр-документов** (после деплоя фичи #422):
    ```bash
    docker compose exec api node prisma/seed-legal.cjs
    ```
    Идемпотентен: при существующих строках `legal_documents` делает skip.
    Если в runtime-образе api нет prisma/*.cjs (проверка: `docker compose exec api ls prisma`),
    запускать через migrate-сервис:
    ```bash
    docker compose run --rm migrate node prisma/seed-legal.cjs
    ```
    **Внимание**: каталог `prisma/legal-content` появится в образе только после
    пересборки с этой версией кода. Гонять сид нужно **после деплоя** образа.

---

## 9. Оценка месячных затрат (2026-07-12, проверить перед заказом)

### Основной сценарий (Hetzner CX53 + Cloudflare)
| Статья | €/мес | $/мес (≈) |
|---|---|---|
| Hetzner CX53 (16 vCPU / 32 GB / 320 GB, hel1) | 21.49 | 23 |
| Hetzner Cloud Backups (+20 %) | 4.30 | 5 |
| Cloudflare Free (proxy, DDoS L7, кеш) | 0 | 0 |
| Cloudflare R2 (медиа, уже используется) | — | ~1–5 (по объёму) |
| SMTP (Resend free tier / SES) | 0–1 | 0–1 |
| UptimeRobot / Grafana Cloud free | 0 | 0 |
| Sentry (Developer tier) | 0 | 0 |
| **Итого** | **~26–31** | **~30–35** |

### Альтернативы
| Сценарий | $/мес (≈) |
|---|---|
| Бюджетный: CX43 + Backups | ~23 |
| Локальный: UzCloud 8/24/200 NVMe | ~130–140 |
| Гибрид: CX53 + warm-standby CX33 + Backups | ~40 |
| Рост (год+): AX42 dedicated + Storage Box | ~55–60 |

Годовой бюджет основного сценария: **~$360–420** — на порядок дешевле
локального хостинга при сопоставимом (а по инструментам — лучшем) уровне
надёжности; резерв цены оставляет свободный апгрейд до AX42 при росте.

---

## Источники
- Задержки: [WonderNetwork — Tashkent](https://wondernetwork.com/pings/Tashkent)
- Цены Hetzner Cloud после повышения 15.06.2026: [comparedge](https://comparedge.com/tools/hetzner/pricing), [Hetzner Docs — Price Adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [Northflank — разбор повышения](https://northflank.com/blog/hetzner-cloud-server-price-increases)
- Hetzner AX42: [hetzner.com/dedicated-rootserver/ax42](https://www.hetzner.com/dedicated-rootserver/ax42/)
- UzCloud тарифы: [uzcloud.uz/prices](https://uzcloud.uz/prices)
- Ahost.uz VDS: [ahost.uz/vds](https://www.ahost.uz/vds)
- Contabo: [contabo.com/en-us/vps-server](https://contabo.com/en-us/vps-server/)
- Kazteleport/Serverspace Алматы: [serverspace.io](https://serverspace.io/services/vps-server/vps-in-kazakhstan/)
- Mevspace: [тарифы AMD dedicated](https://mevspace.com/dedicated-servers/amd), [Trustpilot](https://www.trustpilot.com/review/mevspace.com), [whtop](https://www.whtop.com/review/mevspace.com), [hostadvice](https://hostadvice.com/hosting-company/mevspace-reviews/), [LowEndTalk про DDoS](https://lowendtalk.com/discussion/174995/how-good-is-dos-protection-at-mevspace)
- Cloudflare PoP: [cloudflare.com/network](https://www.cloudflare.com/network/)
- Cloudflare + WebSocket: [Cloudflare Docs — WebSockets](https://developers.cloudflare.com/network/websockets/), [websocket.org — Cloudflare guide (таймауты по планам)](https://websocket.org/guides/infrastructure/cloudflare/), [tests.ws — Cloudflare WebSocket guide](https://tests.ws/guides/cloudflare-websocket), [Under Attack Mode](https://developers.cloudflare.com/fundamentals/reference/under-attack-mode/)
- Socket.io: [memory usage (~1.8 GB / 10k conn)](https://socket.io/docs/v4/memory-usage/), [performance tuning](https://socket.io/docs/v4/performance-tuning/), [multiple nodes / sticky](https://socket.io/docs/v4/using-multiple-nodes/)
- Caddy WS при reload: [reverse_proxy — streaming / stream_close_delay](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#streaming)
- Локализация ПД (ЗРУ-547/ЗРУ-1125): [Serverspace UZ](https://serverspace.uz/about/blog/lokalizacziya-personalnyh-dannyh-v-uzbekistane-chto-vazhno-znat-biznesu-v-2026-godu/amp/), [Servercore](https://servercore.com/ru/blog/articles/uz-zakon-o-personalnyh-dannyh/), [Dentons](https://www.dentons.com/en/insights/alerts/2021/january/25/uzbekistan-data-localization-requirement-to-be-effective-in-april-2021)
