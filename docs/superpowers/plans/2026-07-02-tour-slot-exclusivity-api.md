# Tour Slot Exclusivity (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Слот тура (листинг + дата + окно) занимается первой заявкой: пока она PENDING/CONFIRMED, другие пользователи получают `409 TOUR_SLOT_TAKEN`; DECLINE/CANCEL освобождают слот. Плюс endpoint занятых слотов для UI.

**Architecture:** Гарантия от гонок — частичный уникальный индекс Postgres на `tour_requests(listing_id, requested_date, window_start, window_end) WHERE status IN ('PENDING','CONFIRMED')`. Сервис делает дружелюбную предварительную проверку (различает «своя заявка» → `TOUR_REQUEST_DUPLICATE` и «чужая» → `TOUR_SLOT_TAKEN`), а гонку ловит по Prisma `P2002`. Новый Bearer-роут `GET /api/v1/tour-requests/taken?listing_id=` отдаёт анонимные занятые слоты на 30 дней.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest.

**Spec:** `docs/superpowers/specs/2026-07-02-tour-slot-exclusivity-design.md`

## Global Constraints

- Правки ТОЛЬКО внутри `apps/api/` (одна app-папка = один PR, CLAUDE.md).
- API только под `/api/v1/...` (контроллер уже versioned).
- Комментарии в коде — по-русски, в стиле существующих файлов.
- В `main` не коммитить: работа в ветке `feat/tour-slot-exclusivity-api`, потом PR.
- Все команды ниже выполняются из `apps/api/`, если не сказано иное.
- Prisma НЕ поддерживает partial index в `schema.prisma` — индекс живёт только в SQL-миграции; в схему добавляется только комментарий.

**Первый шаг перед Task 1:**

```bash
git checkout -b feat/tour-slot-exclusivity-api
```

---

### Task 1: Миграция — guard-очистка дублей + частичный уникальный индекс

**Files:**
- Create: `apps/api/prisma/migrations/20260702050000_tour_slot_unique_active/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (модель `TourRequest`, ~строка 981 — только комментарий)

**Interfaces:**
- Consumes: таблица `tour_requests` (колонки `listing_id`, `requested_date`, `window_start`, `window_end`, `status`, `created_at`, `updated_at`).
- Produces: unique-индекс `tour_requests_active_slot_key`, на который Task 2 полагается при ловле `P2002`.

- [ ] **Step 1: Создать SQL-миграцию**

Файл `apps/api/prisma/migrations/20260702050000_tour_slot_unique_active/migration.sql`:

```sql
-- Эксклюзивность слота тура (spec 2026-07-02-tour-slot-exclusivity-design):
-- один активный (PENDING/CONFIRMED) запрос на (listing, date, window).
--
-- Guard перед созданием unique-индекса: среди существующих активных заявок
-- на один слот оставить одну — приоритет CONFIRMED (владелец уже выбрал),
-- затем самая ранняя created_at; остальные -> DECLINED.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY listing_id, requested_date, window_start, window_end
           ORDER BY (status = 'CONFIRMED') DESC, created_at ASC, id ASC
         ) AS rn
  FROM tour_requests
  WHERE status IN ('PENDING', 'CONFIRMED')
)
UPDATE tour_requests t
SET status = 'DECLINED', updated_at = NOW()
FROM ranked r
WHERE t.id = r.id AND r.rn > 1;

-- Частичный уникальный индекс: DECLINED/CANCELLED выпадают из условия,
-- то есть DECLINE/CANCEL освобождают слот автоматически.
CREATE UNIQUE INDEX tour_requests_active_slot_key
  ON tour_requests (listing_id, requested_date, window_start, window_end)
  WHERE status IN ('PENDING', 'CONFIRMED');
```

- [ ] **Step 2: Задокументировать индекс в schema.prisma**

В `apps/api/prisma/schema.prisma`, в модели `TourRequest`, над строкой `@@index([listingId])` добавить комментарий:

```prisma
  // Частичный unique-индекс tour_requests_active_slot_key
  // (listing_id, requested_date, window_start, window_end) WHERE status IN
  // ('PENDING','CONFIRMED') — эксклюзивность слота; Prisma не описывает partial
  // index, см. миграцию 20260702050000_tour_slot_unique_active.
```

- [ ] **Step 3: Применить миграцию**

Run: `npx prisma migrate dev`
Expected: `20260702050000_tour_slot_unique_active` в списке applied, без ошибок.

- [ ] **Step 4: Проверить, что индекс работает**

Run (подставив свой DATABASE_URL, если psql доступен; иначе шаг пропустить — unit-тесты Task 2 проверяют поведение через P2002):

```bash
npx prisma db execute --stdin <<'SQL'
SELECT indexname FROM pg_indexes
WHERE tablename = 'tour_requests' AND indexname = 'tour_requests_active_slot_key';
SQL
```

Expected: команда завершается без ошибки (для SELECT через `db execute` вывода нет — важно отсутствие ошибки применения миграции на Step 3).

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/20260702050000_tour_slot_unique_active/migration.sql prisma/schema.prisma
git commit -m "feat(tour-requests): partial unique index for active tour slot"
```

---

### Task 2: `TOUR_SLOT_TAKEN` + проверка занятости слота в `create()` (TDD)

**Files:**
- Modify: `apps/api/src/common/dto/error-response.dto.ts:38` (добавить enum-значение)
- Modify: `apps/api/src/tour-requests/tour-requests.service.ts:77-105` (метод `create`)
- Test: `apps/api/src/tour-requests/tour-requests.service.spec.ts`

**Interfaces:**
- Consumes: индекс `tour_requests_active_slot_key` из Task 1 (через `P2002`).
- Produces: `ApiErrorCode.TOUR_SLOT_TAKEN = 'TOUR_SLOT_TAKEN'`; `create()` кидает `ConflictException` c этим кодом. Task 3 и клиентский план полагаются на строку `'TOUR_SLOT_TAKEN'`.

- [ ] **Step 1: Написать падающие тесты**

В `tour-requests.service.spec.ts`:

1. Вверху файла к импортам добавить:

```ts
import { Prisma } from '@prisma/client';
```

2. Существующий тест `'409 при дубле PENDING'` заменить на (мок получает `requesterId` текущего пользователя — «своя» заявка):

```ts
  it('409 TOUR_REQUEST_DUPLICATE при своей активной заявке на слот', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue({ requesterId: 'U2' });
    const err = await service.create('U2', validDto() as any).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TOUR_REQUEST_DUPLICATE' });
  });
```

3. Добавить новые тесты (после него):

```ts
  it('409 TOUR_SLOT_TAKEN если слот занят чужой активной заявкой', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue({ requesterId: 'SOMEONE_ELSE' });
    const err = await service.create('U2', validDto() as any).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TOUR_SLOT_TAKEN' });
  });

  it('проверка занятости учитывает PENDING и CONFIRMED (и только их)', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue(null);
    prisma.tourRequest.create.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'PENDING',
      requestedDate: new Date(`${validDto().requested_date}T00:00:00.000Z`),
      windowStart: '07:00', windowEnd: '10:00', requesterName: 'Tap Links',
      requesterPhone: '+998901112233', message: 'hi', createdAt: new Date(),
    });
    await service.create('U2', validDto() as any);
    expect(prisma.tourRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'CONFIRMED'] },
        }),
        select: { requesterId: true },
      }),
    );
  });

  it('409 TOUR_SLOT_TAKEN при гонке (P2002 на unique-индексе слота)', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const err = await service.create('U2', validDto() as any).catch((e) => e);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ code: 'TOUR_SLOT_TAKEN' });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx jest src/tour-requests/tour-requests.service.spec.ts`
Expected: FAIL — новые тесты падают (нет кода `TOUR_SLOT_TAKEN`, `findFirst` вызывается со старым `where` со `status: 'PENDING'` и `requesterId`).

- [ ] **Step 3: Реализация**

1. `apps/api/src/common/dto/error-response.dto.ts` — после строки `TOUR_REQUEST_DUPLICATE = 'TOUR_REQUEST_DUPLICATE',` добавить:

```ts
  TOUR_SLOT_TAKEN = 'TOUR_SLOT_TAKEN',
```

2. `apps/api/src/tour-requests/tour-requests.service.ts`, метод `create`. Заменить блок дубль-проверки (строки 77–87, от `const dup = await this.prisma.tourRequest.findFirst({` до `}` после throw `TOUR_REQUEST_DUPLICATE`) на:

```ts
    // Слот эксклюзивен: любая активная (PENDING/CONFIRMED) заявка блокирует его
    // (spec 2026-07-02). Своя заявка — прежний TOUR_REQUEST_DUPLICATE, чужая —
    // TOUR_SLOT_TAKEN. Гонка двух create ловится ниже по P2002 на
    // tour_requests_active_slot_key.
    const active = await this.prisma.tourRequest.findFirst({
      where: {
        listingId: listing.id, requestedDate,
        windowStart: dto.window_start, windowEnd: dto.window_end,
        status: { in: [TourRequestStatus.PENDING, TourRequestStatus.CONFIRMED] },
      },
      select: { requesterId: true },
    });
    if (active) {
      if (active.requesterId === requesterId) {
        throw new ConflictException({ code: ApiErrorCode.TOUR_REQUEST_DUPLICATE, message: 'A pending tour request for this slot already exists' });
      }
      throw new ConflictException({ code: ApiErrorCode.TOUR_SLOT_TAKEN, message: 'This tour slot is already taken' });
    }
```

3. Там же обернуть транзакцию создания в try/catch. Заменить:

```ts
    const created = await this.prisma.$transaction(async (tx) => {
```

и закрывающую часть

```ts
      return tr;
    });
    return this.toResponse(created);
```

на:

```ts
    let created: TourRequestRow;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const tr = await tx.tourRequest.create({
          data: {
            listingId: listing.id, requesterId, requestedDate,
            windowStart: dto.window_start, windowEnd: dto.window_end,
            requesterName: dto.requester_name, requesterPhone: dto.requester_phone,
            message: dto.message ?? null,
          },
          select: TOUR_REQUEST_SELECT,
        });
        await this.notifications.queueTourRequest(tx, listing.ownerId, {
          tourRequestId: tr.id, listingId: listing.id,
          requestedDate: dto.requested_date, windowStart: dto.window_start, windowEnd: dto.window_end,
        });
        return tr;
      });
    } catch (error) {
      // Гонка: двое прошли проверку одновременно — unique-индекс
      // tour_requests_active_slot_key отдаёт P2002 (в транзакции единственный
      // insert с unique-ограничением — tourRequest.create).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: ApiErrorCode.TOUR_SLOT_TAKEN, message: 'This tour slot is already taken' });
      }
      throw error;
    }
    return this.toResponse(created);
```

(`Prisma` уже импортирован в этом файле; тело транзакции не меняется — только обёртка.)

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx jest src/tour-requests/tour-requests.service.spec.ts`
Expected: PASS — все тесты, включая существующие.

- [ ] **Step 5: Commit**

```bash
git add src/common/dto/error-response.dto.ts src/tour-requests/tour-requests.service.ts src/tour-requests/tour-requests.service.spec.ts
git commit -m "feat(tour-requests): exclusive slot — 409 TOUR_SLOT_TAKEN for occupied slots"
```

---

### Task 3: `GET /api/v1/tour-requests/taken?listing_id=` — занятые слоты (TDD)

**Files:**
- Modify: `apps/api/src/tour-requests/tour-requests.service.ts` (новый метод + интерфейсы)
- Modify: `apps/api/src/tour-requests/tour-requests.controller.ts` (новый роут)
- Test: `apps/api/src/tour-requests/tour-requests.service.spec.ts`

**Interfaces:**
- Consumes: `TOUR_HORIZON_DAYS = 30` (константа уже в service), `TourRequestStatus` из `@prisma/client`.
- Produces:
  - `interface TakenSlot { requested_date: string; window_start: string; window_end: string }`
  - `interface TakenSlotsResponse { data: TakenSlot[] }`
  - `TourRequestsService.listTakenSlots(listingId: string): Promise<TakenSlotsResponse>`
  - Роут `GET /api/v1/tour-requests/taken?listing_id=<uuid>` (Bearer, как весь контроллер). Клиентский план полагается на этот контракт.

- [ ] **Step 1: Написать падающие тесты**

Добавить в `tour-requests.service.spec.ts`:

```ts
  it('taken: отдаёт активные слоты горизонта без личных данных', async () => {
    prisma.listing.findFirst.mockResolvedValue({ id: 'L1' });
    prisma.tourRequest.findMany.mockResolvedValue([
      { requestedDate: new Date('2026-07-03T00:00:00.000Z'), windowStart: '11:00', windowEnd: '13:00' },
    ]);
    const res = await service.listTakenSlots('L1');
    expect(res).toEqual({
      data: [{ requested_date: '2026-07-03', window_start: '11:00', window_end: '13:00' }],
    });
    expect(prisma.tourRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          listingId: 'L1',
          status: { in: ['PENDING', 'CONFIRMED'] },
        }),
        select: { requestedDate: true, windowStart: true, windowEnd: true },
      }),
    );
  });

  it('taken: 404 если листинг не найден или DELETED', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(service.listTakenSlots('L404')).rejects.toMatchObject({ status: 404 });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx jest src/tour-requests/tour-requests.service.spec.ts`
Expected: FAIL — `service.listTakenSlots is not a function`.

- [ ] **Step 3: Реализация — сервис**

В `tour-requests.service.ts` после `export interface TourRequestListQuery { ... }` добавить:

```ts
/** Занятый слот тура для UI (без личных данных заявителя, spec 2026-07-02). */
export interface TakenSlot {
  requested_date: string;
  window_start: string;
  window_end: string;
}

export interface TakenSlotsResponse {
  data: TakenSlot[];
}
```

В классе `TourRequestsService` после метода `create` добавить:

```ts
  /**
   * `GET /tour-requests/taken` — активные (PENDING/CONFIRMED) слоты листинга на
   * ближайшие TOUR_HORIZON_DAYS дней. PENDING и CONFIRMED снаружи неразличимы
   * (оба «занято»); личные данные заявителей не отдаются.
   */
  async listTakenSlots(listingId: string): Promise<TakenSlotsResponse> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Listing not found' });
    }
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + TOUR_HORIZON_DAYS);
    const rows = await this.prisma.tourRequest.findMany({
      where: {
        listingId,
        status: { in: [TourRequestStatus.PENDING, TourRequestStatus.CONFIRMED] },
        requestedDate: { gte: today, lte: horizon },
      },
      orderBy: [{ requestedDate: 'asc' }, { windowStart: 'asc' }],
      select: { requestedDate: true, windowStart: true, windowEnd: true },
    });
    return {
      data: rows.map((r) => ({
        requested_date: r.requestedDate.toISOString().slice(0, 10),
        window_start: r.windowStart,
        window_end: r.windowEnd,
      })),
    };
  }
```

- [ ] **Step 4: Реализация — контроллер**

В `tour-requests.controller.ts`:

1. Импортировать типы из сервиса (расширить существующий импорт):

```ts
import {
  TakenSlotsResponse, TourRequestListResponse, TourRequestResponse, TourRequestsService,
} from './tour-requests.service';
```

2. После метода `create` добавить роут (до `@Get('outgoing')`):

```ts
  /** Занятые слоты листинга для формы заявки (анонимно: только дата и окно). */
  @Get('taken')
  taken(
    @Query('listing_id', ParseUUIDPipe) listingId: string,
  ): Promise<TakenSlotsResponse> {
    return this.service.listTakenSlots(listingId);
  }
```

(`Get`, `Query`, `ParseUUIDPipe` уже импортированы; невалидный/отсутствующий `listing_id` → 400 от pipe.)

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `npx jest src/tour-requests/tour-requests.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tour-requests/tour-requests.service.ts src/tour-requests/tour-requests.controller.ts src/tour-requests/tour-requests.service.spec.ts
git commit -m "feat(tour-requests): GET /tour-requests/taken — occupied slots for listing"
```

---

### Task 4: OpenAPI regen + полная проверка + PR

**Files:**
- Modify: `apps/api/openapi.public.json` (регенерация)

**Interfaces:**
- Consumes: роут и код ошибки из Task 2–3.
- Produces: обновлённый публичный OpenAPI для мобильной команды (иначе CI drift-check красный).

- [ ] **Step 1: Полный прогон тестов и линта**

Run: `npx jest && npx eslint "src/**/*.ts"`
Expected: все тесты PASS, линт без ошибок.

- [ ] **Step 2: Регенерировать OpenAPI**

Run: `pnpm openapi:export`
Expected: сборка проходит, `apps/api/openapi.public.json` изменился (новый path `/api/v1/tour-requests/taken`). Если скрипт падает на env-валидации — выполнить с dummy env-переменными, как в предыдущих PR с регенерацией (см. spec 2026-06-26, секция A.1).

- [ ] **Step 3: Commit + push + PR**

```bash
git add openapi.public.json
git commit -m "docs(api): regen openapi — tour slot exclusivity"
git push -u origin feat/tour-slot-exclusivity-api
```

PR title: `feat(tour-requests): exclusive tour slots + taken-slots endpoint`

PR description:
- Слот тура (листинг+дата+окно) занимается первой заявкой: активная PENDING/CONFIRMED блокирует слот, другие пользователи получают `409 TOUR_SLOT_TAKEN`; DECLINE/CANCEL освобождают.
- Гонки исключены частичным unique-индексом `tour_requests_active_slot_key` (+guard-очистка существующих дублей в миграции).
- Новый Bearer-роут `GET /api/v1/tour-requests/taken?listing_id=` — анонимные занятые слоты на 30 дней для формы заявки.
- Как проверить: unit-тесты `src/tour-requests`; две заявки разных пользователей на один слот → вторая 409; после DECLINE слот снова доступен.

---

## Self-Review (выполнено при написании плана)

- Spec coverage: A.1 миграция → Task 1; A.2 код ошибки → Task 2; A.3 create → Task 2; A.4 endpoint → Task 3; A.5 тесты → Task 2/3; openapi → Task 4. Пробелов нет.
- Placeholders: нет.
- Типы: `TakenSlotsResponse`/`listTakenSlots` согласованы между Task 3 сервисом и контроллером; `TOUR_SLOT_TAKEN` строка совпадает во всех задачах и клиентском плане.
