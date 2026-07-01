# Mobile Backend Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать бэкенд-доработки по баглисту мобильной команды (spec: `docs/superpowers/specs/2026-07-02-mobile-backend-requests-design.md`): дробные санузлы, цокольный этаж, POOL, жилая/нежилая площадь, счётчики просмотров/лайков, чистка сид-описаний, ANSWERS-док.

**Architecture:** NestJS 10 + Prisma 5.18 + PostgreSQL/PostGIS. Каждая фича — вертикаль: raw-SQL миграция → schema.prisma → DTO (строгий whitelist ValidationPipe) → select/mapping в сервисах → тесты. Push для saved-search уже реализован — только деплой-чеклист в ANSWERS.

**Tech Stack:** TypeScript, class-validator/class-transformer, Prisma raw SQL migrations, Jest (unit `*.spec.ts`, integration `*.int-spec.ts`).

## Global Constraints

- Изменения ТОЛЬКО в `apps/api/` и `docs/` (CLAUDE.md: одна app-папка = один PR).
- Ветка: `feat/mobile-backend-api` (уже создана, спека закоммичена).
- Git-коммиты выполняет ТОЛЬКО контроллер сессии, не субагенты (project rule «Суб-агенты не трогают git»). Субагент останавливается перед шагом Commit и сообщает готовность.
- Conventional Commits (`feat(listings): …`, `chore(seed): …`).
- Контракт: Decimal-поля — строки `toFixed(2)` (ADR-002); ИСКЛЮЧЕНИЕ — `bathrooms` отдаётся number (решение спеки, значения кратны 0.5 точны во float).
- Глобальный ValidationPipe: `whitelist + forbidNonWhitelisted` — любое новое поле обязано быть объявлено в DTO.
- Миграции: raw SQL в `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql`, имена и порядок — как указано в задачах (20260702000000…20260702040000).
- Все команды из `apps/api/`, если не сказано иное. Unit-тесты: `npm test -- --testPathPattern <pattern>`. После правок `schema.prisma` — `npx prisma generate` перед tsc/тестами.

---

### Task 1: `bathrooms` → Decimal(3,1), шаг 0.5

**Files:**
- Create: `apps/api/prisma/migrations/20260702000000_alter_listing_bathrooms_decimal/migration.sql`
- Create: `apps/api/src/common/validation/is-half-step.ts`
- Create: `apps/api/src/listings/dto/create-listing.dto.spec.ts`
- Modify: `apps/api/prisma/schema.prisma:437`
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts:116-120`
- Modify: `apps/api/src/listings/dto/update-listing.dto.ts:92-96`
- Modify: `apps/api/src/search/dto/search-listings.dto.ts:167-172`
- Modify: `apps/api/src/search/search.service.ts:1022-1023,1164`
- Modify: `apps/api/src/listings/listings.service.ts:854,927`
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Consumes: существующие `toDetailResponse`/`toListItem`/`toSearchItem`.
- Produces: `bathrooms?: number` (кратно 0.5) в create/update DTO; `bathrooms_min?: number` в `SearchListingsQueryDto`; в ответах `bathrooms: number | null` (через `.toNumber()`); декоратор `IsHalfStep()` из `../../common/validation/is-half-step` — используется только здесь.

- [ ] **Step 1: Написать падающий DTO-тест**

Создать `apps/api/src/listings/dto/create-listing.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateListingDto } from './create-listing.dto';

const BASE = {
  transaction_type: 'SALE',
  property_type: 'APARTMENT',
  original_language: 'RU',
  price: '100000.00',
  currency: 'UZS',
  translation: { title: 'Тест' },
};

function errorsFor(extra: Record<string, unknown>) {
  const inst = plainToInstance(CreateListingDto, { ...BASE, ...extra });
  return validateSync(inst, { whitelist: true, forbidNonWhitelisted: true });
}

describe('CreateListingDto — bathrooms (дробные, шаг 0.5)', () => {
  it('принимает целые и половинные значения', () => {
    expect(errorsFor({ bathrooms: 1 })).toHaveLength(0);
    expect(errorsFor({ bathrooms: 1.5 })).toHaveLength(0);
    expect(errorsFor({ bathrooms: 2.5 })).toHaveLength(0);
  });

  it('отклоняет значения, не кратные 0.5', () => {
    expect(errorsFor({ bathrooms: 1.3 }).length).toBeGreaterThan(0);
  });

  it('отклоняет отрицательные и > 99', () => {
    expect(errorsFor({ bathrooms: -0.5 }).length).toBeGreaterThan(0);
    expect(errorsFor({ bathrooms: 99.5 }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npm test -- --testPathPattern create-listing.dto`
Expected: FAIL — `1.5` отклоняется текущим `@IsInt` (кейс «принимает половинные»).

- [ ] **Step 3: Декоратор IsHalfStep**

Создать `apps/api/src/common/validation/is-half-step.ts`:

```ts
import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Значение кратно 0.5 (санузлы: 1, 1.5, 2, …; баглист мобилки #3, вариант A).
 * Некратные дроби (1.3) → 400, чтобы в БД не попадали «случайные» десятые.
 */
export function IsHalfStep(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHalfStep',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a multiple of 0.5`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'number' && Number.isInteger(value * 2);
        },
      },
    });
  };
}
```

- [ ] **Step 4: Миграция + schema.prisma**

Создать `apps/api/prisma/migrations/20260702000000_alter_listing_bathrooms_decimal/migration.sql`:

```sql
-- Санузлы становятся дробными с шагом 0.5 (баглист мобилки #3, вариант A).
-- SmallInt -> numeric(3,1): расширяющий каст, существующие целые сохраняются.
ALTER TABLE "listings" ALTER COLUMN "bathrooms" TYPE numeric(3,1);
```

В `apps/api/prisma/schema.prisma` строка 437 заменить:

```prisma
  bathrooms          Int?                                   @db.SmallInt
```

на:

```prisma
  bathrooms          Decimal?                               @db.Decimal(3, 1)
```

Затем: `npx prisma generate`

- [ ] **Step 5: DTO create/update/search**

В `apps/api/src/listings/dto/create-listing.dto.ts`:
- в import из `class-validator` добавить `IsNumber` (уже есть IsInt — оставить, он нужен другим полям);
- добавить импорт: `import { IsHalfStep } from '../../common/validation/is-half-step';`
- заменить блок `bathrooms` (строки 116-120):

```ts
  /** Санузлы, шаг 0.5 (1, 1.5, 2 …) — баглист мобилки #3. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @IsHalfStep()
  @Min(0)
  @Max(99)
  bathrooms?: number;
```

То же самое в `apps/api/src/listings/dto/update-listing.dto.ts` (строки 92-96, те же импорты).

В `apps/api/src/search/dto/search-listings.dto.ts` заменить блок `bathrooms_min` (167-172):

```ts
  /** «N+ санузлов» (bathrooms >= N), дробный шаг 0.5 — например 1.5. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  bathrooms_min?: number;
```

- [ ] **Step 6: SQL-фильтр и сериализация**

`apps/api/src/search/search.service.ts`:
- строка 1022-1023, каст к numeric (Prisma биндит JS number как float8):

```ts
    // Zillow Phase 2 + мобилка #3: «N+ санузлов», дробный шаг 0.5
    if (query.bathrooms_min !== undefined)
      conds.push(Prisma.sql`bathrooms >= ${query.bathrooms_min}::numeric`);
```

- строка 1164 в `toSearchItem`: `bathrooms: listing.bathrooms,` →

```ts
      // Контракт: number с шагом 0.5 (не строка, как другие Decimal) — спека 2026-07-02.
      bathrooms: listing.bathrooms?.toNumber() ?? null,
```

`apps/api/src/listings/listings.service.ts`:
- строка 927 (`toDetailResponse`) и строка 854 (`toListItem`): `bathrooms: listing.bathrooms,` →

```ts
      bathrooms: listing.bathrooms?.toNumber() ?? null,
```

- [ ] **Step 7: Обновить фикстуры сервисного спека**

В `apps/api/src/listings/listings.service.spec.ts`:
- найти фикстуру детали (в `describe('findOne')`, объект с `bathrooms:`) — заменить числовое значение на `new Prisma.Decimal('1.5')`, а ожидание в ассерте карточки — на `bathrooms: 1.5`;
- аналогично в фикстуре списка `findMine`, если она содержит `bathrooms`;
- добавить тест в `describe('create')`:

```ts
    it('passes fractional bathrooms (1.5) through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        bathrooms: 1.5,
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.bathrooms).toBe(1.5);
    });
```

- [ ] **Step 8: Прогнать тесты**

Run: `npm test -- --testPathPattern "create-listing.dto|listings.service|search-listings.dto"`
Expected: PASS все.

- [ ] **Step 9: Commit (контроллер)**

```bash
git add apps/api/prisma apps/api/src/common/validation/is-half-step.ts apps/api/src/listings apps/api/src/search
git commit -m "feat(listings): дробные санузлы bathrooms Decimal(3,1) с шагом 0.5"
```

---

### Task 2: Цокольный этаж — `is_basement`

**Files:**
- Create: `apps/api/prisma/migrations/20260702010000_add_listing_is_basement/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (модель Listing, после `floor`)
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts` (после `floor`)
- Modify: `apps/api/src/listings/dto/update-listing.dto.ts` (после `floor`)
- Modify: `apps/api/src/search/dto/search-listings.dto.ts:190` (рядом с `not_first_floor`)
- Modify: `apps/api/src/search/search.service.ts` (SEARCH_SELECT:214-241, SearchListItem:65-99, buildWhereSql:1056-1059, toSearchItem:1155-1188)
- Modify: `apps/api/src/listings/listings.service.ts` (ListingScalarInput/Data ~строки 90-109, toScalarData:758-783, LISTING_DETAIL_SELECT:219-286, ListingDetailResponse:178-217, LISTING_LIST_SELECT:331-358, ListingListItem:299-320, toListItem, toDetailResponse)
- Test: `apps/api/src/search/dto/search-listings.dto.spec.ts`, `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Produces: колонка `is_basement boolean NOT NULL DEFAULT false`; DTO-поле `is_basement?: boolean` (create/update/search); в ответах `is_basement: boolean` (detail, list item, search item). Схема Prisma: `isBasement`.

- [ ] **Step 1: Падающие тесты**

В `apps/api/src/search/dto/search-listings.dto.spec.ts` добавить (внутри существующего `describe`, паттерн как у «парсит булевы флаги»):

```ts
  it('парсит is_basement из query-строки', () => {
    expect(dto({ is_basement: 'true' }).is_basement).toBe(true);
    expect(dto({ is_basement: 'false' }).is_basement).toBe(false);
  });
```

(если хелпер в файле называется не `dto`, использовать локальный хелпер файла — см. строку 7).

В `apps/api/src/listings/listings.service.spec.ts` в `describe('create')`:

```ts
    it('passes is_basement through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        is_basement: true,
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.isBasement).toBe(true);
    });
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -- --testPathPattern "search-listings.dto|listings.service"`
Expected: FAIL — `is_basement` отсутствует в DTO (undefined) и не мапится в `isBasement`.

- [ ] **Step 3: Миграция + schema**

`apps/api/prisma/migrations/20260702010000_add_listing_is_basement/migration.sql`:

```sql
-- Цокольный этаж как отдельный флаг (баглист мобилки #4, вариант B):
-- зарезервированное значение floor ломало бы floor_min/max/not_first_floor.
ALTER TABLE "listings" ADD COLUMN "is_basement" BOOLEAN NOT NULL DEFAULT false;
```

В `schema.prisma`, модель `Listing`, после строки `floor Int? @db.SmallInt`:

```prisma
  isBasement         Boolean                                @default(false) @map("is_basement")
```

Затем: `npx prisma generate`

- [ ] **Step 4: DTO**

В `create-listing.dto.ts` и `update-listing.dto.ts` после блока `floor`:

```ts
  /** Цокольный этаж (баглист мобилки #4). При true клиент обычно шлёт floor: null. */
  @IsOptional()
  @IsBoolean()
  is_basement?: boolean;
```

В `search-listings.dto.ts` после строки 190 (`not_first_floor`):

```ts
  /** Только цокольный этаж (мобилка #4): true → is_basement = true; false/нет — без фильтра. */
  @IsOptional() @Type(() => String) @Transform(toBool) @IsBoolean() is_basement?: boolean;
```

- [ ] **Step 5: Сервисы**

`listings.service.ts`:
- `ListingScalarInput` (интерфейс со snake_case-полями, рядом с `floor?: number;`): добавить `is_basement?: boolean;`
- `ListingScalarData` (camelCase, рядом с `floor?: number;`): добавить `isBasement?: boolean;`
- `toScalarData` после строки `if (dto.floor !== undefined) …`:

```ts
    if (dto.is_basement !== undefined) data.isBasement = dto.is_basement;
```

- `LISTING_DETAIL_SELECT` после `floor: true,`: `isBasement: true,`
- `ListingDetailResponse` после `floor: number | null;`: `is_basement: boolean;`
- `toDetailResponse` после `floor: listing.floor,`: `is_basement: listing.isBasement,`
- `LISTING_LIST_SELECT` после `parkingType: true,`: `isBasement: true,`
- `ListingListItem` после `parking_type: ParkingType | null;`: `is_basement: boolean;`
- `toListItem` после `parking_type: listing.parkingType,`: `is_basement: listing.isBasement,`

`search.service.ts`:
- `SEARCH_SELECT` после `parkingType: true,`: `isBasement: true,`
- `SearchListItem` после `parking_type: ParkingType | null;`: `is_basement: boolean;`
- `toSearchItem` после `parking_type: listing.parkingType,`: `is_basement: listing.isBasement,`
- `buildWhereSql` после блока `not_last_floor` (строка 1059):

```ts
    // Мобилка #4: только цокольный этаж
    if (query.is_basement === true)
      conds.push(Prisma.sql`is_basement = true`);
```

- [ ] **Step 6: Фикстуры детали/списка**

В `listings.service.spec.ts` фикстуры строк БД для `findOne`/`findMine` дополнить `isBasement: false`, ассерты ответов — `is_basement: false` (TypeScript сам подсветит места: `npx tsc --noEmit` из apps/api).

- [ ] **Step 7: Прогнать тесты**

Run: `npm test -- --testPathPattern "search-listings.dto|listings.service"`
Expected: PASS.

- [ ] **Step 8: Commit (контроллер)**

```bash
git add apps/api/prisma apps/api/src/listings apps/api/src/search
git commit -m "feat(listings): цокольный этаж is_basement + фильтр в поиске"
```

---

### Task 3: `POOL` в enum `Amenity`

**Files:**
- Create: `apps/api/prisma/migrations/20260702020000_add_amenity_pool/migration.sql`
- Modify: `apps/api/prisma/schema.prisma:54-63` (enum Amenity)
- Test: `apps/api/src/search/dto/search-listings.dto.spec.ts`

**Interfaces:**
- Produces: enum-значение `POOL` — принимается в create/update `amenities[]` и в фильтре `amenities` автоматически (типизация через `Amenity` из `@prisma/client`).

- [ ] **Step 1: Падающий тест**

В `search-listings.dto.spec.ts` добавить:

```ts
  it('принимает amenities=POOL (бассейн, мобилка #5)', () => {
    const inst = dto({ amenities: 'POOL' });
    expect(inst.amenities).toEqual(['POOL']);
  });
```

(хелпер файла возвращает и ошибки валидации — если он устроен как `{inst, errors}`, ассертить отсутствие ошибок так же, как в кейсе «принимает валидный массив amenities», строка 52).

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -- --testPathPattern search-listings.dto`
Expected: FAIL — `POOL` не входит в enum.

- [ ] **Step 3: Миграция + enum**

`apps/api/prisma/migrations/20260702020000_add_amenity_pool/migration.sql`:

```sql
-- Бассейн (баглист мобилки #5). Добавление enum-значения non-breaking (ADR-0008).
ALTER TYPE "Amenity" ADD VALUE 'POOL';
```

В `schema.prisma` enum `Amenity` — добавить `POOL` последним значением (после `SECURITY`). Затем `npx prisma generate`.

- [ ] **Step 4: Прогнать тесты**

Run: `npm test -- --testPathPattern search-listings.dto`
Expected: PASS.

- [ ] **Step 5: Commit (контроллер)**

```bash
git add apps/api/prisma apps/api/src/search
git commit -m "feat(listings): amenity POOL (бассейн) в enum удобств"
```

---

### Task 4: `living_area` / `non_living_area`

**Files:**
- Create: `apps/api/prisma/migrations/20260702030000_add_listing_living_areas/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (модель Listing, после `lotArea`)
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts` (после `lot_area`)
- Modify: `apps/api/src/listings/dto/update-listing.dto.ts` (после `lot_area`)
- Modify: `apps/api/src/listings/listings.service.ts` (ListingScalarInput/Data, toScalarData, LISTING_DETAIL_SELECT, ListingDetailResponse, toDetailResponse)
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Produces: колонки `living_area`/`non_living_area numeric(10,2)` NULL; DTO-поля `living_area?: string`, `non_living_area?: string` (decimal-строки); в ДЕТАЛИ ответа `living_area: string | null`, `non_living_area: string | null` (формат как `area`: `"83.50"`). В списках/поиске НЕ отдаются.

- [ ] **Step 1: Падающий тест**

В `listings.service.spec.ts`, `describe('create')`:

```ts
    it('passes living_area/non_living_area through to Prisma on create', async () => {
      prisma.listing.create.mockResolvedValue(dbListing);

      await service.create(OWNER_ID, {
        ...validCreate,
        living_area: '95.00',
        non_living_area: '25.50',
      } as any);

      const data = prisma.listing.create.mock.calls[0][0].data;
      expect(data.livingArea).toBe('95.00');
      expect(data.nonLivingArea).toBe('25.50');
    });
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -- --testPathPattern listings.service`
Expected: FAIL — поля не мапятся.

- [ ] **Step 3: Миграция + schema**

`apps/api/prisma/migrations/20260702030000_add_listing_living_areas/migration.sql`:

```sql
-- Жилая/нежилая площадь для дома/особняка (баглист мобилки #10).
-- Nullable, без бэкфилла; для всех типов недвижимости (правило показа — на клиенте).
ALTER TABLE "listings"
  ADD COLUMN "living_area" numeric(10,2),
  ADD COLUMN "non_living_area" numeric(10,2);
```

В `schema.prisma` после строки `lotArea …`:

```prisma
  livingArea         Decimal?                               @map("living_area") @db.Decimal(10, 2)
  nonLivingArea      Decimal?                               @map("non_living_area") @db.Decimal(10, 2)
```

Затем `npx prisma generate`.

- [ ] **Step 4: DTO + сервис**

В `create-listing.dto.ts` и `update-listing.dto.ts` после блока `lot_area`:

```ts
  /** Жилая площадь, м² (мобилка #10; клиент показывает для дома/особняка). */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'living_area must be a decimal string with up to 2 fraction digits' })
  living_area?: string;

  /** Нежилая площадь, м² (кухня/санузлы/коридоры). */
  @IsOptional()
  @Matches(DECIMAL_2, { message: 'non_living_area must be a decimal string with up to 2 fraction digits' })
  non_living_area?: string;
```

В `listings.service.ts`:
- `ListingScalarInput`: `living_area?: string;` и `non_living_area?: string;`
- `ListingScalarData`: `livingArea?: string;` и `nonLivingArea?: string;`
- `toScalarData` после `lot_area`-строки:

```ts
    if (dto.living_area !== undefined) data.livingArea = dto.living_area;
    if (dto.non_living_area !== undefined)
      data.nonLivingArea = dto.non_living_area;
```

- `LISTING_DETAIL_SELECT` после `lotArea: true,`: `livingArea: true,` и `nonLivingArea: true,`
- `ListingDetailResponse` после `lot_area: string | null;`:

```ts
  living_area: string | null;
  non_living_area: string | null;
```

- `toDetailResponse` после `lot_area: …`:

```ts
      living_area: listing.livingArea?.toFixed(2) ?? null,
      non_living_area: listing.nonLivingArea?.toFixed(2) ?? null,
```

- [ ] **Step 5: Тест детали**

В фикстуру `findOne` добавить `livingArea: new Prisma.Decimal('95.00'), nonLivingArea: null`, в ассерт карточки — `living_area: '95.00', non_living_area: null`.

- [ ] **Step 6: Прогнать тесты**

Run: `npm test -- --testPathPattern listings.service`
Expected: PASS.

- [ ] **Step 7: Commit (контроллер)**

```bash
git add apps/api/prisma apps/api/src/listings
git commit -m "feat(listings): жилая и нежилая площадь living_area/non_living_area"
```

---

### Task 5: `views_count` + `POST /api/v1/listings/:id/view`

**Files:**
- Create: `apps/api/prisma/migrations/20260702040000_add_listing_views_count/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (модель Listing, после `tourWindows`)
- Modify: `apps/api/src/listings/listings.service.ts` (новый метод после `findMine`)
- Modify: `apps/api/src/listings/listings.controller.ts` (роут после `findOne`, импорт `HttpCode`)
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Produces: колонка `views_count integer NOT NULL DEFAULT 0` (Prisma `viewsCount`); метод `registerView(listingId: string): Promise<void>` (404 если нет листинга или DELETED); роут `POST /api/v1/listings/:id/view` → 204, публичный. Task 6 читает `viewsCount`.

- [ ] **Step 1: Падающие тесты**

В `listings.service.spec.ts` в мок `prisma.listing` (beforeEach, строки 64-71) добавить `updateMany: jest.fn(),`. Новый describe:

```ts
  describe('registerView', () => {
    it('инкрементит views_count существующего листинга', async () => {
      prisma.listing.updateMany.mockResolvedValue({ count: 1 });

      await service.registerView(LISTING_ID);

      expect(prisma.listing.updateMany).toHaveBeenCalledWith({
        where: { id: LISTING_ID, status: { not: ListingStatus.DELETED } },
        data: { viewsCount: { increment: 1 } },
      });
    });

    it('404 когда листинг не найден или DELETED', async () => {
      prisma.listing.updateMany.mockResolvedValue({ count: 0 });

      await expectCode(service.registerView(LISTING_ID), ApiErrorCode.NOT_FOUND);
    });
  });
```

- [ ] **Step 2: Убедиться, что падают**

Run: `npm test -- --testPathPattern listings.service`
Expected: FAIL — `registerView is not a function`.

- [ ] **Step 3: Миграция + schema**

`apps/api/prisma/migrations/20260702040000_add_listing_views_count/migration.sql`:

```sql
-- Счётчик просмотров детали (баглист мобилки #8). Простой инкремент без
-- дедупликации (решение спеки 2026-07-02); уникальность НЕ считается.
ALTER TABLE "listings" ADD COLUMN "views_count" INTEGER NOT NULL DEFAULT 0;
```

В `schema.prisma` после строки `tourWindows …`:

```prisma
  viewsCount         Int                                    @default(0) @map("views_count")
```

Затем `npx prisma generate`.

- [ ] **Step 4: Сервис + контроллер**

В `listings.service.ts` после `findMine`:

```ts
  /**
   * `POST /api/v1/listings/:id/view` — счётчик просмотров детали (мобилка #8).
   * Простой атомарный инкремент без дедупликации (решение спеки 2026-07-02).
   * DELETED исключён из read-path → как и findOne, отвечает 404.
   */
  async registerView(listingId: string): Promise<void> {
    const res = await this.prisma.listing.updateMany({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      data: { viewsCount: { increment: 1 } },
    });
    if (res.count === 0) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
  }
```

В `listings.controller.ts`: добавить `HttpCode` в импорт из `@nestjs/common`; после `findOne`:

```ts
  /**
   * `POST /api/v1/listings/:id/view` — засчитать просмотр детали (мобилка #8).
   * Публичный (гость тоже считается), 204 без тела; несуществующий/DELETED → 404.
   */
  @Post(':id/view')
  @HttpCode(204)
  registerView(
    @Param('id', ParseUUIDPipe) listingId: string,
  ): Promise<void> {
    return this.listingsService.registerView(listingId);
  }
```

- [ ] **Step 5: Прогнать тесты**

Run: `npm test -- --testPathPattern listings.service`
Expected: PASS.

- [ ] **Step 6: Commit (контроллер)**

```bash
git add apps/api/prisma apps/api/src/listings
git commit -m "feat(listings): счётчик просмотров views_count + POST /listings/:id/view"
```

---

### Task 6: `views_count`/`likes_count` в ответах (деталь, списки, поиск)

**Files:**
- Modify: `apps/api/src/listings/listings.service.ts` (LISTING_DETAIL_SELECT, ListingDetailResponse, toDetailResponse; LISTING_LIST_SELECT, ListingListItem, toListItem)
- Modify: `apps/api/src/search/search.service.ts` (SEARCH_SELECT, SearchListItem, toSearchItem)
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Consumes: `viewsCount` из Task 5; таблица `favorites` (relation `Listing.favorites`).
- Produces: `views_count: number` и `likes_count: number` (int, не null) в `ListingDetailResponse`, `ListingListItem`, `SearchListItem`. `likes_count` — живой `_count.favorites`.

- [ ] **Step 1: Падающий тест**

В `listings.service.spec.ts`, фикстуру `findOne` дополнить:

```ts
    viewsCount: 12,
    _count: { favorites: 3 },
```

и в ассерт детали добавить `views_count: 12, likes_count: 3`. Аналогично для `findMine`-фикстуры (`viewsCount: 0, _count: { favorites: 0 }` → `views_count: 0, likes_count: 0`).

- [ ] **Step 2: Убедиться, что падает**

Run: `npm test -- --testPathPattern listings.service`
Expected: FAIL — в ответе нет `views_count`/`likes_count`.

- [ ] **Step 3: Реализация**

`listings.service.ts`:
- `LISTING_DETAIL_SELECT` (после `tourWindows: true,`):

```ts
  viewsCount: true,
  // Живой агрегат лайков (мобилка #8): COUNT по favorites, без денормализации.
  _count: { select: { favorites: true } },
```

- `ListingDetailResponse` (после `tour_windows`):

```ts
  views_count: number;
  likes_count: number;
```

- `toDetailResponse` (рядом с `tours_enabled`):

```ts
      views_count: listing.viewsCount,
      likes_count: listing._count.favorites,
```

- `LISTING_LIST_SELECT` (после `createdAt: true,`): те же `viewsCount: true,` и `_count: { select: { favorites: true } },`
- `ListingListItem` (после `thumbnail_url`): `views_count: number;` и `likes_count: number;`
- `toListItem`: `views_count: listing.viewsCount,` и `likes_count: listing._count.favorites,`

`search.service.ts`:
- `SEARCH_SELECT` (после `createdAt: true,`): `viewsCount: true,` и `_count: { select: { favorites: true } },`
- `SearchListItem` (после `created_at: string;`):

```ts
  /** Счётчики детали (мобилка #8): просмотры и лайки (избранное всех юзеров). */
  views_count: number;
  likes_count: number;
```

- `toSearchItem` (после `created_at: …`):

```ts
      views_count: listing.viewsCount,
      likes_count: listing._count.favorites,
```

- [ ] **Step 4: Прогнать тесты + tsc**

Run: `npm test -- --testPathPattern listings.service && npx tsc --noEmit`
Expected: PASS / без ошибок (tsc подсветит забытые фикстуры — дополнить `viewsCount`/`_count`).

- [ ] **Step 5: Commit (контроллер)**

```bash
git add apps/api/src/listings apps/api/src/search
git commit -m "feat(listings): views_count/likes_count в детали, списках и поиске"
```

---

### Task 7: Сиды — описания без дублей характеристик + POOL

**Files:**
- Modify: `apps/api/prisma/seed-all.cjs` (функция `descs` строки 357-385, вызов строки 525, `amenitiesFor` строки 278-288)

**Interfaces:**
- Produces: `descs(g, pt, tx, d)` — новая сигнатура (без `dim`/`rooms`); тексты БЕЗ комнат/м²/этажа/года. `amenitiesFor` добавляет `POOL` части HOUSE.

- [ ] **Step 1: Переписать `descs`**

Заменить функцию `descs` (строки 357-385) целиком:

```js
// Лайфстайл-описания БЕЗ структурных полей (комнаты/м²/этаж/год показываются из
// полей объявления — не дублируем, баглист мобилки #6). Вариант — по g (детерминизм).
function descs(g, pt, tx, d) {
  const ru = tx === 'RENT' ? 'Сдаётся в аренду' : 'Продаётся';
  const uz = tx === 'RENT' ? 'Ijaraga beriladi' : 'Sotiladi';
  const en = tx === 'RENT' ? 'For rent' : 'For sale';
  if (pt === 'LAND') {
    const v = [
      {
        RU: `${ru}. Ровный участок правильной формы в районе ${d.nameRu}. Коммуникации рядом, круглогодичный подъезд, тихое окружение — подойдёт и под строительство, и как вложение.`,
        UZ: `${uz}. ${d.nameUz} tumanida tekis, to'g'ri shaklli uchastka. Kommunikatsiyalar yaqin, yil davomida qulay yo'l, tinch atrof-muhit.`,
        EN: `${en}. Level, regular-shaped plot in ${d.nameEn}. Utilities nearby, year-round access, quiet surroundings — great for building or investment.`,
      },
      {
        RU: `${ru}. Участок в развивающейся части ${d.nameRu}: асфальтированный подъезд, электричество и вода по границе. Документы готовы к сделке.`,
        UZ: `${uz}. ${d.nameUz}ning rivojlanayotgan qismida uchastka: asfalt yo'l, elektr va suv chegarada. Hujjatlar bitimga tayyor.`,
        EN: `${en}. Plot in a growing part of ${d.nameEn}: paved access, power and water at the boundary. Paperwork ready.`,
      },
      {
        RU: `${ru}. Тихий участок недалеко от основных магистралей ${d.nameRu}. Хорошие соседи, перспективная локация, разумный торг возможен.`,
        UZ: `${uz}. ${d.nameUz} asosiy yo'llariga yaqin tinch uchastka. Yaxshi qo'shnilar, istiqbolli joylashuv, kelishish mumkin.`,
        EN: `${en}. Quiet plot near the main roads of ${d.nameEn}. Good neighbours, promising location, price negotiable.`,
      },
    ];
    return v[g % v.length];
  }
  if (pt === 'COMMERCIAL') {
    const v = [
      {
        RU: `${ru}. Помещение с отдельным входом и витринными окнами в проходной части ${d.nameRu}. Подходит под магазин, офис или сферу услуг.`,
        UZ: `${uz}. ${d.nameUz}ning gavjum qismida alohida kirish va vitrina oynalariga ega bino. Do'kon, ofis yoki xizmat ko'rsatish uchun mos.`,
        EN: `${en}. Unit with a separate entrance and display windows in a busy part of ${d.nameEn}. Suits retail, office or services.`,
      },
      {
        RU: `${ru}. Готовое к работе помещение: свежий ремонт, все коммуникации, парковка для клиентов. Первая линия, ${d.nameRu}.`,
        UZ: `${uz}. Ishga tayyor bino: yangi ta'mir, barcha kommunikatsiyalar, mijozlar uchun avtoturargoh. Birinchi qator, ${d.nameUz}.`,
        EN: `${en}. Move-in-ready unit: fresh renovation, all utilities, customer parking. Street-front location in ${d.nameEn}.`,
      },
      {
        RU: `${ru}. Ликвидное помещение в ${d.nameRu} с высоким пешеходным трафиком. Гибкая планировка, возможно расширение на соседние площади.`,
        UZ: `${uz}. ${d.nameUz}da piyodalar oqimi yuqori bo'lgan likvidli bino. Moslashuvchan rejalashtirish, kengaytirish imkoniyati bor.`,
        EN: `${en}. High-footfall unit in ${d.nameEn}. Flexible layout, adjacent space available for expansion.`,
      },
    ];
    return v[g % v.length];
  }
  const tw = TYPE_W[pt] || { ru: 'квартира', uz: 'kvartira', en: 'apartment' };
  const v = [
    {
      RU: `${ru}. Светлая ${tw.ru} с продуманной планировкой в ${d.nameRu}. Во дворе детская площадка; школа, детский сад и магазины — в пешей доступности.`,
      UZ: `${uz}. ${d.nameUz}da yorug', qulay rejalashtirilgan ${tw.uz}. Hovlida bolalar maydonchasi; maktab, bog'cha va do'konlar piyoda yetib boriladigan masofada.`,
      EN: `${en}. Bright ${tw.en} with a practical layout in ${d.nameEn}. Playground in the courtyard; school, kindergarten and shops within walking distance.`,
    },
    {
      RU: `${ru}. Качественный ремонт, тёплый и тихий двор, приветливые соседи. Удобный выезд на основные магистрали ${d.nameRu}, остановки транспорта рядом.`,
      UZ: `${uz}. Sifatli ta'mir, issiq va tinch hovli, yaxshi qo'shnilar. ${d.nameUz} asosiy yo'llariga qulay chiqish, bekatlar yaqin.`,
      EN: `${en}. Quality renovation, warm and quiet courtyard, friendly neighbours. Easy access to the main roads of ${d.nameEn}, transit stops nearby.`,
    },
    {
      RU: `${ru}. Развитая инфраструктура ${d.nameRu}: рынки, парки и поликлиника в нескольких минутах. Отличный вариант и для жизни, и под сдачу.`,
      UZ: `${uz}. ${d.nameUz}ning rivojlangan infratuzilmasi: bozorlar, parklar va poliklinika bir necha daqiqada. Yashash uchun ham, ijaraga berish uchun ham ajoyib variant.`,
      EN: `${en}. Well-developed ${d.nameEn} infrastructure: markets, parks and a clinic minutes away. Great both to live in and to rent out.`,
    },
  ];
  return v[g % v.length];
}
```

Обновить вызов (строка 525): `const ds = descs(pt, tx, district, dim, dim.rooms);` → `const ds = descs(g, pt, tx, district);`

ВАЖНО: убедиться, что `TYPE_W` содержит ключи для APARTMENT/HOUSE (см. `titles`, строка 349); для NEW_BUILDING сработает фолбэк `|| {…}`.

- [ ] **Step 2: POOL для части домов**

В `amenitiesFor` (строки 278-288), перед `return out;`:

```js
  // Бассейн — только не-квартиры (мобилка #5): часть домов для демо фильтра POOL.
  if (pt === 'HOUSE' && g % 3 === 0 && !out.includes('POOL')) out.push('POOL');
```

- [ ] **Step 3: Проверка синтаксиса и дублей**

Run: `node --check prisma/seed-all.cjs`
Expected: без вывода (exit 0).

Run: `node -e "const s=require('fs').readFileSync('prisma/seed-all.cjs','utf8'); const m=s.match(/function descs[\s\S]*?\n}/)[0]; console.log(/м²|этаж |qavat|floor |yil,|г\. постройки/.test(m) ? 'FAIL: структурные поля в descs' : 'OK')"`
Expected: `OK`

- [ ] **Step 4: Проверить остальные сиды**

Run: `rtk grep -n -e "этаж" -e "м²" /Users/founder/Desktop/hermes/projects/avino/apps/api/prisma/seed-catalog.cjs /Users/founder/Desktop/hermes/projects/avino/apps/api/prisma/seed-demo.cjs`
Если найдены такие же шаблоны в description-строках — применить тот же принцип (лайфстайл без структурных полей); если нет — шаг завершён.

- [ ] **Step 5: Commit (контроллер)**

```bash
git add apps/api/prisma/seed-all.cjs apps/api/prisma/seed-catalog.cjs apps/api/prisma/seed-demo.cjs
git commit -m "chore(seed): описания без дублей характеристик + POOL для части домов"
```

---

### Task 8: OpenAPI regen + ANSWERS-док для мобилки

**Files:**
- Modify: `apps/api/openapi.public.json` (regen)
- Create: `docs/ANSWERS_MOBILE_BACKEND.md`

**Interfaces:**
- Consumes: все поля/эндпоинты Task 1-6.
- Produces: готовый к пересылке документ-ответ.

- [ ] **Step 1: Regen OpenAPI**

Run: `npm run openapi:export`
Expected: `apps/api/openapi.public.json` обновлён (в diff — bathrooms number, is_basement, POOL, living_area, views_count, likes_count, POST /listings/{id}/view).

- [ ] **Step 2: Написать ANSWERS-док**

Создать `docs/ANSWERS_MOBILE_BACKEND.md`:

```markdown
# Ответы бэкенда на баглист мобильной команды (2026-07-01)

Дата: 2026-07-02. Все пункты реализованы в ветке `feat/mobile-backend-api`
(деплой — после мержа PR; про push см. чеклист в #2).

## #2 Save Search — зона + пуши

**Полигон уже поддерживается.** Формат — НЕ GeoJSON, а строка пар координат
внутри `filters_json.filters.points`:

    POST /api/v1/saved-searches
    {
      "name": "Юнусабад до $500",
      "filters_json": {
        "schemaVersion": 1,
        "filters": {
          "transaction_type": "RENT",
          "price_max": "500",
          "currency": "USD",
          "points": "41.351,69.289;41.348,69.301;41.339,69.295;41.343,69.283"
        }
      }
    }

- `points`: `"lat,lng;lat,lng;…"`, минимум 3 вершины, WGS84. Замыкать кольцо не
  нужно (бэкенд замыкает сам). Битая строка → алерты по этому поиску просто не
  шлются (без city-wide спама).
- Контракт: `GET /api/v1/saved-searches` (список), `POST` (создание, 422 при
  `schemaVersion != 1`), `PATCH /api/v1/saved-searches/{id}` (`name` /
  `filters_json` / `is_active`), `DELETE …/{id}` → 204.
- **Toggle-notify = `PATCH {"is_active": false}`** — отдельного эндпоинта нет,
  матчер обрабатывает только `is_active: true`.

**Пуши есть.** Новое объявление в зоне → push `SAVED_SEARCH_NEW_LISTING`
(+ in-app; email-дайджест шлётся отдельно). От вас:

1. Регистрируйте FCM-токен: `POST /api/v1/notifications/devices`
   `{"platform": "ANDROID" | "IOS", "push_token": "<fcm token>"}` (Bearer).
   При логауте: `DELETE /api/v1/notifications/devices/{id}`.
2. С нашей стороны перед релизом: Firebase-креды на проде + включение тоггла
   `push_notifications_enabled` (пока выключен — доставки копятся и уйдут при включении).

## #3 Санузел 1.5

Вариант A: `bathrooms` теперь **дробный, шаг 0.5** (1, 1.5, 2, 2.5 …, максимум 99).
- Создание/редактирование: `bathrooms: 1.5` (number). Не кратное 0.5 (например 1.3) → 400.
- Фильтр: `bathrooms_min=1.5` (тот же смысл `bathrooms >= N`).
- В ответах API `bathrooms` остаётся number (не строка).

## #4 Цокольный этаж

Вариант B: новый флаг **`is_basement`** (boolean, default false).
- Создание/редактирование: `"is_basement": true` (при этом `floor` шлите `null`).
- Фильтр: `is_basement=true` → только цокольные; `false`/не передан → без фильтра.
- Поле отдаётся в детали, карточках поиска и «моих объявлениях».

## #5 Бассейн

Ключ **`POOL`** добавлен в enum удобств (`amenities`), в ряд к
`AIR_CONDITIONING, FURNITURE, APPLIANCES, INTERNET, ELEVATOR, BALCONY, HEATING, SECURITY`.
Работает в создании и в фильтре `amenities=POOL` (AND-семантика, как у остальных).

## #8 Просмотры и лайки

- В детали, карточках поиска и «моих объявлениях» появились
  **`views_count: int`** и **`likes_count: int`** (лайки = сколько юзеров добавили в избранное).
- Инкремент просмотра: **`POST /api/v1/listings/{id}/view`** — без авторизации,
  тело не нужно, ответ `204`; несуществующее/удалённое объявление → `404`.
  Зовите при открытии детали.
- Уникальность НЕ считается (каждый вызов = +1) — осознанное MVP-решение,
  дедупликацию добавим позже при необходимости.

## #10 Жилая/нежилая площадь

Новые поля **`living_area`** и **`non_living_area`** (м²).
- Формат — как у `area`/`lot_area`: **decimal-строка** `"95.00"` (и в запросе, и в ответе детали).
- Принимаются для любого типа недвижимости — правило «показывать только для дома» на вашей стороне.
- Квери-фильтров пока нет (вы пометили их как необязательные) — добавим по запросу.

## #6 Описания-дубли

Сид-генерация переписана: описания больше не повторяют комнаты/м²/этаж/год
(лайфстайл-тексты про район/инфраструктуру, RU/UZ/EN). Демо-база будет
пересеяна при деплое.

## Напоминание про whitelist

Все новые поля уже в DTO — неизвестные параметры по-прежнему дают 400.
Актуальный контракт: `apps/api/openapi.public.json` (Swagger `/api/docs`).
```

- [ ] **Step 3: Commit (контроллер)**

```bash
git add apps/api/openapi.public.json docs/ANSWERS_MOBILE_BACKEND.md
git commit -m "docs(api): ответы мобильной команде + regen openapi"
```

---

### Task 9: Финальная верификация (контроллер)

**Files:** нет новых — только проверки.

- [ ] **Step 1: Полный unit-прогон + линт + сборка**

Run (из `apps/api`): `npm test && npm run lint && npm run build`
Expected: все PASS/без ошибок.

- [ ] **Step 2: Миграции + int-тесты на локальной БД**

Run (из корня репо): `docker compose up -d postgres`
Run (из `apps/api`): `npx prisma migrate deploy && npm run test:int`
Expected: миграции 20260702000000…20260702040000 применены; int-suite PASS.
Если int-фикстуры поиска сломались на новых полях (`bathrooms` Decimal,
`is_basement`, счётчики) — дополнить фикстуры соответственно и перезапустить.

- [ ] **Step 3: Smoke сидов**

Run (из `apps/api`, БД из Step 2 поднята): `node prisma/seed-all.cjs`
Затем: `rtk psql "$DATABASE_URL" -c "SELECT left(description, 120) FROM listing_translations WHERE language='RU' LIMIT 5"`
Expected: сид отработал без ошибок; описания без «м²», «этаж», «г. постройки».

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/mobile-backend-api
gh pr create --title "feat(api): бэкенд-доработки по баглисту мобильной команды" --body "$(cat <<'EOF'
## Что сделано
- bathrooms → Decimal(3,1), шаг 0.5 (create/update/фильтр bathrooms_min, в ответах number)
- is_basement (поле + фильтр + во всех ответах)
- POOL в enum Amenity
- living_area / non_living_area (детальная карточка, decimal-строки)
- views_count/likes_count в детали, поиске и mine + публичный POST /listings/:id/view
- сиды: описания без дублей характеристик, POOL для части домов
- docs/ANSWERS_MOBILE_BACKEND.md + regen openapi.public.json

## Зачем
Баглист мобильной команды (Flutter) от 2026-07-01 — пункты #2,3,4,5,6,8,10.
Спека: docs/superpowers/specs/2026-07-02-mobile-backend-requests-design.md

## Как проверить
- unit: cd apps/api && npm test
- int: docker compose up -d postgres && npx prisma migrate deploy && npm run test:int
- вручную: POST /api/v1/listings/:id/view → 204, деталь отдаёт счётчики

## Pre-merge checklist
- [ ] 5 миграций применяются чисто (migrate deploy)
- [ ] unit + int тесты зелёные
- [ ] нет изменений вне apps/api/ и docs/

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After merge: запись в docs/DONE.md, ADR-0119, docs/LOG.md; деплой-чеклист —
Firebase env + тоггл `push_notifications_enabled` + пересид демо-базы.
