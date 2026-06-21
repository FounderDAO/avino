# Media-cleanup env isolation + safety modes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Сделать orphan-GC фото в R2 безопасным при общих бакетах между средами (локаль/staging/prod) — через per-env префикс ключа, плюс dry-run и circuit-breaker как предохранители.

**Architecture:** Корень-неймспейс `S3_KEY_PREFIX` префиксует ключи media каждой среды (`{prefix}/listings/{id}/media/...`); cleanup сметает ТОЛЬКО своё поддерево → перекрёстное удаление между средами физически невозможно даже на общем бакете. Чтение не меняется (`storage_key` хранит полный ключ). Доп. защита: `MEDIA_CLEANUP_DRY_RUN` (default ON — лог, без удаления) и `MEDIA_CLEANUP_MAX_DELETE_RATIO` (автостоп при аномально высокой доле «сирот» = не та/пустая база). Всё в `apps/api`.

**Tech Stack:** NestJS + Prisma + AWS SDK v3 + Jest.

## Global Constraints
- Только `apps/api`. Контроллер владеет git; субагенты git НЕ трогают.
- **Back-compat by default:** все новые env имеют дефолты, при которых поведение сегодняшнее (префикс пустой → плоский `listings/`; кроме `MEDIA_CLEANUP_DRY_RUN` default `true` — намеренно безопаснее: первое включение наблюдательное).
- Read-path НЕ меняется (`resolveMediaUrl`/`storage_key` verbatim).
- «Живой ключ» = `storageKey ?? extractKey(url)` (инвариант delete-пути) — не ломать.
- RTK для bash.

---

## Task 1: S3_KEY_PREFIX — per-env namespace для ключей media

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (s3.keyPrefix)
- Modify: `apps/api/src/uploads/uploads.service.ts` (rootPrefix())
- Modify: `apps/api/src/listing-media/listing-media.service.ts` (upload prefix)
- Modify: `apps/api/src/media-cleanup/media-cleanup.service.ts` (sweep root)
- Test: `apps/api/src/uploads/uploads.service.spec.ts`, `apps/api/src/media-cleanup/media-cleanup.service.spec.ts`

**Interfaces:**
- Produces: `UploadsService.rootPrefix(): string` — нормализованный `s3.keyPrefix` (без ведущих/конечных `/`), `''` если не задан.

- [ ] **Step 1: config — добавить `s3.keyPrefix`**

В `s3Config` (`configuration.ts`) добавить поле (нормализуем слэши):

```ts
  // Корень-неймспейс ключей media для ИЗОЛЯЦИИ сред на общем бакете (dev|staging|
  // prod). Пусто → плоский `listings/...` (back-compat, одна среда = один бакет).
  keyPrefix: (process.env.S3_KEY_PREFIX ?? '').replace(/^\/+|\/+$/g, ''),
```

- [ ] **Step 2: TDD `rootPrefix()` — падающий тест**

В `uploads.service.spec.ts` `makeService` уже принимает overrides. Добавить тест:

```ts
  it('rootPrefix возвращает нормализованный s3.keyPrefix (или пусто)', () => {
    expect(makeService({ 's3.keyPrefix': 'dev' }).rootPrefix()).toBe('dev');
    expect(makeService().rootPrefix()).toBe('');
  });
```

Run: `cd apps/api && pnpm jest src/uploads/uploads.service.spec.ts -t rootPrefix` → FAIL (нет метода).

- [ ] **Step 3: реализовать `rootPrefix()`**

В `UploadsService` (рядом с `extractKey`):

```ts
  /**
   * Корень-неймспейс ключей среды (`S3_KEY_PREFIX`). Используется upload'ом и
   * media-cleanup, чтобы каждая среда писала/сметала ТОЛЬКО своё поддерево
   * `{prefix}/listings/...` — изоляция при общем бакете. Пусто → плоский `listings/`.
   */
  rootPrefix(): string {
    return this.configService.get<string>('s3.keyPrefix') ?? '';
  }
```

Run: тест из Step 2 → PASS.

- [ ] **Step 4: upload пишет под префикс — TDD в listing-media**

В `listing-media.service.ts uploadFile` заменить хардкод `prefix`:

```ts
    const root = this.uploads.rootPrefix();
    const prefix = [root, 'listings', listingId, 'media']
      .filter(Boolean)
      .join('/');
    const { key, url } = await this.uploads.upload({
      buffer: file.buffer,
      contentType: file.mimetype,
      prefix,
      extension,
    });
```

Если в `listing-media.service.spec.ts` есть тест загрузки — мок `uploads.rootPrefix` должен возвращать `''` (back-compat: ключ остаётся `listings/...`). Если такого теста нет — добавить мок-метод `rootPrefix: jest.fn().mockReturnValue('')` в существующий uploads-мок, чтобы не падало. Прогнать: `pnpm jest src/listing-media`.

- [ ] **Step 5: cleanup сметает под префикс — обновить sweep root**

В `media-cleanup.service.ts run()` заменить `listKeys('listings/')`:

```ts
    const root = this.uploads.rootPrefix();
    const listingsRoot = root ? `${root}/listings/` : 'listings/';
    const objects = await this.uploads.listKeys(listingsRoot);
```

(фильтр `/media/` остаётся — `{root}/listings/{id}/media/{uuid}` его содержит.)

В `media-cleanup.service.spec.ts` существующий `uploads`-мок должен иметь `rootPrefix: jest.fn().mockReturnValue('')` (back-compat: `listKeys('listings/')` как раньше). Добавить мок-метод. Добавить тест: при `rootPrefix='dev'` → `listKeys` вызван с `'dev/listings/'`.

- [ ] **Step 6: прогон + сборка**

Run: `cd apps/api && pnpm jest src/uploads src/listing-media src/media-cleanup` → все зелёные. `pnpm build` → чисто.

- [ ] **Step 7: Commit (контроллер)** — субагент НЕ коммитит.

---

## Task 2: dry-run + circuit-breaker в MediaCleanupService

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (mediaCleanup.dryRun, maxDeleteRatio)
- Modify: `apps/api/src/media-cleanup/media-cleanup.service.ts` (run() restructure)
- Test: `apps/api/src/media-cleanup/media-cleanup.service.spec.ts`

**Interfaces:**
- Consumes: `UploadsService.rootPrefix` (Task 1).

- [ ] **Step 1: config — dryRun + maxDeleteRatio**

В `mediaCleanupConfig` добавить:

```ts
  // Наблюдательный режим: логировать, что удалили БЫ, но НЕ удалять. Default true
  // (безопаснее — первое включение наблюдательное; явный `false` включает удаление).
  dryRun: process.env.MEDIA_CLEANUP_DRY_RUN !== 'false',
  // Автостоп: если доля «сирот» среди осмотренной выборки выше — прерваться (не та/
  // пустая база, чужой бакет). Default 0.5.
  maxDeleteRatio: parseFloat(process.env.MEDIA_CLEANUP_MAX_DELETE_RATIO ?? '0.5'),
```

- [ ] **Step 2: TDD — падающие тесты поведения**

В `media-cleanup.service.spec.ts`: **сначала обновить `config()` helper**, чтобы существующие тесты, проверяющие реальное удаление, явно отдавали `mediaCleanup.dryRun = false` (иначе с новым дефолтом true они перестанут удалять). Добавить в config-мок ключи `'mediaCleanup.dryRun': false` и `'mediaCleanup.maxDeleteRatio': 0.5` по умолчанию для существующих кейсов. Затем добавить НОВЫЕ тесты:

```ts
  it('dry-run: логирует кандидатов, но НЕ удаляет', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/orphan.jpg', lastModified: old() },
    ]);
    const svc = makeWith({ dryRun: true });   // helper: config с dryRun=true
    const deleted = await svc.run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('circuit-breaker: при доле сирот выше maxDeleteRatio и достаточной выборке — abort, ничего не удаляет', async () => {
    // 30 старых media-объектов, ни одного живого в БД → 100% сирот > 0.5
    const many = Array.from({ length: 30 }, (_, i) => ({
      key: `listings/a/media/o${i}.jpg`, lastModified: old(),
    }));
    uploads.listKeys.mockResolvedValue(many);
    prisma.listingMedia.findMany.mockResolvedValue([]); // живых нет
    const svc = makeWith({ dryRun: false, maxDeleteRatio: 0.5 });
    const deleted = await svc.run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });
```

(`makeWith({...})` — мелкий helper, собирающий `config()` с нужными mediaCleanup-полями; или инлайнить config-объект.)

Run: `pnpm jest src/media-cleanup/media-cleanup.service.spec.ts` → новые FAIL.

- [ ] **Step 3: restructure `run()`**

Добавить константы вверху файла:

```ts
const DEFAULT_DRY_RUN = true;
const DEFAULT_MAX_DELETE_RATIO = 0.5;
/** Ниже этого размера выборки ratio-проверка не применяется (шум малых чисел). */
const MIN_SAMPLE_FOR_RATIO = 20;
```

В конструкторе прочитать (NaN-guard для ratio):

```ts
    const dry = configService.get<boolean>('mediaCleanup.dryRun');
    this.dryRun = typeof dry === 'boolean' ? dry : DEFAULT_DRY_RUN;
    const ratio = configService.get<number>('mediaCleanup.maxDeleteRatio');
    this.maxDeleteRatio = Number.isFinite(ratio) ? (ratio as number) : DEFAULT_MAX_DELETE_RATIO;
```

(добавить поля `private readonly dryRun: boolean; private readonly maxDeleteRatio: number;`)

Переписать `run()` (после построения `live`):

```ts
    const orphans = candidates.filter((o) => !live.has(o.key));

    // Circuit-breaker: аномально высокая доля «сирот» при достаточной выборке =
    // почти наверняка не та/пустая база или чужой бакет → прерываемся.
    if (
      candidates.length >= MIN_SAMPLE_FOR_RATIO &&
      orphans.length / candidates.length > this.maxDeleteRatio
    ) {
      this.logger.error(
        `ABORT media cleanup: ${orphans.length}/${candidates.length} objects under ` +
          `${listingsRoot} look orphaned (> ${this.maxDeleteRatio}). ` +
          `Wrong DB/bucket or missing S3_KEY_PREFIX? Deleting nothing.`,
      );
      return 0;
    }

    if (this.dryRun) {
      this.logger.warn(
        `[DRY-RUN] media cleanup would delete ${orphans.length} orphan object(s) under ` +
          `${listingsRoot}` +
          (orphans.length
            ? `; sample: ${orphans.slice(0, 5).map((o) => o.key).join(', ')}`
            : ''),
      );
      return 0;
    }

    let deleted = 0;
    for (const obj of orphans) {
      try {
        await this.uploads.delete(obj.key);
        deleted += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to delete orphan object ${obj.key}: ${String(error)}`,
        );
      }
    }
    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} orphan media object(s)`);
    }
    return deleted;
```

(заменяет прежний `for (const obj of candidates) { if (live.has) continue; ... }`.)

- [ ] **Step 4: прогон + сборка**

Run: `cd apps/api && pnpm jest src/media-cleanup/media-cleanup.service.spec.ts` → все зелёные (старые delete-тесты с dryRun=false, новые dry-run/breaker). `pnpm build` → чисто. Финально `pnpm jest` (весь api) → зелёно.

- [ ] **Step 5: Commit (контроллер).**

---

## Task 3: docs — ADR-0099 addendum + ENV §6.2 update

**Files:**
- Modify: `docs/adr/ADR-0099-media-cleanup-worker.md`
- Modify: `docs/ENV.md`

- [ ] **Step 1: ADR-0099 — секция про изоляцию сред**

Добавить в Decision/Consequences: проблема общего бакета между средами (cleanup видит чужие фото как сирот); решение — `S3_KEY_PREFIX` (per-env поддерево, sweep только своё) + dry-run (default ON) + circuit-breaker (ratio). Подчеркнуть: read-path не тронут, старые бес-префиксные объекты не сметаются.

- [ ] **Step 2: ENV §6.2 — новые переменные**

Добавить в таблицу §6.2: `S3_KEY_PREFIX` (в §9 S3 — логичнее там; добавить и кросс-ссылку), `MEDIA_CLEANUP_DRY_RUN` (default true), `MEDIA_CLEANUP_MAX_DELETE_RATIO` (default 0.5). Явно описать: при общих бакетах между средами задать разный `S3_KEY_PREFIX` на каждую среду; включать боевое удаление (`MEDIA_CLEANUP_DRY_RUN=false`) только после проверки dry-run лога.

- [ ] **Step 3: Commit (контроллер).**

---

## Self-Review
- Изоляция: upload пишет `{prefix}/listings/...`, cleanup листит `{prefix}/listings/` → Task 1 покрывает оба конца + back-compat default. ✓
- Read-path не тронут (storage_key verbatim). ✓
- dry-run default ON + circuit-breaker → Task 2. ✓
- Существующие delete-тесты обновлены на dryRun=false (иначе сломались бы). ✓ (явно в Task 2 Step 2)
- Docs → Task 3. ✓
- Type-consistency: `rootPrefix()` сигнатура одна (Task 1 def ↔ Task 1/2 consume). ✓
