# Own-listing owner view on detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Когда залогиненный пользователь открывает СВОЁ объявление, detail-страница показывает плашку «Это ваше объявление» с кнопками управления вместо блока «показать телефон / написать».

**Architecture:** Чисто клиентское изменение (`apps/client`). `owner_id` уже приходит в ответе detail — прокидываем его в UI-тип `Listing` и сравниваем с id текущего пользователя из redux прямо в `ContactCard`. Owner-ветка — ранний возврат компонента после всех хуков.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Redux Toolkit, next-intl, Tailwind, Vitest + React Testing Library.

## Global Constraints

- Только app-папка `apps/client` (граница задачи — одна app-папка).
- Весь user-facing текст — через i18n (`next-intl`), 3 локали: `ru`, `uz`, `en`. Никаких хардкод-строк в JSX.
- НЕ трогать git до явного указания; финальный коммит — Conventional Commits.
- Тип `Listing.ownerId` опционален (`string | undefined`): у карточек поиска owner отсутствует by design.
- Сравнение владельца: `isAuthenticated && Boolean(currentUser?.id) && currentUser?.id === listing.ownerId` (никогда не считать владельцем при пустом id с обеих сторон).

---

### Task 1: Owner view на detail (тип + маппинг + компонент + i18n + тесты)

**Files:**
- Modify: `apps/client/src/lib/mock/types.ts:155` (добавить поле `ownerId` в `interface Listing`)
- Modify: `apps/client/src/lib/api/listings.ts:266-305` (заполнить `ownerId` в `mapListing`)
- Modify: `apps/client/src/features/detail/ContactCard.tsx` (импорты + `isOwner` + owner-ветка)
- Modify: `apps/client/messages/ru.json:368`, `apps/client/messages/uz.json:368`, `apps/client/messages/en.json:368` (3 ключа в `listing.contact`)
- Test: `apps/client/src/features/detail/ContactCard.test.tsx` (селектор-зависимый мок + `Link`-стаб + 3 теста)

**Interfaces:**
- Consumes: `selectCurrentUser` (`(s) => s.auth.user`, возвращает `MeResponse | null` с полем `id: string`) и `selectIsAuthenticated` из `@/store/slices/authSlice`; `Link` из `@/i18n/navigation`; `Button` (`asChild`, `variant`, `size`) из `@/components/ui/button`.
- Produces: расширенный тип `Listing` с `ownerId?: string`; маршруты управления `/sell/${id}/edit` и `/account/my-listings`.

- [ ] **Step 1: Добавить поле `ownerId` в тип `Listing`**

В `apps/client/src/lib/mock/types.ts`, сразу после строки `  agent: ListingAgent;` (внутри `interface Listing`, ~строка 155) и её комментария, добавить:

```ts
  /** Автор/контакт. */
  agent: ListingAgent;

  /** UUID владельца объявления (только в detail-ответе; для пометки «моё объявление»). */
  ownerId?: string;
```

(Строку `agent: ListingAgent;` оставить как есть — добавляется только блок `ownerId` ниже неё.)

- [ ] **Step 2: Заполнить `ownerId` в `mapListing`**

В `apps/client/src/lib/api/listings.ts`, в возвращаемом объекте `mapListing` (после `agent,` на ~строке 299) добавить поле:

```ts
    photos: toPhotos(api),
    agent,
    // owner_id есть только в detail-ответе (ApiListingDetail); у карточки поиска — undefined.
    ownerId: detail?.owner_id,

    createdAt: api.created_at,
```

(Существующие строки `photos`, `agent`, `createdAt` не меняются — между `agent,` и `createdAt:` вставляется строка `ownerId`.)

- [ ] **Step 3: Добавить i18n-ключи в три локали**

В `apps/client/messages/ru.json` заменить хвост блока `listing.contact`:

```json
      "requestTour": "Запросить тур",
      "loginToTour": "Войдите, чтобы запросить тур"
    },
```

на:

```json
      "requestTour": "Запросить тур",
      "loginToTour": "Войдите, чтобы запросить тур",
      "ownerNotice": "Это ваше объявление",
      "editListing": "Редактировать",
      "manageListings": "Мои объявления"
    },
```

В `apps/client/messages/uz.json` — аналогично, заменить:

```json
      "requestTour": "Tur so'rash",
      "loginToTour": "Tur so'rash uchun tizimga kiring"
    },
```

на:

```json
      "requestTour": "Tur so'rash",
      "loginToTour": "Tur so'rash uchun tizimga kiring",
      "ownerNotice": "Bu sizning e'loningiz",
      "editListing": "Tahrirlash",
      "manageListings": "Mening e'lonlarim"
    },
```

В `apps/client/messages/en.json` — заменить:

```json
      "requestTour": "Request a tour",
      "loginToTour": "Sign in to request a tour"
    },
```

на:

```json
      "requestTour": "Request a tour",
      "loginToTour": "Sign in to request a tour",
      "ownerNotice": "This is your listing",
      "editListing": "Edit listing",
      "manageListings": "My listings"
    },
```

- [ ] **Step 4: Обновить моки в тесте (селектор-зависимый store + Link-стаб)**

В `apps/client/src/features/detail/ContactCard.test.tsx`:

Заменить объявление управляемого состояния авторизации (строка `let mockAuthed = false;`) на пару переменных:

```tsx
// Управляемое состояние авторизации + текущий пользователь для useAppSelector.
let mockAuthed = false;
let mockUser: { id: string } | null = null;
```

Заменить мок навигации (`vi.mock('@/i18n/navigation', ...)`) на версию с `Link`-стабом:

```tsx
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));
```

Заменить мок `@/store/hooks` (сейчас `useAppSelector: () => mockAuthed`) на селектор-зависимый — он прогоняет реальные селекторы по поддельному стейту, чтобы и `selectIsAuthenticated`, и `selectCurrentUser` работали:

```tsx
// Прогоняем реальные селекторы (selectIsAuthenticated / selectCurrentUser) по
// поддельному стейту — так один мок обслуживает оба useAppSelector в компоненте.
vi.mock('@/store/hooks', () => ({
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      auth: {
        accessToken: mockAuthed ? 'access' : null,
        refreshToken: mockAuthed ? 'refresh' : null,
        user: mockUser,
      },
    }),
}));
```

Обновить фабрику `makeListing`, добавив второй аргумент `ownerId`:

```tsx
function makeListing(phone?: string, ownerId?: string): Listing {
  return {
    id: 'lst-1',
    tx: 'SALE',
    type: 'APARTMENT',
    promo: 'none',
    price: 95000,
    currency: 'USD',
    title: 'Тестовое объявление',
    desc: '',
    address: '',
    district: '',
    photos: [],
    ownerId,
    agent: { name: 'Тимур Сафаров', pro: false, agency: '', phone },
  } as unknown as Listing;
}
```

В `beforeEach` сбросить нового пользователя — заменить тело на:

```tsx
  beforeEach(() => {
    mockAuthed = false;
    mockUser = null;
    createSpy.mockReturnValue({ unwrap: () => Promise.resolve({ id: 'th-1' }) });
  });
```

- [ ] **Step 5: Написать падающие тесты owner-вида**

Добавить три теста в конец `describe('ContactCard', ...)` (перед закрывающей `});`):

```tsx
  it('показывает владельческий вид, когда текущий пользователь — автор', () => {
    mockAuthed = true;
    mockUser = { id: 'u-owner' };
    const { container } = render(
      <ContactCard listing={makeListing('+998 90 123-45-67', 'u-owner')} />,
    );
    // Плашка вместо контактов/чата.
    expect(screen.getByText('Это ваше объявление')).toBeInTheDocument();
    expect(screen.queryByText('Показать телефон')).not.toBeInTheDocument();
    expect(screen.queryByText('Написать')).not.toBeInTheDocument();
    // Управление: редактирование и «Мои объявления».
    expect(
      container.querySelector('a[href="/sell/lst-1/edit"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('a[href="/account/my-listings"]'),
    ).toBeInTheDocument();
  });

  it('показывает обычные контакты, если объявление не принадлежит пользователю', () => {
    mockAuthed = true;
    mockUser = { id: 'u-other' };
    render(<ContactCard listing={makeListing('+998 90 123-45-67', 'u-owner')} />);
    expect(screen.queryByText('Это ваше объявление')).not.toBeInTheDocument();
    expect(screen.getByText('Показать телефон')).toBeInTheDocument();
  });

  it('не считает гостя владельцем (аноним видит контакты)', () => {
    mockAuthed = false;
    mockUser = null;
    render(<ContactCard listing={makeListing('+998 90 123-45-67', 'u-owner')} />);
    expect(screen.queryByText('Это ваше объявление')).not.toBeInTheDocument();
    expect(screen.getByText('Показать телефон')).toBeInTheDocument();
  });
```

- [ ] **Step 6: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- src/features/detail/ContactCard.test.tsx`
Expected: FAIL — owner-тест валится (компонент ещё рендерит «Показать телефон», нет `a[href="/sell/lst-1/edit"]`).

- [ ] **Step 7: Реализовать owner-ветку в ContactCard**

В `apps/client/src/features/detail/ContactCard.tsx`:

Заменить импорт навигации (строка 12):

```tsx
import { useRouter, Link } from '@/i18n/navigation';
```

Заменить импорт селекторов authSlice (строка 21):

```tsx
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
```

Сразу после `const isAuthenticated = useAppSelector(selectIsAuthenticated);` (строка 34) добавить чтение пользователя и флаг владельца:

```tsx
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  // Владелец, открывший своё объявление, видит управление вместо контактов/чата.
  const isOwner =
    isAuthenticated &&
    Boolean(currentUser?.id) &&
    currentUser?.id === listing.ownerId;
```

Перед основным `return (` (строка 98) добавить ранний возврат owner-вида (все хуки выше уже вызваны — правило хуков не нарушается):

```tsx
  // Владельческий вид: плашка + управление (редактирование / мои объявления),
  // вместо «показать телефон / написать». ShareModal оставляем — полезно и владельцу.
  if (isOwner) {
    return (
      <div className={'rounded-card border border-border bg-surface p-5 shadow-card ' + (className ?? '')}>
        <div className="text-base font-bold text-ink">{t('contact.ownerNotice')}</div>
        <div className="mt-4 flex flex-col gap-2.5">
          <Button asChild size="lg" className="w-full">
            <Link href={`/sell/${listing.id}/edit`}>{t('contact.editListing')}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/account/my-listings">{t('contact.manageListings')}</Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setShareOpen(true)}
          >
            <Share2 size={17} /> {t('contact.share')}
          </Button>
        </div>
        {shareOpen && (
          <ShareModal listing={listing} open={shareOpen} onOpenChange={setShareOpen} />
        )}
      </div>
    );
  }

  return (
```

- [ ] **Step 8: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client test -- src/features/detail/ContactCard.test.tsx`
Expected: PASS — все тесты ContactCard зелёные (включая 3 новых и 5 существующих).

- [ ] **Step 9: Прогнать lint и сборку клиента**

Run: `pnpm --filter @avino/client lint`
Expected: без ошибок (в частности нет unused-import — `Link`/`selectCurrentUser` использованы).

Run: `pnpm --filter @avino/client build`
Expected: успешная сборка (тип `Listing.ownerId` и owner-ветка компилируются). Примечание: `rtk next build` может ложно сообщать «Errors: 1» при чистой сборке — ориентироваться на raw-вывод `pnpm`.

- [ ] **Step 10: Полный прогон тестов клиента (sanity)**

Run: `pnpm --filter @avino/client test`
Expected: предсуществующие 2 фейла в `LoginModal.test.tsx` (известный долг, не регресс) + всё остальное зелёное, включая 3 новых ContactCard-теста.

- [ ] **Step 11: Commit**

```bash
git add apps/client/src/lib/mock/types.ts apps/client/src/lib/api/listings.ts apps/client/src/features/detail/ContactCard.tsx apps/client/src/features/detail/ContactCard.test.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): owner view on listing detail (mine instead of contacts)"
```

---

## Self-Review

**Spec coverage:** Спека Фичи 1 — пометка «Это ваше объявление» на detail (плашка + управление), detail-only, без бэкенда → покрыто Task 1 (owner-ветка + ссылки на `/sell/[id]/edit` и `/account/my-listings`). i18n 3 локали → Step 3. Граница apps/client → выдержана.

**Placeholder scan:** плейсхолдеров нет; весь код приведён целиком.

**Type consistency:** `ownerId?: string` объявлен в `Listing` (Step 1), заполнен в `mapListing` (Step 2), прочитан как `listing.ownerId` в `ContactCard` (Step 7). `selectCurrentUser` возвращает объект с `id` — сравнение `currentUser?.id === listing.ownerId` корректно по типам. Маршруты `/sell/${id}/edit` и `/account/my-listings` совпадают с реально существующими (проверены в коде клиента).

## Live-verify (опционально, после мёржа)

Залогиниться своим аккаунтом, открыть собственное объявление в `/listing/[id]` → в сайдбаре видна плашка «Это ваше объявление» + «Редактировать» (→ форма редактирования) + «Мои объявления». Открыть чужое объявление → обычные «Показать телефон»/«Написать».
