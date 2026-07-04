# Гейт «Контактные данные» в визарде + Имя/Фамилия в профиле (apps/client) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Пользователь с незаполненными Имя/Фамилия/Телефон при попытке создать объявление на /sell/new заполняет их инлайн-формой; страница профиля получает раздельные поля Имя и Фамилия.

**Architecture:** Чистый предикат `isProfileCompleteForListing(user)` в `lib/`; компонент-гейт `ContactDetailsGate` в `features/listing-new/` рендерится в `ListingNew` между auth-гейтом и шагами; сохранение через существующую мутацию `updateProfile` (уже в `SUPPRESSED_ENDPOINTS`, инвалидирует `Auth` → `getMe` перечитывается → гейт сам исчезает). `Profile.tsx`: поле «Имя» → два поля `first_name`/`last_name` + `display_name: null`.

**Tech Stack:** Next.js (app router), RTK Query, next-intl, Vitest+RTL.

Spec: `docs/superpowers/specs/2026-07-04-listing-profile-required-design.md`

## Global Constraints

- Работать ТОЛЬКО в `apps/client/`. Другие app-папки не трогать.
- Git НЕ трогать — коммиты делает контроллер.
- i18n: ключи в ru/uz/en с паритетом; uz — латиница, без кириллических двойников; никаких хардкод-строк в JSX.
- Тесты: `pnpm --filter @avino/client test`; известный предсущ. долг — 2 фейла `LoginModal.test.tsx` (НЕ чинить, не регресс).
- Mocked next-intl в тестах скрывает отсутствующие ключи — паритет словарей проверять руками/скриптом.

---

### Task 1: Предикат isProfileCompleteForListing

**Files:**
- Create: `apps/client/src/lib/profile-complete.ts`
- Test: `apps/client/src/lib/profile-complete.test.ts`

**Interfaces:**
- Consumes: тип `MeResponse` из `@/store/api/authApi` (`profile: { first_name, last_name, contact_phone } | null-поля`, `phone`).
- Produces: `isProfileCompleteForListing(user: MeResponse | null): boolean` — зеркало backend-предиката ADR-0125.

- [ ] **Step 1: Написать падающий тест**

`apps/client/src/lib/profile-complete.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isProfileCompleteForListing } from './profile-complete';
import type { MeResponse } from '@/store/api/authApi';

/** Минимальный MeResponse: только поля, которые читает предикат. */
function me(over: {
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_phone?: string | null;
}): MeResponse {
  return {
    phone: over.phone ?? null,
    profile: {
      first_name: over.first_name ?? null,
      last_name: over.last_name ?? null,
      contact_phone: over.contact_phone ?? null,
    },
  } as unknown as MeResponse;
}

describe('isProfileCompleteForListing (ADR-0125)', () => {
  it('false для null (гость)', () => {
    expect(isProfileCompleteForListing(null)).toBe(false);
  });

  it('true: имя+фамилия+contact_phone (Google-юзер, заполнил телефон)', () => {
    expect(
      isProfileCompleteForListing(
        me({ first_name: 'Ali', last_name: 'Valiev', contact_phone: '+998901234567' }),
      ),
    ).toBe(true);
  });

  it('true: имя+фамилия+только телефон аккаунта (вход по телефону)', () => {
    expect(
      isProfileCompleteForListing(
        me({ first_name: 'Ali', last_name: 'Valiev', phone: '+998901234567' }),
      ),
    ).toBe(true);
  });

  it('false: нет фамилии', () => {
    expect(
      isProfileCompleteForListing(me({ first_name: 'Ali', phone: '+998901234567' })),
    ).toBe(false);
  });

  it('false: имя из пробелов', () => {
    expect(
      isProfileCompleteForListing(
        me({ first_name: '   ', last_name: 'Valiev', phone: '+998901234567' }),
      ),
    ).toBe(false);
  });

  it('false: нет ни contact_phone, ни телефона аккаунта (Google-юзер)', () => {
    expect(
      isProfileCompleteForListing(me({ first_name: 'Ali', last_name: 'Valiev' })),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Прогнать — падает**

Run: `rtk vitest pnpm --filter @avino/client test -- run src/lib/profile-complete.test.ts`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализация**

`apps/client/src/lib/profile-complete.ts`:

```ts
import type { MeResponse } from '@/store/api/authApi';

/**
 * Полнота профиля для создания объявления (зеркало backend-гейта ADR-0125,
 * POST /listings → 422 PROFILE_INCOMPLETE): Имя и Фамилия непустые, телефон —
 * contact_phone профиля или телефон аккаунта (тот же фолбэк, что в публичном
 * контакт-блоке объявления).
 */
export function isProfileCompleteForListing(user: MeResponse | null): boolean {
  if (!user) return false;
  const firstName = user.profile?.first_name?.trim();
  const lastName = user.profile?.last_name?.trim();
  const phone = user.profile?.contact_phone?.trim() || user.phone?.trim();
  return Boolean(firstName && lastName && phone);
}
```

- [ ] **Step 4: Тест зелёный**

Run: `rtk vitest pnpm --filter @avino/client test -- run src/lib/profile-complete.test.ts`
Expected: PASS (6/6).

---

### Task 2: Компонент ContactDetailsGate + i18n

**Files:**
- Create: `apps/client/src/features/listing-new/ContactDetailsGate.tsx`
- Test: `apps/client/src/features/listing-new/ContactDetailsGate.test.tsx`
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json` (раздел `listingNew.contactGate`)

**Interfaces:**
- Consumes: `useUpdateProfileMutation` из `@/store/api/usersApi` (body `{ first_name, last_name, contact_phone }`), `selectCurrentUser` из `@/store/slices/authSlice`, `getApiError` из `@/store/api/apiError`.
- Produces: `<ContactDetailsGate />` — self-contained экран формы; onDone-колбэка нет: после успешного PATCH инвалидация `Auth` перечитает `getMe`, предикат Task 1 станет true и родитель сам уберёт гейт.

- [ ] **Step 1: i18n-ключи**

В `ru.json` внутрь объекта `listingNew` (рядом с `"auth"`, строка ~649) добавить:

```json
"contactGate": {
  "title": "Контактные данные",
  "text": "Чтобы разместить объявление, укажите имя, фамилию и телефон — их увидят покупатели в карточке объявления.",
  "firstName": "Имя",
  "lastName": "Фамилия",
  "phone": "Телефон",
  "phonePlaceholder": "+998 90 123-45-67",
  "submit": "Продолжить",
  "saving": "Сохранение…",
  "error": "Не удалось сохранить данные. Попробуйте ещё раз."
}
```

`uz.json` (латиница):

```json
"contactGate": {
  "title": "Aloqa ma'lumotlari",
  "text": "E'lon joylash uchun ism, familiya va telefon raqamini kiriting — ular e'lon kartochkasida xaridorlarga ko'rinadi.",
  "firstName": "Ism",
  "lastName": "Familiya",
  "phone": "Telefon",
  "phonePlaceholder": "+998 90 123-45-67",
  "submit": "Davom etish",
  "saving": "Saqlanmoqda…",
  "error": "Ma'lumotlarni saqlab bo'lmadi. Yana urinib ko'ring."
}
```

`en.json`:

```json
"contactGate": {
  "title": "Contact details",
  "text": "To post a listing, add your first name, last name and phone — buyers will see them on the listing card.",
  "firstName": "First name",
  "lastName": "Last name",
  "phone": "Phone",
  "phonePlaceholder": "+998 90 123-45-67",
  "submit": "Continue",
  "saving": "Saving…",
  "error": "Could not save your details. Please try again."
}
```

- [ ] **Step 2: Падающий тест**

`ContactDetailsGate.test.tsx` (зеркалить сетап соседних тестов фичи — см. `ListingNew.test.tsx`: мок `next-intl` там возвращает ключ):

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactDetailsGate } from './ContactDetailsGate';

const updateProfile = vi.fn();
let mockUser: unknown = null;

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@/store/hooks', () => ({
  useAppSelector: (sel: unknown) =>
    (sel as (s: unknown) => unknown)({ auth: { user: mockUser, status: 'authenticated' } }),
}));
vi.mock('@/store/api/usersApi', () => ({
  useUpdateProfileMutation: () => [updateProfile, { isLoading: false }],
}));

describe('ContactDetailsGate', () => {
  beforeEach(() => {
    updateProfile.mockReset();
    updateProfile.mockReturnValue({ unwrap: () => Promise.resolve({}) });
  });

  it('предзаполняет поля из профиля и телефона аккаунта', () => {
    mockUser = {
      phone: '+998901234567',
      profile: { first_name: 'Ali', last_name: null, contact_phone: null },
    };
    render(<ContactDetailsGate />);
    expect(screen.getByLabelText('contactGate.firstName')).toHaveValue('Ali');
    expect(screen.getByLabelText('contactGate.phone')).toHaveValue('+998901234567');
  });

  it('submit заблокирован, пока не заполнены все три поля', () => {
    mockUser = { phone: null, profile: { first_name: null, last_name: null, contact_phone: null } };
    render(<ContactDetailsGate />);
    expect(screen.getByRole('button', { name: 'contactGate.submit' })).toBeDisabled();
  });

  it('шлёт PATCH с first_name/last_name/contact_phone (trim)', async () => {
    mockUser = { phone: null, profile: { first_name: null, last_name: null, contact_phone: null } };
    render(<ContactDetailsGate />);
    fireEvent.change(screen.getByLabelText('contactGate.firstName'), { target: { value: ' Ali ' } });
    fireEvent.change(screen.getByLabelText('contactGate.lastName'), { target: { value: 'Valiev' } });
    fireEvent.change(screen.getByLabelText('contactGate.phone'), { target: { value: '+998901234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'contactGate.submit' }));
    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        first_name: 'Ali',
        last_name: 'Valiev',
        contact_phone: '+998901234567',
      }),
    );
  });
});
```

Если в проекте общий сетап моков другой (например, `vi.mock('next-intl')` уже в `vitest.setup`), зеркалить существующий паттерн из `ListingNew.test.tsx` — не изобретать свой.

- [ ] **Step 3: Прогнать — падает**

Run: `rtk vitest pnpm --filter @avino/client test -- run src/features/listing-new/ContactDetailsGate.test.tsx`
Expected: FAIL — компонента нет.

- [ ] **Step 4: Реализация**

`ContactDetailsGate.tsx` — визуальный стиль зеркалит auth-гейт `ListingNew` (центрированная колонка, `max-w-[620px]`, иконка в круге `bg-mint`) и поля формы из `Profile.tsx` (label + `Field`):

```tsx
/**
 * ContactDetailsGate — экран «Контактные данные» в визарде /sell/new
 * (ADR-0125). Показывается вошедшему пользователю с неполным профилем
 * (см. isProfileCompleteForListing). Сохраняет Имя/Фамилию/Телефон через
 * PATCH /users/me/profile; мутация инвалидирует Auth → getMe перечитывается →
 * родитель сам скрывает гейт. Телефон пишется в contact_phone (без OTP).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/slices/authSlice';
import { useUpdateProfileMutation } from '@/store/api/usersApi';
import { getApiError } from '@/store/api/apiError';

export function ContactDetailsGate() {
  const t = useTranslations('listingNew');
  const user = useAppSelector(selectCurrentUser);
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();

  const [firstName, setFirstName] = React.useState(
    user?.profile?.first_name ?? '',
  );
  const [lastName, setLastName] = React.useState(user?.profile?.last_name ?? '');
  const [phone, setPhone] = React.useState(
    user?.profile?.contact_phone ?? user?.phone ?? '',
  );
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit =
    Boolean(firstName.trim()) && Boolean(lastName.trim()) && Boolean(phone.trim());

  const onSubmit = async () => {
    setError(null);
    try {
      await updateProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        contact_phone: phone.trim(),
      }).unwrap();
      // Успех: инвалидация Auth перечитает getMe, гейт исчезнет сам.
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? t('contactGate.error'));
    }
  };

  return (
    <div className="fade-up mx-auto max-w-[620px] px-6 py-16">
      <div className="mx-auto mb-5 flex h-21 w-21 items-center justify-center rounded-full bg-mint text-teal-deep">
        <UserRound size={38} strokeWidth={2.2} />
      </div>
      <h1 className="text-center text-[30px]">{t('contactGate.title')}</h1>
      <p className="mx-auto mb-7 mt-3 max-w-[460px] text-center text-base text-muted-foreground">
        {t('contactGate.text')}
      </p>
      <div className="mx-auto flex max-w-[420px] flex-col gap-4">
        <div>
          <label htmlFor="cg-first" className="mb-[7px] block text-[13px] font-bold">
            {t('contactGate.firstName')}
          </label>
          <Field
            id="cg-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cg-last" className="mb-[7px] block text-[13px] font-bold">
            {t('contactGate.lastName')}
          </label>
          <Field
            id="cg-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cg-phone" className="mb-[7px] block text-[13px] font-bold">
            {t('contactGate.phone')}
          </label>
          <Field
            id="cg-phone"
            type="tel"
            maxLength={20}
            placeholder={t('contactGate.phonePlaceholder')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {error && <p className="text-[13px] font-semibold text-red">{error}</p>}
        <Button
          size="lg"
          className="mt-1.5"
          disabled={!canSubmit || isLoading}
          onClick={onSubmit}
        >
          {isLoading ? t('contactGate.saving') : t('contactGate.submit')}
        </Button>
      </div>
    </div>
  );
}
```

Примечание: если `Field` не пробрасывает `id`/`type`/`maxLength`/`placeholder` на input — проверить `apps/client/src/components/ui/field.tsx` (он spread-ит rest-пропсы; в `Profile.tsx` используется без id, в тестах связка label+`htmlFor` обязательна).

- [ ] **Step 5: Тесты зелёные**

Run: `rtk vitest pnpm --filter @avino/client test -- run src/features/listing-new/ContactDetailsGate.test.tsx`
Expected: PASS (3/3).

---

### Task 3: Врезка гейта в ListingNew + обработка 422 PROFILE_INCOMPLETE

**Files:**
- Modify: `apps/client/src/features/listing-new/ListingNew.tsx`
- Modify: `apps/client/messages/{ru,uz,en}.json` (ключ `listingNew.errors.profileIncomplete`)
- Test: `apps/client/src/features/listing-new/ListingNew.test.tsx` (дополнить)

**Interfaces:**
- Consumes: `isProfileCompleteForListing` (Task 1), `ContactDetailsGate` (Task 2), `selectCurrentUser`.

- [ ] **Step 1: i18n**

В `listingNew.errors` (ru/uz/en; рядом с существующим `loginRequired`):

- ru: `"profileIncomplete": "Заполните имя, фамилию и телефон в профиле, чтобы разместить объявление."`
- uz: `"profileIncomplete": "E'lon joylash uchun profilda ism, familiya va telefonni to'ldiring."`
- en: `"profileIncomplete": "Fill in your first name, last name and phone in your profile to post a listing."`

- [ ] **Step 2: Врезка гейта**

В `ListingNew.tsx`:

1. Импорты:

```ts
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice';
import { isProfileCompleteForListing } from '@/lib/profile-complete';
import { ContactDetailsGate } from './ContactDetailsGate';
```

2. Рядом с `const isAuthenticated = ...` (строка ~277):

```ts
  const currentUser = useAppSelector(selectCurrentUser);
  const profileComplete = isProfileCompleteForListing(currentUser);
```

3. Сразу ПОСЛЕ блока auth-гейта `if (!isAuthenticated) { ... }` (строка ~392) и ПЕРЕД `if (done)`:

```tsx
  // ---- Гейт полноты профиля (ADR-0125) ----
  // Вошёл, но Имя/Фамилия/Телефон не заполнены → форма контактных данных
  // вместо шагов. После сохранения getMe перечитывается и гейт исчезает.
  if (!profileComplete) {
    return <ContactDetailsGate />;
  }
```

4. Обработка страховочного 422 от `createListing`: там, где рендерится `apiError` (сообщение ошибки публикации), спецкейс:

```tsx
  const apiErrorMessage =
    apiError?.code === 'PROFILE_INCOMPLETE'
      ? t('errors.profileIncomplete')
      : apiError?.message;
```

и в JSX использовать `apiErrorMessage` вместо `apiError.message` (найти текущее место рендера `apiError` в файле и заменить только источник текста).

- [ ] **Step 3: Тест на гейт**

Дополнить `ListingNew.test.tsx` (в нём уже замоканы `@/store/hooks` и авторизация — зеркалить существующий паттерн моков): кейс «авторизован, профиль неполный → рендерится contactGate.title, шаги не рендерятся» и кейс «профиль полный → рендерится шаг 1». Если текущий мок `useAppSelector` в тесте возвращает фикс-значение для всех селекторов — расширить его маппингом по селектору (как в тесте Task 2).

- [ ] **Step 4: Прогон фичи**

Run: `rtk vitest pnpm --filter @avino/client test -- run src/features/listing-new`
Expected: PASS (кроме известного долга вне этой папки).

---

### Task 4: Profile.tsx — раздельные Имя/Фамилия

**Files:**
- Modify: `apps/client/src/features/account/Profile.tsx`
- Modify: `apps/client/messages/{ru,uz,en}.json` (`account.profile.firstName`, `account.profile.lastName`; ключ `name` больше не используется — удалить)
- Test: `apps/client/src/features/account/Profile.test.tsx` (если существует — обновить; если нет — НЕ создавать)

**Interfaces:**
- Consumes: `useUpdateProfileMutation` (`UpdateProfileBody` уже принимает `first_name/last_name/display_name: null`).

- [ ] **Step 1: i18n**

В `account.profile` (ru/uz/en) заменить `"name"` на два ключа:

- ru: `"firstName": "Имя"`, `"lastName": "Фамилия"`
- uz: `"firstName": "Ism"`, `"lastName": "Familiya"`
- en: `"firstName": "First name"`, `"lastName": "Last name"`

Проверить, что `account.profile.name` не используется больше нигде: `rtk grep -rn "profile.name" apps/client/src`.

- [ ] **Step 2: Правка Profile.tsx**

1. `ProfileForm`: `name: string` → `firstName: string; lastName: string`.
2. Гидрация из user (useEffect):

```ts
    setForm({
      firstName: user.profile.first_name ?? '',
      lastName: user.profile.last_name ?? '',
      phone: user.profile.contact_phone ?? user.phone ?? '',
      email: user.email ?? '',
      lang: toChip(user.default_language),
    });
```

3. `avatarChar`: `(form.firstName.trim()[0] ?? 'A').toUpperCase()`.
4. PATCH в `onSave`:

```ts
      await updateProfile({
        first_name: form.firstName.trim() || null,
        last_name: form.lastName.trim() || null,
        // Публичное имя становится производным «Имя Фамилия» (buildContact
        // на бэке: displayName ?? first+last) — иначе display_name из Google
        // навсегда перекрывал бы отредактированные Имя/Фамилию.
        display_name: null,
        contact_phone: form.phone.trim() || null,
        preferred_language: nextLang,
      }).unwrap();
```

5. В JSX вместо одного поля `profile.name` — два поля (тот же паттерн label+Field, друг за другом): label `t('profile.firstName')` → `form.firstName`, label `t('profile.lastName')` → `form.lastName`.

- [ ] **Step 3: Полная верификация client**

Run: `rtk vitest pnpm --filter @avino/client test` затем `rtk lint pnpm --filter @avino/client lint` затем `pnpm --filter @avino/client exec tsc --noEmit`
Expected: тесты — 0 новых фейлов (2 известных LoginModal), lint 0 errors, tsc clean.

- [ ] **Step 4: Паритет словарей**

Run:

```bash
python3 - <<'EOF'
import json
def keys(d, p=''):
    out = set()
    for k, v in d.items():
        kp = f'{p}.{k}' if p else k
        out |= keys(v, kp) if isinstance(v, dict) else {kp}
    return out
base = None
for loc in ('ru', 'uz', 'en'):
    ks = keys(json.load(open(f'apps/client/messages/{loc}.json')))
    if base is None:
        base = ks
    else:
        print(loc, 'missing:', sorted(base - ks)[:10], 'extra:', sorted(ks - base)[:10])
EOF
```

Expected: missing/extra пустые.
