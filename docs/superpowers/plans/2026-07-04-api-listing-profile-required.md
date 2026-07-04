# PROFILE_INCOMPLETE guard на POST /listings (apps/api) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POST /api/v1/listings возвращает `422 PROFILE_INCOMPLETE`, если у автора не заполнены Имя, Фамилия и Телефон.

**Architecture:** Приватный метод-гейт в `ListingsService.create` перед транзакцией: читает `User` + `UserProfile`, проверяет предикат `first_name && last_name && (contact_phone || phone)` (все — trim-непустые). Новый код в `ApiErrorCode`. Миграций нет.

**Tech Stack:** NestJS, Prisma, Jest.

Spec: `docs/superpowers/specs/2026-07-04-listing-profile-required-design.md`

## Global Constraints

- Работать ТОЛЬКО в `apps/api/` (+ `docs/adr/`). Другие app-папки не трогать.
- Git НЕ трогать — коммиты делает контроллер.
- Гейтится только `create`; `update`, смена статуса, медиа — без изменений.
- Ошибка — по образцу `invalid()` в том же файле: `new HttpException({ code, message }, HttpStatus.UNPROCESSABLE_ENTITY)`.

---

### Task 1: Гейт полноты профиля в ListingsService.create

**Files:**
- Modify: `apps/api/src/common/dto/error-response.dto.ts` (enum `ApiErrorCode`)
- Modify: `apps/api/src/listings/listings.service.ts` (метод `create`, ~строка 453)
- Test: `apps/api/src/listings/listings.service.spec.ts`

**Interfaces:**
- Produces: `ApiErrorCode.PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE'`; `create()` бросает 422 c этим кодом при неполном профиле.

- [ ] **Step 1: Написать падающие тесты**

В `listings.service.spec.ts`:

1. В `beforeEach` в объект `prisma` (строка ~63) добавить дефолтный мок пользователя с ПОЛНЫМ профилем (чтобы существующие create-тесты остались зелёными):

```ts
      // Гейт полноты профиля (ADR-0125): create() читает автора с профилем.
      // Дефолт — полный профиль, чтобы остальные create-тесты не задевало.
      user: {
        findUnique: jest.fn().mockResolvedValue({
          phone: '+998901234567',
          profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: null },
        }),
      },
```

2. Новый `describe('create — profile completeness gate (ADR-0125)')` внутри верхнего `describe('ListingsService')`:

```ts
  describe('create — profile completeness gate (ADR-0125)', () => {
    it('rejects with 422 PROFILE_INCOMPLETE when first_name is missing', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: { firstName: null, lastName: 'Валиев', contactPhone: null },
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
      expect(prisma.listing.create).not.toHaveBeenCalled();
    });

    it('rejects with 422 PROFILE_INCOMPLETE when last_name is blank', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: { firstName: 'Али', lastName: '   ', contactPhone: null },
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
    });

    it('rejects with 422 PROFILE_INCOMPLETE when both phones are missing (Google user)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: null,
        profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: null },
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
    });

    it('rejects with 422 PROFILE_INCOMPLETE when the profile row is absent', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: null,
      });
      await expectCode(
        service.create(OWNER_ID, validCreate as any),
        ApiErrorCode.PROFILE_INCOMPLETE,
      );
    });

    it('creates when names are set and only account phone exists (phone-login user)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: '+998901234567',
        profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: null },
      });
      prisma.listing.create.mockResolvedValue(dbListing);
      await expect(service.create(OWNER_ID, validCreate as any)).resolves.toBeDefined();
    });

    it('creates when contact_phone is set and account phone is null (Google user)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        phone: null,
        profile: { firstName: 'Али', lastName: 'Валиев', contactPhone: '+998907654321' },
      });
      prisma.listing.create.mockResolvedValue(dbListing);
      await expect(service.create(OWNER_ID, validCreate as any)).resolves.toBeDefined();
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd apps/api && rtk test pnpm jest listings.service.spec -t "profile completeness"`
Expected: FAIL — `prisma.user` не вызывается, ошибка не бросается (и/или `ApiErrorCode.PROFILE_INCOMPLETE` не существует — TS-ошибка).

- [ ] **Step 3: Реализация**

1. `apps/api/src/common/dto/error-response.dto.ts` — в enum `ApiErrorCode` добавить (рядом с 4xx-кодами, например после `INVALID_STATUS_TRANSITION`):

```ts
  PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE',
```

2. `apps/api/src/listings/listings.service.ts` — первой строкой `create()` (перед `validateToursInput`):

```ts
    await this.ensureProfileComplete(ownerId);
```

и приватный метод рядом с `ensureSellerRole`:

```ts
  /**
   * Создавать объявление можно только с заполненными Имя/Фамилия/Телефон
   * (ADR-0125): контакт-блок карточки строится из профиля (buildContact),
   * без них объявление публикуется «безымянным». Телефон — contact_phone
   * профиля или телефон аккаунта (та же логика, что buildContact).
   */
  private async ensureProfileComplete(ownerId: string): Promise<void> {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: {
        phone: true,
        profile: {
          select: { firstName: true, lastName: true, contactPhone: true },
        },
      },
    });
    const firstName = owner?.profile?.firstName?.trim();
    const lastName = owner?.profile?.lastName?.trim();
    const phone = owner?.profile?.contactPhone?.trim() || owner?.phone?.trim();
    if (!firstName || !lastName || !phone) {
      throw new HttpException(
        {
          code: ApiErrorCode.PROFILE_INCOMPLETE,
          message:
            'First name, last name and phone are required to create a listing',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
```

`HttpException`/`HttpStatus` уже импортированы в файле (используются в `invalid()` смены статуса); если нет — добавить в импорт из `@nestjs/common`.

- [ ] **Step 4: Тесты зелёные**

Run: `cd apps/api && rtk test pnpm jest listings.service.spec`
Expected: PASS, все существующие create/update-тесты тоже зелёные.

- [ ] **Step 5: Полная верификация api**

Run: `cd apps/api && rtk test pnpm jest && rtk lint pnpm lint && rtk tsc pnpm exec tsc --noEmit`
Expected: 0 failed (int-spec `*.int-spec.ts` не в прогоне — им нужен живой PG), lint 0 errors, tsc clean.

---

### Task 2: OpenAPI regen + ADR-0125

**Files:**
- Create: `docs/adr/ADR-0125-listing-requires-complete-profile.md`
- Modify: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` (regen)

**Interfaces:**
- Consumes: `ApiErrorCode.PROFILE_INCOMPLETE` из Task 1.

- [ ] **Step 1: Регенерация OpenAPI**

Run: `cd apps/api && rtk npm run openapi:export`
Expected: оба json обновлены (enum `ApiErrorCode` в схеме ошибок получил `PROFILE_INCOMPLETE`). Если diff пуст — это ок (enum может не сериализоваться в схему), зафиксировать факт в отчёте.

- [ ] **Step 2: ADR-0125**

Создать `docs/adr/ADR-0125-listing-requires-complete-profile.md`:

```markdown
# ADR-0125 — Создание объявления требует заполненного профиля (Имя/Фамилия/Телефон)

## Status

Accepted

## Date

2026-07-04

## Context

Вход через Google даёт аккаунт без телефона; вход по телефону — без имени и
фамилии. Такие пользователи создавали объявления с пустым контакт-блоком:
`buildContact` берёт имя из профиля, телефон — `contact_phone ?? users.phone`,
и покупателю не к кому обращаться.

## Decision

`POST /api/v1/listings` проверяет полноту профиля автора перед созданием:

- `user_profiles.first_name` — непустая строка (trim);
- `user_profiles.last_name` — непустая строка (trim);
- `user_profiles.contact_phone` ИЛИ `users.phone` — непустая строка (trim) —
  та же логика фолбэка, что в публичном контакт-блоке.

При провале — `422 { code: PROFILE_INCOMPLETE }` (новый `ApiErrorCode`).
Клиент (apps/client) зеркалит предикат гейтом «Контактные данные» в визарде
/sell/new и заполняет поля через существующий `PATCH /users/me/profile`
(телефон пишется в `contact_phone` без OTP-верификации — это контакт для
связи, не логин-идентификатор).

Гейтится только создание. Редактирование/смена статуса существующих
объявлений не блокируются. Миграций нет — поля существовали.

## Consequences

Positive:
- У каждого нового объявления гарантированно есть имя и телефон контакта.
- Enforcement на API — совместимо с будущим Flutter-клиентом.

Negative / trade-offs:
- Телефон Google-пользователя не верифицируется OTP (осознанно, Фаза 2).
- Старые объявления «безымянных» авторов остаются как есть.

## Related files

- apps/api/src/listings/listings.service.ts (ensureProfileComplete)
- apps/api/src/common/dto/error-response.dto.ts (PROFILE_INCOMPLETE)
- apps/client/src/features/listing-new/ (клиентский гейт, отдельный PR)

## Related task

- Спека: docs/superpowers/specs/2026-07-04-listing-profile-required-design.md
```

- [ ] **Step 3: Верификация**

Run: `cd apps/api && rtk git status` (через контроллера) — изменены только файлы задач 1–2.
