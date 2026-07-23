# Счётчик звонков по объявлению — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Считать намерение позвонить (клик по `tel:`-ссылке в карточке контакта) и показывать счётчик звонков владельцу и админу.

**Architecture:** Полное зеркало существующего паттерна просмотров (`viewsCount` / `POST /listings/:id/view`). Новое поле БД `callsCount`, эндпоинт `POST /listings/:id/call` с инкрементом только для `ACTIVE`, клиентская RTK-мутация вешается на клик по раскрытой `tel:`-ссылке (fire-and-forget), значение прокидывается в «Мои объявления» (apps/client) и в детали админки (apps/web).

**Tech Stack:** NestJS + Prisma (PostgreSQL) на бэке; Next.js + RTK Query + next-intl на фронте; Jest (api), Vitest + Testing Library (client).

## Global Constraints

- Ответы API — `snake_case` (`calls_count`), внутренние Prisma-поля — `camelCase` (`callsCount`). Копировать разделение точно по образцу `views_count`/`viewsCount`.
- Инкремент **без дедупликации**: каждый вызов эндпоинта = +1 (решение спеки 2026-07-03).
- Эндпоинт публичный (без Bearer), `204` без тела; несуществующее/не-`ACTIVE` объявление → `404`.
- Клиент при вызове мутации **проглатывает** ошибки (404/сеть) и **не блокирует** навигацию `tel:` (без `await`, без `preventDefault`).
- Миграции в этом репозитории — рукописный SQL (см. `apps/api/prisma/migrations/20260702040000_add_listing_views_count/`), НЕ автоген через `prisma migrate dev`.
- Каждый агент работает в ОДНОЙ app-папке за задачу (CLAUDE.md). Git-коммиты — часть плана.

---

### Task 1: Поле БД `callsCount` + миграция (apps/api)

**Files:**
- Modify: `apps/api/prisma/schema.prisma:464` (модель `Listing`)
- Create: `apps/api/prisma/migrations/20260703000000_add_listing_calls_count/migration.sql`

**Interfaces:**
- Produces: Prisma-поле `Listing.callsCount: Int` (маппинг колонки `calls_count`), доступное в `select`/`$executeRaw` для Task 2.

- [ ] **Step 1: Добавить поле в схему**

В `apps/api/prisma/schema.prisma`, сразу после строки `viewsCount` (`:464`), добавить:

```prisma
  viewsCount         Int                                    @default(0) @map("views_count")
  callsCount         Int                                    @default(0) @map("calls_count")
```

- [ ] **Step 2: Создать SQL-миграцию**

Создать файл `apps/api/prisma/migrations/20260703000000_add_listing_calls_count/migration.sql`:

```sql
-- Счётчик намерений позвонить (клик по tel:-ссылке в карточке контакта).
-- Простой инкремент без дедупликации (спека 2026-07-03), по образцу views_count.
ALTER TABLE "listings" ADD COLUMN "calls_count" INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 3: Применить миграцию и перегенерить клиент**

Из `apps/api`:

Run: `rtk prisma migrate deploy && rtk prisma generate`
Expected: миграция `20260703000000_add_listing_calls_count` применена; `prisma generate` завершается без ошибок, тип `Listing` содержит `callsCount`.

- [ ] **Step 4: Проверить типизацию**

Run (из `apps/api`): `rtk tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260703000000_add_listing_calls_count/migration.sql
git commit -m "feat(api): поле listings.calls_count + миграция"
```

---

### Task 2: Эндпоинт `POST /listings/:id/call` + отдача `calls_count` (apps/api)

**Files:**
- Modify: `apps/api/src/listings/listings.service.ts` (метод после `registerView:786`; select'ы `:280`, `:371`; маппинги `:913`, `:1006`)
- Modify: `apps/api/src/listings/listings.controller.ts` (после `registerView:117`)
- Test: `apps/api/src/listings/listings.service.spec.ts` (после `describe('registerView'):867`)

**Interfaces:**
- Consumes: `Listing.callsCount` из Task 1.
- Produces: HTTP `POST /api/v1/listings/:id/call` → `204`; поле `calls_count: number` в ответах `findOne`/detail; метод `ListingsService.registerCall(listingId: string): Promise<void>`.

- [ ] **Step 1: Написать падающий тест**

В `apps/api/src/listings/listings.service.spec.ts`, сразу после блока `describe('registerView', …)` (закрывается на `:867`), добавить:

```typescript
  describe('registerCall', () => {
    it('инкрементит calls_count raw-UPDATE, резолвится без ошибки', async () => {
      prisma.$executeRaw.mockResolvedValue(1);

      await expect(service.registerCall(LISTING_ID)).resolves.toBeUndefined();

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('404 когда листинг не найден или не ACTIVE', async () => {
      prisma.$executeRaw.mockResolvedValue(0);

      await expectCode(service.registerCall(LISTING_ID), ApiErrorCode.NOT_FOUND);
    });
  });
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run (из `apps/api`): `rtk test jest -- --testPathPattern listings.service.spec -t registerCall`
Expected: FAIL — `service.registerCall is not a function`.

- [ ] **Step 3: Реализовать `registerCall` в сервисе**

В `apps/api/src/listings/listings.service.ts`, сразу после метода `registerView` (закрывается на `:786`), добавить:

```typescript
  async registerCall(listingId: string): Promise<void> {
    const count = await this.prisma.$executeRaw`
      UPDATE listings SET calls_count = calls_count + 1
      WHERE id = ${listingId}::uuid AND status = 'ACTIVE'
    `;
    if (count === 0) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
  }
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run (из `apps/api`): `rtk test jest -- --testPathPattern listings.service.spec -t registerCall`
Expected: PASS (оба кейса).

- [ ] **Step 5: Добавить поле в select'ы и маппинги ответа**

В `apps/api/src/listings/listings.service.ts` в обоих `select`-объектах, где есть `viewsCount: true` (`:280` и `:371`), добавить рядом строку:

```typescript
  viewsCount: true,
  callsCount: true,
```

В обоих местах маппинга ответа, где есть `views_count: listing.viewsCount` (`:913` и `:1006`), добавить рядом:

```typescript
      views_count: listing.viewsCount,
      calls_count: listing.callsCount,
```

- [ ] **Step 6: Добавить эндпоинт в контроллер**

В `apps/api/src/listings/listings.controller.ts`, сразу после метода `registerView` (закрывается на `:117`), добавить:

```typescript
  /**
   * `POST /api/v1/listings/:id/call` — засчитать намерение позвонить (клик по
   * tel:-ссылке). Публичный (гость тоже считается), 204 без тела;
   * несуществующий/не-ACTIVE → 404.
   */
  @Post(':id/call')
  @HttpCode(204)
  registerCall(
    @Param('id', ParseUUIDPipe) listingId: string,
  ): Promise<void> {
    return this.listingsService.registerCall(listingId);
  }
```

- [ ] **Step 7: Прогнать весь spec листингов + типизацию**

Run (из `apps/api`): `rtk test jest -- --testPathPattern listings.service.spec`
Expected: PASS (весь файл, включая старые кейсы, где маппинг теперь содержит `calls_count`).

Run (из `apps/api`): `rtk tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/listings/listings.service.ts apps/api/src/listings/listings.controller.ts apps/api/src/listings/listings.service.spec.ts
git commit -m "feat(api): POST /listings/:id/call + отдача calls_count"
```

---

### Task 3: Клиентский слой API — мутация + типы (apps/client)

**Files:**
- Modify: `apps/client/src/store/api/listingEditApi.ts` (мутация после `registerListingView:154`; экспорт хука `:164`; поле `calls_count?` рядом с `views_count?:67`)
- Modify: `apps/client/src/lib/api/listings.ts` (поле в двух типах `:86`, `:152`; маппинг `:307`)
- Modify: `apps/client/src/lib/mock/types.ts` (`:144`)

**Interfaces:**
- Produces: RTK-хук `useRegisterListingCallMutation()` → `[trigger: (id: string) => { unwrap(): Promise<void> }, …]`; поле `Listing.callsCount?: number` (mock/types); поле `calls_count?: number` в API-типах ответа.

- [ ] **Step 1: Добавить мутацию и поле в `listingEditApi.ts`**

В `apps/client/src/store/api/listingEditApi.ts`, сразу после мутации `registerListingView` (`:152-154`), добавить (внутри `endpoints`):

```typescript
    /**
     * Зарегистрировать намерение позвонить. POST /listings/:id/call → 204.
     * Публичный (без Bearer), без тела; 404 у неопубликованного — вызывающий
     * должен проглотить ошибку (спека 2026-07-03).
     */
    registerListingCall: build.mutation<void, string>({
      query: (id) => ({ url: `/listings/${id}/call`, method: 'POST' }),
    }),
```

В блоке экспорта хуков, после `useRegisterListingViewMutation,` (`:164`), добавить:

```typescript
  useRegisterListingViewMutation,
  useRegisterListingCallMutation,
```

Рядом с полем `views_count?: number;` (`:67`) добавить `calls_count?: number;`.

- [ ] **Step 2: Добавить `calls_count?` в типы ответа `lib/api/listings.ts`**

В `apps/client/src/lib/api/listings.ts` в обоих типах, где есть `views_count?: number;` (`:86` и `:152`), добавить следом:

```typescript
  views_count?: number;
  calls_count?: number;
```

- [ ] **Step 3: Добавить маппинг `callsCount`**

В `apps/client/src/lib/api/listings.ts`, сразу после строки `viewsCount: (api as ApiSearchItem | ApiListingDetail).views_count ?? undefined,` (`:307`), добавить:

```typescript
    viewsCount: (api as ApiSearchItem | ApiListingDetail).views_count ?? undefined,
    callsCount: (api as ApiSearchItem | ApiListingDetail).calls_count ?? undefined,
```

- [ ] **Step 4: Добавить поле в `mock/types.ts`**

В `apps/client/src/lib/mock/types.ts`, сразу после блока `viewsCount?` (`:143-144`), добавить:

```typescript
  /** Кол-во просмотров (только в ответах API). */
  viewsCount?: number;
  /** Кол-во намерений позвонить (только в ответах API). */
  callsCount?: number;
```

- [ ] **Step 5: Проверить типизацию**

Run (из `apps/client`): `rtk tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/store/api/listingEditApi.ts apps/client/src/lib/api/listings.ts apps/client/src/lib/mock/types.ts
git commit -m "feat(client): RTK-мутация registerListingCall + поле callsCount"
```

---

### Task 4: Счёт звонка по клику на `tel:`-ссылку (apps/client)

**Files:**
- Modify: `apps/client/src/features/detail/ContactCard.tsx` (импорт хука; вызов в `onClick` на `tel:`-ссылке `:160-165`)
- Test: `apps/client/src/features/detail/ContactCard.test.tsx` (мок `listingEditApi`; новый кейс)

**Interfaces:**
- Consumes: `useRegisterListingCallMutation` из Task 3.

- [ ] **Step 1: Написать падающий тест**

В `apps/client/src/features/detail/ContactCard.test.tsx` добавить hoisted-спай и мок модуля. Рядом с существующим `vi.hoisted` (`:19-22`) расширить:

```typescript
const { createSpy, pushSpy, registerCallSpy } = vi.hoisted(() => ({
  createSpy: vi.fn(),
  pushSpy: vi.fn(),
  registerCallSpy: vi.fn(),
}));
```

После мока `@/store/api/chatApi` (`:80-82`) добавить мок:

```typescript
vi.mock('@/store/api/listingEditApi', () => ({
  useRegisterListingCallMutation: () => [registerCallSpy, { isLoading: false }],
}));
```

В `beforeEach` (рядом с `createSpy.mockReturnValue(...)`, `:120`) добавить:

```typescript
    registerCallSpy.mockReturnValue({ unwrap: () => Promise.resolve() });
```

Добавить новый кейс в `describe('ContactCard', …)`:

```typescript
  it('клик по раскрытой tel:-ссылке засчитывает звонок', async () => {
    const user = userEvent.setup();
    render(<ContactCard listing={makeListing('+998 90 123-45-67')} />);
    await user.click(screen.getByText('Показать телефон'));
    await user.click(screen.getByRole('link', { name: /\+998 90 123-45-67/ }));
    expect(registerCallSpy).toHaveBeenCalledWith('lst-1');
  });

  it('ошибка мутации звонка не ломает tel:-ссылку', async () => {
    registerCallSpy.mockReturnValue({
      unwrap: () => Promise.reject(new Error('network')),
    });
    const user = userEvent.setup();
    render(<ContactCard listing={makeListing('+998 90 123-45-67')} />);
    await user.click(screen.getByText('Показать телефон'));
    const link = screen.getByRole('link', { name: /\+998 90 123-45-67/ });
    await user.click(link);
    expect(link).toHaveAttribute('href', 'tel:+99890123-45-67');
  });
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run (из `apps/client`): `rtk vitest run ContactCard`
Expected: FAIL — `registerCallSpy` не вызван (мутация ещё не подключена).

- [ ] **Step 3: Подключить мутацию в `ContactCard.tsx`**

Добавить импорт рядом с `useCreateThreadMutation` (`:22`):

```typescript
import { useCreateThreadMutation } from '@/store/api/chatApi';
import { useRegisterListingCallMutation } from '@/store/api/listingEditApi';
```

Внутри компонента, рядом с объявлением `createThread` (`:41`), добавить:

```typescript
  const [registerCall] = useRegisterListingCallMutation();
```

Заменить `tel:`-ссылку (`:159-165`) — добавить `onClick` (fire-and-forget, ошибку глотаем, навигацию не блокируем):

```tsx
            <a
              href={`tel:${agent.phone.replace(/\s/g, '')}`}
              onClick={() => {
                // Намерение позвонить (спека 2026-07-03). Не ждём ответа и не
                // блокируем набор номера; 404/сеть — глотаем.
                void registerCall(listing.id)
                  .unwrap()
                  .catch(() => {});
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-ink px-7 py-4 text-base font-bold tracking-[-0.01em] text-white transition-colors hover:bg-black"
            >
              <Phone size={18} /> {agent.phone}
            </a>
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run (из `apps/client`): `rtk vitest run ContactCard`
Expected: PASS (все кейсы файла, включая старые).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/detail/ContactCard.tsx apps/client/src/features/detail/ContactCard.test.tsx
git commit -m "feat(client): счёт звонка по клику на tel:-ссылку"
```

---

### Task 5: Показ счётчика в «Мои объявления» + i18n (apps/client)

**Files:**
- Modify: `apps/client/src/features/account/MyListings.tsx` (импорт `Phone`; блок статов `:129-147`)
- Modify: `apps/client/messages/en.json` (`:850`), `apps/client/messages/ru.json` (`:850`), `apps/client/messages/uz.json` (соответствующий `myListings.stats`)

**Interfaces:**
- Consumes: `Listing.callsCount?` из Task 3; i18n-ключ `myListings.stats.calls`.

- [ ] **Step 1: Добавить i18n-ключ `calls`**

В `apps/client/messages/en.json`, в блоке `myListings.stats` (`:848-851`), добавить ключ (не забыть запятую после `likes`):

```json
      "stats": {
        "views": "Views: {count}",
        "likes": "Favorited: {count}",
        "calls": "Calls: {count}"
      }
```

В `apps/client/messages/ru.json` (тот же блок, `:849-850`):

```json
        "views": "Просмотров: {count}",
        "likes": "В избранном: {count}",
        "calls": "Звонков: {count}"
```

В `apps/client/messages/uz.json` — найти блок `myListings.stats` (ключи `views`/`likes`) и добавить по образцу:

```json
        "calls": "Qo'ng'iroqlar: {count}"
```

- [ ] **Step 2: Добавить иконку `Phone` в импорт**

В `apps/client/src/features/account/MyListings.tsx`, в списке импортов из `lucide-react` (где уже `Eye`, `:19`), добавить `Phone`:

```typescript
  Eye,
  Phone,
```

- [ ] **Step 3: Расширить блок статов**

В `apps/client/src/features/account/MyListings.tsx` заменить условие показа блока (`:129`), добавив `callsCount`:

```tsx
        {(l.viewsCount != null || l.likesCount != null || l.callsCount != null) && (
```

Внутри блока, сразу после `span` с `likesCount` (закрывается на `:146`), добавить `span` для звонков:

```tsx
            {l.callsCount != null && (
              <span
                className="inline-flex items-center gap-1"
                title={t('myListings.stats.calls', { count: l.callsCount })}
              >
                <Phone size={13} strokeWidth={2} /> {l.callsCount}
              </span>
            )}
```

- [ ] **Step 4: Проверить сборку и типизацию**

Run (из `apps/client`): `rtk tsc --noEmit`
Expected: без ошибок.

Run (из `apps/client`): `rtk vitest run MyListings`
Expected: PASS, если тест-файл существует; иначе «no test files» — это ок.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/account/MyListings.tsx apps/client/messages/en.json apps/client/messages/ru.json apps/client/messages/uz.json
git commit -m "feat(client): счётчик звонков в «Мои объявления» + i18n"
```

---

### Task 6: Показ счётчика в админке (apps/web) — только detail-путь

> **Ревизия контроллера (2026-07-03):** админ-деталь берётся через
> `useGetAdminListingQuery` → `GET /listings/:id` → `toDetailResponse` (Task 2
> уже отдаёт там `calls_count`). Админ-**список** идёт через отдельный
> `moderationService.listListings`, который `calls_count` НЕ отдаёт, и на
> странице списка звонки не показываются. Поэтому трогаем ТОЛЬКО detail-путь
> (detail-тип ответа + detail-адаптер + страница детали). List-тип (`:112`) и
> list-адаптер (`:150`) НЕ трогаем — там `calls_count` был бы мёртвым DASH.

**Files:**
- Modify: `apps/web/src/store/api/adminTypes.ts` (detail-тип ответа, рядом с `views_count?` на `:213`)
- Modify: `apps/web/src/lib/mock/types.ts` (`:96`)
- Modify: `apps/web/src/lib/adapters/listings.ts` (detail-адаптер `detailToAdminListing`, рядом с `views: d.views_count` на `:202`)
- Modify: `apps/web/src/app/admin/listings/[id]/page.tsx` (`:325`)

**Interfaces:**
- Consumes: поле detail-ответа API `calls_count?: number` (Task 2, `toDetailResponse`).
- Produces: UI-поле `calls?: number | string` в admin-типе листинга.

- [ ] **Step 1: Добавить `calls_count?` в detail-тип ответа админки**

В `apps/web/src/store/api/adminTypes.ts`, в типе detail-ответа (где `views_count?: number;` соседствует с `likes_count?`, `:212-213`), добавить следом:

```typescript
  /** Счётчик просмотров. `optional` — мягкая деградация к «—» на старом бэкенде. */
  views_count?: number;
  /** Счётчик звонков (намерений позвонить). `optional` — мягкая деградация. */
  calls_count?: number;
```

Список-тип (`AdminListItem`, `:112`) НЕ трогать — админ-список не отдаёт этот счётчик.

- [ ] **Step 2: Добавить UI-поле `calls` в mock-тип**

В `apps/web/src/lib/mock/types.ts`, сразу после поля `likes?` (`:95-96`), добавить:

```typescript
  /** Число «нравится» (только из API-детали); «—» без источника. */
  likes?: number | string;
  /** Число звонков (только из API-детали); «—» без источника. */
  calls?: number | string;
```

- [ ] **Step 3: Прокинуть `calls` в detail-адаптере**

В `apps/web/src/lib/adapters/listings.ts`, в функции `detailToAdminListing`, сразу после строки `views: d.views_count ?? DASH,` (`:202`) добавить:

```typescript
    views: d.views_count ?? DASH,
    calls: d.calls_count ?? DASH,
```

List-адаптер (`listingRowToAdminListing`, строка с `views: r.views_count`, `:150`) НЕ трогать.

- [ ] **Step 4: Показать звонки в детали объявления**

В `apps/web/src/app/admin/listings/[id]/page.tsx`, в массиве статов (`:325`), добавить пару `['Звонки', listing.calls ?? '—']`:

```tsx
              {([['Просмотры', listing.views], ['Звонки', listing.calls ?? '—'], ['Понравилось', listing.likes ?? '—'], ['Статус', STATUS_LABEL[status]]] as [string, string | number][]).map(([k, v]) => (
```

- [ ] **Step 5: Проверить типизацию**

Run (из `apps/web`): `rtk tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store/api/adminTypes.ts apps/web/src/lib/mock/types.ts apps/web/src/lib/adapters/listings.ts apps/web/src/app/admin/listings/[id]/page.tsx
git commit -m "feat(web): счётчик звонков в детали объявления админки"
```

---

## Порядок выполнения

Task 1 → Task 2 (зависят: поле → эндпоинт/select).
Task 3 → Task 4 и Task 5 (зависят: мутация/тип → потребители).
Task 6 независим (apps/web имеет собственные типы), может идти параллельно после Task 2 (нужен контракт `calls_count` в ответе).
