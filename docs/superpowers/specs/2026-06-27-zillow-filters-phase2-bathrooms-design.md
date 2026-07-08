# Spec: фильтры «как у Zillow» — Фаза 2: Санузлы (`bathrooms`)

**Дата:** 2026-06-27
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api`, `apps/client`, `apps/web`
**Дорожная карта:** Фаза 1 (`2026-06-26-zillow-filters-phase1-design.md`, merged #239/#240)
→ **Фаза 2 (этот спек)** → Фаза 2+ (парковка/гараж, площадь участка, кондиционер/amenities)

## Контекст и цель

Фаза 1 дала Zillow-вид бара и подключила все фильтры, **по которым колонки в БД уже
были** (миграций не требовалось). Фаза 2 открывает 🔴-список из §D Фазы 1 — фильтры,
которым нужна **новая колонка + поле в визарде/детали/модерации**. Первый из них —
**санузлы**.

Это полная вертикаль одной характеристики:
миграция БД → поле в визарде создания и редактирования → отображение в детали и
модерации → фильтр в API (`/search` + все гео-эндпоинты) → UI в мега-панели «Фильтры».

## Решения (утверждены брейнштормом)

- **Модель данных — целое число (count, Zillow-style)**, не enum типа санузла.
  Колонка `bathrooms Int? @db.SmallInt` (nullable). Рассматривались `тип
  (совмещённый/раздельный)` и `оба поля` — отклонены: клиент хочет Zillow-параллель,
  кнопки «N+», и YAGNI.
- **Фильтр — только `bathrooms_min`** (кнопки `1+/2+/3+/4+` → `bathrooms >= N`).
  Exact-match НЕ делаем (в отличие от `rooms`, где он есть ради легаси «4 = 4+»).
- **Мега-панель — объединённый блок «Комнаты и санузлы»** (как Zillow «More»):
  строка Комнаты (переиспользуем существующий `BedroomsControl`, `1+/2+/3+/4+/5+`) +
  строка Санузлы (новый `BathroomsControl`, `1+/2+/3+/4+`). Бар-дропдаун «Комнаты ▾»
  остаётся; обе строки комнат пишут **один и тот же** URL-параметр → синхрон
  автоматический через общий `FilterValues`/URL, без отдельной sync-логики.
- **Санузлы в визарде — опциональны** (новое поле не ломает существующий поток,
  не требует бэкфилла). Скрыто для типов, где скрыты комнаты (`noRooms` —
  LAND/COMMERCIAL).
- **Показываем «с/у» и на компактной карточке, и в детали** (Zillow:
  beds · baths · area).
- **Миграция** — raw SQL `ALTER TABLE`, как принято в репо (`prisma migrate diff`
  → `migrate deploy`), не интерактивный `migrate dev`. Колонка nullable, без
  `DEFAULT`, без бэкфилла → non-breaking.
- Реализация — **3 PR по app-папкам**: `apps/api` (фундамент) → `apps/client` +
  `apps/web` (оба зависят от поля API).

---

## A. apps/api — миграция, поле, фильтр (PR #1)

Файлы: `apps/api/prisma/schema.prisma`,
`apps/api/prisma/migrations/<timestamp>_add_listing_bathrooms/migration.sql` (новый),
`apps/api/src/listings/dto/create-listing.dto.ts`,
`apps/api/src/listings/dto/update-listing.dto.ts`,
`apps/api/src/listings/listings.service.ts`,
`apps/api/src/search/dto/search-listings.dto.ts`,
`apps/api/src/search/search.service.ts` (+ `search.service.int-spec.ts`,
`listings.service.spec.ts`), `apps/api/openapi.public.json` (regen).

### A.1 Миграция и схема
- В `schema.prisma`, модель `Listing`, рядом с `rooms` (после строки 410):
  ```prisma
  bathrooms          Int?                                   @db.SmallInt
  ```
- Новый каталог миграции `migration.sql` (зеркало стиля
  `20260622100000_admin_broadcast/migration.sql` — шапка-комментарий + AlterTable):
  ```sql
  -- AlterTable
  ALTER TABLE "listings" ADD COLUMN "bathrooms" SMALLINT;
  ```
  (Имя таблицы подтвердить из `@@map` модели `Listing` перед написанием.)
- После правки схемы — `prisma generate` (обновить клиент; иначе cryptic TS-ошибки,
  см. [[avino-prisma-client-stale-after-branch-switch]]).

### A.2 DTO (зеркало `rooms`)
- `create-listing.dto.ts` и `update-listing.dto.ts`: добавить
  ```ts
  @IsOptional() @IsInt() @Min(0) @Max(SMALLINT_MAX)
  bathrooms?: number;
  ```
- `search-listings.dto.ts` → **в `SearchListingsQueryDto`** (его наследуют ВСЕ гео-DTO
  `GeoSearchQueryDto`/`PolygonSearchQueryDto`/`BoundsSearchQueryDto` →
  `/search` и `/map` покрыты автоматически, `geo-search.dto.ts` НЕ трогаем):
  ```ts
  @IsOptional() @IsInt() @Min(0)
  bathrooms_min?: number;
  ```
  Число приводит глобальный `ValidationPipe` (`enableImplicitConversion`).

### A.3 Сервисы
- `listings.service.ts`: `bathrooms` в `ListingScalarInput`, `ListingScalarData`,
  `SEARCH_SELECT`; в update-handler — `if (dto.bathrooms !== undefined) data.bathrooms = dto.bathrooms;`.
- `search.service.ts`: `bathrooms: number | null` в `SearchListItem`; `bathrooms: true`
  в `SEARCH_SELECT`; `bathrooms: listing.bathrooms` в `toSearchItem`; в `buildWhereSql`
  (рядом с `rooms_min`):
  ```ts
  if (query.bathrooms_min !== undefined)
    conds.push(Prisma.sql`bathrooms >= ${query.bathrooms_min}`);
  ```
  Параметризованный плейсхолдер (стиль сервиса). `NULL`-объявления под фильтр не
  попадают — ожидаемо.

### A.4 Тесты и OpenAPI
- `search.service.int-spec.ts`: фикстуры с `bathrooms` 0..4 + кейсы `bathrooms_min`
  (≥N сужает, `NULL` исключается).
- `listings.service.spec.ts`: create/update прокидывают `bathrooms`.
- ⚠️ `/search` публичный → regen `openapi.public.json` (`pnpm openapi:export` + 4 dummy
  env) и закоммитить в **этот же** PR (CI drift-check).

---

## B. apps/client — визард, деталь, карточка, фильтр (PR #2)

Зависит от PR #1 (поле API). Файлы:
- Визард: `features/listing-new/ListingNew.tsx`, `features/listing-edit/ListingEdit.tsx`.
- Отображение: `features/detail/Facts.tsx`, `features/search/PropertyCard.tsx`,
  `lib/format.ts`.
- Фильтр: `features/search/controls/BathroomsControl.tsx` (новый),
  `features/search/FilterBar.tsx`, `features/search/ActiveFilters.tsx`,
  `lib/savedSearch.ts`, `lib/api/listings.ts`,
  `app/[locale]/search/page.tsx`, `app/[locale]/map/page.tsx`,
  `lib/mock/types.ts`, `messages/{ru,uz,en}.json`.

### B.1 Визард (create + edit)
- `ListingNew.tsx`: в шаге «Параметры» рядом с комнатами — поле «Санузлы», Chip-кнопки
  `['1','2','3','4+']` (по аналогии с `ROOM_OPTIONS`). В `buildBody()`: `'4+' → 4`,
  иначе `parseInt`; ставить `body.bathrooms = n` только если выбрано. **Опционально**
  (в валидацию `canSubmit` НЕ добавляем). Скрыть поле при `noRooms` (LAND/COMMERCIAL).
  В preview-блоке — показать значение, если задано.
- `ListingEdit.tsx`: пред-заполнить `bathrooms` из объявления (число → `'4+'` если ≥4,
  иначе `String(n)`), тот же контрол и `buildBody`-нормализация.

### B.2 Отображение
- `Facts.tsx`: Fact-карточка с иконкой `Bath` (lucide-react), лейбл — плюрализованный
  `units.bathroomsLabel`. Рендерить только если `listing.bathrooms` задано.
- `lib/format.ts` `specs()`: добавить `if (l.bathrooms) parts.push(t('bathroomsShort', { count: l.bathrooms }))`
  после комнат. `PropertyCard` уже рендерит `specs()` → попадёт в спек-строку.

### B.3 Мега-панель «Комнаты и санузлы»
- Новый `controls/BathroomsControl.tsx` — зеркало `BedroomsControl`, но опции
  `1+/2+/3+/4+`, значение `bathroomsMin?: number`, **без** чекбокса «Точное совпадение».
- `FilterBar.tsx`: в мега-панели (`FiltersPanel`) добавить блок «Комнаты и санузлы»:
  переиспользовать `BedroomsControl` (строка Комнаты, привязан к тем же
  `values.rooms`/`values.roomsMin`) + `BathroomsControl` (строка Санузлы). Бар «Комнаты ▾»
  не трогаем (тот же `BedroomsControl`, тот же URL-param → синхрон автоматический).
  `FilterValues` расширить полем `bathroomsMin?: number`; onChange пишет/чистит
  `bathrooms_min` в URL.

### B.4 Плюмбинг
- `lib/api/listings.ts`: `bathrooms: number | null` в `ApiSearchItem`; маппинг
  `bathrooms: api.bathrooms ?? undefined` в UI-`Listing`; в `buildSearchParams` —
  `if (filter.bathroomsMin != null) params.set('bathrooms_min', String(filter.bathroomsMin))`.
- `search/page.tsx` + `map/page.tsx`: парсить `bathrooms_min` из `searchParams` →
  `FilterValues.bathroomsMin` и в `ListingFilter`.
- `ActiveFilters.tsx`: чип «Санузлов: N+» при `values.bathroomsMin != null` (× чистит
  параметр); добавить `bathrooms_min` в массив ключей «Сбросить всё».
- `lib/savedSearch.ts`: `bathrooms_min` в `SavedSearchFilters`; `describeFilters` —
  `${n}+ с/у`; `filtersToSearchHref` — `set('bathrooms_min', …)`.
- `lib/mock/types.ts`: `bathrooms?: number` в `Listing`; `bathroomsMin?: number` в
  `ListingFilter`.

### B.5 i18n (ru/uz/en, все три)
- `units`: `bathrooms` (плюрал «санузел/санузла/санузлов»), `bathroomsShort` («# с/у»),
  `bathroomsLabel`.
- `search.filters`: `bathrooms` («Санузлы»), `roomsAndBathrooms` («Комнаты и санузлы»),
  чип `bathroomsCount` («Санузлов: {count}+»).
- `listingNew.fields.bathrooms` («Санузлы»).
- ⚠️ Замоканный `next-intl` в тестах скрывает отсутствующие ключи — добавить ключи во
  ВСЕ три файла и проверить вручную (см. [[avino-client-test-i18n-eslint-gotchas]]).

### B.6 Тесты
RTL: `BathroomsControl` (выбор «N+», сброс) + чип в `ActiveFilters`. `lint` + `build`
зелёные. Помнить про предсущ. 2 фейла `LoginModal.test`
([[avino-loginmodal-test-preexisting-fail]]) — не регресс.

---

## C. apps/web — модерация (PR #3)

Зависит от PR #1. Файл: `apps/web/src/app/admin/listings/[id]/page.tsx` (строка ~158).
Добавить `{listing.bathrooms} с/у` рядом с `{listing.rooms} комн` в спек-строке.
`bathrooms` добавить в web-тип ответа listing (apps/web — свой API-тип). i18n в
`apps/web` нет (хардкод-строки, как и `комн`).

---

## D. Объём, порядок, ограничения

3 PR по app-папкам (одна папка = один PR, §5 CLAUDE.md):
1. **PR #1 `apps/api`** — миграция + `bathrooms` (schema/DTO/service) + `bathrooms_min`
   (search DTO/`buildWhereSql`) + int-spec + regen `openapi.public.json`. Мёржится
   первым (фундамент).
2. **PR #2 `apps/client`** — визард create/edit + деталь + карточка + мега-панель
   (`BathroomsControl` + строка Комнаты в панели) + плюмбинг + чипы + saved search +
   i18n + RTL. После PR #1.
3. **PR #3 `apps/web`** — строка санузлов в модерации. После PR #1.

Ограничения:
- `main` защищён: открываю PR, мёржит пользователь (никогда `--admin`,
  см. [[avino-main-branch-protection]]).
- GitHub-операции — токеном из `~/.gh_token` (значение не печатать).
- Git-мутации по одной команде (цепочки через `&&` отклоняются правами,
  см. [[avino-git-mutation-single-commands]]).
- Субагенты `avino-impl` пишут код в одной папке и **не трогают git** — git/PR веду я
  (см. [[avino-subagents-shared-workdir-git-hazard]]).
- ADR (обновить ADR фильтров Фазы 1 или новый) + `DONE.md` готовить в feature-PR до
  пуша (см. [[avino-finalize-in-feature-pr]]).

## Критерии готовности (verify)

- **API:** `GET /search` и гео-эндпоинты применяют `bathrooms_min` (`bathrooms >= N`);
  `NULL` исключается; create/update сохраняют `bathrooms`; невалидное значение → 400;
  int-spec зелёные; openapi drift-check зелёный; миграция применяется (`migrate deploy`).
- **client:** визард создаёт/редактирует объявление с санузлами (опционально); деталь
  и карточка показывают «N с/у»; мега-панель «Комнаты и санузлы» открывается, кнопки
  Санузлы пишут `bathrooms_min` и сужают выдачу; строка Комнаты в панели синхронна с
  баром; чип и «Сбросить всё» работают; save search хранит `bathrooms_min`;
  `lint`+`build` зелёные; RTL-тесты зелёные.
- **web:** карточка модерации показывает санузлы рядом с комнатами.
- **Live-verify:** создать объявление с N санузлами → отфильтровать `bathrooms_min`
  на `/search` → выдача сужается; URL содержит `bathrooms_min`; SSR-перезагрузка
  сохраняет фильтр; деталь/модерация показывают значение.
