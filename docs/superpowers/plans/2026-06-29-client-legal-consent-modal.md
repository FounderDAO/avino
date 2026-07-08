# Client Legal-Consent Modal — Implementation Plan (PR №3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a blocking, non-dismissible "accept Terms + Privacy" modal to an authenticated user in `apps/client` whenever the backend requires consent and the user hasn't accepted the current document version.

**Architecture:** Pure client-side gate over an already-shipped backend (PR #265, ADR-0115). Extend three RTK Query slices with new contract fields + one mutation, add a fail-safe gate hook, render a Radix `Dialog` modal (mirroring `LoginModal`) that cannot be closed until both boxes are checked and `POST /users/me/legal-consent` succeeds, and mount the gate once inside `StoreProvider` so it overlays any page.

**Tech Stack:** Next.js (App Router) + TypeScript, RTK Query, `radix-ui` Dialog, `next-intl`, Vitest + React Testing Library.

## Global Constraints

- **One app folder only:** every change lives under `apps/client/`. Do **not** touch `apps/web/`, `apps/api/`, or `packages/shared/` (CLAUDE.md §0).
- **No `fetch`/`axios` in components** — all API access via RTK Query slices (CLAUDE.md §4).
- **Subagents never touch git** — the controller owns all `git`/PR operations (CLAUDE.md §15, [[avino-subagents-shared-workdir-git-hazard]]).
- **i18n parity is mandatory in all 3 files** — `messages/ru.json`, `messages/uz.json`, `messages/en.json`. The repo's `next-intl` test mock resolves against `ru.json` only and **silently hides missing keys** in `uz`/`en` ([[avino-client-test-i18n-eslint-gotchas]]). Every `legalConsent.*` key must exist in all three with identical shape.
- **`uz` locale is Latin script** — LLM-authored Uzbek tends to leak Cyrillic homoglyphs (`а е о р с …`). After editing `uz.json`, scan the new block for Cyrillic and fix any ([[avino-legal-pages-terms-privacy]]).
- **Backend contract (in `main`, do not change):**
  - `GET /api/v1/settings/public` → `{ promotionsEnabled, mapHoverRecenter, legalConsentRequired: boolean, legalConsentVersion: number }`
  - `GET /api/v1/auth/me` → `MeResponse` includes `legal_consent: { accepted_version: number|null, accepted_at: string|null }`
  - `POST /api/v1/users/me/legal-consent` (Bearer), body `{ terms_accepted: boolean, privacy_accepted: boolean }` → `200 { accepted_version, accepted_at }`; if either is `false` → `422 { error: { code: "CONSENT_INCOMPLETE" } }`
- **Gate predicate (client-side only):** show modal when
  `isAuthenticated && legalConsentRequired && (accepted_version == null || accepted_version < legalConsentVersion)`.
  **Fail-safe:** while settings or `me` are loading/errored/undefined → do **not** show (never block on uncertainty).
- **Verification commands** (run from repo root):
  - Tests: `pnpm --filter @avino/client test`
  - Lint: `pnpm --filter @avino/client lint`
  - Typecheck: `pnpm --filter @avino/client exec tsc --noEmit`
  - `rtk next build` lies about errors — if you build, use raw `pnpm --filter @avino/client exec next build` ([[avino-rtk-next-build-false-error]]).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/client/src/store/api/publicSettingsApi.ts` | `PublicSettings` type | Modify: +2 fields |
| `apps/client/src/store/api/authApi.ts` | `MeResponse` type | Modify: +`legal_consent` |
| `apps/client/src/store/api/usersApi.ts` | consent mutation | Modify: +`acceptLegalConsent` |
| `apps/client/src/lib/useLegalConsentGate.ts` | gate predicate hook | Create |
| `apps/client/src/lib/useLegalConsentGate.test.ts` | hook tests | Create |
| `apps/client/src/components/layout/LegalConsentModal.tsx` | blocking modal | Create |
| `apps/client/src/components/layout/LegalConsentModal.test.tsx` | modal tests | Create |
| `apps/client/src/components/LegalConsentGate.tsx` | mount wrapper | Create |
| `apps/client/src/components/LegalConsentGate.test.tsx` | gate wrapper test | Create |
| `apps/client/src/store/StoreProvider.tsx` | mount point | Modify: +`<LegalConsentGate />` |
| `apps/client/messages/{ru,uz,en}.json` | `legalConsent` i18n | Modify: +namespace |
| `docs/adr/ADR-0115-legal-consent-modal.md` | ADR follow-up | Modify (Task 6) |
| `docs/DONE.md`, `docs/TASKS.md` | tracking | Modify (Task 6) |

---

## Task 1: Extend RTK Query contracts + add consent mutation

Thin type/endpoint plumbing consumed by every later task. No unit test of its own — verified by `tsc` and by the tested hook/component that consume it. One reviewable unit: "the client API layer for consent".

**Files:**
- Modify: `apps/client/src/store/api/publicSettingsApi.ts`
- Modify: `apps/client/src/store/api/authApi.ts`
- Modify: `apps/client/src/store/api/usersApi.ts`

**Interfaces:**
- Consumes: backend contract (Global Constraints).
- Produces (later tasks rely on these exact names/types):
  - `PublicSettings` gains `legalConsentRequired: boolean; legalConsentVersion: number`.
  - `authApi`: `export interface MeLegalConsent { accepted_version: number | null; accepted_at: string | null }`; `MeResponse` gains `legal_consent: MeLegalConsent`.
  - `usersApi`: `export interface AcceptLegalConsentBody { terms_accepted: boolean; privacy_accepted: boolean }`; `export interface LegalConsentState { accepted_version: number | null; accepted_at: string | null }`; `useAcceptLegalConsentMutation` (returns `LegalConsentState`, `invalidatesTags: ['Auth','User']`).

- [ ] **Step 1: Extend `PublicSettings`**

In `apps/client/src/store/api/publicSettingsApi.ts`, replace the interface:

```ts
export interface PublicSettings {
  promotionsEnabled: boolean;
  mapHoverRecenter: boolean;
  legalConsentRequired: boolean;
  legalConsentVersion: number;
}
```

(Leave the `getPublicSettings` endpoint and the `useGetPublicSettingsQuery` export unchanged.)

- [ ] **Step 2: Extend `MeResponse` with `legal_consent`**

In `apps/client/src/store/api/authApi.ts`, add the interface next to `UserProfile` and add the field to `MeResponse`:

```ts
export interface MeLegalConsent {
  /** Версия последнего согласия; null — ни разу не соглашался. */
  accepted_version: number | null;
  accepted_at: string | null;
}

export interface MeResponse {
  id: string;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  default_language: Language;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  roles: UserRole[];
  profile: UserProfile;
  legal_consent: MeLegalConsent;
}
```

(Do not change the `getMe` endpoint — it already `providesTags: ['Auth','User']`.)

- [ ] **Step 3: Add the `acceptLegalConsent` mutation**

In `apps/client/src/store/api/usersApi.ts`, add the body/result types above the slice and the endpoint inside `endpoints`:

```ts
/** Тело `POST /api/v1/users/me/legal-consent` — обе галочки обязательны (true). */
export interface AcceptLegalConsentBody {
  terms_accepted: boolean;
  privacy_accepted: boolean;
}

/** Ответ согласия — та же форма, что `MeResponse.legal_consent`. */
export interface LegalConsentState {
  accepted_version: number | null;
  accepted_at: string | null;
}
```

Add inside `endpoints: (build) => ({ ... })`, after `updateProfile`:

```ts
    acceptLegalConsent: build.mutation<LegalConsentState, AcceptLegalConsentBody>({
      query: (body) => ({
        url: '/users/me/legal-consent',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Auth', 'User'],
    }),
```

Update the hook export line:

```ts
export const {
  useUpdateUserMutation,
  useUpdateProfileMutation,
  useAcceptLegalConsentMutation,
} = usersApi;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS (no errors). If errors mention `legal_consent` missing on a `MeResponse` literal elsewhere, that's a real consumer — fix it to include the field.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/store/api/publicSettingsApi.ts apps/client/src/store/api/authApi.ts apps/client/src/store/api/usersApi.ts
git commit -m "feat(client): extend RTK contracts for legal consent + accept mutation"
```

---

## Task 2: `useLegalConsentGate` hook (TDD)

Pure predicate. Mirrors `usePromotionsEnabled` (fail-safe flag hook) but combines three inputs: auth state, public settings, and `me`.

**Files:**
- Create: `apps/client/src/lib/useLegalConsentGate.ts`
- Test: `apps/client/src/lib/useLegalConsentGate.test.ts`

**Interfaces:**
- Consumes: `useGetPublicSettingsQuery` (Task 1), `useGetMeQuery` (authApi), `useAppSelector` + `selectIsAuthenticated` (`@/store/slices/authSlice`).
- Produces: `export function useLegalConsentGate(): boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/lib/useLegalConsentGate.test.ts` (mirrors `usePromotionsEnabled.test.ts`, mocking all three inputs):

```ts
/**
 * useLegalConsentGate — поведенческая матрица (design 2026-06-29 §5).
 * Fail-safe: пока что-то грузится/ошибка — не показывать.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

let mockAuthed = true;
let mockSettings = {
  data: undefined as
    | { legalConsentRequired: boolean; legalConsentVersion: number }
    | undefined,
  isLoading: false,
  isError: false,
};
let mockMe = {
  data: undefined as
    | { legal_consent: { accepted_version: number | null } }
    | undefined,
  isLoading: false,
  isError: false,
};

vi.mock('@/store/hooks', () => ({ useAppSelector: () => mockAuthed }));
vi.mock('@/store/api/publicSettingsApi', () => ({
  useGetPublicSettingsQuery: () => mockSettings,
}));
vi.mock('@/store/api/authApi', () => ({ useGetMeQuery: () => mockMe }));

import { useLegalConsentGate } from './useLegalConsentGate';

const settings = (required: boolean, version: number) => ({
  data: { legalConsentRequired: required, legalConsentVersion: version },
  isLoading: false,
  isError: false,
});
const me = (accepted_version: number | null) => ({
  data: { legal_consent: { accepted_version } },
  isLoading: false,
  isError: false,
});

describe('useLegalConsentGate', () => {
  beforeEach(() => {
    mockAuthed = true;
    mockSettings = settings(true, 2);
    mockMe = me(null);
  });

  it('false для гостя (не вошёл)', () => {
    mockAuthed = false;
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false когда флаг выключен', () => {
    mockSettings = settings(false, 2);
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false пока грузятся настройки (fail-safe)', () => {
    mockSettings = { data: undefined, isLoading: true, isError: false };
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false при ошибке настроек (fail-safe)', () => {
    mockSettings = { data: undefined, isLoading: false, isError: true };
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('false пока грузится me (fail-safe)', () => {
    mockMe = { data: undefined, isLoading: true, isError: false };
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });

  it('true когда ни разу не соглашался', () => {
    mockMe = me(null);
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(true);
  });

  it('true когда принятая версия устарела', () => {
    mockMe = me(1); // < 2
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(true);
  });

  it('false когда принятая версия актуальна', () => {
    mockMe = me(2);
    expect(renderHook(() => useLegalConsentGate()).result.current).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @avino/client test -- useLegalConsentGate`
Expected: FAIL with "Failed to resolve import './useLegalConsentGate'" (file not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/client/src/lib/useLegalConsentGate.ts`:

```ts
import { useGetMeQuery } from '@/store/api/authApi';
import { useGetPublicSettingsQuery } from '@/store/api/publicSettingsApi';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';

/**
 * Нужно ли показать блокирующую модалку согласия (design 2026-06-29 §5).
 * Fail-safe: пока настройки или `me` грузятся/в ошибке — возвращаем false,
 * чтобы не блокировать пользователя зря.
 */
export function useLegalConsentGate(): boolean {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const settings = useGetPublicSettingsQuery();
  const me = useGetMeQuery(undefined, { skip: !isAuthenticated });

  if (!isAuthenticated) return false;
  if (settings.isLoading || settings.isError || !settings.data) return false;
  if (!settings.data.legalConsentRequired) return false;
  if (me.isLoading || me.isError || !me.data) return false;

  const accepted = me.data.legal_consent.accepted_version;
  return accepted == null || accepted < settings.data.legalConsentVersion;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @avino/client test -- useLegalConsentGate`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/useLegalConsentGate.ts apps/client/src/lib/useLegalConsentGate.test.ts
git commit -m "feat(client): add useLegalConsentGate fail-safe predicate hook"
```

---

## Task 3: `legalConsent` i18n + `LegalConsentModal` (TDD)

The blocking modal. i18n keys are folded in here because the component needs them and the test resolves against `ru.json`. The two checkbox labels use a plain `prefix` + a `<Link>` whose text is a separate key — this keeps the simple `next-intl` test mock (plain string interpolation, **no** `t.rich`) working.

**Files:**
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json`
- Create: `apps/client/src/components/layout/LegalConsentModal.tsx`
- Test: `apps/client/src/components/layout/LegalConsentModal.test.tsx`

**Interfaces:**
- Consumes: `useAcceptLegalConsentMutation` (Task 1), `getApiError`/`isNetworkError` (`@/store/api/apiError`), `Link` (`@/i18n/navigation`), `Button` (`@/components/ui/button`), `Dialog` (`radix-ui`).
- Produces: `export function LegalConsentModal(): JSX.Element` — always renders an open, non-dismissible dialog (caller decides whether to mount it).

- [ ] **Step 1: Add the `legalConsent` namespace to `ru.json`**

In `apps/client/messages/ru.json`, add a top-level `"legalConsent"` key (sibling of `"legal"`):

```json
  "legalConsent": {
    "title": "Согласие с условиями",
    "description": "Чтобы продолжить пользоваться Avino, примите Правила пользования и Политику конфиденциальности.",
    "termsPrefix": "Я принимаю",
    "termsLink": "Правила пользования",
    "privacyPrefix": "Я принимаю",
    "privacyLink": "Политику конфиденциальности",
    "accept": "Согласен и продолжить",
    "errors": {
      "incomplete": "Нужно принять оба документа.",
      "network": "Не удалось связаться с сервером. Проверьте интернет-соединение и попробуйте ещё раз."
    }
  }
```

- [ ] **Step 2: Add the same namespace to `en.json`**

In `apps/client/messages/en.json`:

```json
  "legalConsent": {
    "title": "Accept our terms",
    "description": "To keep using Avino, please accept the Terms of Service and the Privacy Policy.",
    "termsPrefix": "I accept the",
    "termsLink": "Terms of Service",
    "privacyPrefix": "I accept the",
    "privacyLink": "Privacy Policy",
    "accept": "Accept and continue",
    "errors": {
      "incomplete": "Please accept both documents.",
      "network": "Couldn't reach the server. Check your connection and try again."
    }
  }
```

- [ ] **Step 3: Add the same namespace to `uz.json` (Latin script)**

In `apps/client/messages/uz.json`:

```json
  "legalConsent": {
    "title": "Shartlarga rozilik",
    "description": "Avino'dan foydalanishni davom ettirish uchun Foydalanish qoidalari va Maxfiylik siyosatini qabul qiling.",
    "termsPrefix": "Men qabul qilaman",
    "termsLink": "Foydalanish qoidalari",
    "privacyPrefix": "Men qabul qilaman",
    "privacyLink": "Maxfiylik siyosati",
    "accept": "Roziman va davom etish",
    "errors": {
      "incomplete": "Ikkala hujjatni ham qabul qilish kerak.",
      "network": "Server bilan bog'lanib bo'lmadi. Internet aloqasini tekshiring va qayta urinib ko'ring."
    }
  }
```

- [ ] **Step 4: Verify i18n parity + no Cyrillic in `uz`**

Run (from `apps/client`):
```bash
node -e "for (const l of ['ru','uz','en']) { const m=require('./messages/'+l+'.json').legalConsent; console.log(l, JSON.stringify(Object.keys(m))+' errors:'+JSON.stringify(Object.keys(m.errors))); }"
```
Expected: identical key arrays for all three: `["title","description","termsPrefix","termsLink","privacyPrefix","privacyLink","accept","errors"]` and `errors: ["incomplete","network"]`.

Then scan `uz.json`'s new block for Cyrillic homoglyphs:
```bash
grep -nP '"legalConsent"' -A 14 messages/uz.json | grep -nP '[\x{0400}-\x{04FF}]' && echo "CYRILLIC FOUND — FIX" || echo "uz block clean"
```
Expected: `uz block clean`.

- [ ] **Step 5: Write the failing component test**

Create `apps/client/src/components/layout/LegalConsentModal.test.tsx` (mirrors `LoginModal.test.tsx` mocking conventions):

```tsx
/**
 * LegalConsentModal — блокирующая модалка согласия:
 *  - кнопка disabled, пока не отмечены обе галочки;
 *  - submit шлёт { terms_accepted: true, privacy_accepted: true };
 *  - ссылки на /legal/terms и /legal/privacy (target=_blank);
 *  - блокирующая: нет кнопки закрытия.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next-intl', async () => {
  const ru = (await import('../../../messages/ru.json')).default as Record<string, unknown>;
  const useTranslations =
    (ns: string) =>
    (key: string, vars?: Record<string, unknown>): string => {
      const root = (ns ? ru[ns] : ru) as Record<string, unknown>;
      const val = key.split('.').reduce<unknown>(
        (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
        root,
      );
      if (typeof val !== 'string') return key;
      return vars ? val.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : val;
    };
  return { useTranslations };
});

vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, ...props }: { children?: React.ReactNode }) => <a {...props}>{children}</a>,
}));

const acceptSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ accepted_version: 1, accepted_at: 'x' }) }));
const idleState = { isLoading: false, error: undefined, reset: vi.fn() };
vi.mock('@/store/api/usersApi', () => ({
  useAcceptLegalConsentMutation: () => [acceptSpy, idleState],
}));

import { LegalConsentModal } from './LegalConsentModal';

describe('LegalConsentModal', () => {
  beforeEach(() => acceptSpy.mockClear());

  it('кнопка disabled, пока не отмечены обе галочки', async () => {
    const user = userEvent.setup();
    render(<LegalConsentModal />);
    const accept = screen.getByRole('button', { name: 'Согласен и продолжить' });
    expect(accept).toBeDisabled();

    const boxes = screen.getAllByRole('checkbox');
    await user.click(boxes[0]);
    expect(accept).toBeDisabled();
    await user.click(boxes[1]);
    expect(accept).toBeEnabled();
  });

  it('submit шлёт обе галочки true', async () => {
    const user = userEvent.setup();
    render(<LegalConsentModal />);
    for (const b of screen.getAllByRole('checkbox')) await user.click(b);
    await user.click(screen.getByRole('button', { name: 'Согласен и продолжить' }));
    expect(acceptSpy).toHaveBeenCalledWith({ terms_accepted: true, privacy_accepted: true });
  });

  it('ссылки ведут на юр-страницы в новой вкладке', () => {
    render(<LegalConsentModal />);
    const terms = screen.getByRole('link', { name: 'Правила пользования' });
    const privacy = screen.getByRole('link', { name: 'Политику конфиденциальности' });
    expect(terms).toHaveAttribute('href', '/legal/terms');
    expect(terms).toHaveAttribute('target', '_blank');
    expect(privacy).toHaveAttribute('href', '/legal/privacy');
    expect(privacy).toHaveAttribute('target', '_blank');
  });

  it('блокирующая: нет кнопки закрытия', () => {
    render(<LegalConsentModal />);
    expect(screen.queryByRole('button', { name: /закрыть|close/i })).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @avino/client test -- LegalConsentModal`
Expected: FAIL with "Failed to resolve import './LegalConsentModal'".

- [ ] **Step 7: Write the modal implementation**

Create `apps/client/src/components/layout/LegalConsentModal.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { getApiError, isNetworkError } from '@/store/api/apiError';
import { useAcceptLegalConsentMutation } from '@/store/api/usersApi';

/**
 * Блокирующая модалка согласия с Правилами и Политикой (design 2026-06-29 §5).
 * Монтируется только когда согласие требуется (см. LegalConsentGate). Нельзя
 * закрыть: нет крестика, Esc и клик вне — preventDefault. Кнопка «Согласен»
 * активна только когда отмечены обе галочки. После успеха getMe перечитывается
 * (invalidatesTags) → гейт размонтирует модалку.
 */
export function LegalConsentModal() {
  const t = useTranslations('legalConsent');
  const [terms, setTerms] = React.useState(false);
  const [privacy, setPrivacy] = React.useState(false);
  const [accept, state] = useAcceptLegalConsentMutation();

  const apiError = getApiError(state.error);
  const errorMessage = apiError
    ? t('errors.incomplete')
    : isNetworkError(state.error)
      ? t('errors.network')
      : null;

  const handleAccept = async () => {
    try {
      await accept({ terms_accepted: terms, privacy_accepted: privacy }).unwrap();
      /* успех: getMe перечитывается, гейт размонтирует модалку */
    } catch {
      /* ошибка показывается через errorMessage */
    }
  };

  return (
    <Dialog.Root open onOpenChange={() => undefined}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content
          className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-8 shadow-raised"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-[24px]">{t('title')}</Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[14.5px] text-muted-foreground">
            {t('description')}
          </Dialog.Description>

          <div className="mt-6 space-y-3.5">
            <label htmlFor="consent-terms" className="flex items-start gap-3 text-[14.5px]">
              <input
                id="consent-terms"
                type="checkbox"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                className="mt-0.5 size-[18px] shrink-0 accent-red"
              />
              <span>
                {t('termsPrefix')}{' '}
                <Link href="/legal/terms" target="_blank" className="font-semibold text-teal hover:text-teal-deep">
                  {t('termsLink')}
                </Link>
              </span>
            </label>

            <label htmlFor="consent-privacy" className="flex items-start gap-3 text-[14.5px]">
              <input
                id="consent-privacy"
                type="checkbox"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-0.5 size-[18px] shrink-0 accent-red"
              />
              <span>
                {t('privacyPrefix')}{' '}
                <Link href="/legal/privacy" target="_blank" className="font-semibold text-teal hover:text-teal-deep">
                  {t('privacyLink')}
                </Link>
              </span>
            </label>
          </div>

          {errorMessage && (
            <p className="mt-4 text-[13.5px] text-red" role="alert">
              {errorMessage}
            </p>
          )}

          <Button
            className="mt-6 w-full"
            disabled={!terms || !privacy || state.isLoading}
            onClick={handleAccept}
          >
            {t('accept')}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @avino/client test -- LegalConsentModal`
Expected: PASS (4 tests). If a checkbox-role query fails, confirm `<input type="checkbox">` (not a styled `div`).

- [ ] **Step 9: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json apps/client/src/components/layout/LegalConsentModal.tsx apps/client/src/components/layout/LegalConsentModal.test.tsx
git commit -m "feat(client): add blocking LegalConsentModal + legalConsent i18n (ru/uz/en)"
```

---

## Task 4: `LegalConsentGate` wrapper + global mount (TDD)

Wires hook → modal and mounts it once so it overlays any page. Mirrors the always-mounted, render-null `SessionBootstrap` pattern.

**Files:**
- Create: `apps/client/src/components/LegalConsentGate.tsx`
- Test: `apps/client/src/components/LegalConsentGate.test.tsx`
- Modify: `apps/client/src/store/StoreProvider.tsx`

**Interfaces:**
- Consumes: `useLegalConsentGate` (Task 2), `LegalConsentModal` (Task 3).
- Produces: `export function LegalConsentGate(): JSX.Element | null` — renders the modal only when the gate predicate is true.

- [ ] **Step 1: Write the failing test**

Create `apps/client/src/components/LegalConsentGate.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let mockShow = false;
vi.mock('@/lib/useLegalConsentGate', () => ({ useLegalConsentGate: () => mockShow }));
vi.mock('@/components/layout/LegalConsentModal', () => ({
  LegalConsentModal: () => <div data-testid="legal-modal" />,
}));

import { LegalConsentGate } from './LegalConsentGate';

describe('LegalConsentGate', () => {
  beforeEach(() => {
    mockShow = false;
  });

  it('ничего не рендерит, когда согласие не требуется', () => {
    render(<LegalConsentGate />);
    expect(screen.queryByTestId('legal-modal')).toBeNull();
  });

  it('рендерит модалку, когда согласие требуется', () => {
    mockShow = true;
    render(<LegalConsentGate />);
    expect(screen.getByTestId('legal-modal')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @avino/client test -- LegalConsentGate`
Expected: FAIL with "Failed to resolve import './LegalConsentGate'".

- [ ] **Step 3: Write the gate component**

Create `apps/client/src/components/LegalConsentGate.tsx`:

```tsx
'use client';

import { LegalConsentModal } from '@/components/layout/LegalConsentModal';
import { useLegalConsentGate } from '@/lib/useLegalConsentGate';

/**
 * Глобальный гейт согласия: монтируется один раз (StoreProvider) и рендерит
 * блокирующую модалку, только когда согласие требуется. Модалка перекрывает
 * любую страницу публичного портала.
 */
export function LegalConsentGate() {
  const shouldShow = useLegalConsentGate();
  if (!shouldShow) return null;
  return <LegalConsentModal />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @avino/client test -- LegalConsentGate`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount the gate in `StoreProvider`**

In `apps/client/src/store/StoreProvider.tsx`, add the import and render `<LegalConsentGate />` as a sibling of `<SessionBootstrap />`:

```tsx
import { LegalConsentGate } from '@/components/LegalConsentGate';
```

```tsx
  return (
    <Provider store={storeRef.current}>
      <FavoritesHydrator />
      <CurrencyHydrator />
      <SessionBootstrap />
      <LegalConsentGate />
      {children}
    </Provider>
  );
```

(Match the existing import style — relative vs `@/` alias — used by the other helpers in this file.)

- [ ] **Step 6: Full verification**

Run:
```bash
pnpm --filter @avino/client test
pnpm --filter @avino/client lint
pnpm --filter @avino/client exec tsc --noEmit
```
Expected: tests PASS (new suites green; the 2 pre-existing `LoginModal.test.tsx` failures from an unmocked `useAppleLoginMutation` are known debt, **not** a regression — [[avino-loginmodal-test-preexisting-fail]]). Lint clean. Typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/components/LegalConsentGate.tsx apps/client/src/components/LegalConsentGate.test.tsx apps/client/src/store/StoreProvider.tsx
git commit -m "feat(client): mount LegalConsentGate globally in StoreProvider"
```

---

## Task 5: Manual smoke verification (optional but recommended)

Confirm the gate actually blocks in a running stack. Skip only if the controller decides docs/tests are sufficient.

**Files:** none.

- [ ] **Step 1: Bring up the stack and enable the flag**

The flag defaults OFF. Enable it via the admin toggle (apps/web, PR #265/#266 in `main`) or directly: set `app_settings.legal_consent_required = true`, `legal_consent_version = 1`. Recipe: [[avino-local-live-verify-recipe]] / [[avino-staging-server-deploy]].

- [ ] **Step 2: Verify behavior matrix**

- Logged out → no modal (browse freely).
- Logged in, flag ON, never consented → blocking modal; cannot Esc / click-out / find a close button; "Согласен" disabled until both boxes checked.
- Click both + Согласен → modal disappears (getMe refetched); reload → no modal.
- Bump `legal_consent_version` to 2 → modal reappears on next load.

(No commit — verification only.)

---

## Task 6: ADR follow-up + tracking (in this feature PR)

Per project convention, ADR/DONE updates ship **inside** the feature PR ([[avino-finalize-in-feature-pr]]).

**Files:**
- Modify: `docs/adr/ADR-0115-legal-consent-modal.md`
- Modify: `docs/DONE.md`, `docs/TASKS.md`

- [ ] **Step 1: Append the PR №3 follow-up to ADR-0115**

After the existing `## Follow-up — PR №2 (apps/web admin-тоггл)` section, add:

```markdown
## Follow-up — PR №3 (apps/client модалка)

Клиентская реализация блокирующего гейта поверх бэкенда этого ADR:

- `apps/client/src/store/api/publicSettingsApi.ts` — `PublicSettings +=
  { legalConsentRequired, legalConsentVersion }`.
- `apps/client/src/store/api/authApi.ts` — `MeResponse += legal_consent
  { accepted_version, accepted_at }`.
- `apps/client/src/store/api/usersApi.ts` — мутация `acceptLegalConsent`
  (`POST /users/me/legal-consent`, `invalidatesTags: ['Auth','User']`).
- `apps/client/src/lib/useLegalConsentGate.ts` — fail-safe предикат показа
  (пока настройки/`me` грузятся или в ошибке — не блокируем).
- `apps/client/src/components/layout/LegalConsentModal.tsx` — radix `Dialog`
  без крестика; Esc / клик-вне → `preventDefault`; две галочки со ссылками на
  `/legal/terms` и `/legal/privacy` (`target=_blank`); «Согласен» активна
  только при обеих отметках. i18n `legalConsent.*` на ru/uz/en.
- `apps/client/src/components/LegalConsentGate.tsx` — смонтирован один раз в
  `StoreProvider`, перекрывает любую страницу.

Все три PR (№1 api, №2 web, №3 client) ADR-0115 закрыты.
```

- [ ] **Step 2: Update tracking files**

In `docs/DONE.md`, add an entry (match the existing format; use the real PR number/branch once the controller opens the PR — `PR: pending` until then):

```markdown
## 2026-06-29

### Legal consent — PR №3 (apps/client blocking modal)

Status: DONE
Branch: feat/client-legal-consent-modal
PR: pending
Files changed:
- apps/client/src/store/api/publicSettingsApi.ts
- apps/client/src/store/api/authApi.ts
- apps/client/src/store/api/usersApi.ts
- apps/client/src/lib/useLegalConsentGate.ts (+ test)
- apps/client/src/components/layout/LegalConsentModal.tsx (+ test)
- apps/client/src/components/LegalConsentGate.tsx (+ test)
- apps/client/src/store/StoreProvider.tsx
- apps/client/messages/{ru,uz,en}.json

Summary:
- Blocking, non-dismissible consent modal gated on backend flag + version.
- Fail-safe: never blocks while settings/me are loading or errored.
- Closes the apps/client part of ADR-0115.

Related ADR:
- docs/adr/ADR-0115-legal-consent-modal.md
```

If `docs/TASKS.md` has an active entry for this client modal task, remove it (completed tasks must not stay in TASKS.md).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-0115-legal-consent-modal.md docs/DONE.md docs/TASKS.md
git commit -m "docs(legal-consent): ADR-0115 follow-up + DONE entry for client modal"
```

---

## After implementation (controller-only — not a subagent step)

Open the PR from `feat/client-legal-consent-modal` → `main` via `gh` (token at `~/.gh_token`; never print it). `main` is protected — the **user merges**, never `--admin` ([[avino-main-branch-protection]], [[avino-git-mutation-single-commands]]).

---

## Self-Review

**Spec coverage (design §5):**
- `publicSettingsApi += legalConsentRequired/Version` → Task 1 ✓
- `authApi MeResponse += legal_consent` → Task 1 ✓
- `usersApi acceptLegalConsent` mutation, invalidates Auth/User → Task 1 ✓
- `useLegalConsentGate` fail-safe hook → Task 2 ✓
- `LegalConsentModal` radix Dialog, no close, Esc/outside preventDefault, two checkboxes with terms/privacy links (target=_blank), accept disabled until both → Task 3 ✓
- i18n `legalConsent.*` ru/uz/en → Task 3 ✓
- Mounted once in authed zone (StoreProvider) → Task 4 ✓
- ADR-0115 follow-up + DONE/TASKS → Task 6 ✓

**Placeholder scan:** No TBD/"handle errors"/"similar to". All steps carry full code and exact commands. ✓

**Type consistency:** `legal_consent` / `accepted_version` / `legalConsentRequired` / `legalConsentVersion` / `AcceptLegalConsentBody{terms_accepted,privacy_accepted}` / `useAcceptLegalConsentMutation` / `useLegalConsentGate` used identically across Tasks 1→4 and match the verified backend wire format. ✓

**Known non-blockers:** 2 pre-existing `LoginModal.test.tsx` failures are expected debt, not a regression.
