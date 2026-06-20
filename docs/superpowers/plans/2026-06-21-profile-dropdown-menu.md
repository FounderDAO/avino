# OLX-style Profile Dropdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить залогиненный кластер шапки (ссылка-имя + кнопка «Выйти») на профиль-меню в стиле OLX: триггер «Ваш профиль» без имени → выпадающая панель с контактом, пунктами аккаунта, секцией «Избранные» со счётчиками и «Выйти».

**Architecture:** Новый компонент `ProfileMenu` поверх существующего Radix-примитива `Dropdown` (как `LangSwitcher`). Логика выхода выносится в общий хук `useLogout` (его переиспользуют десктоп-меню и мобильное меню). `Header` в залогиненной ветке рендерит `<ProfileMenu/>`. `DropdownItem` получает опциональный проп `trailing` для пилюли-счётчика.

**Tech Stack:** Next.js (App Router) + React, next-intl, Redux Toolkit + RTK Query, radix-ui DropdownMenu, Tailwind (токены Avino), Vitest + React Testing Library.

## Global Constraints

- Все изменения — только в `apps/client` (граница app-папки; см. память app-folder-boundaries).
- Имя/фамилия пользователя НЕ выводятся нигде (ни триггер, ни панель, ни мобайл). Контакт = email-локалpart → телефон → «Аккаунт». Не использовать `display_name`/`first_name`.
- Полный паритет 3 языков: `messages/ru.json`, `uz.json`, `en.json`.
- Переиспользовать существующие примитивы (`Dropdown*`, `useFavoritesCount`, `useGetSavedSearchesQuery`); не плодить дубликаты.
- TDD: тест-фейл → минимальная реализация → тест-пасс → коммит. Conventional Commits.
- Каждый коммит-месседж заканчивается строкой:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Команды: тесты `pnpm --filter @avino/client exec vitest run <path>`; линт `pnpm --filter @avino/client lint`; сборка `pnpm --filter @avino/client build` (при аномалиях сверяться с сырым `pnpm --filter @avino/client exec next build` — `rtk next build` иногда врёт, см. память rtk-next-build-false-error).
- НЕ трогать git-историю чужих файлов в рабочей копии; `git add` только перечисленные пути.

---

### Task 1: i18n-ключи `nav.profileMenu.*`

**Files:**
- Modify: `apps/client/messages/ru.json` (объект `"nav"`, ~строки 19-38)
- Modify: `apps/client/messages/uz.json` (объект `"nav"`)
- Modify: `apps/client/messages/en.json` (объект `"nav"`)

**Interfaces:**
- Consumes: ничего.
- Produces: ключи `nav.profileMenu.{trigger,sectionMain,profile,listings,chat,settings,favorites,favListings,favSearches}` во всех трёх локалях. `nav.logout` уже существует и переиспользуется для «Выйти».

- [ ] **Step 1: Добавить блок `profileMenu` в `ru.json`**

В объект `"nav"` (после `"close": "Закрыть",` или в любом валидном месте внутри `nav`) добавить новый ключ:

```json
    "profileMenu": {
      "trigger": "Ваш профиль",
      "sectionMain": "Ваш профиль",
      "profile": "Профиль",
      "listings": "Объявления",
      "chat": "Чат",
      "settings": "Настройки",
      "favorites": "Избранные:",
      "favListings": "Объявления",
      "favSearches": "Поиски"
    },
```

Следить за валидностью JSON (запятые между ключами, без хвостовой запятой перед `}` объекта `nav`).

- [ ] **Step 2: Добавить тот же блок в `uz.json`**

```json
    "profileMenu": {
      "trigger": "Profilingiz",
      "sectionMain": "Profilingiz",
      "profile": "Profil",
      "listings": "E'lonlar",
      "chat": "Chat",
      "settings": "Sozlamalar",
      "favorites": "Saqlanganlar:",
      "favListings": "E'lonlar",
      "favSearches": "Qidiruvlar"
    },
```

- [ ] **Step 3: Добавить тот же блок в `en.json`**

```json
    "profileMenu": {
      "trigger": "Your profile",
      "sectionMain": "Your profile",
      "profile": "Profile",
      "listings": "Listings",
      "chat": "Chat",
      "settings": "Settings",
      "favorites": "Saved:",
      "favListings": "Listings",
      "favSearches": "Searches"
    },
```

- [ ] **Step 4: Проверить, что все три JSON валидны и ключи на месте**

Run:
```bash
cd apps/client && node -e "for (const l of ['ru','uz','en']) { const m = require('./messages/'+l+'.json'); if (!m.nav.profileMenu || !m.nav.profileMenu.trigger || !m.nav.logout) throw new Error('missing keys in '+l); } console.log('i18n ok')"
```
Expected: `i18n ok` (без исключений — все файлы парсятся, ключи присутствуют).

- [ ] **Step 5: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "i18n(client): add nav.profileMenu keys for profile dropdown

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Проп `trailing` у `DropdownItem`

Добавляет опциональный слот справа (для пилюли-счётчика). Обратносовместимо: существующие вызовы без `trailing`/`selected` рендерятся как раньше.

**Files:**
- Modify: `apps/client/src/components/ui/dropdown.tsx:35-59`
- Test: `apps/client/src/components/ui/dropdown.test.tsx` (create)

**Interfaces:**
- Consumes: ничего.
- Produces: `DropdownItemProps` теперь имеет `trailing?: React.ReactNode`. Рендер: `<span>{children}</span>` слева; справа группа `{trailing}` + (если `selected`) `<Check/>`.

- [ ] **Step 1: Написать падающий тест**

Create `apps/client/src/components/ui/dropdown.test.tsx`:

```tsx
/**
 * DropdownItem — слот trailing (правый аддон, напр. пилюля-счётчик).
 * Radix-меню рендерим сразу открытым (defaultOpen), чтобы проверить содержимое.
 */
import * as React from 'react';
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from './dropdown';

beforeAll(() => {
  // Radix DropdownMenu опирается на эти DOM-API, которых нет в jsdom.
  if (!Element.prototype.hasPointerCapture)
    Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture)
    Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView)
    Element.prototype.scrollIntoView = () => {};
});

describe('DropdownItem trailing', () => {
  it('рендерит trailing-узел справа от текста пункта', () => {
    render(
      <Dropdown defaultOpen>
        <DropdownTrigger>open</DropdownTrigger>
        <DropdownContent>
          <DropdownItem trailing={<span>9</span>}>Поиски</DropdownItem>
        </DropdownContent>
      </Dropdown>,
    );
    expect(screen.getByText('Поиски')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/components/ui/dropdown.test.tsx`
Expected: FAIL — `9` не отрендерен (текущий `DropdownItem` игнорирует `trailing`).

- [ ] **Step 3: Реализовать проп `trailing`**

В `apps/client/src/components/ui/dropdown.tsx` заменить блок `DropdownItemProps` + `DropdownItem` (строки 35-59) на:

```tsx
export interface DropdownItemProps
  extends React.ComponentPropsWithoutRef<typeof RadixDropdown.Item> {
  /** Показать галочку (выбранный пункт). */
  selected?: boolean;
  /** Правый аддон (напр. пилюля-счётчик). */
  trailing?: React.ReactNode;
}

export const DropdownItem = React.forwardRef<
  React.ComponentRef<typeof RadixDropdown.Item>,
  DropdownItemProps
>(({ className, children, selected, trailing, ...props }, ref) => (
  <RadixDropdown.Item
    ref={ref}
    className={cn(
      'flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-lg px-3 py-[9px] text-sm font-semibold text-ink outline-none transition-colors',
      'data-[highlighted]:bg-mint',
      selected && 'bg-mint',
      className,
    )}
    {...props}
  >
    <span className="truncate">{children}</span>
    {(trailing || selected) && (
      <span className="flex shrink-0 items-center gap-2">
        {trailing}
        {selected && <Check size={15} className="text-teal" />}
      </span>
    )}
  </RadixDropdown.Item>
));
DropdownItem.displayName = 'DropdownItem';
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/components/ui/dropdown.test.tsx`
Expected: PASS.

- [ ] **Step 5: Регресс — существующие потребители `DropdownItem` (LangSwitcher, MyListings) не сломались**

Run: `pnpm --filter @avino/client exec vitest run` (полный прогон) затем `pnpm --filter @avino/client lint`
Expected: тесты зелёные, линт без ошибок.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/ui/dropdown.tsx apps/client/src/components/ui/dropdown.test.tsx
git commit -m "feat(client): add optional trailing slot to DropdownItem

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Хук `useLogout` + компонент `ProfileMenu`

**Files:**
- Create: `apps/client/src/components/layout/useLogout.ts`
- Create: `apps/client/src/components/layout/ProfileMenu.tsx`
- Test: `apps/client/src/components/layout/ProfileMenu.test.tsx`

**Interfaces:**
- Consumes:
  - `DropdownItem` с пропом `trailing` (Task 2).
  - `nav.profileMenu.*` + `nav.logout` (Task 1).
  - `selectIsAuthenticated`, `selectCurrentUser`, `selectRefreshToken` из `@/store/slices/authSlice`.
  - `useFavoritesCount(): number` из `@/store/favorites`.
  - `useGetSavedSearchesQuery(undefined, { skip })` → `data?: SavedSearch[]` из `@/store/api/savedSearchesApi`.
  - `useLogoutMutation()` → `[logout, { isLoading }]` из `@/store/api/authApi`.
  - `useRouter()` из `@/i18n/navigation`.
- Produces:
  - `useLogout(): { logout: () => Promise<void>; isLoggingOut: boolean }`.
  - `ProfileMenu` (default-экспорт отсутствует; именованный `ProfileMenu`).
  - `PROFILE_MENU_LINKS` и `FAVORITE_MENU_LINKS: { key: string; href: string; labelKey: string }[]` — переиспользуются мобильным меню в Task 4.

- [ ] **Step 1: Написать падающий тест компонента**

Create `apps/client/src/components/layout/ProfileMenu.test.tsx`:

```tsx
/**
 * ProfileMenu — профиль-меню в шапке (стиль OLX).
 * Слои Redux / RTK Query / i18n-навигация замоканы — проверяем проводку и
 * приватность (имя не светится), а не сеть. next-intl резолвится по реальному
 * messages/ru.json (как в ContactCard.test).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { pushSpy, logoutSpy } = vi.hoisted(() => ({
  pushSpy: vi.fn(),
  logoutSpy: vi.fn(() => Promise.resolve(undefined)),
}));

// Управляемое состояние стора для useAppSelector(<реальный селектор>).
let mockState: {
  auth: {
    accessToken: string | null;
    refreshToken: string | null;
    user: {
      email: string | null;
      phone: string | null;
      profile: { avatar_url: string | null };
    } | null;
  };
};

vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<
    string,
    unknown
  >;
  const useTranslations =
    (ns: string) =>
    (key: string): string => {
      const root = (ns ? ru[ns] : ru) as Record<string, unknown>;
      const val = key
        .split('.')
        .reduce<unknown>(
          (o, k) =>
            o && typeof o === 'object'
              ? (o as Record<string, unknown>)[k]
              : undefined,
          root,
        );
      return typeof val === 'string' ? val : key;
    };
  return { useTranslations };
});

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
}));

// useAppSelector прогоняем через реальные селекторы по mockState.
vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: (s: unknown) => unknown) => sel(mockState),
}));

vi.mock('@/store/favorites', () => ({
  useFavoritesCount: () => 3,
}));

vi.mock('@/store/api/savedSearchesApi', () => ({
  useGetSavedSearchesQuery: () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
}));

vi.mock('@/store/api/authApi', () => ({
  useLogoutMutation: () => [logoutSpy, { isLoading: false }],
}));

import { ProfileMenu } from './ProfileMenu';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture)
    Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture)
    Element.prototype.releasePointerCapture = () => {};
  if (!Element.prototype.scrollIntoView)
    Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  mockState = {
    auth: {
      accessToken: 'access',
      refreshToken: 'refresh',
      user: {
        email: 'taplinksuz@gmail.com',
        phone: '+998901112233',
        // display_name/first_name намеренно отсутствуют — проверяем приватность.
        profile: { avatar_url: null },
      },
    },
  };
});

afterEach(() => vi.clearAllMocks());

describe('ProfileMenu', () => {
  it('триггер показывает «Ваш профиль» и НЕ показывает имя', () => {
    render(<ProfileMenu />);
    expect(
      screen.getByRole('button', { name: /Ваш профиль/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Камила/)).not.toBeInTheDocument();
  });

  it('по клику открывает все пункты назначения и счётчики', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));

    expect(screen.getByText('Профиль')).toBeInTheDocument();
    expect(screen.getByText('Чат')).toBeInTheDocument();
    expect(screen.getByText('Настройки')).toBeInTheDocument();
    expect(screen.getByText('Поиски')).toBeInTheDocument();
    expect(screen.getByText('Выйти')).toBeInTheDocument();
    // «Объявления» встречается дважды (пункт + избранное).
    expect(screen.getAllByText('Объявления')).toHaveLength(2);
    // Счётчики из моков: избранное 3, поиски 2.
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('в шапке панели показывает email-локалpart, а не имя', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));
    expect(screen.getByText('taplinksuz')).toBeInTheDocument();
  });

  it('клик по «Чат» ведёт на /account/inbox', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));
    await user.click(screen.getByText('Чат'));
    expect(pushSpy).toHaveBeenCalledWith('/account/inbox');
  });

  it('клик по «Выйти» отзывает refresh-токен и уводит на /', async () => {
    const user = userEvent.setup();
    render(<ProfileMenu />);
    await user.click(screen.getByRole('button', { name: /Ваш профиль/ }));
    await user.click(screen.getByText('Выйти'));
    expect(logoutSpy).toHaveBeenCalledWith({ refresh_token: 'refresh' });
    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/'));
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/components/layout/ProfileMenu.test.tsx`
Expected: FAIL — модуль `./ProfileMenu` ещё не существует (cannot find module / ProfileMenu is not defined).

- [ ] **Step 3: Создать хук `useLogout`**

Create `apps/client/src/components/layout/useLogout.ts`:

```tsx
/**
 * useLogout — общая логика выхода для шапки (десктоп-меню ProfileMenu и
 * мобильное полноэкранное меню Header). Отзывает refresh-токен (clearCredentials
 * чистит локальные креды в onQueryStarted независимо от исхода) и уводит на «/».
 */
'use client';

import * as React from 'react';
import { useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import { selectRefreshToken } from '@/store/slices/authSlice';
import { useLogoutMutation } from '@/store/api/authApi';

export function useLogout(): {
  logout: () => Promise<void>;
  isLoggingOut: boolean;
} {
  const router = useRouter();
  const refreshToken = useAppSelector(selectRefreshToken);
  const [logoutMutation, { isLoading: isLoggingOut }] = useLogoutMutation();

  const logout = React.useCallback(async () => {
    try {
      await logoutMutation({ refresh_token: refreshToken ?? '' });
    } finally {
      router.push('/');
    }
  }, [logoutMutation, refreshToken, router]);

  return { logout, isLoggingOut };
}
```

- [ ] **Step 4: Создать компонент `ProfileMenu`**

Create `apps/client/src/components/layout/ProfileMenu.tsx`:

```tsx
/**
 * ProfileMenu — выпадающее меню профиля в шапке (стиль OLX).
 * Рендерится только в залогиненном состоянии (Header гардит по isAuthenticated).
 * Триггер «Ваш профиль» (БЕЗ имени); панель — контакт + пункты аккаунта +
 * секция «Избранные» со счётчиками + «Выйти». Переиспользует Radix Dropdown.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { User, ChevronDown } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useAppSelector } from '@/store/hooks';
import {
  selectIsAuthenticated,
  selectCurrentUser,
} from '@/store/slices/authSlice';
import { useFavoritesCount } from '@/store/favorites';
import { useGetSavedSearchesQuery } from '@/store/api/savedSearchesApi';
import {
  Dropdown,
  DropdownTrigger,
  DropdownContent,
  DropdownItem,
} from '@/components/ui/dropdown';
import { useLogout } from './useLogout';

type MenuLink = { key: string; href: string; labelKey: string };

/** Основные пункты — переиспользуются мобильным меню Header. */
export const PROFILE_MENU_LINKS: MenuLink[] = [
  { key: 'profile', href: '/account/profile', labelKey: 'profileMenu.profile' },
  { key: 'listings', href: '/account/my-listings', labelKey: 'profileMenu.listings' },
  { key: 'chat', href: '/account/inbox', labelKey: 'profileMenu.chat' },
  { key: 'settings', href: '/account/settings', labelKey: 'profileMenu.settings' },
];

/** Пункты секции «Избранные». */
export const FAVORITE_MENU_LINKS: MenuLink[] = [
  { key: 'favListings', href: '/account/favorites', labelKey: 'profileMenu.favListings' },
  { key: 'favSearches', href: '/account/saved', labelKey: 'profileMenu.favSearches' },
];

/** Контакт для шапки панели: email-локалpart → телефон → запасной текст. Имя НЕ используется. */
function contactLabel(
  user: { email: string | null; phone: string | null } | null | undefined,
  fallback: string,
): string {
  const email = user?.email;
  if (email && email.includes('@')) return email.split('@')[0];
  if (user?.phone) return user.phone;
  return fallback;
}

function CountPill({ n }: { n: number }) {
  return (
    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-2 px-1.5 text-xs font-bold text-muted-foreground">
      {n}
    </span>
  );
}

export function ProfileMenu() {
  const t = useTranslations('nav');
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const currentUser = useAppSelector(selectCurrentUser);
  const favCount = useFavoritesCount();
  const { data: savedSearches } = useGetSavedSearchesQuery(undefined, {
    skip: !isAuthenticated,
  });
  const savedCount = savedSearches?.length ?? 0;
  const { logout, isLoggingOut } = useLogout();

  const label = contactLabel(currentUser, t('account'));
  const avatarUrl = currentUser?.profile?.avatar_url ?? null;
  const initial = /^[\p{L}]/u.test(label) ? label[0].toUpperCase() : null;
  const favCounts: Record<string, number> = {
    favListings: favCount,
    favSearches: savedCount,
  };

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-pill px-3 py-2 text-[15px] font-semibold text-ink hover:bg-surface-2"
        >
          <User size={20} strokeWidth={1.9} />
          <span>{t('profileMenu.trigger')}</span>
          <ChevronDown size={16} strokeWidth={2} />
        </button>
      </DropdownTrigger>

      <DropdownContent className="min-w-[240px]">
        {/* Идентичность — контакт, без имени */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-sm font-bold text-teal">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : initial ? (
              initial
            ) : (
              <User size={18} strokeWidth={1.9} />
            )}
          </span>
          <span className="truncate text-[15px] font-bold text-ink">{label}</span>
        </div>

        <div className="-mx-1.5 my-1 h-px bg-border" />

        {/* Секция «Ваш профиль» */}
        <div className="px-3 pb-1 pt-1 text-[13px] font-bold text-muted-foreground">
          {t('profileMenu.sectionMain')}
        </div>
        {PROFILE_MENU_LINKS.map((it) => (
          <DropdownItem key={it.key} onSelect={() => router.push(it.href)}>
            {t(it.labelKey)}
          </DropdownItem>
        ))}

        {/* Секция «Избранные» */}
        <div className="px-3 pb-1 pt-2 text-[13px] font-bold text-muted-foreground">
          {t('profileMenu.favorites')}
        </div>
        {FAVORITE_MENU_LINKS.map((it) => (
          <DropdownItem
            key={it.key}
            onSelect={() => router.push(it.href)}
            trailing={<CountPill n={favCounts[it.key]} />}
          >
            {t(it.labelKey)}
          </DropdownItem>
        ))}

        <div className="-mx-1.5 my-1 h-px bg-border" />

        <DropdownItem
          disabled={isLoggingOut}
          onSelect={() => {
            void logout();
          }}
        >
          {t('logout')}
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/components/layout/ProfileMenu.test.tsx`
Expected: PASS (все 5 кейсов).

- [ ] **Step 6: Линт**

Run: `pnpm --filter @avino/client lint`
Expected: без ошибок (директива `eslint-disable-next-line @next/next/no-img-element` гасит ожидаемое предупреждение про `<img>`).

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/components/layout/useLogout.ts apps/client/src/components/layout/ProfileMenu.tsx apps/client/src/components/layout/ProfileMenu.test.tsx
git commit -m "feat(client): OLX-style ProfileMenu dropdown + useLogout hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Интеграция в `Header` (десктоп + мобайл)

**Files:**
- Modify: `apps/client/src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: `ProfileMenu`, `PROFILE_MENU_LINKS`, `FAVORITE_MENU_LINKS` (Task 3), `useLogout` (Task 3).
- Produces: десктоп залогиненная ветка = `<ProfileMenu/>`; мобильное меню = список тех же назначений + «Выйти». Имя нигде не выводится.

- [ ] **Step 1: Обновить импорты в `Header.tsx`**

Удалить импорт (строка 29):
```tsx
import { useLogoutMutation } from '@/store/api/authApi';
```
Сузить импорт из authSlice (строки 24-28) до:
```tsx
import { selectIsAuthenticated } from '@/store/slices/authSlice';
```
Добавить (рядом с импортами `./LangSwitcher` и т.п.):
```tsx
import {
  ProfileMenu,
  PROFILE_MENU_LINKS,
  FAVORITE_MENU_LINKS,
} from './ProfileMenu';
import { useLogout } from './useLogout';
```

- [ ] **Step 2: Заменить хуки/мемо в `HeaderBody`**

Удалить строки 40-42 (`currentUser`, `refreshToken`, `useLogoutMutation`), блок `accountLabel` (44-49) и `handleLogout` (51-59). Вместо логаут-мутации добавить (рядом с `const favCount = ...`):
```tsx
  const { logout, isLoggingOut } = useLogout();
```
Оставить `const isAuthenticated = useAppSelector(selectIsAuthenticated);` (строка 39).

- [ ] **Step 3: Заменить десктопную залогиненную ветку**

Блок (текущие строки 138-156) заменить на:
```tsx
          {isAuthenticated ? (
            <ProfileMenu />
          ) : (
            <Button variant="ghost" onClick={() => setLogin(true)} className="text-[15px]">
              {t('login')}
            </Button>
          )}
```

- [ ] **Step 4: Заменить мобильную залогиненную ветку (паритет назначений, без имени)**

Блок (текущие строки 199-227) заменить на:
```tsx
              {isAuthenticated ? (
                <>
                  {[...PROFILE_MENU_LINKS, ...FAVORITE_MENU_LINKS].map((it) => (
                    <Button key={it.key} size="lg" variant="outline" asChild>
                      <Link href={it.href}>{t(it.labelKey)}</Link>
                    </Button>
                  ))}
                  <Button
                    size="lg"
                    variant="ghost"
                    disabled={isLoggingOut}
                    onClick={() => {
                      setMenu(false);
                      void logout();
                    }}
                  >
                    {t('logout')}
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setMenu(false);
                    setLogin(true);
                  }}
                >
                  {t('login')}
                </Button>
              )}
```

- [ ] **Step 5: Прогнать тесты, линт и сборку**

Run:
```bash
pnpm --filter @avino/client exec vitest run
pnpm --filter @avino/client lint
pnpm --filter @avino/client build
```
Expected: тесты зелёные; линт без ошибок (в `Header.tsx` не осталось неиспользуемых импортов/переменных — иначе `no-unused-vars` подсветит); сборка успешна. При странностях сборки сверить с `pnpm --filter @avino/client exec next build`.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/layout/Header.tsx
git commit -m "feat(client): wire ProfileMenu into header (desktop + mobile parity)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Триггер «Ваш профиль» без имени → Task 3 (компонент) + Task 4 (десктоп) ✓
- Шапка панели = только контакт (email-локалpart → телефон → «Аккаунт»), без id → `contactLabel`, Task 3 ✓
- Пункты Профиль/Объявления/Чат/Настройки + Избранные(Объявления/Поиски) + Выйти → `PROFILE_MENU_LINKS`/`FAVORITE_MENU_LINKS` + логаут, Task 3 ✓
- Счётчики избранного/поисков (пилюли, даже при 0) → `CountPill` + `trailing` (Task 2), `useFavoritesCount`/`useGetSavedSearchesQuery`, Task 3 ✓
- i18n `nav.profileMenu.*` ru/uz/en, короткие лейблы → Task 1 ✓
- Переиспользование Radix `Dropdown` → Task 3 ✓
- Header: десктоп = `<ProfileMenu/>`, мобайл = паритет назначений → Task 4 ✓
- Тест Vitest+RTL → Task 3 (5 кейсов, включая приватность имени) ✓
- Всё в `apps/client` → все задачи ✓
- Вне области (нет бэкенда, нет Платежи/Ищу работу/Уведомления, нет аплоада аватара) → соблюдено ✓

**2. Placeholder scan:** плейсхолдеров нет — весь код приведён целиком, команды с ожидаемым выводом.

**3. Type consistency:**
- `useLogout(): { logout: () => Promise<void>; isLoggingOut: boolean }` — объявлен в Task 3, потребляется в Task 3/4 одинаково ✓
- `MenuLink = { key; href; labelKey }` — массивы `PROFILE_MENU_LINKS`/`FAVORITE_MENU_LINKS` экспортируются в Task 3, импортируются в Task 4; `t(it.labelKey)` в namespace `nav` ✓
- `DropdownItemProps.trailing?: React.ReactNode` — добавлен в Task 2, используется `CountPill` в Task 3 ✓
- `contactLabel(user, fallback)` — сигнатура совпадает с вызовом ✓
- `favCounts[it.key]` ключи (`favListings`/`favSearches`) совпадают с `FAVORITE_MENU_LINKS[].key` и i18n-ключами ✓
```
