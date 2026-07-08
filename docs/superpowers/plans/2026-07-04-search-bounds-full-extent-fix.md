# TASK-226 — Fix: /search/bounds на боксе «весь мир» возвращает 0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/v1/search/bounds` с bbox полного экстента (`sw=-85,-180 / ne=85,180`) возвращает те же листинги, что и заведомо покрывающий меньший бокс (сейчас — `total: 0`).

**Architecture:** Баг в GIST-префильтре `location && envelope::geography` (apps/api/src/search/search.service.ts:581). При касте planar-envelope к `geography` рёбра интерпретируются как дуги больших кругов «коротким путём»; при ширине bbox ≥ 180° по долготе направление обхода инвертируется/вырождается (при 360° горизонтальные рёбра — нулевой длины: (-180, lat) и (180, lat) — одна точка сферы), и `&&` отбрасывает всё. Точный фильтр `ST_Within(location::geometry, envelope)` — planar и корректен всегда; чиним ТОЛЬКО префильтр: при span ≥ 180° режем bbox на куски ≤ 90° по долготе и OR-им `&&`-условия (GIST bitmap-OR, индекс сохраняется).

**Tech Stack:** NestJS, Prisma raw SQL, PostGIS (geography/geometry), Jest int-spec против живого PostgreSQL (docker `avino-postgres`, порт 5432).

## Global Constraints

- Работать ТОЛЬКО в `apps/api/` (CLAUDE.md §0).
- Все SQL-параметры биндить через `Prisma.sql` (никакой конкатенации).
- int-spec гонять ПО ОДНОМУ файлу: `pnpm --filter @avino/api test:int -- search.service.geo.int-spec` (живой PG обязателен; cross-file контаминация — известная гоча).
- Субагенты НЕ трогают git — коммиты делает контроллер.
- Ветка: `fix/api-search-bounds-full-extent`. Commit: `fix(search): handle wide/full-extent bbox in /search/bounds`.

---

### Task 1: Красный int-spec тест, воспроизводящий баг

**Files:**
- Modify: `apps/api/src/search/search.service.geo.int-spec.ts` (в существующий первый describe `SearchService geo (integration, live PostGIS)`, после теста `'bounds keeps a stable keyset across pages...'`, ~строка 232)

**Interfaces:**
- Consumes: существующие фикстуры describe — `ID.near/mid/far/outside` (широты 41.311/41.319/41.355/41.490, долгота 69.28), `ID.noGeo` (NULL location), `CITY_ID`, `service.searchBounds`.
- Produces: два `it`-кейса, которые Task 2 обязан сделать зелёными.

- [ ] **Step 1: Добавить два падающих теста**

```ts
  it('bounds full-extent bbox (whole world) returns all geo listings (mobile bug 2026-07-04)', async () => {
    // Регресс: geography-каст envelope шириной 360° вырождается (рёбра (-180,lat)→(180,lat)
    // — одна точка сферы) → GIST-префильтр && отбрасывал всё, total: 0.
    const result = await service.searchBounds({
      sw_lat: -85,
      sw_lng: -180,
      ne_lat: 85,
      ne_lng: 180,
      city_id: CITY_ID,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([ID.near, ID.mid, ID.far, ID.outside]));
    expect(result.meta.total).toBe(4);
    expect(ids.has(ID.noGeo)).toBe(false);
  });

  it('bounds bbox wider than 180° of longitude still matches listings inside', async () => {
    // span 200° ≥ 180°: «короткий путь» дуг инвертирует полигон в geography —
    // без чанкинга префильтр либо пуст, либо покрывает комплемент.
    const result = await service.searchBounds({
      sw_lat: -85,
      sw_lng: -100,
      ne_lat: 85,
      ne_lng: 100, // Ташкент (69.28) внутри
      city_id: CITY_ID,
      limit: 100,
    });

    const ids = new Set(result.data.map((d) => d.id));
    expect(ids).toEqual(new Set([ID.near, ID.mid, ID.far, ID.outside]));
    expect(result.meta.total).toBe(4);
  });
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают именно с total: 0**

Run: `pnpm --filter @avino/api test:int -- search.service.geo.int-spec`
Expected: FAIL — оба новых кейса (received Set {} / total 0); ВСЕ остальные кейсы файла PASS. Если новые кейсы прошли — гипотеза о причине неверна, СТОП, вернуть управление контроллеру с выводом теста.

### Task 2: Чанкованный geography-префильтр

**Files:**
- Modify: `apps/api/src/search/search.service.ts` (метод `searchBounds` ~строка 578-581, приватный хелпер рядом с `envelopeSql` ~строка 800)

**Interfaces:**
- Consumes: `envelopeSql(query)`, `BoundsSearchQueryDto`.
- Produces: `private boundsPrefilterSql(query: BoundsSearchQueryDto): Prisma.Sql` — SQL-фрагмент GIST-префильтра (без `location IS NOT NULL`). Task-225 (кластеры, отдельный план) будет вызывать этот же хелпер — имя и сигнатуру не менять.

- [ ] **Step 1: Добавить хелпер `boundsPrefilterSql` (после `envelopeSql`)**

```ts
  /**
   * GIST-префильтр bbox по geography-колонке `location`. При касте planar-envelope
   * к geography рёбра становятся дугами больших кругов «коротким путём»: при ширине
   * bbox ≥ 180° по долготе полигон вырождается/инвертируется (при 360° горизонтальные
   * рёбра — нулевой длины), и `&&` отбрасывает всё (баг мобилки 2026-07-04, TASK-226).
   * Поэтому широкий bbox режется на куски ≤ 90° по долготе (запас от граничных 180°),
   * префильтр — OR по кускам (GIST bitmap-OR, индекс работает). Для кусков < 180°
   * geography-полигон — надмножество planar-прямоугольника (дуги выгибаются к полюсам),
   * т.е. префильтр остаётся корректным супersetом; точность гарантирует ST_Within.
   */
  private boundsPrefilterSql(query: {
    sw_lat: number;
    sw_lng: number;
    ne_lat: number;
    ne_lng: number;
  }): Prisma.Sql {
    const span = query.ne_lng - query.sw_lng;
    if (span < 180) {
      const envelope = Prisma.sql`ST_MakeEnvelope(${query.sw_lng}, ${query.sw_lat}, ${query.ne_lng}, ${query.ne_lat}, 4326)`;
      return Prisma.sql`location && ${envelope}::geography`;
    }
    const chunks = Math.ceil(span / 90);
    const step = span / chunks;
    const parts: Prisma.Sql[] = [];
    for (let i = 0; i < chunks; i += 1) {
      const west = query.sw_lng + i * step;
      const east = i === chunks - 1 ? query.ne_lng : query.sw_lng + (i + 1) * step;
      parts.push(
        Prisma.sql`location && ST_MakeEnvelope(${west}, ${query.sw_lat}, ${east}, ${query.ne_lat}, 4326)::geography`,
      );
    }
    return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
  }
```

- [ ] **Step 2: Переключить `searchBounds` на хелпер**

В `searchBounds` заменить строку

```ts
    const filterSql = Prisma.sql`${this.buildWhereSql(query, fxRate)} AND location IS NOT NULL AND location && ${envelope}::geography AND ST_Within(location::geometry, ${envelope})`;
```

на

```ts
    const filterSql = Prisma.sql`${this.buildWhereSql(query, fxRate)} AND location IS NOT NULL AND ${this.boundsPrefilterSql(query)} AND ST_Within(location::geometry, ${envelope})`;
```

(`const envelope = this.envelopeSql(query);` остаётся — используется в `ST_Within`; точный фильтр planar и от ширины не страдает.)

- [ ] **Step 3: Обновить doc-комментарий `envelopeSql`**

К JSDoc `envelopeSql` (строки ~794-799) добавить последней строкой:

```
   * Для GIST-префильтра по geography использовать {@link boundsPrefilterSql}
   * (каст к geography при ширине ≥ 180° по долготе вырождается, TASK-226).
```

- [ ] **Step 4: Прогнать int-spec до зелёного**

Run: `pnpm --filter @avino/api test:int -- search.service.geo.int-spec`
Expected: PASS — все кейсы файла, включая 2 новых.

- [ ] **Step 5: Юнит-тесты и линт без регресса**

Run: `pnpm --filter @avino/api test -- search.service` затем `pnpm --filter @avino/api lint`
Expected: PASS / 0 errors.

- [ ] **Step 6: Вернуть управление контроллеру (git делает контроллер)**

Контроллер: `git add apps/api/src/search/search.service.ts apps/api/src/search/search.service.geo.int-spec.ts` → commit `fix(search): handle wide/full-extent bbox in /search/bounds` → push → PR.

## Self-Review

- Spec coverage: полный экстент (кейс 1), широкий-но-не-полный bbox (кейс 2), «обычные боксы без регресса» — существующие кейсы файла. ✓
- ST_Within оставлен с ЕДИНЫМ полным envelope — planar-geometry не имеет wrap-проблемы, дробить его не нужно. ✓
- `span < 180` — строго: ровно 180° уже опасно (дуга между точками с Δlng=180° на одной широте проходит через полюс). Чанк ≤ 90° даёт запас. ✓
- Антимеридиан (`sw_lng > ne_lng`) — как и раньше НЕ поддержан (документировано в BoundsSearchQueryDto, рынок УЗ). span < 0 → ветка `span < 180` → прежнее поведение (пустая выдача). ✓
