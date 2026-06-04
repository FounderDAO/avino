# ADR-0031 — Saved searches module: versioned filters_json with owner-scoped CRUD

## Status

Accepted

## Date

2026-06-05

## Context

TASK-091 (milestone M9) добавляет сохранённые поиски (API.md §12, CLAUDE.md §4, §11):

- `GET /api/v1/saved-searches` — список поисков пользователя;
- `POST /api/v1/saved-searches` — создать поиск;
- `PATCH /api/v1/saved-searches/:id` — обновить `name` / `filters_json` / `is_active`;
- `DELETE /api/v1/saved-searches/:id` — удалить поиск.

Схема уже готова: модель `SavedSearch` (`filters_json Json`, `is_active`,
`last_checked_at`, индексы по `user_id`/`is_active`, `ON DELETE CASCADE`) и таблица
`saved_searches` созданы миграцией `20260603180000_add_favorites_saved_searches`
(DB_SCHEMA §9). Код ошибки `UNSUPPORTED_FILTER_SCHEMA` (422) уже в каталоге
(`ApiErrorCode`, API.md §17). Эта задача — application-слой поверх существующей
схемы; новых миграций нет.

API.md §12 фиксирует версионирование фильтров: `filters_json` хранится как
`{ "schemaVersion": <int>, "filters": { ... } }`. Матчер сохранённых поисков
(polling `check_saved_searches`, MVP email-алерт — отдельная задача M10) обязан
оставаться толерантным к ранее сохранённым версиям, чтобы эволюция параметров
поиска (TASK-081/082) не ломала уже сохранённые записи.

## Decision

1. **Модуль/маршруты (API versioning, CLAUDE.md §14).** Новый `SavedSearchesModule`
   с `SavedSearchesController` (`@Controller({ path: 'saved-searches', version: '1' })`).
   Весь контроллер под `JwtAuthGuard` (класс-уровень) — `GUEST` без Bearer → `401`.
   `RolesGuard` не нужен: сохранённые поиски доступны любому аутентифицированному
   пользователю, без привязки к роли. `SearchModule` НЕ импортируется (в отличие от
   favorites): здесь не гидратируются карточки листингов — возвращаются сами записи
   сохранённого поиска.

2. **Версионированный `filters_json` — валидация в два слоя.** `FiltersJsonDto`
   валидирует структуру: `schemaVersion` (`@IsInt`) и `filters` (`@IsObject`).
   Отсутствие/неверный тип → `400 VALIDATION_ERROR` глобальным ValidationPipe.
   Поддержка конкретной версии проверяется в сервисе против
   `SUPPORTED_SCHEMA_VERSIONS = { 1 }`: структурно валидная, но неизвестная версия
   (напр. `99`) → `422 UNSUPPORTED_FILTER_SCHEMA`. Так «битый тип» (400) и
   «неподдерживаемая версия» (422) разделены, как требует API.md §12/§17.

3. **`filters` — намеренно свободный объект.** Содержимое `filters` НЕ валидируется
   по DTO `/search` (`SearchListingsQueryDto`). Причина — forward-совместимость:
   матчер толерантен к версиям, а набор фильтров поиска растёт (TASK-081/082);
   жёсткая привязка ломала бы ранее сохранённые поиски при каждом расширении
   поиска. `whitelist`/`forbidNonWhitelisted` режут лишние поля на уровне конверта
   (`name`/`filters_json`, и `schemaVersion`/`filters` внутри), но не трогают
   ключи свободного `filters` (он не nested-validated класс).

4. **Владение enforced на уровне записи.** `PATCH`/`DELETE` идут через
   `(id, user_id)`-фильтр: `updateMany`/`deleteMany` с `count === 0` → `404`.
   Чужой поиск недоступен и не «течёт» существованием (один и тот же `404` для
   «нет такого» и «чужой»). `:id` валидируется `ParseUUIDPipe`. `PATCH` после
   успешного `updateMany` (count = 1) дочитывает строку `findUnique` для ответа
   `200`; конкурентное удаление между записью и чтением → `404`.

5. **Список — простой `limit`/`total`, без keyset.** `GET /saved-searches`
   сортирует по `created_at DESC, id DESC` (свежие сверху) и отдаёт
   `meta: { limit, total }` — ровно как в контракте §12 (курсор там не показан).
   Сохранённых поисков у пользователя мало, поэтому keyset-пагинация (как у
   favorites) избыточна; `limit` — default 20, max 100 (API.md §4).

6. **`PATCH` частичный.** Обновляются только переданные поля (`name` /
   `filters_json` / `is_active`); прочие сохраняются. `is_active=false` —
   пользовательский способ приостановить алерты, не удаляя поиск.

## Consequences

Positive:

- Полный saved-searches-CRUD поверх существующей схемы — без новых миграций.
- Версионированный `filters_json` устойчив к эволюции фильтров: матчер и старые
  записи не ломаются (forward-совместимость), неподдерживаемая версия отсекается
  явным `422`.
- Владение безопасно (`(id, user_id)`-гард); чужие поиски недоступны и не
  раскрываются по существованию.
- Контракт ответа (`is_active`, `filters_json`, `last_checked_at`, `created_at`)
  единый для web (RTK Query) и будущего Flutter-клиента.

Negative / trade-offs:

- `filters` не валидируется по схеме поиска — некорректный набор фильтров примется
  и «не сматчит» ничего у матчера, а не упадёт на записи. Это осознанный размен
  ради forward-совместимости; строгая проверка отложена до версионного матчера.
- Список без keyset-курсора — при аномально большом числе поисков вернётся только
  первая страница (`limit`), без продолжения. Для MVP приемлемо (личный короткий
  список); курсор добавится при необходимости.
- `PATCH` читает строку вторым запросом после `updateMany` (Prisma не возвращает
  строки из массового апдейта) — две операции вместо одной; цена за
  атомарный гард владения.
- Покрытие — юнит-тесты (Prisma мокается), как у favorites; live-PostgreSQL
  integration-spec не добавлялся.

## Related files

- apps/api/src/saved-searches/saved-searches.controller.ts
- apps/api/src/saved-searches/saved-searches.service.ts
- apps/api/src/saved-searches/saved-searches.module.ts
- apps/api/src/saved-searches/saved-searches.service.spec.ts
- apps/api/src/saved-searches/dto/filters-json.dto.ts
- apps/api/src/saved-searches/dto/create-saved-search.dto.ts
- apps/api/src/saved-searches/dto/update-saved-search.dto.ts
- apps/api/src/saved-searches/dto/list-saved-searches.dto.ts
- apps/api/src/saved-searches/index.ts
- apps/api/src/app.module.ts
- docs/API.md (§12)

## Related task

- TASK-091

## Related ADR

- ADR-0030 (favorites module — соседний M6/M9 personal-list модуль, тот же
  `JwtAuthGuard`-паттерн; saved-searches не переиспользует карточку `/search`)
- ADR-0026/0027 (public search keyset + §9 фильтры — источник параметров `filters`)
- ADR-0016 (RBAC guards — `JwtAuthGuard` отсекает GUEST)
- ADR-0007 (unified error envelope — `UNSUPPORTED_FILTER_SCHEMA`/`NOT_FOUND`)
