# TASK-225 — GET /api/v1/search/clusters (кластеризация карты) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Агрегирующий эндпоинт `GET /api/v1/search/clusters?sw_lat&sw_lng&ne_lat&ne_lng&zoom&<фильтры /search>` → `{ data: [{ latitude, longitude, count, min_price, avg_price }], currency }`, чтобы мобильный клиент на широких зумах видел ВСЕ объявления кластерами (схема Zillow/Airbnb).

**Architecture:** Один raw-SQL `GROUP BY ST_SnapToGrid(location::geometry, cell, cell)` по ACTIVE-листингам внутри bbox (`boundsPrefilterSql` + `ST_Within` — как `/search/bounds`), с шагом сетки от `zoom` (~8 ячеек на тайл 256px). Координата кластера — центроид точек ячейки (avg lat/lng). Цены нормализуются к валюте `currency` (default USD) по курсу ЦБУ через существующий `priceInCurrencySql`; нет курса → деградация к сырой цене (паттерн ADR-0117). Без пагинации; guard `LIMIT 2000` по `count DESC`.

**Tech Stack:** NestJS, Prisma raw SQL, PostGIS (`ST_SnapToGrid`), class-validator DTO, Swagger DTO-декораторы, Jest unit + int-spec (живой PG).

**ВАЖНО — зависимость:** ветка создаётся ОТ `fix/api-search-bounds-full-extent` (TASK-226): переиспользуется его хелпер `boundsPrefilterSql` (на широких зумах bbox почти всегда ≥ 180°). PR открывать с base `main`, в описании пометить «depends on #<PR TASK-226>, merge after it».

## Global Constraints

- Работать ТОЛЬКО в `apps/api/` (+ `docs/` для ADR/API.md) — CLAUDE.md §0.
- Роут строго версионирован: `@Controller({ path: 'search', version: '1' })` уже даёт `/api/v1/search/clusters` (CLAUDE.md §14).
- Все SQL-параметры биндить через `Prisma.sql`.
- Swagger документирует только `*.dto.ts` (гоча #230-232) → query и response — классы в `dto/clusters.dto.ts` c `@ApiProperty`.
- Новый роут → regen OpenAPI: `pnpm --filter @avino/api openapi:export`, коммитить оба слоя (public+internal), иначе CI drift-check красный.
- int-spec гонять ПО ОДНОМУ файлу; для юнитов — `pnpm --filter @avino/api test -- <pattern>`.
- Субагенты НЕ трогают git — коммиты делает контроллер.
- Ветка: `feature/api-search-clusters`. Коммиты: `feat(search): add map clusters aggregation endpoint`, `docs(adr): add ADR-0126 search clusters endpoint`.

---

### Task 1: DTO — query и response

**Files:**
- Create: `apps/api/src/search/dto/clusters.dto.ts`

**Interfaces:**
- Consumes: `BoundsSearchQueryDto` из `./geo-search.dto` (даёт sw/ne-координаты + ВСЕ фильтры §9 через `SearchListingsQueryDto`).
- Produces: `ClustersSearchQueryDto` (query: bbox + `zoom` 0..22), `ClusterCellDto`, `ClustersResponseDto { data, currency }` — используются Task 2 (сервис) и Task 3 (контроллер).

- [ ] **Step 1: Написать DTO-файл целиком**

```ts
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { Currency } from '@prisma/client';
import { BoundsSearchQueryDto } from './geo-search.dto';

/**
 * Query для `GET /api/v1/search/clusters` (кластеризация карты, TASK-225,
 * ADR-0126). Наследует bbox (`sw_*`/`ne_*`) и все фильтры §9 от
 * {@link BoundsSearchQueryDto}; `zoom` задаёт шаг кластерной сетки
 * (~8 ячеек на тайл 256px web-mercator). Унаследованные `limit`/`cursor`/`sort`
 * игнорируются — ответ не пагинируется (агрегат, не список).
 */
export class ClustersSearchQueryDto extends BoundsSearchQueryDto {
  /** Зум карты (web-mercator), 0..22 — определяет размер ячейки сетки. */
  @ApiProperty({ minimum: 0, maximum: 22, description: 'Зум карты (web-mercator); задаёт шаг кластерной сетки' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(22)
  zoom!: number;
}

/** Одна ячейка кластерной сетки: центроид точек, счётчик и ценовые агрегаты. */
export class ClusterCellDto {
  @ApiProperty({ description: 'Широта центроида листингов ячейки (WGS84)' })
  latitude!: number;

  @ApiProperty({ description: 'Долгота центроида листингов ячейки (WGS84)' })
  longitude!: number;

  @ApiProperty({ description: 'Число объявлений в ячейке' })
  count!: number;

  @ApiProperty({ description: 'Минимальная цена в ячейке (в валюте ответа)' })
  min_price!: number;

  @ApiProperty({ description: 'Средняя цена в ячейке (в валюте ответа)' })
  avg_price!: number;
}

/**
 * Ответ кластеризации. `currency` — валюта, к которой FX-нормализованы
 * min_price/avg_price (курс ЦБУ); при отсутствии строки курса цены сырые
 * (без конвертации, деградация как в ADR-0117).
 */
export class ClustersResponseDto {
  @ApiProperty({ type: [ClusterCellDto] })
  data!: ClusterCellDto[];

  @ApiProperty({ enum: Currency, description: 'Валюта ценовых агрегатов' })
  currency!: Currency;
}
```

- [ ] **Step 2: Компиляция**

Run: `pnpm --filter @avino/api build`
Expected: OK (0 errors).

### Task 2: Сервис — `clusterCellSizeDeg` + `searchClusters` (TDD)

**Files:**
- Modify: `apps/api/src/search/search.service.ts` (экспортируемая чистая функция рядом с `niceCeil` вверху файла; метод `searchClusters` после `searchBounds`; константа `MAX_CLUSTER_CELLS` рядом с `DEFAULT_LIMIT`)
- Test: `apps/api/src/search/search.service.spec.ts` (юнит на чистую функцию)

**Interfaces:**
- Consumes: `buildWhereSql`, `fxRate`, `fxRateForFilter`, `priceInCurrencySql`, `envelopeSql`, `boundsPrefilterSql` (из TASK-226), DTO из Task 1.
- Produces: `export function clusterCellSizeDeg(zoom: number): number`; `async searchClusters(query: ClustersSearchQueryDto): Promise<ClustersResponseDto>` — вызывается контроллером (Task 3).

- [ ] **Step 1: Юнит-тест на размер ячейки (падающий)**

В `search.service.spec.ts` добавить describe (импортировав `clusterCellSizeDeg` из `./search.service`):

```ts
describe('clusterCellSizeDeg (TASK-225)', () => {
  it('is ~8 cells per 256px tile and halves with each zoom step', () => {
    expect(clusterCellSizeDeg(0)).toBeCloseTo(45); // 360 / 1 / 8
    expect(clusterCellSizeDeg(1)).toBeCloseTo(22.5);
    expect(clusterCellSizeDeg(5)).toBeCloseTo(360 / 32 / 8);
    for (let z = 0; z < 22; z += 1) {
      expect(clusterCellSizeDeg(z + 1)).toBeCloseTo(clusterCellSizeDeg(z) / 2);
    }
  });
});
```

- [ ] **Step 2: Убедиться, что юнит падает**

Run: `pnpm --filter @avino/api test -- search.service.spec`
Expected: FAIL (`clusterCellSizeDeg is not a function` / not exported).

- [ ] **Step 3: Реализация в search.service.ts**

Константа (рядом с `DEFAULT_LIMIT`/`MAX_LIMIT`):

```ts
/** Максимум ячеек в ответе кластеризации — защита от «bbox × высокий zoom». */
const MAX_CLUSTER_CELLS = 2000;
```

Чистая функция (после `niceCeil`):

```ts
/**
 * Размер ячейки кластерной сетки в градусах для зума web-mercator (TASK-225,
 * ADR-0126): ~8 ячеек на тайл 256px (~32px на экране — плотность supercluster).
 * Экспортирована как чистая функция для юнит-тестов.
 */
export function clusterCellSizeDeg(zoom: number): number {
  return 360 / Math.pow(2, zoom) / 8;
}
```

Метод (после `searchBounds`):

```ts
  /**
   * `GET /api/v1/search/clusters` — агрегаты кластерной сетки для широких зумов
   * карты (TASK-225, ADR-0126, схема Zillow/Airbnb): вместо страницы листингов —
   * ячейки `ST_SnapToGrid` с числом объявлений и ценовыми агрегатами. Клиент
   * рисует кластерные кружки; при < ~200 объектов в боксе переключается на
   * обычные пины `/search/bounds`.
   *
   * bbox-фильтр — как у {@link searchBounds}: GIST-префильтр
   * ({@link boundsPrefilterSql}, широкие bbox чанкуются — TASK-226) + точный
   * `ST_Within`. Применяются ВСЕ фильтры §9 ({@link buildWhereSql}).
   *
   * Координата кластера — центроид точек ячейки (avg по listing-координатам,
   * кружок стоит на реальных данных, не в углу пустой ячейки). `min_price`/
   * `avg_price` FX-нормализуются к `currency` (default USD) по курсу ЦБУ
   * ({@link priceInCurrencySql}); нет курса → сырые цены (деградация ADR-0117).
   * Ответ не пагинируется; guard `LIMIT {@link MAX_CLUSTER_CELLS}` по count DESC
   * (крупнейшие кластеры выживают при патологическом bbox×zoom).
   */
  async searchClusters(
    query: ClustersSearchQueryDto,
  ): Promise<ClustersResponseDto> {
    const cell = clusterCellSizeDeg(query.zoom);
    const envelope = this.envelopeSql(query);
    const currency = query.currency ?? Currency.USD;
    const rate = await this.fxRate();
    const priceExpr = rate
      ? this.priceInCurrencySql(currency, rate)
      : Prisma.sql`price`;
    // Курс для ценового ФИЛЬТРА — тот же rate, но только если фильтр задан
    // (семантика fxRateForFilter, без второго похода в БД).
    const filterRate =
      (query.price_min !== undefined || query.price_max !== undefined) &&
      query.currency !== undefined
        ? rate
        : null;
    const filterSql = Prisma.sql`${this.buildWhereSql(query, filterRate)} AND location IS NOT NULL AND ${this.boundsPrefilterSql(query)} AND ST_Within(location::geometry, ${envelope})`;

    const rows = await this.prisma.$queryRaw<
      {
        latitude: number;
        longitude: number;
        count: number;
        min_price: number;
        avg_price: number;
      }[]
    >(Prisma.sql`
      SELECT
        avg(ST_Y(location::geometry))::float8 AS latitude,
        avg(ST_X(location::geometry))::float8 AS longitude,
        count(*)::int AS count,
        min(${priceExpr})::float8 AS min_price,
        avg(${priceExpr})::float8 AS avg_price
      FROM listings
      WHERE ${filterSql}
      GROUP BY ST_SnapToGrid(location::geometry, ${cell}, ${cell})
      ORDER BY count DESC
      LIMIT ${MAX_CLUSTER_CELLS}
    `);

    return {
      data: rows.map((r) => ({
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        count: Number(r.count),
        min_price: Number(r.min_price),
        avg_price: Number(r.avg_price),
      })),
      currency,
    };
  }
```

Импорт DTO в search.service.ts:

```ts
import {
  ClusterCellDto,
  ClustersResponseDto,
  ClustersSearchQueryDto,
} from './dto/clusters.dto';
```

(если `ClusterCellDto` не используется в типах — не импортировать, линт не пропустит unused).

- [ ] **Step 4: Юнит зелёный, компиляция**

Run: `pnpm --filter @avino/api test -- search.service.spec` затем `pnpm --filter @avino/api build`
Expected: PASS / 0 errors.

### Task 3: Контроллер + OpenAPI

**Files:**
- Modify: `apps/api/src/search/search.controller.ts`
- Modify (generated): `openapi.public.json`, `openapi.internal.json` (пути уточнит `openapi:export`)

**Interfaces:**
- Consumes: `searchService.searchClusters`, DTO из Task 1.
- Produces: роут `GET /api/v1/search/clusters`.

- [ ] **Step 1: Добавить роут (после `searchBounds`, по образцу `priceDistribution` с @ApiOkResponse)**

```ts
  /**
   * `GET /api/v1/search/clusters` — агрегаты кластерной сетки для широких зумов
   * карты (TASK-225, ADR-0126): ячейки с count/min_price/avg_price вместо
   * страницы листингов. bbox + zoom + все фильтры §9. Auth: public.
   */
  @Get('clusters')
  @ApiOkResponse({ type: ClustersResponseDto })
  searchClusters(
    @Query() query: ClustersSearchQueryDto,
  ): Promise<ClustersResponseDto> {
    return this.searchService.searchClusters(query);
  }
```

Импорты: `ClustersResponseDto, ClustersSearchQueryDto` из `./dto/clusters.dto`.

- [ ] **Step 2: Regen OpenAPI и проверить diff**

Run: `pnpm --filter @avino/api openapi:export` затем `rtk git diff --stat`
Expected: в diff — оба json-слоя с новым путём `/api/v1/search/clusters`; никаких удалений чужих путей.

### Task 4: int-spec на живом PostGIS

**Files:**
- Modify: `apps/api/src/search/search.service.geo.int-spec.ts` (НОВЫЙ describe в конце файла, по образцу `SearchService.searchPolygon (integration...)`)

**Interfaces:**
- Consumes: `service.searchClusters`, паттерн фикстур файла (`createListing` с latitude/longitude; `location` заполняет sync-триггер БД).

- [ ] **Step 1: Добавить describe с изолированными фикстурами**

Собственная изоляция: `CITY_ID = '11111111-2222-4333-8444-777777777777'`, owner phone `'+998900000083'`, id-префикс `...-000000000083`. `createListing` — копия локального хелпера describe'а полигона, с параметрами `{ id, latitude, longitude, price }` (price — строка, currency UZS).

Фикстуры (beforeAll, после deleteMany по CITY_ID и создания owner):

```ts
    // Тройка в одной ячейке любого разумного зума (≤ 0.002° разброса) + дальний.
    await createListing({ id: ID.c1, latitude: '41.311000', longitude: '69.280000', price: '100000.00' });
    await createListing({ id: ID.c2, latitude: '41.311500', longitude: '69.280500', price: '200000.00' });
    await createListing({ id: ID.c3, latitude: '41.312000', longitude: '69.281000', price: '300000.00' });
    await createListing({ id: ID.far, latitude: '41.490000', longitude: '69.280000', price: '900000.00' });
    await createListing({ id: ID.noGeo, latitude: null, longitude: null, price: '100000.00' });
```

Кейсы:

```ts
  it('low zoom merges everything into one cell with count and price aggregates', async () => {
    const result = await service.searchClusters({
      sw_lat: 41.0, sw_lng: 69.0, ne_lat: 41.6, ne_lng: 69.5,
      zoom: 5, city_id: CITY_ID,
    });
    // cell(zoom 5) = 360/32/8 = 1.40625° — все 4 гео-листинга в одной ячейке.
    expect(result.data).toHaveLength(1);
    expect(result.data[0].count).toBe(4);
    expect(result.data[0].min_price).toBeLessThanOrEqual(result.data[0].avg_price);
    // Центроид — внутри разброса фикстур.
    expect(result.data[0].latitude).toBeGreaterThan(41.3);
    expect(result.data[0].latitude).toBeLessThan(41.5);
  });

  it('high zoom splits near-triple and far listing into separate cells', async () => {
    const result = await service.searchClusters({
      sw_lat: 41.0, sw_lng: 69.0, ne_lat: 41.6, ne_lng: 69.5,
      zoom: 12, city_id: CITY_ID,
    });
    // cell(zoom 12) ≈ 0.011° — тройка (разброс ≤0.002°) может лечь в 1-2 смежные
    // ячейки в зависимости от выравнивания сетки; far — всегда отдельно.
    const total = result.data.reduce((s, c) => s + c.count, 0);
    expect(total).toBe(4);
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    const farCell = result.data.find((c) => Math.abs(c.latitude - 41.49) < 0.01);
    expect(farCell?.count).toBe(1);
  });

  it('applies §9 filters (price_max drops the expensive far listing)', async () => {
    const result = await service.searchClusters({
      sw_lat: 41.0, sw_lng: 69.0, ne_lat: 41.6, ne_lng: 69.5,
      zoom: 5, city_id: CITY_ID, price_max: '500000',
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].count).toBe(3); // far (900000) отфильтрован
  });

  it('full-extent bbox works (chunked prefilter from TASK-226)', async () => {
    const result = await service.searchClusters({
      sw_lat: -85, sw_lng: -180, ne_lat: 85, ne_lng: 180,
      zoom: 2, city_id: CITY_ID,
    });
    expect(result.data.reduce((s, c) => s + c.count, 0)).toBe(4);
  });
```

Замечание: НЕ ассертить точные значения min_price/avg_price — в стендовой БД может существовать строка курса ЦБУ (FX-конвертация в USD изменит числа); ассерты только на count/геометрию/инварианты.

- [ ] **Step 2: Прогнать int-spec**

Run: `pnpm --filter @avino/api test:int -- search.service.geo.int-spec`
Expected: PASS все кейсы файла (старые + новые). Если сплит на zoom 12 даёт иное число ячеек — проверить руками ceil/выравнивание и поправить ассерт `data.length` (инвариант «far отдельно, сумма 4» обязателен).

### Task 5: ADR + API.md

**Files:**
- Create: `docs/adr/ADR-0126-search-clusters-endpoint.md`
- Modify: `docs/API.md` (краткая подсекция в §10 «Гео-поиск», рядом с /search/bounds)

- [ ] **Step 1: ADR-0126**

```markdown
# ADR-0126 — Эндпоинт кластеризации карты /api/v1/search/clusters

## Status

Accepted

## Date

2026-07-04

## Context

На широких зумах карта показывает только первые N объявлений из /search/bounds
(keyset-пагинация) — при 10 000+ объявлений «вся страна» выглядит пустой.
Заявка мобильного клиента (BACKEND-REQUESTS.md, 04.07.2026, п.1): стандартная
схема Zillow/Airbnb — сервер отдаёт агрегаты сетки, клиент рисует кластерные
кружки и при < ~200 объектов в боксе переключается на пины /search/bounds.

## Decision

GET /api/v1/search/clusters?sw_lat&sw_lng&ne_lat&ne_lng&zoom&<фильтры /search>
→ { data: [{ latitude, longitude, count, min_price, avg_price }], currency }.

- Сетка: GROUP BY ST_SnapToGrid(location::geometry, cell, cell),
  cell = 360 / 2^zoom / 8 (~8 ячеек на тайл 256px, плотность supercluster).
- Координата кластера — центроид точек ячейки (avg), не угол сетки.
- bbox-фильтр как у /search/bounds: чанкованный geography-префильтр
  (boundsPrefilterSql, TASK-226) + точный ST_Within; применяются все фильтры §9
  (buildWhereSql).
- Цены: min/avg FX-нормализуются к currency (default USD) по курсу ЦБУ
  (priceInCurrencySql); нет курса → сырые цены (деградация как в ADR-0117).
- Без пагинации; LIMIT 2000 ячеек по count DESC (guard патологического bbox×zoom).

## Consequences

Positive:
- Вся страна видна одним запросом; O(ячеек), не O(листингов).
- Фильтры и промо-семантика не дублируются — переиспользован buildWhereSql.

Negative / trade-offs:
- Сетка фиксированного шага (не supercluster-иерархия): визуальные скачки
  кластеров при смене зума приемлемы для MVP.
- Смешанные валюты без строки курса дают «сырые» агрегаты (документировано).

## Related files

- apps/api/src/search/search.service.ts
- apps/api/src/search/search.controller.ts
- apps/api/src/search/dto/clusters.dto.ts

## Related task

- TASK-225
```

- [ ] **Step 2: API.md — подсекция после /search/bounds (формат соседних секций §10)**

Кратко: сигнатура, параметры (bbox, zoom 0..22, фильтры §9, currency), форма ответа, замечание про валюту/деградацию и LIMIT 2000.

- [ ] **Step 3: Финальная проверка**

Run: `pnpm --filter @avino/api lint && pnpm --filter @avino/api test -- search.service && pnpm --filter @avino/api build`
Expected: всё зелёное. Контроллер делает git: 2 коммита (код+тесты+openapi; ADR+API.md), push, PR base `main` с пометкой зависимости от PR TASK-226.

## Self-Review

- Spec coverage: контракт заявки (bbox+zoom+фильтры → data[]) ✓; PostGIS ST_SnapToGrid ✓; переключение клиента на пины — на стороне клиента, серверу достаточно count ✓; FX-валюта агрегатов зафиксирована полем currency ✓.
- Типы: `ClustersSearchQueryDto` → `searchClusters(query)` → `ClustersResponseDto` согласованы между Task 1/2/3. `boundsPrefilterSql` — сигнатура из плана TASK-226 (объект с sw/ne полями — ClustersSearchQueryDto подходит структурно) ✓.
- Никаких unversioned routes; никаких изменений вне apps/api + docs ✓.
