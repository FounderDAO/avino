# Spec: бэкенд-доработки по баглисту мобильной команды (BUGS_BACKEND.md)

**Дата:** 2026-07-02
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api` (+ `docs/`)
**Источник:** баглист мобильной команды (Flutter) от 2026-07-01 — пункты #2, #3, #4, #5, #6, #8, #10

## Контекст и цель

Мобильная команда прислала 7 пунктов, требующих доработки сервера. Исследование
показало: часть уже реализована и требует только ответа/конфигурации (#2), часть —
обычные доработки модели/API (#3, #4, #5, #10), счётчики (#8) строятся с нуля,
описания в сидах (#6) действительно дублируют характеристики.

Итог работы: один PR в `apps/api` + файл-ответ `docs/ANSWERS_MOBILE_BACKEND.md`
с именами полей/эндпоинтов для мобилки.

## Решения (утверждены брейнштормом)

- **Скоуп** — все 7 пунктов сразу, включая push-канал saved-search алертов
  (по факту он уже в коде — остаётся конфигурация).
- **#3 санузлы** — вариант A: `bathrooms` становится дробным (`Decimal(3,1)`,
  шаг 0.5), не отдельное `half_bathrooms`. В ответах API — number.
- **#4 цоколь** — вариант B: отдельный флаг `is_basement Boolean`, не
  зарезервированное значение `floor` (магическое число ломает семантику
  диапазонных фильтров `floor_min/floor_max/not_first_floor`).
- **#8 просмотры** — простой инкремент без дедупликации (решение Team Lead;
  мобилке честно сообщаем, что уникальность не считается).
- **#8 счётчики** — отдаём и в детали, и в списках (поиск + «мои объявления»).
  `likes_count` — живой `COUNT` по `favorites` (не денормализованная колонка:
  два пути записи и риск рассинхрона ради экономии дешёвого COUNT не нужны).
- **#10 площади** — только поля `living_area`/`non_living_area`, БЕЗ
  квери-фильтров (мобилка сама пометила фильтр как необязательный; YAGNI).
- **Организация** — одна ветка `feat/mobile-backend-api`, атомарный коммит на
  пункт, один PR (все изменения в `apps/api`, связаны одним запросом мобилки).

---

## A. #2 Save Search — конфигурация и ответ, нового кода нет

Исследование: полигон и push **уже реализованы**.

- Полигон: `filters_json.filters.points` — строка `"lat,lng;lat,lng;…"`
  (≥3 вершин WGS84), парсер `apps/api/src/search/dto/polygon-ring.util.ts`,
  матчер `ST_Within` в `search.service.ts` (`matchNewlyActiveListings`).
- Контракт `/api/v1/saved-searches`: `GET` (список), `POST`
  (`{name, filters_json: {schemaVersion: 1, filters: {...}}}`, 422 при
  `schemaVersion ≠ 1`), `PATCH /:id` (`name`/`filters_json`/`is_active`),
  `DELETE /:id` (204). Отдельного toggle-notify нет: **выкл. алертов =
  `PATCH {is_active: false}`** (матчер обрабатывает только `is_active: true`).
- Push: routing `SAVED_SEARCH_NEW_LISTING → [IN_APP, PUSH]`
  (`notification-routing.ts:46`), push-шаблон есть
  (`notification-templates.ts:186`), FCM-отправка и деактивация мёртвых токенов
  реализованы (`notification-dispatcher.service.ts:343-390`,
  `fcm.service.ts`). Email — отдельный существующий дайджест.

**Работа (деплой-чеклист, не код):**
1. Прописать `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY`
   на стейдже/проде — гайд `docs/GUIDE_FIREBASE_PUSH_SETUP.md`.
2. Включить runtime-тоггл `push_notifications_enabled` (админка,
   `admin-notification-settings`). Пока выключен — PUSH-доставки висят PENDING
   и доедут при включении (поведение dispatcher'а).
3. Мобилка регистрирует токены: `POST /api/v1/notifications/devices`
   `{platform: "ANDROID"|"IOS", push_token}` (JWT), `DELETE
   /api/v1/notifications/devices/:id` при логауте.

## B. #3 Санузлы 1.5 — `bathrooms` → `Decimal(3,1)`

Файлы: `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/<ts>_alter_listing_bathrooms_decimal/migration.sql`,
`apps/api/src/listings/dto/create-listing.dto.ts`,
`apps/api/src/listings/dto/update-listing.dto.ts`,
`apps/api/src/search/dto/search-listings.dto.ts`,
`apps/api/src/listings/listings.service.ts`,
`apps/api/src/search/search.service.ts` + их спеки.

- Миграция: `ALTER TABLE "listings" ALTER COLUMN "bathrooms" TYPE numeric(3,1);`
  (расширяющий каст, данные сохраняются). Prisma: `bathrooms Decimal? @db.Decimal(3,1)`.
- Create/Update DTO: `@IsNumber({maxDecimalPlaces: 1}) @Min(0) @Max(99)` +
  кастомный валидатор шага 0.5 (`value * 2` — целое; сообщение вида
  «bathrooms must be a multiple of 0.5»).
- Фильтр `bathrooms_min`: `@IsInt` → `@IsNumber({maxDecimalPlaces: 1}) @Min(0)`.
  SQL `bathrooms >= ?` не меняется.
- **Сериализация — number** (`1`, `1.5`): в маппингах ответов
  (`listings.service.ts` detail/list, `search.service.ts` rows, модерационные
  ответы, если отдают `bathrooms`) добавить `Number(...)` — Prisma теперь
  возвращает `Decimal`. Значения кратны 0.5 — во float представимы точно,
  потери нет. Тип поля в контракте (`number | null`) не меняется → non-breaking
  для веба (целые остаются валидны).

## C. #4 Цоколь — `is_basement`

Файлы: schema + миграция `<ts>_add_listing_is_basement`, create/update DTO,
`search-listings.dto.ts`, `search.service.ts`, `listings.service.ts` + спеки.

- Миграция: `ALTER TABLE "listings" ADD COLUMN "is_basement" boolean NOT NULL DEFAULT false;`
  Prisma: `isBasement Boolean @default(false) @map("is_basement")`.
- Create/Update DTO: `is_basement?` `@IsOptional() @IsBoolean()`.
- Фильтр `is_basement?: boolean` в `SearchListingsQueryDto` — трансформация
  строки квери по образцу существующего `not_first_floor` (тот же паттерн
  boolean-фильтра). Семантика: `true` → `WHERE is_basement = true`;
  `false`/отсутствует → без условия.
- `floor` не трогаем; при цоколе клиент шлёт `floor: null` — сервер не форсит.
- Ответы: `is_basement` в детали, `SearchListItem`, списке «мои объявления».

## D. #5 Бассейн — `POOL` в enum `Amenity`

Файлы: schema + миграция `<ts>_add_amenity_pool`.

- Миграция: `ALTER TYPE "Amenity" ADD VALUE 'POOL';` (PG 16 — допустимо в
  транзакции миграции, значение не используется в той же транзакции).
- Prisma enum `Amenity`: + `POOL` (9-е значение).
- DTO create/update/фильтр типизированы enum'ом — подхватят автоматически,
  AND-containment `@>` и GIN-индекс работают без изменений.

## E. #10 Площади — `living_area` / `non_living_area`

Файлы: schema + миграция `<ts>_add_listing_living_areas`, create/update DTO,
`listings.service.ts` + спеки.

- Миграция: `ALTER TABLE "listings" ADD COLUMN "living_area" numeric(10,2),
  ADD COLUMN "non_living_area" numeric(10,2);` (nullable, без бэкфилла).
  Prisma: `livingArea Decimal? @map("living_area") @db.Decimal(10,2)`,
  `nonLivingArea Decimal? @map("non_living_area") @db.Decimal(10,2)`.
- Create/Update DTO: `living_area?`, `non_living_area?` — decimal-строка по
  образцу `area` (`@Matches` тем же паттерном `/^\d{1,12}(\.\d{1,2})?$/`).
- Ответ: **строки** в формате `area`/`lot_area` (`"83.50"`, через `toFixed(2)`)
  — консистентность контракта; мобилка уже парсит `area` в этом формате
  (зафиксировать в ANSWERS). Отдаём в детали объявления; в списках не нужно.
- Принимаем для любого типа недвижимости — правило «только для домов» живёт
  на клиенте.
- Квери-фильтров НЕТ (решение выше).

## F. #8 Счётчики просмотров и лайков

Файлы: schema + миграция `<ts>_add_listing_views_count`,
`apps/api/src/listings/listings.controller.ts`, `listings.service.ts`,
`search.service.ts` + спеки (включая e2e на POST /view, если есть e2e-слой).

- Миграция: `ALTER TABLE "listings" ADD COLUMN "views_count" integer NOT NULL DEFAULT 0;`
  Prisma: `viewsCount Int @default(0) @map("views_count")`.
- **Инкремент**: `POST /api/v1/listings/:id/view` — публичный (без guard),
  атомарный `updateMany({where: {id}, data: {viewsCount: {increment: 1}}})`;
  0 строк → 404 `NOT_FOUND`; успех → 204 без тела. Без дедупликации.
- **`likes_count`** — живой агрегат по `favorites` (индекс по `listing_id` есть):
  - деталь: Prisma `_count: {select: {favorites: true}}`;
  - поиск (raw SQL): скалярный подзапрос
    `(SELECT COUNT(*)::int FROM favorites f WHERE f.listing_id = l.id)`;
  - «мои объявления»: `_count` в существующем запросе списка.
- Ответы: `views_count: number`, `likes_count: number` в детали,
  `SearchListItem` и списке «мои объявления» (везде int, не null).

## G. #6 Сиды — описания без дублей характеристик

Файлы: `apps/api/prisma/seed-all.cjs` (функция `descs()`, ~строки 357-384);
проверить `seed-catalog.cjs`, `seed-demo.cjs` на тот же паттерн.

- Переписать генерацию: описание НЕ содержит комнаты/м²/этаж/год (они
  показываются из структурных полей). Вместо этого — лайфстайл-тексты: район
  и инфраструктура, транспорт, состояние/ремонт, окружение; RU/UZ/EN;
  детерминированно по индексу `g` (без `Math.random`), вариативность через
  наборы шаблонов по типу недвижимости.
- Заодно добавить `POOL` в `amenitiesFor` для части HOUSE-объявлений
  (демо-данные для нового фильтра).
- Деплой-нота: пересидить демо/стейджинг-базу после мержа.

## H. Организация, тесты, деплой

- **Ветка** `feat/mobile-backend-api` от `main`; атомарные коммиты
  (`feat(listings): …`, `feat(search): …`, `chore(seed): …`); один PR —
  все изменения в `apps/api` + docs.
- **Тесты** по образцу существующих спеков: DTO-валидация (шаг 0.5 bathrooms,
  is_basement, decimal-паттерн площадей), SQL фильтра `is_basement`,
  инкремент POST /view (204/404), счётчики в ответах detail/search/list.
- **Миграции** (5, последовательные timestamps): bathrooms-decimal,
  is_basement, amenity-pool, living-areas, views-count. Применение —
  `prisma migrate deploy` (compose-сервис `migrate`).
- **OpenAPI**: regen `apps/api/openapi.public.json` (DTO/Swagger-декораторы).
- **`docs/ANSWERS_MOBILE_BACKEND.md`** — ответ мобилке по каждому пункту:
  формат полигона + контракт saved-searches + регистрация девайсов (#2);
  `bathrooms` number с шагом 0.5 + `bathrooms_min` (#3); `is_basement` (#4);
  ключ `POOL` (#5); `views_count`/`likes_count` + `POST /listings/{id}/view`,
  уникальность не считается (#8); `living_area`/`non_living_area` строки в
  формате `area`, без фильтра (#10); сиды почищены (#6).
- **After merge**: запись в `docs/DONE.md`, ADR-0119 (дробные санузлы, цоколь,
  POOL, площади, счётчики — пакет доработок под мобильный клиент), запись в
  `docs/LOG.md`, деплой-чеклист из §A (Firebase env + тоггл) и пересид (§G).

## Вне скоупа

- Дедупликация/анти-накрутка просмотров (уникальность по user/device) —
  осознанно отложено, задокументировано в ANSWERS.
- Фильтры `living_area_min/max` — добавим по реальному запросу мобилки.
- Пуш-канал для чего-либо, кроме уже реализованного routing'а.
- Изменения `apps/client`/`apps/web` — отдельные задачи, если понадобятся
  (веб-визард может позже добавить 0.5-шаг санузлов, цоколь, бассейн, площади).
