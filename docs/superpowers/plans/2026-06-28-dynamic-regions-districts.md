# Dynamic Regions → Districts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать дропдаун «Район» в поиске зависимым от выбранного «Региона» (вместо вечного списка районов Ташкента), наполнив справочник всеми 14 регионами и 210 районами Узбекистана, и дать продавцу выбирать Регион+Район при создании/редактировании объявления.

**Architecture:** Подход A — регион родитель района. Новая таблица `regions`, FK `district.region_id`. Существующие 12 ташкентских районов (UUID `d0000000-*`) сохраняются и привязываются к региону «город Ташкент». Листинг хранит только `district_id`; фильтр поиска по `region_id` раскрывается в набор районов региона (`district_id IN (SELECT … WHERE region_id = …)`). Справочные данные едут внутри одной миграции.

**Tech Stack:** NestJS + Prisma + PostgreSQL (`apps/api`); Next.js 15 + React 19 + RTK Query + next-intl + Tailwind (`apps/client`); Vitest (оба).

**Источник данных:** `github.com/FounderDAO/uzbekistan-regions-data`, файлы `JSON/regions.json` (14), `JSON/districts.json` (210). Поля: `id`, `region_id`, `name_uz` (латиница), `name_oz` (кириллица), `name_ru`.

## Global Constraints

- **Спека:** `docs/superpowers/specs/2026-06-28-dynamic-regions-districts-design.md` — источник истины.
- **Сохранить 12 ташкентских UUID** `d0000000-0000-4000-8000-000000000001 … 000000000012`; имена не менять; листинги/сиды не ломать.
- **Детерминированные UUID:** регионы `c0000000-0000-4000-8000-<region_id, 12 знаков>`; импортированные районы `e0000000-0000-4000-8000-<district_id, 12 знаков>`.
- **Пропустить при импорте районов:** `region_id = 11` (Ташкент — дубли наших 12) и `id = 2993` (мусор, `name_ru = null`).
- **Версионирование роутов:** все API-роуты с `version: '1'` (правило §14 CLAUDE.md), unversioned запрещены.
- **API контракт snake_case** в ответах гео, **camelCase** в Prisma-моделях. Глобального snake_case-трансформера НЕТ.
- **OpenAPI drift-check:** после любого изменения роутов/DTO — `pnpm openapi:export` (4 dummy env), иначе CI красный. Swagger-плагин документирует только классы в `*.dto.ts`.
- **i18n:** строки только через `t('key')`, ключи в `ru`/`uz`/`en`. Мок next-intl в тестах скрывает пропущенные ключи — проверять ключи вручную. ESLint в `apps/client` не ловит unused-импорты — проверять вручную.
- **Prisma после смены схемы:** `pnpm --filter @avino/api prisma generate` (иначе устаревший клиент → cryptic TS-ошибки).
- **Git:** main protected. Ветки `feat/regions-*`; PR открывает агент, мёржит юзер; никогда `--admin`. Каждая фаза = отдельный PR. ADR + DONE.md готовятся внутри PR1.
- **Язык prose:** русский; код/коммиты/i18n-ключи — по обычным правилам.

---

# ФАЗА A — Backend (`apps/api`), ветка `feat/regions-api`

Производит: таблицу `regions`, `district.region_id`, миграцию-сид, `GET /geo/regions`, `GET /geo/districts?region_id=`, `region_id`-фильтр поиска. Это PR1 — мёржится первым.

## Task A1: Prisma-схема — модель Region + district.region_id

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (модель `District` ~`:880`; добавить модель `Region` рядом)

**Interfaces:**
- Produces: Prisma-модели `Region { id, code, nameUz, nameRu, nameEn, sortOrder, districts[] }` и связь `District.region (regionId?)`.

- [ ] **Step 1: Добавить модель Region и связь в District**

В `schema.prisma`, сразу перед `model District {`:
```prisma
/// Справочник регионов (областей + город Ташкент) Узбекистана — родитель District.
/// 14 регионов сидируются в миграции (фиксированные UUID c0000000-*). `code` —
/// latin-slug (уникальный). Источник: uzbekistan-regions-data (ADR-0113).
model Region {
  id        String     @id @default(uuid()) @db.Uuid
  code      String     @unique @db.VarChar(40)
  nameUz    String     @map("name_uz") @db.VarChar(120)
  nameRu    String     @map("name_ru") @db.VarChar(120)
  nameEn    String     @map("name_en") @db.VarChar(120)
  sortOrder Int        @map("sort_order")
  districts District[]
  createdAt DateTime   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime   @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("regions")
}
```

Внутри `model District { … }` добавить (после `nameEn`):
```prisma
  regionId  String?  @map("region_id") @db.Uuid
  region    Region?  @relation(fields: [regionId], references: [id])
```
И в индексы District добавить:
```prisma
  @@index([regionId])
```

- [ ] **Step 2: Провалидировать схему**

Run: `pnpm --filter @avino/api exec prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(api): add Region model and District.region_id relation"
```

---

## Task A2: Сгенерировать и положить миграцию-сид

**Files:**
- Create (throwaway, в scratchpad — НЕ коммитить): `<scratchpad>/gen-regions-migration.cjs`
- Create: `apps/api/prisma/migrations/20260628120000_add_regions/migration.sql`

**Interfaces:**
- Consumes: `regions.json`, `districts.json` из датасета.
- Produces: таблицу `regions` (14 строк), колонку `districts.region_id` (заполнена для всех строк), `e0000000-*` UUID импортированных районов.

- [ ] **Step 1: Скачать датасет в scratchpad**

```bash
cd <scratchpad>
gh api repos/FounderDAO/uzbekistan-regions-data/contents/JSON/regions.json --jq '.content' | base64 -d > regions.json
gh api repos/FounderDAO/uzbekistan-regions-data/contents/JSON/districts.json --jq '.content' | base64 -d > districts.json
```

- [ ] **Step 2: Написать генератор**

Создать `<scratchpad>/gen-regions-migration.cjs`:
```js
const fs = require('fs');
const regions = JSON.parse(fs.readFileSync('regions.json', 'utf8').replace(/^﻿/, ''));
const districts = JSON.parse(fs.readFileSync('districts.json', 'utf8').replace(/^﻿/, ''));

const pad = (n) => String(n).padStart(12, '0');
const regUuid = (id) => `c0000000-0000-4000-8000-${pad(id)}`;
const distUuid = (id) => `e0000000-0000-4000-8000-${pad(id)}`;
const esc = (s) => s.replace(/'/g, "''");

// latin-slug из name_uz: убрать суффикс, латиница/цифры/дефис.
const slug = (nameUz) =>
  nameUz
    .replace(/\s+(viloyati|shahri|Respublikasi)$/i, '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// 12 наших ташкентских кодов — для UPDATE region_id (НЕ импортируем заново).
const TASHKENT_CODES = [
  'bektemir','chilonzor','mirobod','mirzo-ulugbek','olmazor','sergeli',
  'shayxontohur','uchtepa','yakkasaroy','yashnobod','yangihayot','yunusobod',
];
const TASHKENT_REGION_ID = 11;

// Регионы по алфавиту RU → sort_order.
const sortedRegions = [...regions].sort((a, b) => a.name_ru.localeCompare(b.name_ru, 'ru'));

let sql = `-- Auto-generated: regions + district.region_id (ADR-0113)\n`;
sql += `-- Источник: github.com/FounderDAO/uzbekistan-regions-data\n\n`;

sql += `CREATE TABLE "regions" (\n`;
sql += `  "id" UUID PRIMARY KEY,\n`;
sql += `  "code" VARCHAR(40) NOT NULL,\n`;
sql += `  "name_uz" VARCHAR(120) NOT NULL,\n`;
sql += `  "name_ru" VARCHAR(120) NOT NULL,\n`;
sql += `  "name_en" VARCHAR(120) NOT NULL,\n`;
sql += `  "sort_order" INTEGER NOT NULL,\n`;
sql += `  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),\n`;
sql += `  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now()\n`;
sql += `);\n`;
sql += `CREATE UNIQUE INDEX "regions_code_key" ON "regions"("code");\n\n`;

sql += `INSERT INTO "regions" ("id","code","name_uz","name_ru","name_en","sort_order") VALUES\n`;
sql += sortedRegions
  .map((r, i) => `  ('${regUuid(r.id)}','${esc(slug(r.name_uz))}','${esc(r.name_uz)}','${esc(r.name_ru)}','${esc(r.name_uz)}',${i})`)
  .join(',\n') + ';\n\n';

sql += `ALTER TABLE "districts" ADD COLUMN "region_id" UUID;\n`;
sql += `ALTER TABLE "districts" ADD CONSTRAINT "districts_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;\n`;
sql += `CREATE INDEX "districts_region_id_idx" ON "districts"("region_id");\n\n`;

// Привязать наши 12 ташкентских к региону "город Ташкент".
const tashkentUuid = regUuid(TASHKENT_REGION_ID);
sql += `UPDATE "districts" SET "region_id" = '${tashkentUuid}' WHERE "code" IN (${TASHKENT_CODES.map((c) => `'${c}'`).join(',')});\n\n`;

// Импорт остальных районов: пропустить регион 11 и мусор 2993.
const imported = districts.filter((d) => d.region_id !== TASHKENT_REGION_ID && d.name_ru);
sql += `INSERT INTO "districts" ("id","code","name_uz","name_ru","name_en","region_id","updated_at") VALUES\n`;
sql += imported
  .map((d) => `  ('${distUuid(d.id)}','${esc(slug(d.name_uz))}-${d.id}','${esc(d.name_uz)}','${esc(d.name_ru)}','${esc(d.name_uz)}','${regUuid(d.region_id)}',now())`)
  .join(',\n') + ';\n';

fs.writeFileSync('migration.sql', sql);
console.log(`regions=${sortedRegions.length} imported_districts=${imported.length}`);
```

Run: `node gen-regions-migration.cjs`
Expected: `regions=14 imported_districts=197` (точное число — проверить; должно быть ~197). Если `name_ru=null` строки попали — увеличить фильтр.

> Примечание про `code`: у районов `code` строится как `<slug>-<datasetId>` — гарантирует уникальность (одноимённые районы в разных областях) и не конфликтует с нашими 12 короткими кодами.

- [ ] **Step 3: Положить миграцию в репозиторий**

```bash
mkdir -p apps/api/prisma/migrations/20260628120000_add_regions
cp <scratchpad>/migration.sql apps/api/prisma/migrations/20260628120000_add_regions/migration.sql
```

- [ ] **Step 4: Применить миграцию к dev-БД и проверить инварианты**

Run: `pnpm --filter @avino/api exec prisma migrate deploy`
Затем sanity-проверка:
```bash
pnpm --filter @avino/api exec prisma db execute --stdin <<'SQL'
SELECT (SELECT count(*) FROM regions) AS regions,
       (SELECT count(*) FROM districts WHERE region_id IS NOT NULL) AS districts_with_region,
       (SELECT count(*) FROM districts WHERE region_id IS NULL) AS districts_orphan,
       (SELECT count(*) FROM districts WHERE id LIKE 'd0000000%' AND region_id = 'c0000000-0000-4000-8000-000000000011') AS tashkent_linked;
SQL
```
Expected: `regions=14`, `districts_orphan=0`, `tashkent_linked=12`.

- [ ] **Step 5: Перегенерировать Prisma-клиент**

Run: `pnpm --filter @avino/api exec prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations/20260628120000_add_regions/migration.sql
git commit -m "feat(api): seed regions and backfill district.region_id (migration)"
```

---

## Task A3: RegionsService + GET /geo/regions

**Files:**
- Create: `apps/api/src/geo/regions.service.ts`
- Create: `apps/api/src/geo/regions.service.spec.ts`
- Modify: `apps/api/src/geo/geo.controller.ts`
- Modify: `apps/api/src/geo/geo.module.ts`

**Interfaces:**
- Produces: `RegionsService.listAll(): Promise<RegionListItem[]>` где `RegionListItem = { id, code, name_uz, name_ru, name_en }`; роут `GET /api/v1/geo/regions`.

- [ ] **Step 1: Написать падающий тест сервиса**

Создать `apps/api/src/geo/regions.service.spec.ts`:
```ts
import { RegionsService } from './regions.service';

describe('RegionsService', () => {
  it('listAll маппит camelCase → snake_case и сортирует по sort_order', async () => {
    const prisma = {
      region: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', code: 'andijon', nameUz: 'Andijon viloyati', nameRu: 'Андижанская область', nameEn: 'Andijon viloyati' },
        ]),
      },
    } as any;
    const svc = new RegionsService(prisma);
    const rows = await svc.listAll();
    expect(prisma.region.findMany).toHaveBeenCalledWith({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true },
    });
    expect(rows[0]).toEqual({
      id: 'c1', code: 'andijon', name_uz: 'Andijon viloyati', name_ru: 'Андижанская область', name_en: 'Andijon viloyati',
    });
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- regions.service`
Expected: FAIL — `Cannot find module './regions.service'`.

- [ ] **Step 3: Реализовать сервис**

Создать `apps/api/src/geo/regions.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/** Строка справочника регионов для публичного ответа (snake_case контракт §geo). */
export interface RegionListItem {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
}

/**
 * RegionsService — справочник регионов (ADR-0113). Зеркало DistrictsService.
 * Родитель района; lookup без relation на listings.
 */
@Injectable()
export class RegionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Полный список регионов в порядке sort_order — `GET /api/v1/geo/regions`. */
  async listAll(): Promise<RegionListItem[]> {
    const rows = await this.prisma.region.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true },
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name_uz: r.nameUz,
      name_ru: r.nameRu,
      name_en: r.nameEn,
    }));
  }
}
```

- [ ] **Step 4: Зарегистрировать в модуле и контроллере**

В `geo.module.ts` добавить `RegionsService` в `providers` и `exports`, импорт сверху.

В `geo.controller.ts`:
```ts
import { RegionListItem, RegionsService } from './regions.service';
```
В конструктор добавить `private readonly regionsService: RegionsService`. Добавить роут:
```ts
  /** `GET /api/v1/geo/regions` — полный список регионов (ADR-0113). Auth: public. */
  @Get('regions')
  listRegions(): Promise<RegionListItem[]> {
    return this.regionsService.listAll();
  }
```

- [ ] **Step 5: Запустить тест — проходит**

Run: `pnpm --filter @avino/api test -- regions.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/geo/
git commit -m "feat(api): add GET /geo/regions (RegionsService)"
```

---

## Task A4: GET /geo/districts?region_id= (опциональный фильтр)

**Files:**
- Modify: `apps/api/src/geo/districts.service.ts` (`listAll`)
- Modify: `apps/api/src/geo/geo.controller.ts` (роут `districts`)
- Modify: `apps/api/src/geo/districts.service.int-spec.ts` (или unit-spec)

**Interfaces:**
- Consumes: `District.regionId`.
- Produces: `DistrictsService.listAll(regionId?: string)`; ответ `DistrictListItem` получает поле `region_id: string | null`; роут `GET /geo/districts?region_id=<uuid>`.

- [ ] **Step 1: Падающий тест на фильтр + region_id в ответе**

В `districts.service.int-spec.ts` (или новый unit-spec по образцу A3) добавить кейс: `listAll('c0000000-0000-4000-8000-000000000011')` вызывает `findMany` с `where: { regionId }` и каждый элемент содержит `region_id`. Минимальный unit-вариант:
```ts
it('listAll(regionId) фильтрует по региону и отдаёт region_id', async () => {
  const prisma = { district: { findMany: jest.fn().mockResolvedValue([
    { id: 'd1', code: 'olmazor', nameUz: 'Olmazor', nameRu: 'Алмазар', nameEn: 'Almazar', regionId: 'c11' },
  ]) } } as any;
  const svc = new DistrictsService(prisma);
  const rows = await svc.listAll('c11');
  expect(prisma.district.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { regionId: 'c11' } }));
  expect(rows[0].region_id).toBe('c11');
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/api test -- districts.service`
Expected: FAIL (`where` не передаётся / `region_id` отсутствует).

- [ ] **Step 3: Реализовать**

В `districts.service.ts`: добавить `region_id` в интерфейс `DistrictListItem`:
```ts
export interface DistrictListItem {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
  region_id: string | null;
}
```
Переписать `listAll`:
```ts
async listAll(regionId?: string): Promise<DistrictListItem[]> {
  const rows = await this.prisma.district.findMany({
    where: regionId ? { regionId } : undefined,
    orderBy: { nameRu: 'asc' },
    select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true, regionId: true },
  });
  return rows.map((r) => ({
    id: r.id, code: r.code,
    name_uz: r.nameUz, name_ru: r.nameRu, name_en: r.nameEn,
    region_id: r.regionId,
  }));
}
```

- [ ] **Step 4: Контроллер — принять query-параметр**

В `geo.controller.ts`, импортировать `Query`:
```ts
import { Controller, Get, Query } from '@nestjs/common';
```
Переписать роут districts:
```ts
  /** `GET /api/v1/geo/districts?region_id=` — список районов, опц. фильтр по региону. */
  @Get('districts')
  listDistricts(@Query('region_id') regionId?: string): Promise<DistrictListItem[]> {
    return this.districtsService.listAll(regionId);
  }
```

- [ ] **Step 5: Тесты проходят**

Run: `pnpm --filter @avino/api test -- districts.service`
Expected: PASS. (Если правился int-spec — `pnpm --filter @avino/api test:int -- districts` при наличии БД.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/geo/
git commit -m "feat(api): filter GET /geo/districts by region_id, expose region_id"
```

---

## Task A5: region_id-фильтр в поиске

**Files:**
- Modify: `apps/api/src/search/dto/search-listings.dto.ts` (рядом с `district_id` ~`:117`)
- Modify: `apps/api/src/search/search.service.ts` (conds ~`:824`)
- Modify: `apps/api/src/search/search.service.spec.ts`

**Interfaces:**
- Consumes: `district.regionId`.
- Produces: query-параметр `region_id` на `/search` и (через наследование `geo-search.dto`) `/map`.

- [ ] **Step 1: Падающий тест ветки region_id**

В `search.service.spec.ts` (рядом с тестами `district_id`, ~`:141`) добавить кейс: при `region_id` в WHERE появляется подзапрос `district_id IN (SELECT id FROM districts WHERE region_id = …)`. Проверять через мок `$queryRaw`/собранный `Prisma.sql` как в существующих district_id-тестах (повторить их паттерн ассертов для `region_id`).

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/api test -- search.service`
Expected: FAIL.

- [ ] **Step 3: DTO — добавить region_id**

В `search-listings.dto.ts`, сразу перед `district_id`:
```ts
  @IsOptional()
  @IsUUID()
  region_id?: string;
```

- [ ] **Step 4: Service — добавить cond**

В `search.service.ts`, сразу после блока `district_id` (`:824`):
```ts
    if (query.region_id !== undefined)
      conds.push(
        Prisma.sql`district_id IN (SELECT id FROM districts WHERE region_id = ${query.region_id}::uuid)`,
      );
```

- [ ] **Step 5: Тесты проходят**

Run: `pnpm --filter @avino/api test -- search.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/search/
git commit -m "feat(api): add region_id filter to listing search"
```

---

## Task A6: OpenAPI regen + ADR-0113 + DONE.md + PR

**Files:**
- Modify: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` (генерируются)
- Create: `docs/adr/ADR-0113-region-district-hierarchy.md` (путь — по образцу существующих ADR)
- Modify: `docs/DONE.md` (или где ведётся)

- [ ] **Step 1: Перегенерировать OpenAPI**

Run: `pnpm --filter @avino/api openapi:export` (с 4 dummy env, как в CI; см. предыдущие PR).
Затем убедиться, что `/geo/regions` и параметр `region_id` появились:
```bash
grep -c "geo/regions" apps/api/openapi.public.json
grep -c "region_id" apps/api/openapi.public.json
```
Expected: оба `>= 1`.

- [ ] **Step 2: Полный прогон api-тестов + lint + tsc**

Run: `pnpm --filter @avino/api test && pnpm --filter @avino/api lint && pnpm --filter @avino/api exec tsc --noEmit`
Expected: всё зелёное.

- [ ] **Step 3: Написать ADR-0113**

Создать `docs/adr/ADR-0113-region-district-hierarchy.md` (формат — как у ADR-0112): контекст (плоский справочник Ташкента), решение (Подход A: Region родитель District, фильтр раскрывается в district set, листинг без region-колонки), источник данных, последствия (визард обязан задавать район; миграция листингов вне объёма).

- [ ] **Step 4: Обновить DONE.md** записью о фиче.

- [ ] **Step 5: Commit + PR**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json docs/adr/ADR-0113-region-district-hierarchy.md docs/DONE.md docs/superpowers/specs/2026-06-28-dynamic-regions-districts-design.md docs/superpowers/plans/2026-06-28-dynamic-regions-districts.md
git commit -m "docs(api): ADR-0113 region→district hierarchy + openapi + spec/plan"
gh pr create --base main --head feat/regions-api --title "feat(api): dynamic regions → districts hierarchy" --body "<краткое описание + ссылка на спеку>"
```

> **Live-verify (по возможности):** поднять стек, `curl /api/v1/geo/regions` → 14, `curl '/api/v1/geo/districts?region_id=<namangan>'` → наманганские районы, `curl '/api/v1/search?region_id=<namangan>'` → 200 (пусто, инвентаря нет).

---

# ФАЗА B — Клиент: поиск (`apps/client`), ветка `feat/regions-client-search`

Зависит от ФАЗЫ A (новые роуты). Это PR2.

## Task B1: Гео-слой клиента — Region + region-aware districts

**Files:**
- Modify: `apps/client/src/lib/mock/types.ts` (тип `District`; добавить `Region`)
- Modify: `apps/client/src/lib/api/geo.ts`
- Modify: `apps/client/src/lib/api/geo.test.ts` (если есть; иначе создать рядом)

**Interfaces:**
- Produces: `Region { id, name, code }`; `District.regionId?: string`; `getRegions(lang): Promise<Region[]>`; `mapDistrict` проставляет `regionId`.

- [ ] **Step 1: Падающий тест mapDistrict.regionId + mapRegion**

В тесте geo добавить: `mapDistrict({ …, region_id: 'c11' }, 'ru').regionId === 'c11'`; и (если добавляем `mapRegion`) маппинг имени по языку.

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- geo`
Expected: FAIL.

- [ ] **Step 3: Типы**

В `lib/mock/types.ts`: в `interface District` добавить `regionId?: string;`. Добавить:
```ts
export interface Region {
  id: string;
  name: string;
  code: string;
}
```

- [ ] **Step 4: geo.ts — ApiRegion, mapRegion, getRegions, region_id в районах**

В `geo.ts`:
- В `ApiDistrict` добавить `region_id: string | null;`.
- В `mapDistrict` вернуть `regionId: api.region_id ?? undefined` (вместе с прежними полями).
- Добавить:
```ts
export interface ApiRegion {
  id: string;
  code: string;
  name_uz: string;
  name_ru: string;
  name_en: string;
}

function pickRegionName(r: ApiRegion, lang: string): string {
  const l = lang.toLowerCase();
  if (l.startsWith('uz')) return r.name_uz;
  if (l.startsWith('en')) return r.name_en;
  return r.name_ru;
}

export function mapRegion(api: ApiRegion, lang = 'ru'): Region {
  return { id: api.id, name: pickRegionName(api, lang), code: api.code };
}

/** Список регионов для дропдауна фильтра. GET /geo/regions, кэш 1ч. */
export async function getRegions(lang = 'ru'): Promise<Region[]> {
  try {
    const res = await fetch(`${resolveApiBase()}/geo/regions`, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json', 'Accept-Language': lang },
    });
    if (!res.ok) throw new Error(`API ${res.status} for /geo/regions`);
    return ((await res.json()) as ApiRegion[]).map((r) => mapRegion(r, lang));
  } catch (err) {
    console.error('[geo] regions fetch failed, degrading to empty list', err);
    return [];
  }
}
```
Импортировать `Region` из `@/lib/mock/types`.

- [ ] **Step 5: Тест проходит**

Run: `pnpm --filter @avino/client test -- geo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/lib/
git commit -m "feat(client): geo getRegions + District.regionId mapping"
```

---

## Task B2: URL-параметр region_id (locationParams + page parse)

**Files:**
- Modify: `apps/client/src/features/search/locationParams.ts` (где маппятся suggestion→params и парсинг)
- Modify: `apps/client/src/app/[locale]/search/page.tsx` (parse `region_id` из searchParams → `FilterValues.regionId`; server-fetch `getRegions`)

**Interfaces:**
- Consumes: `getRegions`.
- Produces: `FilterValues.regionId`; `FilterBarProps.regions: Region[]`.

- [ ] **Step 1: page.tsx — фетч регионов и проброс**

В `search/page.tsx`: импортировать `getRegions`; рядом с `getDistricts` вызвать `getRegions(lang)` (можно `Promise.all`). Распарсить `region_id` из searchParams в `values.regionId` (рядом с `district_id`). Передать `regions` в `<FilterBar regions={regions} … />`.

- [ ] **Step 2: tsc**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: ошибки только об отсутствии `regions` в `FilterBarProps` (исправим в B3) — зафиксировать как ожидаемое; либо сделать B3 до прогона.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/app apps/client/src/features/search/locationParams.ts
git commit -m "feat(client): parse region_id from URL, fetch regions in search page"
```

---

## Task B3: FilterBar — каскад «Регион → Район»

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx`
- Modify: `apps/client/src/features/search/FilterBar.test.tsx`

**Interfaces:**
- Consumes: `regions: Region[]`, `districts: District[]` (с `regionId`), `values.regionId`.
- Produces: дропдаун «Регион» + зависимый «Район»; `setParams({ region_id, district_id })`.

- [ ] **Step 1: Падающие тесты каскада**

В `FilterBar.test.tsx` добавить:
1. Без выбранного региона триггер «Район» имеет `disabled` (или `aria-disabled`).
2. После выбора региона X «Район» показывает только районы с `regionId === X`.
3. Смена региона очищает `district_id` (проверить аргумент `router.replace`/`setParams`).

(Использовать существующий рендер-хелпер теста; `data-testid="filter-region"` для нового триггера.)

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- FilterBar`
Expected: FAIL.

- [ ] **Step 3: Реализовать каскад**

В `FilterBar.tsx`:
- В `FilterBarProps` добавить `regions: Region[];`; в сигнатуру `FilterBar({ values, districts, regions })`.
- В `FilterValues` добавить `regionId?: string;`.
- Импортировать `Region` из `@/lib/mock/types`.
- Метки:
```ts
const selectedRegion = values.regionId ? regions.find((r) => r.id === values.regionId) : undefined;
const regionLabel = selectedRegion?.name ?? tSearch('filters.region');
const regionDistricts = values.regionId
  ? districts.filter((d) => d.regionId === values.regionId)
  : [];
```
- Заменить источник списка районов в дропдауне «Район» на `regionDistricts` (вместо `districts`). Триггер «Район» — `disabled={!values.regionId}` с подсказкой `tSearch('filters.regionRequired')` (например, через `title`/пустой dropdown-контент).
- Добавить дропдаун «Регион» перед блоком «Район» (зеркало блока «Тип жилья»): кнопка `TriggerButton label={regionLabel} active={Boolean(values.regionId)} data-testid="filter-region"`; пункт «Все регионы» (`tSearch('filters.allRegions')`, `setParams({ region_id: undefined, district_id: undefined })`); список `regions.map`:
```tsx
onClick={() => setParams({
  region_id: values.regionId === r.id ? undefined : r.id,
  district_id: undefined,
})}
```
- В `buildFilters` добавить: `if (values.regionId) filters.region_id = values.regionId;`.

- [ ] **Step 4: Тесты проходят**

Run: `pnpm --filter @avino/client test -- FilterBar`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/FilterBar.tsx apps/client/src/features/search/FilterBar.test.tsx
git commit -m "feat(client): cascading region → district filter in FilterBar"
```

---

## Task B4: ActiveFilters чип региона + saved search + /map

**Files:**
- Modify: `apps/client/src/features/search/ActiveFilters.tsx` (+ `.test.tsx`)
- Modify: `apps/client/src/lib/savedSearch.ts` (если region входит в имя/сериализацию)
- Modify: `apps/client/src/features/map/MapSearch.tsx` (если строит params напрямую) — проверить `buildSearchParams`

**Interfaces:**
- Consumes: `values.regionId`, `regions`.
- Produces: чип «Регион: X» со сбросом (`region_id` + `district_id` undefined); `region_id` в saved-search-фильтрах и в `/map`-params.

- [ ] **Step 1: Падающий тест чипа**

В `ActiveFilters.test.tsx`: при `regionId` рендерится чип с именем региона; клик-сброс вызывает очистку `region_id` и `district_id`. (`ActiveFilters` уже принимает `districts` — добавить проп `regions`.)

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- ActiveFilters`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

- `ActiveFilters`: добавить проп `regions: Region[]`; чип региона по образцу чипа района; сброс региона также сбрасывает район.
- В `FilterBar.tsx` прокинуть `regions` в `<ActiveFilters … regions={regions} />`.
- В `savedSearch.ts` / `buildSearchParams` (используется `/map`, см. memory) добавить `region_id` по образцу `district_id`. Найти: `rtk grep -rn "district_id" apps/client/src/lib apps/client/src/features/map`.

- [ ] **Step 4: Тесты + сборка**

Run: `pnpm --filter @avino/client test -- ActiveFilters && pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS / без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/ActiveFilters.tsx apps/client/src/features/search/ActiveFilters.test.tsx apps/client/src/lib/savedSearch.ts apps/client/src/features/map/MapSearch.tsx
git commit -m "feat(client): region chip in ActiveFilters + region_id in saved search & map"
```

---

## Task B5: i18n + полный прогон + PR (поиск)

**Files:**
- Modify: `apps/client/src/messages/ru.json`, `uz.json`, `en.json` (или where messages live — `rtk grep -rln "filters.district" apps/client/src`)

**Interfaces:**
- Produces: ключи `search.filters.region`, `search.filters.allRegions`, `search.filters.regionRequired` в 3 языках.

- [ ] **Step 1: Добавить ключи** в `ru`/`uz`/`en` рядом с `filters.district`/`filters.allDistricts`:
  - ru: «Регион», «Все регионы», «Сначала выберите регион»
  - uz: «Hudud», «Barcha hududlar», «Avval hududni tanlang»
  - en: «Region», «All regions», «Select a region first»

- [ ] **Step 2: Вручную сверить, что ключи есть во всех трёх файлах** (мок next-intl скрывает пропуски):
```bash
for f in ru uz en; do echo "== $f =="; grep -c "regionRequired\|allRegions" apps/client/src/messages/$f.json; done
```
Expected: каждый `>= 2`.

- [ ] **Step 3: Полный прогон + lint + ручная проверка unused-импортов**

Run: `pnpm --filter @avino/client test && pnpm --filter @avino/client lint && pnpm --filter @avino/client exec tsc --noEmit`
Expected: тесты — база 180 passed + новые; 2 known-fail `LoginModal` — не регресс. Вручную: нет неиспользуемых импортов в тронутых файлах.

- [ ] **Step 4: Commit + PR**

```bash
git add apps/client/src/messages
git commit -m "feat(client): i18n for region filter (ru/uz/en)"
gh pr create --base main --head feat/regions-client-search --title "feat(client): cascading region → district search filter" --body "<описание + ссылка на спеку; зависит от feat/regions-api>"
```

> **Live-verify:** `/search` → выбрать «Регион: Наманган» → «Район» показывает наманганские районы; смена региона на «Ташкент» → ташкентские; «Все регионы» → «Район» задизейблен.

---

# ФАЗА C — Клиент: создание/редактирование (`apps/client`), ветка `feat/regions-client-listing`

Зависит от ФАЗЫ A (роуты) и переиспользует гео-слой из ФАЗЫ B (тип `Region`, `getRegions`). Это PR3.

## Task C1: Переиспользуемый RegionDistrictSelect

**Files:**
- Create: `apps/client/src/features/listing-new/RegionDistrictSelect.tsx`
- Create: `apps/client/src/features/listing-new/RegionDistrictSelect.test.tsx`

**Interfaces:**
- Consumes: `regions: Region[]`, `districts: District[]`.
- Produces: контролируемый компонент
  `RegionDistrictSelect({ regions, districts, regionId, districtId, onChange, locale })`,
  где `onChange(next: { regionId?: string; districtId?: string })`. При смене региона сбрасывает `districtId`. «Район» задизейблен без региона.

- [ ] **Step 1: Падающий тест**

`RegionDistrictSelect.test.tsx`:
1. Рендерит регионы; выбор региона зовёт `onChange({ regionId: X, districtId: undefined })`.
2. «Район» задизейблен, пока нет региона.
3. После региона X в списке районов — только `regionId === X`; выбор зовёт `onChange({ regionId: X, districtId: Y })`.

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- RegionDistrictSelect`
Expected: FAIL.

- [ ] **Step 3: Реализовать** компонент двумя `Dropdown` (как в FilterBar), фильтрация `districts.filter(d => d.regionId === regionId)`, метки через `useTranslations('listingNew')` с фолбэком на `search.filters.*`. Никакого URL — чистый контролируемый ввод.

- [ ] **Step 4: Тест проходит**

Run: `pnpm --filter @avino/client test -- RegionDistrictSelect`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/listing-new/RegionDistrictSelect.tsx apps/client/src/features/listing-new/RegionDistrictSelect.test.tsx
git commit -m "feat(client): reusable RegionDistrictSelect cascade component"
```

---

## Task C2: Визард создания — поля Регион+Район

**Files:**
- Modify: `apps/client/src/features/listing-new/ListingNew.tsx` (state, валидация шага, payload)
- Modify: `apps/client/src/app/[locale]/sell/new/page.tsx` (server-fetch regions+districts, проброс)
- Modify: `apps/client/src/features/listing-new/ListingNew.test.tsx` (если есть)

**Interfaces:**
- Consumes: `RegionDistrictSelect`, `getRegions`, `getDistricts`.
- Produces: `body.district_id = districtId`, `body.city_id = regionId`; шаг «Адрес» не пройти без региона+района.

- [ ] **Step 1: Падающий тест валидации/payload**

Тест: без `regionId`/`districtId` шаг адреса невалиден (нельзя «Далее»/submit); при заданных — в теле запроса `district_id` и `city_id` проставлены. (Если ListingNew.test отсутствует — добавить точечный тест функции сборки body или валидации шага.)

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- ListingNew`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

- В стейт формы добавить `regionId: ''`, `districtId: ''` (и в тип формы).
- На шаге «Адрес» отрендерить `<RegionDistrictSelect … />` над `AddressStep`, прокинув `regions`/`districts` (из props страницы).
- В валидацию шага «Адрес» (там, где `Boolean(f.address.trim())`, ~`:298`) добавить `&& Boolean(f.regionId) && Boolean(f.districtId)`.
- В сборку body (рядом с `:247`): `body.district_id = f.districtId; body.city_id = f.regionId;`.
- `sell/new/page.tsx`: server-fetch `getRegions(lang)` + `getDistricts(lang)`, передать в `<ListingNew regions=… districts=… />`.

- [ ] **Step 4: Тест проходит + tsc**

Run: `pnpm --filter @avino/client test -- ListingNew && pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS / без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/listing-new apps/client/src/app/[locale]/sell/new
git commit -m "feat(client): region+district selection in create listing wizard"
```

---

## Task C3: Форма редактирования — Регион+Район

**Files:**
- Modify: `apps/client/src/features/listing-edit/ListingEdit.tsx`
- Modify: `apps/client/src/app/[locale]/sell/[id]/edit/page.tsx` (server-fetch, проброс)

**Interfaces:**
- Consumes: `RegionDistrictSelect`, объявление (`city_id`, `district_id`).
- Produces: префилл `regionId`/`districtId` из объявления; `update`-payload с `district_id`/`city_id`.

- [ ] **Step 1: Падающий тест префилла/payload**

Тест: форма инициализирует `regionId`/`districtId` из загруженного объявления; submit шлёт их в `update`.

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @avino/client test -- ListingEdit`
Expected: FAIL.

- [ ] **Step 3: Реализовать** по образцу C2: стейт + `RegionDistrictSelect` + валидация + payload; префилл `regionId = listing.city_id`, `districtId = listing.district_id`. Страница edit — server-fetch справочников.

- [ ] **Step 4: Тест + tsc**

Run: `pnpm --filter @avino/client test -- ListingEdit && pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS / без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/listing-edit apps/client/src/app/[locale]/sell/[id]/edit
git commit -m "feat(client): region+district selection in edit listing form"
```

---

## Task C4: i18n визарда + полный прогон + PR

**Files:**
- Modify: `apps/client/src/messages/{ru,uz,en}.json` (ключи `listingNew.fields.region/.district`)

- [ ] **Step 1: Ключи** `listingNew.fields.region` и `.district` (label/placeholder/error) в 3 языках.

- [ ] **Step 2: Сверка ключей**
```bash
for f in ru uz en; do echo "== $f =="; grep -c "fields\": {\|\"region\"\|\"district\"" apps/client/src/messages/$f.json; done
```
(Убедиться, что новые ключи присутствуют во всех трёх.)

- [ ] **Step 3: Полный прогон**

Run: `pnpm --filter @avino/client test && pnpm --filter @avino/client lint && pnpm --filter @avino/client exec tsc --noEmit`
Expected: зелёное (кроме 2 known-fail LoginModal).

- [ ] **Step 4: Commit + PR**

```bash
git add apps/client/src/messages
git commit -m "feat(client): i18n for listing region/district fields"
gh pr create --base main --head feat/regions-client-listing --title "feat(client): region+district in create/edit listing" --body "<описание; зависит от feat/regions-api>"
```

> **Live-verify:** создать объявление с Регион=Наманган, Район=X → в `/search?region_id=<namangan>` оно находится; редактирование сохраняет район.

---

## Self-Review (выполнено при написании)

**Spec coverage:**
- §1 модель/миграция → A1, A2 ✓
- §2 API (regions, districts?region_id, search region_id, openapi, ADR) → A3, A4, A5, A6 ✓
- §3 клиент-поиск (geo, page, FilterBar каскад, ActiveFilters/saved/map, i18n) → B1–B5 ✓
- §4 клиент-визард (RegionDistrictSelect, create, edit, i18n) → C1–C4 ✓
- §5 PR-разбивка/выкатка → 3 ветки/PR, `migrate deploy` в A2/выкатке ✓
- Критерии готовности → live-verify в A6/B5/C4 ✓

**Type consistency:** `RegionListItem`/`DistrictListItem` (snake_case в API) ↔ `Region`/`District` (camelCase, `regionId` в клиенте); `mapRegion`/`mapDistrict`/`getRegions` имена едины между B1 и потребителями; `region_id` (URL/API) ↔ `regionId` (FilterValues/компоненты) — соответствие выдержано.

**Placeholder scan:** конкретные пути, код и команды во всех шагах; «mirror existing pattern» относится к существующему коду (district_id), не к другим задачам.

**Известные точки уточнения для исполнителя:** точные пути `messages/*.json` и `sell/new|edit/page.tsx`, наличие `ListingNew.test`/`geo.test` — проверить `rtk grep`/`rtk find` перед задачей (указано в шагах).
