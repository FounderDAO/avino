# Property Tour Requests — Backend Implementation Plan (PR 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать покупателю запрашивать просмотр (тур) объявления с подтверждением продавцом — backend-часть: модель, API, уведомления.

**Architecture:** Продавец включает приём туров (`tours_enabled`) и задаёт окна (`tour_windows` JSONB) при создании/правке объявления. Покупатель создаёт `TourRequest` (снимок слота + контактов) через новый модуль `tour-requests`; продавец подтверждает/отклоняет, покупатель отменяет. Уведомления переиспользуют продюсер-паттерн `notifications.service` (оживляем `NEW_LEAD`, добавляем `TOUR_REQUEST_STATUS_CHANGED`).

**Tech Stack:** NestJS, Prisma 5.18, PostgreSQL, class-validator, Jest (unit, mock Prisma), `packages/shared` (TS-enums).

**Branch:** `feat/property-tour-requests` (уже содержит спеку; сюда же ложатся `packages/shared` + `apps/api`). Один PR = backend.

**Spec:** `docs/superpowers/specs/2026-06-21-property-tour-requests-design.md`

## Global Constraints

- API versioning обязателен: все роуты под `/api/v1/...`, контроллеры с `version: '1'` (CLAUDE.md §14).
- JSON-контракт — **snake_case** ключи в request/response DTO.
- Bearer-auth (`JwtAuthGuard`) на всех tour-эндпоинтах (как чат).
- Окна: формат `HH:MM` (`^([01]\d|2[0-3]):[0-5]\d$`), `start < end`, **≤6** окон; включить туры можно только при ≥1 окне.
- Горизонт даты тура: **сегодня … +30 дней**; `message` ≤500; `requester_name` ≤120; `requester_phone` обязателен.
- Время — локальное Asia/Tashkent; TZ-конверсий нет (дата хранится как `@db.Date`).
- `tours_enabled` дефолт **false** (opt-in; существующие объявления не меняются).
- После любых правок enum/DTO — регенерация `openapi.public.json`/`openapi.internal.json` (`pnpm --filter @avino/api openapi:export`), иначе CI drift-check падает.
- Commit-стиль: Conventional Commits (`feat(tours): …`). Каждое commit-сообщение завершать строкой:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Суб-агенты пишут только код и НЕ трогают git (контроллер ведёт git). Если исполняешь инлайн — git делает контроллер сессии.

---

## File Structure

**Создаём:**
- `apps/api/src/listings/tour-window.ts` — тип `TourWindow`, регэксп `HHMM`, чистые валидаторы `validateToursInput`, `windowOffered`.
- `apps/api/src/listings/tour-window.spec.ts` — юнит-тесты валидаторов.
- `apps/api/prisma/migrations/20260621000000_tour_requests/migration.sql` — миграция.
- `apps/api/src/tour-requests/tour-requests.module.ts`
- `apps/api/src/tour-requests/tour-requests.controller.ts`
- `apps/api/src/tour-requests/tour-requests.service.ts`
- `apps/api/src/tour-requests/tour-requests.service.spec.ts`
- `apps/api/src/tour-requests/dto/create-tour-request.dto.ts`
- `apps/api/src/tour-requests/dto/tour-request-status.dto.ts`
- `apps/api/src/tour-requests/index.ts`

**Изменяем:**
- `packages/shared/src/enums.ts` — `TourRequestStatus`.
- `apps/api/prisma/schema.prisma` — поля `Listing`, модель `TourRequest`, enum `TourRequestStatus`, значение `NotificationType.TOUR_REQUEST_STATUS_CHANGED`, обратные relation на `User`/`Listing`.
- `apps/api/src/common/dto/error-response.dto.ts` — код `TOUR_REQUEST_DUPLICATE`.
- `apps/api/src/listings/dto/create-listing.dto.ts` — `TourWindowDto`, `tours_enabled`, `tour_windows`.
- `apps/api/src/listings/dto/update-listing.dto.ts` — те же поля.
- `apps/api/src/listings/listings.service.ts` — `ListingScalarInput`, `toScalarData`, `create`, `update`, `ListingDetailResponse`, `LISTING_DETAIL_SELECT`, маппинг detail.
- `apps/api/src/listings/listings.service.spec.ts` — тесты tours-полей.
- `apps/api/src/notifications/notifications.service.ts` — продюсеры `queueTourRequest`, `queueTourStatusChanged` + data-интерфейсы.
- `apps/api/src/app.module.ts` — регистрация `TourRequestsModule`.

---

## Task 1: Shared enum `TourRequestStatus`

**Files:**
- Modify: `packages/shared/src/enums.ts`

**Interfaces:**
- Produces: `enum TourRequestStatus { PENDING, CONFIRMED, DECLINED, CANCELLED }` (string-значения), экспортируется из `@avino/shared`.

- [ ] **Step 1: Добавить enum в `packages/shared/src/enums.ts`** (в конец файла)

```ts
/**
 * Статусы заявки на тур (просмотр). PENDING — создана покупателем; CONFIRMED/
 * DECLINED — решение владельца; CANCELLED — отмена покупателем. DECLINED/CANCELLED
 * терминальны. Зеркалит Prisma-enum `TourRequestStatus`.
 */
export enum TourRequestStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
}
```

- [ ] **Step 2: Сборка shared — проверить, что типы компилируются**

Run: `pnpm --filter @avino/shared build`
Expected: PASS (tsc без ошибок; enum экспортируется через barrel `index.ts`).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/enums.ts
git commit -m "feat(tours): add TourRequestStatus to shared enums

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Prisma schema + миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260621000000_tour_requests/migration.sql`

**Interfaces:**
- Produces: Prisma-модель `TourRequest`, поля `Listing.toursEnabled: Boolean`, `Listing.tourWindows: Json`, enum `TourRequestStatus`, значение `NotificationType.TOUR_REQUEST_STATUS_CHANGED`. Доступны через `@prisma/client` после `prisma generate`.

- [ ] **Step 1: schema.prisma — добавить значение в `NotificationType`** (в enum `NotificationType`, после `PROMOTION_EXPIRED`)

```prisma
  NEW_LEAD
  PROMOTION_ACTIVATED
  PROMOTION_EXPIRED
  TOUR_REQUEST_STATUS_CHANGED
```

- [ ] **Step 2: schema.prisma — enum `TourRequestStatus`** (рядом с другими enum, например после `NotificationStatus`)

```prisma
/// Статусы заявки на тур (TASK tour-requests). PENDING → CONFIRMED|DECLINED
/// (решение владельца) | CANCELLED (отмена покупателем). DECLINED/CANCELLED — терминальны.
enum TourRequestStatus {
  PENDING
  CONFIRMED
  DECLINED
  CANCELLED
}
```

- [ ] **Step 3: schema.prisma — поля в модель `Listing`** (после `editedSinceHidden`)

```prisma
  // Приём туров (просмотров): флаг + окна доступного времени (JSONB-массив
  // [{ "start": "07:00", "end": "10:00" }]). tours_enabled=false → заявки не
  // принимаются; окна — общие, локальное Asia/Tashkent.
  toursEnabled       Boolean                                @default(false) @map("tours_enabled")
  tourWindows        Json                                   @default("[]") @map("tour_windows")
```

И в блок relation модели `Listing` добавить:

```prisma
  tourRequests   TourRequest[]
```

- [ ] **Step 4: schema.prisma — relation в модель `User`** (в блок relation-полей `User`, рядом с другими обратными связями)

```prisma
  tourRequests  TourRequest[]
```

- [ ] **Step 5: schema.prisma — модель `TourRequest`** (после модели `ExchangeRate` или рядом с `ChatMessage`)

```prisma
/// Заявка на тур (просмотр объявления). Хранит СНИМОК выбранного слота
/// (window_start/end, requested_date) и контактов покупателя (requester_name/phone),
/// чтобы правка окон продавцом не затрагивала историю. ON DELETE CASCADE — заявка
/// не переживает удаление объявления/пользователя.
model TourRequest {
  id             String            @id @default(uuid()) @db.Uuid
  listingId      String            @map("listing_id") @db.Uuid
  requesterId    String            @map("requester_id") @db.Uuid
  status         TourRequestStatus @default(PENDING)
  requestedDate  DateTime          @map("requested_date") @db.Date
  windowStart    String            @map("window_start")
  windowEnd      String            @map("window_end")
  requesterName  String            @map("requester_name")
  requesterPhone String            @map("requester_phone")
  message        String?
  createdAt      DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  listing   Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  requester User    @relation(fields: [requesterId], references: [id], onDelete: Cascade)

  @@index([listingId])
  @@index([requesterId])
  @@index([status])
  @@map("tour_requests")
}
```

- [ ] **Step 6: Создать миграцию** `apps/api/prisma/migrations/20260621000000_tour_requests/migration.sql`

```sql
-- AlterEnum: новый тип уведомления (значение НЕ используется в этой миграции,
-- поэтому ADD VALUE в транзакции миграции безопасен на PG12+).
ALTER TYPE "NotificationType" ADD VALUE 'TOUR_REQUEST_STATUS_CHANGED';

-- CreateEnum
CREATE TYPE "TourRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED');

-- AlterTable: приём туров на объявлении
ALTER TABLE "listings"
  ADD COLUMN "tours_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "tour_windows" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "tour_requests" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "status" "TourRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requested_date" DATE NOT NULL,
    "window_start" TEXT NOT NULL,
    "window_end" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "requester_phone" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tour_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tour_requests_listing_id_idx" ON "tour_requests"("listing_id");
CREATE INDEX "tour_requests_requester_id_idx" ON "tour_requests"("requester_id");
CREATE INDEX "tour_requests_status_idx" ON "tour_requests"("status");

ALTER TABLE "tour_requests" ADD CONSTRAINT "tour_requests_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tour_requests" ADD CONSTRAINT "tour_requests_requester_id_fkey"
  FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 7: Сгенерировать Prisma Client и провалидировать схему**

Run: `pnpm --filter @avino/api exec prisma validate && pnpm --filter @avino/api exec prisma generate`
Expected: PASS — `The schema is valid` + `Generated Prisma Client`.

- [ ] **Step 8: Применить миграцию на dev/test БД**

Run: `pnpm --filter @avino/api exec prisma migrate deploy`
Expected: миграция `20260621000000_tour_requests` применена.
> Если `migrate deploy` упирается в drift (известная гоча, см. memory): применить SQL через `prisma db execute --file <migration.sql>` и пометить `prisma migrate resolve --applied 20260621000000_tour_requests`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260621000000_tour_requests/migration.sql
git commit -m "feat(tours): prisma model TourRequest + listing tour fields + notif type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Чистые валидаторы окон (`tour-window.ts`)

**Files:**
- Create: `apps/api/src/listings/tour-window.ts`
- Create: `apps/api/src/listings/tour-window.spec.ts`

**Interfaces:**
- Produces:
  - `interface TourWindow { start: string; end: string }`
  - `const HHMM: RegExp`
  - `function validateToursInput(toursEnabled: boolean, windows: TourWindow[]): void` — кидает `HttpException(422, VALIDATION_ERROR)` при плохом окне (`start>=end` или не-`HH:MM`) или при `toursEnabled && windows.length===0`.
  - `function windowOffered(windows: TourWindow[], start: string, end: string): boolean`.

- [ ] **Step 1: Написать падающие тесты** `apps/api/src/listings/tour-window.spec.ts`

```ts
import { HttpException } from '@nestjs/common';
import { validateToursInput, windowOffered, TourWindow } from './tour-window';

const W = (start: string, end: string): TourWindow => ({ start, end });

describe('validateToursInput', () => {
  it('пропускает валидные окна', () => {
    expect(() => validateToursInput(true, [W('07:00', '10:00'), W('18:00', '20:00')])).not.toThrow();
  });
  it('кидает 422 если start >= end', () => {
    expect(() => validateToursInput(true, [W('10:00', '07:00')])).toThrow(HttpException);
  });
  it('кидает 422 на неверный формат', () => {
    expect(() => validateToursInput(true, [W('7:0', '10:00')])).toThrow(HttpException);
  });
  it('кидает 422 если tours_enabled без окон', () => {
    expect(() => validateToursInput(true, [])).toThrow(HttpException);
  });
  it('разрешает tours_enabled=false без окон', () => {
    expect(() => validateToursInput(false, [])).not.toThrow();
  });
});

describe('windowOffered', () => {
  const windows = [W('07:00', '10:00'), W('18:00', '20:00')];
  it('true для предложенного окна', () => {
    expect(windowOffered(windows, '18:00', '20:00')).toBe(true);
  });
  it('false для непредложенного окна', () => {
    expect(windowOffered(windows, '12:00', '15:00')).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- tour-window`
Expected: FAIL — `Cannot find module './tour-window'`.

- [ ] **Step 3: Реализовать** `apps/api/src/listings/tour-window.ts`

```ts
import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '../common/dto/error-response.dto';

/** Окно доступного времени тура (общее, локальное Asia/Tashkent). */
export interface TourWindow {
  start: string;
  end: string;
}

/** Формат времени окна — `HH:MM` (24ч, zero-padded). */
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function unprocessable(message: string): HttpException {
  return new HttpException(
    { code: ApiErrorCode.VALIDATION_ERROR, message },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/**
 * Кросс-полевая валидация tours-конфига объявления. Формат каждого окна и размер
 * массива проверяет DTO; здесь — `start < end` и «включено → есть ≥1 окно».
 * `windows` — ЭФФЕКТИВНЫЕ окна (dto.tour_windows ?? существующие).
 */
export function validateToursInput(toursEnabled: boolean, windows: TourWindow[]): void {
  for (const w of windows) {
    if (!HHMM.test(w.start) || !HHMM.test(w.end) || w.start >= w.end) {
      throw unprocessable(`Invalid tour window ${w.start}-${w.end}`);
    }
  }
  if (toursEnabled && windows.length === 0) {
    throw unprocessable('tours_enabled requires at least one tour window');
  }
}

/** Предложено ли продавцом точное окно `{start,end}`. */
export function windowOffered(windows: TourWindow[], start: string, end: string): boolean {
  return windows.some((w) => w.start === start && w.end === end);
}
```

- [ ] **Step 4: Запустить — убедиться, что зелено**

Run: `pnpm --filter @avino/api test -- tour-window`
Expected: PASS (все 7 кейсов).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/listings/tour-window.ts apps/api/src/listings/tour-window.spec.ts
git commit -m "feat(tours): pure tour-window validators

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: DTO листинга — поля tours

**Files:**
- Modify: `apps/api/src/listings/dto/create-listing.dto.ts`
- Modify: `apps/api/src/listings/dto/update-listing.dto.ts`

**Interfaces:**
- Produces: `CreateListingDto`/`UpdateListingDto` принимают `tours_enabled?: boolean` и `tour_windows?: TourWindowDto[]` (каждое окно — `{ start, end }` формата `HH:MM`, массив ≤6). Класс `TourWindowDto` экспортируется из `create-listing.dto.ts`.

- [ ] **Step 1: В `create-listing.dto.ts` добавить класс `TourWindowDto` и импорты** (рядом с `CreateListingTranslationDto`)

```ts
// добавить в существующий импорт из 'class-validator':
//   ArrayMaxSize, IsArray, IsBoolean
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Окно доступного времени тура (общее). `start`/`end` — `HH:MM`. */
export class TourWindowDto {
  @Matches(HHMM_RE, { message: 'start must be HH:MM' })
  start!: string;

  @Matches(HHMM_RE, { message: 'end must be HH:MM' })
  end!: string;
}
```

- [ ] **Step 2: В `CreateListingDto` добавить поля** (перед `translation`)

```ts
  @IsOptional()
  @IsBoolean()
  tours_enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TourWindowDto)
  tour_windows?: TourWindowDto[];
```

- [ ] **Step 3: В `update-listing.dto.ts` добавить те же поля** (импортировать `TourWindowDto` из `./create-listing.dto`, добавить `ArrayMaxSize, IsArray, IsBoolean, ValidateNested` и `Type`)

```ts
import { TourWindowDto } from './create-listing.dto';
// ... в классе UpdateListingDto:
  @IsOptional()
  @IsBoolean()
  tours_enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => TourWindowDto)
  tour_windows?: TourWindowDto[];
```

- [ ] **Step 4: Проверить сборку/линт**

Run: `pnpm --filter @avino/api exec tsc --noEmit && pnpm --filter @avino/api lint`
Expected: PASS — нет ошибок типов/линта.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/listings/dto/create-listing.dto.ts apps/api/src/listings/dto/update-listing.dto.ts
git commit -m "feat(tours): accept tours_enabled + tour_windows in listing DTOs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: listings.service — persist + expose tours

**Files:**
- Modify: `apps/api/src/listings/listings.service.ts`
- Modify: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Consumes: `validateToursInput`, `TourWindow` (Task 3); `tours_enabled`/`tour_windows` из DTO (Task 4).
- Produces: `create`/`update` валидируют и сохраняют tours-поля; `ListingDetailResponse` содержит `tours_enabled: boolean` и `tour_windows: TourWindow[]`.

- [ ] **Step 1: Написать падающие тесты** в `listings.service.spec.ts` (добавить describe-блок)

```ts
// ... внутри существующего describe('ListingsService', ...) с уже настроенным prismaMock:

describe('tours', () => {
  it('create сохраняет tours_enabled + tour_windows', async () => {
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
    prismaMock.userRole.count.mockResolvedValue(1);
    prismaMock.listing.create.mockResolvedValue({
      id: 'L1', status: 'NEW', transactionType: 'SALE', propertyType: 'HOUSE',
      originalLanguage: 'RU', price: '100.00', currency: 'USD', createdAt: new Date(),
    });
    await service.create('U1', {
      transaction_type: 'SALE', property_type: 'HOUSE', original_language: 'RU',
      price: '100.00', currency: 'USD',
      tours_enabled: true, tour_windows: [{ start: '07:00', end: '10:00' }],
      translation: { title: 'T' },
    } as any);
    const arg = prismaMock.listing.create.mock.calls[0][0];
    expect(arg.data.toursEnabled).toBe(true);
    expect(arg.data.tourWindows).toEqual([{ start: '07:00', end: '10:00' }]);
  });

  it('create с tours_enabled и без окон → 422', async () => {
    await expect(
      service.create('U1', {
        transaction_type: 'SALE', property_type: 'HOUSE', original_language: 'RU',
        price: '100.00', currency: 'USD', tours_enabled: true, tour_windows: [],
        translation: { title: 'T' },
      } as any),
    ).rejects.toMatchObject({ status: 422 });
  });
});
```
> Прим.: имена `service`/`prismaMock` — как в текущем `listings.service.spec.ts`; переиспользовать существующий setup, не дублировать модуль.

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- listings.service`
Expected: FAIL — `toursEnabled` undefined / нет 422.

- [ ] **Step 3: Реализация — `ListingScalarInput` + `toScalarData`**

В `interface ListingScalarInput` добавить:
```ts
  tours_enabled?: boolean;
  tour_windows?: { start: string; end: string }[];
```
В методе `toScalarData(dto)` (там, где мапятся optional-поля) добавить:
```ts
    if (dto.tours_enabled !== undefined) data.toursEnabled = dto.tours_enabled;
    if (dto.tour_windows !== undefined) data.tourWindows = dto.tour_windows as unknown as Prisma.InputJsonValue;
```

- [ ] **Step 4: Реализация — валидация в `create`**

В начале `create`, до сборки `data`:
```ts
    validateToursInput(dto.tours_enabled ?? false, (dto.tour_windows as TourWindow[]) ?? []);
```
Импорт сверху файла `listings.service.ts`:
`import { validateToursInput, TourWindow } from './tour-window';`

- [ ] **Step 5: Реализация — валидация в `update` (эффективные окна)**

Расширить `select` в `existing`-запросе `update`: добавить `toursEnabled: true, tourWindows: true`. Затем перед сборкой `data`:
```ts
    const effectiveEnabled = dto.tours_enabled ?? existing.toursEnabled;
    const effectiveWindows =
      (dto.tour_windows as TourWindow[]) ?? ((existing.tourWindows as unknown as TourWindow[]) ?? []);
    validateToursInput(effectiveEnabled, effectiveWindows);
```

- [ ] **Step 6: Реализация — detail response**

В `ListingDetailResponse` добавить:
```ts
  tours_enabled: boolean;
  tour_windows: TourWindow[];
```
В `LISTING_DETAIL_SELECT` добавить `toursEnabled: true,` и `tourWindows: true,`.
В построении detail-ответа (метод `findOne`/маппер) добавить:
```ts
      tours_enabled: row.toursEnabled,
      tour_windows: (row.tourWindows as unknown as TourWindow[]) ?? [],
```

- [ ] **Step 7: Запустить тесты листинга**

Run: `pnpm --filter @avino/api test -- listings.service`
Expected: PASS (новые tours-кейсы + старые без регрессий).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/listings/listings.service.ts apps/api/src/listings/listings.service.spec.ts
git commit -m "feat(tours): persist + expose tours_enabled/tour_windows on listings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Error code + notification producers

**Files:**
- Modify: `apps/api/src/common/dto/error-response.dto.ts`
- Modify: `apps/api/src/notifications/notifications.service.ts`

**Interfaces:**
- Produces:
  - `ApiErrorCode.TOUR_REQUEST_DUPLICATE`
  - `interface TourRequestNotificationData { tourRequestId; listingId; requestedDate; windowStart; windowEnd }`
  - `interface TourStatusChangedNotificationData { tourRequestId; listingId; status }`
  - `NotificationsService.queueTourRequest(tx, userId, data): Promise<void>` (тип `NEW_LEAD`, канал `IN_APP`)
  - `NotificationsService.queueTourStatusChanged(tx, userId, data): Promise<void>` (тип `TOUR_REQUEST_STATUS_CHANGED`, канал `IN_APP`)

- [ ] **Step 1: Добавить код ошибки** в `ApiErrorCode` (после `INVALID_STATUS_TRANSITION`)

```ts
  TOUR_REQUEST_DUPLICATE = 'TOUR_REQUEST_DUPLICATE',
```

- [ ] **Step 2: Написать падающий тест** в `notifications.service.spec.ts` (добавить кейсы)

```ts
it('queueTourRequest ставит NEW_LEAD владельцу', async () => {
  const tx = { notification: { create: jest.fn() } } as any;
  await service.queueTourRequest(tx, 'OWNER1', {
    tourRequestId: 'TR1', listingId: 'L1', requestedDate: '2026-06-25',
    windowStart: '07:00', windowEnd: '10:00',
  });
  expect(tx.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      userId: 'OWNER1', type: 'NEW_LEAD', channel: 'IN_APP',
      dataJson: expect.objectContaining({ tour_request_id: 'TR1', listing_id: 'L1' }),
    }),
  });
});

it('queueTourStatusChanged ставит TOUR_REQUEST_STATUS_CHANGED', async () => {
  const tx = { notification: { create: jest.fn() } } as any;
  await service.queueTourStatusChanged(tx, 'U2', { tourRequestId: 'TR1', listingId: 'L1', status: 'CONFIRMED' });
  expect(tx.notification.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      userId: 'U2', type: 'TOUR_REQUEST_STATUS_CHANGED', channel: 'IN_APP',
      dataJson: expect.objectContaining({ status: 'CONFIRMED' }),
    }),
  });
});
```

- [ ] **Step 3: Запустить — FAIL**

Run: `pnpm --filter @avino/api test -- notifications.service`
Expected: FAIL — методы не существуют.

- [ ] **Step 4: Реализовать data-интерфейсы** (рядом с `ChatMessageNotificationData`, ~строка 43)

```ts
/** data_json уведомления о новой заявке на тур (NEW_LEAD). */
export interface TourRequestNotificationData {
  tourRequestId: string;
  listingId: string;
  requestedDate: string;
  windowStart: string;
  windowEnd: string;
}

/** data_json уведомления о смене статуса заявки (TOUR_REQUEST_STATUS_CHANGED). */
export interface TourStatusChangedNotificationData {
  tourRequestId: string;
  listingId: string;
  status: string;
}
```

- [ ] **Step 5: Реализовать продюсеры** (после `queueChatMessage`)

```ts
  /** Уведомить владельца о новой заявке на тур (оживляем NEW_LEAD). Канал IN_APP. */
  async queueTourRequest(
    tx: Prisma.TransactionClient,
    userId: string,
    data: TourRequestNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.NEW_LEAD,
        channel: NotificationChannel.IN_APP,
        dataJson: {
          tour_request_id: data.tourRequestId,
          listing_id: data.listingId,
          requested_date: data.requestedDate,
          window_start: data.windowStart,
          window_end: data.windowEnd,
        },
      },
    });
  }

  /** Уведомить вторую сторону о смене статуса заявки. Канал IN_APP. */
  async queueTourStatusChanged(
    tx: Prisma.TransactionClient,
    userId: string,
    data: TourStatusChangedNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.TOUR_REQUEST_STATUS_CHANGED,
        channel: NotificationChannel.IN_APP,
        dataJson: {
          tour_request_id: data.tourRequestId,
          listing_id: data.listingId,
          status: data.status,
        },
      },
    });
  }
```

- [ ] **Step 6: Запустить — PASS**

Run: `pnpm --filter @avino/api test -- notifications.service`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/common/dto/error-response.dto.ts apps/api/src/notifications/notifications.service.ts
git commit -m "feat(tours): notification producers (NEW_LEAD + status changed) + dup error code

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: tour-requests DTOs + module scaffold

**Files:**
- Create: `apps/api/src/tour-requests/dto/create-tour-request.dto.ts`
- Create: `apps/api/src/tour-requests/dto/tour-request-status.dto.ts`
- Create: `apps/api/src/tour-requests/index.ts`
- Create: `apps/api/src/tour-requests/tour-requests.module.ts` (заглушка, наполнится в Task 8)
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces:
  - `CreateTourRequestDto { listing_id; requested_date; window_start; window_end; requester_name; requester_phone; message? }`
  - `enum TourRequestAction { CONFIRM, DECLINE, CANCEL }`, `TourRequestStatusDto { action: TourRequestAction }`
  - `TourRequestsModule`

- [ ] **Step 1: `create-tour-request.dto.ts`**

```ts
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Тело `POST /api/v1/tour-requests`. snake_case контракт. */
export class CreateTourRequestDto {
  @IsUUID()
  listing_id!: string;

  @Matches(DATE_RE, { message: 'requested_date must be YYYY-MM-DD' })
  requested_date!: string;

  @Matches(HHMM_RE, { message: 'window_start must be HH:MM' })
  window_start!: string;

  @Matches(HHMM_RE, { message: 'window_end must be HH:MM' })
  window_end!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  requester_name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  requester_phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
```

- [ ] **Step 2: `tour-request-status.dto.ts`**

```ts
import { IsEnum } from 'class-validator';

/** Действие владельца/покупателя над заявкой. */
export enum TourRequestAction {
  CONFIRM = 'CONFIRM',
  DECLINE = 'DECLINE',
  CANCEL = 'CANCEL',
}

/** Тело `PATCH /api/v1/tour-requests/:id/status`. */
export class TourRequestStatusDto {
  @IsEnum(TourRequestAction)
  action!: TourRequestAction;
}
```

- [ ] **Step 3: `index.ts` (barrel)**

```ts
export * from './tour-requests.module';
export * from './tour-requests.service';
```

- [ ] **Step 4: `tour-requests.module.ts` (наполнится в Task 8)**

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma';
import { NotificationsModule } from '../notifications/notifications.module';
import { TourRequestsController } from './tour-requests.controller';
import { TourRequestsService } from './tour-requests.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [TourRequestsController],
  providers: [TourRequestsService],
})
export class TourRequestsModule {}
```
> Если `NotificationsService` не экспортируется из `NotificationsModule` — добавить его в `exports` модуля уведомлений (проверить в Task 8 при первом импорте).

- [ ] **Step 5: Зарегистрировать модуль** в `app.module.ts` (в массив `imports`, рядом с `ChatModule`)

```ts
    TourRequestsModule,
```
(+ импорт сверху: `import { TourRequestsModule } from './tour-requests';`)

- [ ] **Step 6: Commit** (компиляция будет завершена в Task 8 вместе с service/controller)

```bash
git add apps/api/src/tour-requests/dto apps/api/src/tour-requests/index.ts apps/api/src/tour-requests/tour-requests.module.ts apps/api/src/app.module.ts
git commit -m "feat(tours): tour-requests DTOs + module scaffold

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: tour-requests service + controller (create + status + lists)

**Files:**
- Create: `apps/api/src/tour-requests/tour-requests.service.ts`
- Create: `apps/api/src/tour-requests/tour-requests.controller.ts`
- Create: `apps/api/src/tour-requests/tour-requests.service.spec.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts` (если нужно — `exports: [NotificationsService]`)

**Interfaces:**
- Consumes: `validateToursInput`/`windowOffered`/`TourWindow` (Task 3); `queueTourRequest`/`queueTourStatusChanged` (Task 6); DTOs/enum (Task 7); `TourRequestStatus` (`@prisma/client`).
- Produces:
  - `interface TourRequestResponse { id; listing_id; requester_id; status; requested_date; window_start; window_end; requester_name; requester_phone; message; created_at }`
  - `TourRequestsService.create(requesterId, dto): Promise<TourRequestResponse>`
  - `TourRequestsService.setStatus(userId, id, action): Promise<TourRequestResponse>`
  - `TourRequestsService.listOutgoing(userId, query): Promise<{ data; meta }>`
  - `TourRequestsService.listIncoming(userId, query): Promise<{ data; meta }>`
  - Контроллер: `POST /api/v1/tour-requests`, `GET /api/v1/tour-requests/outgoing`, `GET /api/v1/tour-requests/incoming`, `PATCH /api/v1/tour-requests/:id/status`.

- [ ] **Step 1: Написать падающие тесты** `tour-requests.service.spec.ts`

```ts
import { Test } from '@nestjs/testing';
import { TourRequestsService } from './tour-requests.service';
import { PrismaService } from '../prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { TourRequestAction } from './dto/tour-request-status.dto';

const future = (days: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const ACTIVE_LISTING = {
  id: 'L1', ownerId: 'OWNER1', status: 'ACTIVE', toursEnabled: true,
  tourWindows: [{ start: '07:00', end: '10:00' }],
};

describe('TourRequestsService', () => {
  let service: TourRequestsService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      listing: { findFirst: jest.fn() },
      tourRequest: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
    };
    notifications = { queueTourRequest: jest.fn(), queueTourStatusChanged: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        TourRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = mod.get(TourRequestsService);
  });

  const validDto = () => ({
    listing_id: 'L1', requested_date: future(2), window_start: '07:00', window_end: '10:00',
    requester_name: 'Tap Links', requester_phone: '+998901112233', message: 'hi',
  });

  it('создаёт заявку и ставит NEW_LEAD владельцу', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue(null);
    prisma.tourRequest.create.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'PENDING',
      requestedDate: new Date(`${validDto().requested_date}T00:00:00.000Z`),
      windowStart: '07:00', windowEnd: '10:00', requesterName: 'Tap Links',
      requesterPhone: '+998901112233', message: 'hi', createdAt: new Date(),
    });
    const res = await service.create('U2', validDto() as any);
    expect(res.status).toBe('PENDING');
    expect(notifications.queueTourRequest).toHaveBeenCalledWith(prisma, 'OWNER1', expect.objectContaining({ tourRequestId: 'TR1' }));
  });

  it('409 если tours выключены', async () => {
    prisma.listing.findFirst.mockResolvedValue({ ...ACTIVE_LISTING, toursEnabled: false });
    await expect(service.create('U2', validDto() as any)).rejects.toMatchObject({ status: 409 });
  });

  it('409 если объявление не ACTIVE', async () => {
    prisma.listing.findFirst.mockResolvedValue({ ...ACTIVE_LISTING, status: 'NEW' });
    await expect(service.create('U2', validDto() as any)).rejects.toMatchObject({ status: 409 });
  });

  it('422 если окно не предложено', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('U2', { ...validDto(), window_start: '12:00', window_end: '15:00' } as any))
      .rejects.toMatchObject({ status: 422 });
  });

  it('422 если дата в прошлом', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('U2', { ...validDto(), requested_date: future(-1) } as any))
      .rejects.toMatchObject({ status: 422 });
  });

  it('422 если дата дальше 30 дней', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('U2', { ...validDto(), requested_date: future(40) } as any))
      .rejects.toMatchObject({ status: 422 });
  });

  it('403 если владелец просит тур у себя', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    await expect(service.create('OWNER1', validDto() as any)).rejects.toMatchObject({ status: 403 });
  });

  it('409 при дубле PENDING', async () => {
    prisma.listing.findFirst.mockResolvedValue(ACTIVE_LISTING);
    prisma.tourRequest.findFirst.mockResolvedValue({ id: 'DUP' });
    await expect(service.create('U2', validDto() as any)).rejects.toMatchObject({ status: 409 });
  });

  it('владелец подтверждает PENDING → CONFIRMED + уведомление покупателю', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'PENDING', listing: { ownerId: 'OWNER1' } });
    prisma.tourRequest.update.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'CONFIRMED',
      requestedDate: new Date('2026-06-25T00:00:00.000Z'), windowStart: '07:00', windowEnd: '10:00',
      requesterName: 'Tap Links', requesterPhone: '+998901112233', message: null, createdAt: new Date(),
    });
    const res = await service.setStatus('OWNER1', 'TR1', TourRequestAction.CONFIRM);
    expect(res.status).toBe('CONFIRMED');
    expect(notifications.queueTourStatusChanged).toHaveBeenCalledWith(prisma, 'U2', expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('403 если не-владелец пытается подтвердить', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'PENDING', listing: { ownerId: 'OWNER1' } });
    await expect(service.setStatus('U2', 'TR1', TourRequestAction.CONFIRM)).rejects.toMatchObject({ status: 403 });
  });

  it('422 при недопустимом переходе (confirm уже DECLINED)', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'DECLINED', listing: { ownerId: 'OWNER1' } });
    await expect(service.setStatus('OWNER1', 'TR1', TourRequestAction.CONFIRM)).rejects.toMatchObject({ status: 422 });
  });

  it('покупатель отменяет CONFIRMED → CANCELLED + уведомление владельцу', async () => {
    prisma.tourRequest.findUnique.mockResolvedValue({ id: 'TR1', requesterId: 'U2', status: 'CONFIRMED', listing: { ownerId: 'OWNER1' } });
    prisma.tourRequest.update.mockResolvedValue({
      id: 'TR1', listingId: 'L1', requesterId: 'U2', status: 'CANCELLED',
      requestedDate: new Date('2026-06-25T00:00:00.000Z'), windowStart: '07:00', windowEnd: '10:00',
      requesterName: 'Tap Links', requesterPhone: '+998901112233', message: null, createdAt: new Date(),
    });
    const res = await service.setStatus('U2', 'TR1', TourRequestAction.CANCEL);
    expect(res.status).toBe('CANCELLED');
    expect(notifications.queueTourStatusChanged).toHaveBeenCalledWith(prisma, 'OWNER1', expect.objectContaining({ status: 'CANCELLED' }));
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @avino/api test -- tour-requests.service`
Expected: FAIL — модуль/сервис не существует.

- [ ] **Step 3: Реализовать `tour-requests.service.ts`**

```ts
import {
  ConflictException, ForbiddenException, HttpException, HttpStatus,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { ListingStatus, Prisma, TourRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { TourWindow, windowOffered } from '../listings/tour-window';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { TourRequestAction } from './dto/tour-request-status.dto';

const TOUR_HORIZON_DAYS = 30;

const TOUR_REQUEST_SELECT = {
  id: true, listingId: true, requesterId: true, status: true, requestedDate: true,
  windowStart: true, windowEnd: true, requesterName: true, requesterPhone: true,
  message: true, createdAt: true,
} satisfies Prisma.TourRequestSelect;

type TourRequestRow = Prisma.TourRequestGetPayload<{ select: typeof TOUR_REQUEST_SELECT }>;

export interface TourRequestResponse {
  id: string;
  listing_id: string;
  requester_id: string;
  status: TourRequestStatus;
  requested_date: string;
  window_start: string;
  window_end: string;
  requester_name: string;
  requester_phone: string;
  message: string | null;
  created_at: string;
}

export interface TourRequestListResponse {
  data: TourRequestResponse[];
  meta: { limit: number; total: number; next_cursor: string | null };
}

export interface TourRequestListQuery {
  limit?: number;
  cursor?: string;
}

@Injectable()
export class TourRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(requesterId: string, dto: CreateTourRequestDto): Promise<TourRequestResponse> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listing_id, status: { not: ListingStatus.DELETED } },
      select: { id: true, ownerId: true, status: true, toursEnabled: true, tourWindows: true },
    });
    if (!listing) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Listing not found' });
    }
    if (listing.status !== ListingStatus.ACTIVE || !listing.toursEnabled) {
      throw new ConflictException({ code: ApiErrorCode.LISTING_NOT_AVAILABLE, message: 'Listing is not available for tours' });
    }
    if (listing.ownerId === requesterId) {
      throw new ForbiddenException({ code: ApiErrorCode.FORBIDDEN, message: 'You cannot request a tour for your own listing' });
    }
    const windows = (listing.tourWindows as unknown as TourWindow[]) ?? [];
    if (!windowOffered(windows, dto.window_start, dto.window_end)) {
      throw new HttpException(
        { code: ApiErrorCode.VALIDATION_ERROR, message: 'Selected window is not offered for this listing' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const requestedDate = this.parseRequestedDate(dto.requested_date);

    const dup = await this.prisma.tourRequest.findFirst({
      where: {
        listingId: listing.id, requesterId, requestedDate,
        windowStart: dto.window_start, windowEnd: dto.window_end,
        status: TourRequestStatus.PENDING,
      },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException({ code: ApiErrorCode.TOUR_REQUEST_DUPLICATE, message: 'A pending tour request for this slot already exists' });
    }

    const created = await this.prisma.$transaction(async (tx) => {
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
    return this.toResponse(created);
  }

  async setStatus(userId: string, id: string, action: TourRequestAction): Promise<TourRequestResponse> {
    const tr = await this.prisma.tourRequest.findUnique({
      where: { id },
      select: { id: true, requesterId: true, status: true, listing: { select: { ownerId: true } } },
    });
    if (!tr) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Tour request not found' });
    }
    const isOwner = tr.listing.ownerId === userId;
    const isRequester = tr.requesterId === userId;

    let nextStatus: TourRequestStatus;
    let notifyUserId: string;

    if (action === TourRequestAction.CONFIRM || action === TourRequestAction.DECLINE) {
      if (!isOwner) {
        throw new ForbiddenException({ code: ApiErrorCode.FORBIDDEN, message: 'Only the listing owner can confirm or decline' });
      }
      if (tr.status !== TourRequestStatus.PENDING) throw this.invalidTransition(action, tr.status);
      nextStatus = action === TourRequestAction.CONFIRM ? TourRequestStatus.CONFIRMED : TourRequestStatus.DECLINED;
      notifyUserId = tr.requesterId;
    } else {
      // CANCEL
      if (!isRequester) {
        throw new ForbiddenException({ code: ApiErrorCode.FORBIDDEN, message: 'Only the requester can cancel' });
      }
      if (tr.status !== TourRequestStatus.PENDING && tr.status !== TourRequestStatus.CONFIRMED) {
        throw this.invalidTransition(action, tr.status);
      }
      nextStatus = TourRequestStatus.CANCELLED;
      notifyUserId = tr.listing.ownerId;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.tourRequest.update({ where: { id }, data: { status: nextStatus }, select: TOUR_REQUEST_SELECT });
      await this.notifications.queueTourStatusChanged(tx, notifyUserId, {
        tourRequestId: u.id, listingId: u.listingId, status: nextStatus,
      });
      return u;
    });
    return this.toResponse(updated);
  }

  async listOutgoing(userId: string, query: TourRequestListQuery): Promise<TourRequestListResponse> {
    return this.listBy({ requesterId: userId }, query);
  }

  async listIncoming(userId: string, query: TourRequestListQuery): Promise<TourRequestListResponse> {
    return this.listBy({ listing: { ownerId: userId } }, query);
  }

  private async listBy(where: Prisma.TourRequestWhereInput, query: TourRequestListQuery): Promise<TourRequestListResponse> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const cursor = this.decodeCursor(query.cursor);
    const cursorWhere: Prisma.TourRequestWhereInput | undefined = cursor
      ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] }
      : undefined;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tourRequest.findMany({
        where: cursorWhere ? { AND: [where, cursorWhere] } : where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit, select: TOUR_REQUEST_SELECT,
      }),
      this.prisma.tourRequest.count({ where }),
    ]);
    const last = rows.length === limit ? rows[rows.length - 1] : null;
    const next = last ? this.encodeCursor(last.createdAt.toISOString(), last.id) : null;
    return { data: rows.map((r) => this.toResponse(r)), meta: { limit, total, next_cursor: next } };
  }

  private parseRequestedDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + TOUR_HORIZON_DAYS);
    if (Number.isNaN(date.getTime()) || date < today || date > horizon) {
      throw new HttpException(
        { code: ApiErrorCode.VALIDATION_ERROR, message: `requested_date must be today or within ${TOUR_HORIZON_DAYS} days` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return date;
  }

  private invalidTransition(action: TourRequestAction, status: TourRequestStatus): HttpException {
    return new HttpException(
      { code: ApiErrorCode.INVALID_STATUS_TRANSITION, message: `Cannot ${action} a tour request in status ${status}` },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private encodeCursor(createdAt: string, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string): { createdAt: string; id: string } | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private toResponse(row: TourRequestRow): TourRequestResponse {
    return {
      id: row.id,
      listing_id: row.listingId,
      requester_id: row.requesterId,
      status: row.status,
      requested_date: row.requestedDate.toISOString().slice(0, 10),
      window_start: row.windowStart,
      window_end: row.windowEnd,
      requester_name: row.requesterName,
      requester_phone: row.requesterPhone,
      message: row.message,
      created_at: row.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 4: Реализовать `tour-requests.controller.ts`**

```ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { TourRequestStatusDto } from './dto/tour-request-status.dto';
import {
  TourRequestListResponse, TourRequestResponse, TourRequestsService,
} from './tour-requests.service';

/** TourRequestsController — заявки на тур (просмотр). Все роуты Bearer-only. */
@Controller({ path: 'tour-requests', version: '1' })
@UseGuards(JwtAuthGuard)
export class TourRequestsController {
  constructor(private readonly service: TourRequestsService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTourRequestDto,
  ): Promise<TourRequestResponse> {
    return this.service.create(userId, dto);
  }

  @Get('outgoing')
  outgoing(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TourRequestListResponse> {
    return this.service.listOutgoing(userId, { limit: limit ? Number(limit) : undefined, cursor });
  }

  @Get('incoming')
  incoming(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TourRequestListResponse> {
    return this.service.listIncoming(userId, { limit: limit ? Number(limit) : undefined, cursor });
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TourRequestStatusDto,
  ): Promise<TourRequestResponse> {
    return this.service.setStatus(userId, id, dto.action);
  }
}
```

- [ ] **Step 5: Убедиться, что `NotificationsModule` экспортирует `NotificationsService`**

Проверить `notifications.module.ts`: в `exports` должен быть `NotificationsService`. Если нет — добавить:
```ts
  exports: [NotificationsService],
```

- [ ] **Step 6: Запустить тесты сервиса**

Run: `pnpm --filter @avino/api test -- tour-requests.service`
Expected: PASS (все кейсы create/setStatus).

- [ ] **Step 7: Полная сборка + линт**

Run: `pnpm --filter @avino/api exec tsc --noEmit && pnpm --filter @avino/api lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/tour-requests apps/api/src/notifications/notifications.module.ts
git commit -m "feat(tours): tour-requests service + controller (create/status/lists)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: OpenAPI regen + полный прогон тестов

**Files:**
- Modify: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` (генерируются)

**Interfaces:**
- Consumes: всё из Tasks 1–8.

- [ ] **Step 1: Регенерировать OpenAPI**

Run: `pnpm --filter @avino/api openapi:export`
Expected: команда отрабатывает; `git status` показывает изменения в `openapi.public.json`/`openapi.internal.json` (новые DTO/enum-значения).
> Нужны 4 dummy-env для preview-mode (известная гоча) — см. memory `avino-api-docs-two-layers`.

- [ ] **Step 2: Прогнать весь unit-набор**

Run: `pnpm --filter @avino/api test`
Expected: PASS — 0 failed (включая новые tour-spec'и; ожидаемо ~+25 тестов).

- [ ] **Step 3: Линт всего api**

Run: `pnpm --filter @avino/api lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json
git commit -m "chore(tours): regenerate OpenAPI for tour-requests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Финальная проверка (перед PR)

- [ ] `pnpm --filter @avino/api test` — зелёно.
- [ ] `pnpm --filter @avino/api exec tsc --noEmit` — без ошибок.
- [ ] `pnpm --filter @avino/api lint` — без ошибок.
- [ ] `git diff --name-only origin/main...HEAD` — только `packages/shared`, `apps/api`, `docs/superpowers/*` (никаких `apps/web`/`apps/client`).
- [ ] OpenAPI в синке (повторный `openapi:export` не даёт diff).
- [ ] PR по формату `docs/CLAUDE.md` §6 (A–G), base = `main`, не пушить в main напрямую.

## Что НЕ входит в этот PR

- Клиент (`apps/client`): форма, модалка, кабинет «Мои туры» → **PR 2** (отдельный план).
- Интеграционные `*.int-spec.ts` против реальной БД (опционально, если требуется покрытие на уровне БД).
- Email/PUSH-доставка уведомлений (воркер-стаб, как у прочих типов).
