# Tour Agenda — API Implementation Plan (PR 1/2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Обогатить list-эндпоинты tour-requests контекстом объявления/владельца, добавить фильтры `status`/`upcoming` и разрешить владельцу `DECLINE` из `CONFIRMED`.

**Architecture:** Все изменения — внутри существующего модуля `apps/api/src/tour-requests/` (сервис, контроллер, модуль) + переиспользование `TranslationsService.resolveLanguage` и `UploadsService.resolveMediaUrl`. Ответы create/setStatus не меняются; обогащение только в list-ответах. Non-breaking (API v1).

**Tech Stack:** NestJS, Prisma, Jest (unit-моки Prisma).

**Spec:** `docs/superpowers/specs/2026-07-04-tour-agenda-design.md`

## Global Constraints

- Работать ТОЛЬКО в `apps/api/` (+ `docs/`, `packages/shared` не трогаем).
- Ветка `feat/tour-requests-listing-context` от свежего `main` (`git checkout main` → `git pull --ff-only` → `git checkout -b ...`). Git-мутации — по одной команде (chain через `&&` блокируется хуком).
- API-контракт — snake_case; все роуты уже под `/api/v1`.
- Никакого push в main; PR мёржит Team Lead.
- После изменения контроллера/DTO обязательно `pnpm openapi:export` и коммит обновлённого `openapi.internal.json` (CI drift-check).
- Prose/комментарии — на русском, в стиле существующего кода модуля.

---

### Task 1: Обогащение list-ответов (listing + owner) и фильтры status/upcoming

**Files:**
- Modify: `apps/api/src/tour-requests/tour-requests.service.ts`
- Modify: `apps/api/src/tour-requests/tour-requests.controller.ts`
- Modify: `apps/api/src/tour-requests/tour-requests.module.ts`
- Test: `apps/api/src/tour-requests/tour-requests.service.spec.ts`

**Interfaces:**
- Consumes: `TranslationsService.resolveLanguage(translations, originalLanguage, langParam?, acceptLanguage?): Language` (из `../translations`); `UploadsService.resolveMediaUrl(storageKey: string | null, fallbackUrl: string): Promise<string>` (из `../uploads`).
- Produces (для клиентского PR): list-item получает поля
  `listing: { id: string; title: string; photo_url: string | null }` и (только outgoing)
  `owner: { name: string | null; phone: string | null }` (`phone` ≠ null только при `status=CONFIRMED`);
  query-параметры `?status=<PENDING|CONFIRMED|DECLINED|CANCELLED>` и `?upcoming=true`
  (сортировка `requestedDate ASC, windowStart ASC, id ASC`, `next_cursor: null`).

- [ ] **Step 1: Написать падающие тесты**

В `tour-requests.service.spec.ts`:

1. В `beforeEach` добавить моки новых зависимостей и провайдеры:

```ts
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
```

```ts
let translations: any;
let uploads: any;
```

```ts
translations = { resolveLanguage: jest.fn().mockReturnValue('RU') };
uploads = { resolveMediaUrl: jest.fn().mockResolvedValue('https://signed.example/1.jpg') };
```

и в `providers` тестового модуля:

```ts
{ provide: TranslationsService, useValue: translations },
{ provide: UploadsService, useValue: uploads },
```

2. Общая фикстура строки списка (рядом с `ACTIVE_LISTING`):

```ts
const LIST_ROW = {
  id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'PENDING',
  requestedDate: new Date('2026-07-10T00:00:00.000Z'),
  windowStart: '07:00', windowEnd: '10:00',
  requesterName: 'Tap Links', requesterPhone: '+998901112233',
  message: null, createdAt: new Date('2026-07-04T00:00:00.000Z'),
  listing: {
    id: 'L1', originalLanguage: 'RU',
    translations: [{ language: 'RU', title: 'Квартира у метро' }],
    media: [{ url: 'https://r2.example/raw.jpg', storageKey: 'listings/L1/1.jpg' }],
    owner: {
      phone: '+998900000000',
      profile: { displayName: 'Акмаль', firstName: null, lastName: null, contactPhone: null },
    },
  },
};
```

3. Новые тесты (в конец `describe`):

```ts
describe('list: обогащение и фильтры', () => {
  beforeEach(() => {
    prisma.$transaction.mockImplementation(async (arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prisma));
    prisma.tourRequest.count.mockResolvedValue(1);
  });

  it('outgoing: включает listing {id,title,photo_url} и owner без телефона (PENDING)', async () => {
    prisma.tourRequest.findMany.mockResolvedValue([LIST_ROW]);
    const res = await service.listOutgoing('U2', {}, 'ru');
    expect(res.data[0].listing).toEqual({
      id: 'L1', title: 'Квартира у метро', photo_url: 'https://signed.example/1.jpg',
    });
    expect(res.data[0].owner).toEqual({ name: 'Акмаль', phone: null });
    expect(uploads.resolveMediaUrl).toHaveBeenCalledWith('listings/L1/1.jpg', 'https://r2.example/raw.jpg');
  });

  it('outgoing: телефон владельца раскрывается только при CONFIRMED', async () => {
    prisma.tourRequest.findMany.mockResolvedValue([{ ...LIST_ROW, status: 'CONFIRMED' }]);
    const res = await service.listOutgoing('U2', {});
    expect(res.data[0].owner).toEqual({ name: 'Акмаль', phone: '+998900000000' });
  });

  it('incoming: owner-блока нет, listing есть', async () => {
    prisma.tourRequest.findMany.mockResolvedValue([LIST_ROW]);
    const res = await service.listIncoming('OWNER1', {});
    expect(res.data[0].owner).toBeUndefined();
    expect(res.data[0].listing.title).toBe('Квартира у метро');
  });

  it('фильтр status попадает в where', async () => {
    prisma.tourRequest.findMany.mockResolvedValue([]);
    prisma.tourRequest.count.mockResolvedValue(0);
    await service.listIncoming('OWNER1', { status: 'PENDING' as any });
    expect(prisma.tourRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ listing: { ownerId: 'OWNER1' } }, { status: 'PENDING' }] },
      }),
    );
  });

  it('upcoming: requestedDate >= сегодня, сортировка по дате тура, cursor не используется', async () => {
    prisma.tourRequest.findMany.mockResolvedValue([LIST_ROW]);
    const res = await service.listOutgoing('U2', { upcoming: true, cursor: 'whatever' });
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    expect(prisma.tourRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ requesterId: 'U2' }, { requestedDate: { gte: today } }] },
        orderBy: [{ requestedDate: 'asc' }, { windowStart: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(res.meta.next_cursor).toBeNull();
  });

  it('листинг без фото → photo_url null; без перевода → title пустая строка', async () => {
    prisma.tourRequest.findMany.mockResolvedValue([
      { ...LIST_ROW, listing: { ...LIST_ROW.listing, media: [], translations: [] } },
    ]);
    const res = await service.listOutgoing('U2', {});
    expect(res.data[0].listing).toEqual({ id: 'L1', title: '', photo_url: null });
  });
});
```

Примечание: существующие тесты create/setStatus мокали `$transaction` только как callback — новая реализация `beforeEach` внутри вложенного `describe` перекрывает мок и для массива промисов (`$transaction([findMany, count])`), не трогая внешние тесты.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `pnpm --filter @avino/api test -- tour-requests.service`
Expected: FAIL — `Nest can't resolve dependencies` нет (мы передаём провайдеры), падают новые тесты: у сервиса нет параметра `acceptLanguage`, нет `listing`-блока и т.д.

- [ ] **Step 3: Реализация в сервисе**

`tour-requests.service.ts`:

1. Импорты:

```ts
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
```

2. После `TOUR_REQUEST_SELECT` добавить select списка:

```ts
// Строка списка: заявка + контекст объявления (title по языку ответа, первое фото,
// владелец для outgoing) — spec 2026-07-04-tour-agenda-design.
const TOUR_LIST_SELECT = {
  ...TOUR_REQUEST_SELECT,
  listing: {
    select: {
      id: true,
      originalLanguage: true,
      translations: { select: { language: true, title: true } },
      media: {
        select: { url: true, storageKey: true },
        orderBy: { sortOrder: Prisma.SortOrder.asc },
        take: 1,
      },
      owner: {
        select: {
          phone: true,
          profile: {
            select: { displayName: true, firstName: true, lastName: true, contactPhone: true },
          },
        },
      },
    },
  },
} satisfies Prisma.TourRequestSelect;

type TourListRow = Prisma.TourRequestGetPayload<{ select: typeof TOUR_LIST_SELECT }>;
```

3. Новые контрактные типы (рядом с `TourRequestResponse`):

```ts
/** Контекст объявления в списках туров (spec 2026-07-04). */
export interface TourRequestListingBlock {
  id: string;
  title: string;
  photo_url: string | null;
}

/** «Кто принимает» для outgoing-списка; телефон — только после CONFIRMED. */
export interface TourRequestOwnerBlock {
  name: string | null;
  phone: string | null;
}

export interface TourRequestListItem extends TourRequestResponse {
  listing: TourRequestListingBlock;
  owner?: TourRequestOwnerBlock;
}
```

Обновить `TourRequestListResponse.data` на `TourRequestListItem[]` и `TourRequestListQuery`:

```ts
export interface TourRequestListQuery {
  limit?: number;
  cursor?: string;
  status?: TourRequestStatus;
  upcoming?: boolean;
}
```

4. Конструктор:

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly notifications: NotificationsService,
  private readonly translations: TranslationsService,
  private readonly uploads: UploadsService,
) {}
```

5. Хелпер «UTC-полночь сегодня» (DRY: используется в `create`/`taken`/`upcoming`):

```ts
/** UTC-полночь текущего дня — нижняя граница «сегодня» всего тур-домена. */
private todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
```

Заменить дублированные вычисления `today` в `listTakenSlots` и `parseRequestedDate` на `this.todayUtc()` (по одной строке, остальное не трогать).

6. Подписи list-методов (+ `acceptLanguage`, флаг owner-блока):

```ts
async listOutgoing(
  userId: string,
  query: TourRequestListQuery,
  acceptLanguage?: string,
): Promise<TourRequestListResponse> {
  return this.listBy({ requesterId: userId }, query, acceptLanguage, true);
}

async listIncoming(
  userId: string,
  query: TourRequestListQuery,
  acceptLanguage?: string,
): Promise<TourRequestListResponse> {
  return this.listBy({ listing: { ownerId: userId } }, query, acceptLanguage, false);
}
```

7. Переписать `listBy`:

```ts
private async listBy(
  base: Prisma.TourRequestWhereInput,
  query: TourRequestListQuery,
  acceptLanguage: string | undefined,
  includeOwner: boolean,
): Promise<TourRequestListResponse> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const filters: Prisma.TourRequestWhereInput[] = [base];
  if (query.status) filters.push({ status: query.status });
  if (query.upcoming) filters.push({ requestedDate: { gte: this.todayUtc() } });
  const where: Prisma.TourRequestWhereInput =
    filters.length > 1 ? { AND: filters } : base;

  if (query.upcoming) {
    // Агенда: сортировка по дате тура; keyset-cursor не поддерживается —
    // предстоящих туров мало, отдаём первые `limit` (spec 2026-07-04).
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tourRequest.findMany({
        where,
        orderBy: [{ requestedDate: 'asc' }, { windowStart: 'asc' }, { id: 'asc' }],
        take: limit,
        select: TOUR_LIST_SELECT,
      }),
      this.prisma.tourRequest.count({ where }),
    ]);
    return {
      data: await this.toListItems(rows, acceptLanguage, includeOwner),
      meta: { limit, total, next_cursor: null },
    };
  }

  const cursor = this.decodeCursor(query.cursor);
  const cursorWhere: Prisma.TourRequestWhereInput | undefined = cursor
    ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] }
    : undefined;
  const [rows, total] = await this.prisma.$transaction([
    this.prisma.tourRequest.findMany({
      where: cursorWhere ? { AND: [where, cursorWhere] } : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: TOUR_LIST_SELECT,
    }),
    this.prisma.tourRequest.count({ where }),
  ]);
  const last = rows.length === limit ? rows[rows.length - 1] : null;
  const next = last ? this.encodeCursor(last.createdAt.toISOString(), last.id) : null;
  return {
    data: await this.toListItems(rows, acceptLanguage, includeOwner),
    meta: { limit, total, next_cursor: next },
  };
}
```

8. Мапперы (рядом с `toResponse`):

```ts
/** Обогащённые элементы списка: title по языку ответа + свежий photo_url (ADR-0086). */
private async toListItems(
  rows: TourListRow[],
  acceptLanguage: string | undefined,
  includeOwner: boolean,
): Promise<TourRequestListItem[]> {
  return Promise.all(
    rows.map(async (row) => {
      const language = this.translations.resolveLanguage(
        row.listing.translations,
        row.listing.originalLanguage,
        undefined,
        acceptLanguage,
      );
      const translation = row.listing.translations.find((t) => t.language === language);
      const photo = row.listing.media[0];
      const item: TourRequestListItem = {
        ...this.toResponse(row),
        listing: {
          id: row.listing.id,
          title: translation?.title ?? '',
          photo_url: photo
            ? await this.uploads.resolveMediaUrl(photo.storageKey, photo.url)
            : null,
        },
      };
      if (includeOwner) {
        item.owner = this.buildOwnerBlock(row.listing.owner, row.status);
      }
      return item;
    }),
  );
}

/** Имя — как в ContactBlock листинга (displayName → first+last); телефон только после CONFIRMED. */
private buildOwnerBlock(
  owner: TourListRow['listing']['owner'],
  status: TourRequestStatus,
): TourRequestOwnerBlock {
  const profile = owner.profile;
  const fullName = [profile?.firstName, profile?.lastName]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  return {
    name: profile?.displayName ?? (fullName.length > 0 ? fullName : null),
    phone:
      status === TourRequestStatus.CONFIRMED
        ? (profile?.contactPhone ?? owner.phone ?? null)
        : null,
  };
}
```

9. `tour-requests.module.ts` — добавить импорты модулей:

```ts
import { TranslationsModule } from '../translations';
import { UploadsModule } from '../uploads';
```

```ts
imports: [RolesModule, PrismaModule, NotificationsModule, TranslationsModule, UploadsModule],
```

(дополнить JSDoc модуля одной строкой: контекст объявления в списках — spec 2026-07-04).

10. `tour-requests.controller.ts`:

```ts
import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TourRequestStatus } from '@prisma/client';
```

Хелпер рядом с `parseLimit`:

```ts
/** Валидный enum-статус или undefined (мусор игнорируем, как parseLimit). */
private parseStatus(status?: string): TourRequestStatus | undefined {
  return status && status in TourRequestStatus ? (status as TourRequestStatus) : undefined;
}
```

Роуты:

```ts
@Get('outgoing')
outgoing(
  @CurrentUser('id') userId: string,
  @Headers('accept-language') acceptLanguage?: string,
  @Query('limit') limit?: string,
  @Query('cursor') cursor?: string,
  @Query('status') status?: string,
  @Query('upcoming') upcoming?: string,
): Promise<TourRequestListResponse> {
  return this.service.listOutgoing(
    userId,
    { limit: this.parseLimit(limit), cursor, status: this.parseStatus(status), upcoming: upcoming === 'true' },
    acceptLanguage,
  );
}

@Get('incoming')
incoming(
  @CurrentUser('id') userId: string,
  @Headers('accept-language') acceptLanguage?: string,
  @Query('limit') limit?: string,
  @Query('cursor') cursor?: string,
  @Query('status') status?: string,
  @Query('upcoming') upcoming?: string,
): Promise<TourRequestListResponse> {
  return this.service.listIncoming(
    userId,
    { limit: this.parseLimit(limit), cursor, status: this.parseStatus(status), upcoming: upcoming === 'true' },
    acceptLanguage,
  );
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm --filter @avino/api test -- tour-requests.service`
Expected: PASS (все старые + 6 новых).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tour-requests
git commit -m "feat(tour-requests): listing context, owner block and status/upcoming filters in lists"
```

---

### Task 2: DECLINE из CONFIRMED (владелец отменяет подтверждённый тур)

**Files:**
- Modify: `apps/api/src/tour-requests/tour-requests.service.ts:186-203` (ветка CONFIRM/DECLINE в `setStatus`)
- Test: `apps/api/src/tour-requests/tour-requests.service.spec.ts`

**Interfaces:**
- Produces: `PATCH /tour-requests/:id/status {action: DECLINE}` теперь валиден и из `CONFIRMED` (только владелец); `CONFIRM` — по-прежнему только из `PENDING`. Уведомление заявителю — существующий `TOUR_REQUEST_STATUS_CHANGED`.

- [ ] **Step 1: Написать падающие тесты**

```ts
it('владелец отклоняет CONFIRMED → DECLINED (отмена подтверждённого тура) + уведомление', async () => {
  prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'CONFIRMED', listing: { ownerId: 'OWNER1' } });
  prisma.tourRequest.update.mockResolvedValue({
    id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'DECLINED',
    requestedDate: new Date('2026-07-10T00:00:00.000Z'), windowStart: '07:00', windowEnd: '10:00',
    requesterName: 'Tap Links', requesterPhone: '+998901112233', message: null, createdAt: new Date(),
  });
  const res = await service.setStatus('OWNER1', 'TR1', TourRequestAction.DECLINE);
  expect(res.status).toBe('DECLINED');
  expect(notifications.queueTourStatusChanged).toHaveBeenCalledWith(prisma, 'U2', expect.objectContaining({ status: 'DECLINED' }));
});

it('422 при CONFIRM из CONFIRMED (подтверждать можно только PENDING)', async () => {
  prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'CONFIRMED', listing: { ownerId: 'OWNER1' } });
  await expect(service.setStatus('OWNER1', 'TR1', TourRequestAction.CONFIRM)).rejects.toMatchObject({ status: 422 });
});
```

Внимание: мокам `update` поле `listing` не нужно — `TOUR_REQUEST_SELECT` для setStatus не менялся, ответ остаётся плоским.

- [ ] **Step 2: Убедиться, что первый тест падает**

Run: `pnpm --filter @avino/api test -- tour-requests.service`
Expected: FAIL — `Cannot DECLINE a tour request in status CONFIRMED` (422 вместо DECLINED).

- [ ] **Step 3: Реализация**

В `setStatus` заменить ветку CONFIRM/DECLINE:

```ts
if (action === TourRequestAction.CONFIRM || action === TourRequestAction.DECLINE) {
  if (!isOwner) {
    throw new ForbiddenException({ code: ApiErrorCode.FORBIDDEN, message: 'Only the listing owner can confirm or decline' });
  }
  if (action === TourRequestAction.CONFIRM) {
    if (tr.status !== TourRequestStatus.PENDING) throw this.invalidTransition(action, tr.status);
    nextStatus = TourRequestStatus.CONFIRMED;
  } else {
    // DECLINE: из PENDING (отказ) или из CONFIRMED — владелец отменяет уже
    // подтверждённый тур (spec 2026-07-04); слот освобождается автоматически,
    // т.к. partial unique index покрывает только PENDING/CONFIRMED.
    if (tr.status !== TourRequestStatus.PENDING && tr.status !== TourRequestStatus.CONFIRMED) {
      throw this.invalidTransition(action, tr.status);
    }
    nextStatus = TourRequestStatus.DECLINED;
  }
  notifyUserId = tr.requesterId;
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `pnpm --filter @avino/api test -- tour-requests.service`
Expected: PASS (в т.ч. старый тест «422 при недопустимом переходе (confirm уже DECLINED)»).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tour-requests/tour-requests.service.ts apps/api/src/tour-requests/tour-requests.service.spec.ts
git commit -m "feat(tour-requests): allow owner DECLINE from CONFIRMED"
```

---

### Task 3: OpenAPI regen, docs, ADR

**Files:**
- Modify: `apps/api/openapi.internal.json` (генерируется), возможно `apps/api/openapi.public.json`
- Modify: `docs/API.md` (раздел tour-requests, если есть)
- Create: `docs/adr/ADR-0122-tour-agenda-listing-context.md`

- [ ] **Step 1: Полные проверки пакета**

Run: `pnpm --filter @avino/api lint` → Expected: 0 errors
Run: `pnpm --filter @avino/api build` → Expected: успешная сборка (если ~37 cryptic TS ошибок — устаревший Prisma-клиент: `pnpm --filter @avino/api exec prisma generate` и повторить)
Run: `pnpm --filter @avino/api test` → Expected: PASS все юниты

- [ ] **Step 2: Regen OpenAPI**

Run: `pnpm openapi:export`
Expected: обновлён `apps/api/openapi.internal.json` (новые query-параметры). `openapi.public.json` не должен измениться (tour-requests — Bearer/internal).

- [ ] **Step 3: docs/API.md**

Найти раздел tour-requests (`grep -n "tour-requests" docs/API.md`) и дополнить: параметры `status`, `upcoming` (+ правило сортировки/отсутствие курсора), поля `listing`/`owner` в list-ответах, новый переход DECLINE из CONFIRMED. Если раздела нет — не создавать (API.md ведётся руками и может отставать).

- [ ] **Step 4: ADR**

Создать `docs/adr/ADR-0122-tour-agenda-listing-context.md` (проверить, что номер 0122 свободен: `ls docs/adr/ | tail -3`; занят — взять следующий):

```markdown
# ADR-0122 — Контекст объявления и агенда в списках тур-заявок

## Status

Accepted

## Date

2026-07-04

## Context

После подтверждения тура обе стороны теряли его из вида: list-эндпоинты
tour-requests отдавали только голый listing_id, не поддерживали фильтры и
сортировались по дате создания заявки, а не по дате тура. Владелец не мог
отменить уже подтверждённый тур (DECLINE был разрешён только из PENDING).

## Decision

1. GET /api/v1/tour-requests/outgoing|incoming обогащены блоком
   `listing {id, title, photo_url}` (title по Accept-Language через
   TranslationsService.resolveLanguage, фото — sign-on-read, ADR-0086).
2. В outgoing добавлен блок `owner {name, phone}`; телефон раскрывается
   ТОЛЬКО при status=CONFIRMED (до подтверждения контакт не раскрываем и
   не обходим счётчик звонков).
3. Новые опциональные query-параметры `status` и `upcoming=true`; при
   upcoming сортировка requestedDate ASC, windowStart ASC, id ASC и
   keyset-cursor не используется (next_cursor: null).
4. Переход DECLINE разрешён из CONFIRMED (только владелец) — владелец может
   отменить подтверждённый тур; слот освобождается автоматически (partial
   unique index покрывает только PENDING/CONFIRMED).

Изменения additive/non-breaking, остаются в API v1.

## Consequences

Positive:
- Обе стороны видят «какой тур, когда и по какому объявлению» в одном ответе.
- Клиент строит агенду «Предстоящие туры» без N+1 запросов за листингами.
- Подтверждённый тур больше не «застревает» при смене планов владельца.

Negative / trade-offs:
- list-запросы стали тяжелее (join listing/translations/media/owner).
- Смешанная семантика DECLINED (отказ и отмена владельцем) — отдельный
  статус не заводим до реальной необходимости.

## Related files

- apps/api/src/tour-requests/tour-requests.service.ts
- apps/api/src/tour-requests/tour-requests.controller.ts
- docs/superpowers/specs/2026-07-04-tour-agenda-design.md

## Related task

- Tour agenda (spec 2026-07-04), PR: pending
```

- [ ] **Step 5: Commit + push + PR**

```bash
git add apps/api/openapi.internal.json docs/API.md docs/adr/ADR-0122-tour-agenda-listing-context.md
git commit -m "docs(tour-requests): openapi regen, API.md and ADR-0122 for tour agenda"
git push -u origin feat/tour-requests-listing-context
```

PR title: `feat(tour-requests): listing context, filters and owner cancel for tour lists`

PR description:
- Списки туров обогащены `listing {id,title,photo_url}` и (outgoing) `owner {name,phone}` — телефон только после CONFIRMED
- Новые фильтры `?status=` и `?upcoming=true` (агенда: сортировка по дате тура)
- Владелец может отменить подтверждённый тур (DECLINE из CONFIRMED)
- Как проверить: unit-тесты `tour-requests.service.spec.ts`; вручную — `GET /api/v1/tour-requests/outgoing?status=CONFIRMED&upcoming=true` с Bearer

Pre-merge checklist:
- Тесты и lint зелёные, openapi.internal.json перегенерён
- Ответы create/setStatus не изменились (обратная совместимость)
- Нет unrelated файлов
