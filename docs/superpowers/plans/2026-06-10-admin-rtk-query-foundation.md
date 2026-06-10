# Admin RTK Query Auth Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-establish the Redux/RTK Query auth foundation (store, baseQuery с авто-refresh, OTP-логин, guard роли ADMIN) в редизайненной админке `apps/web`, чтобы защищённые `/admin/*` могли ходить в реальный API.

**Architecture:** Слой данных (`store/api/*`, `store/slices/*`, `store.ts`, `StoreProvider`) портируется из `apps/web_old` **дословно** (он уже live-проверен, алиасы `@/store/*` совпадают). UI-экраны (login, guard loading/403/error, кнопка logout) **пишутся заново** под новый дизайн (`a-card`/`a-field`/`abtn`/CSS-токены), RU-строки инлайн. Бизнес-страницы и мапперы DTO→UI — вне этого PR.

**Tech Stack:** Next 15 (App Router) · React 19 · Redux Toolkit 2 + RTK Query · react-redux 9 · Tailwind v4 + CSS-токены Avino.

---

## О подходе к проверке (важно — отклонение от TDD по умолчанию)

В `apps/web` **нет тест-раннера** (`"test": "echo \"no tests yet\""`), и весь предыдущий admin-слой (ADMIN-01..17) шипился с gate'ами `lint` + `build` + ручной live-прогон, без unit-тестов (см. `docs/TASK_ADMIN_PANEL.md` §1). Приоритет инструкций: соглашения проекта > дефолт skill'а. Поэтому **не вводим vitest** (YAGNI, против established pattern). Верификация каждой задачи:

```bash
pnpm --filter @avino/web exec tsc --noEmit   # типы (быстро)
pnpm --filter @avino/web lint                # eslint
```

Полный `pnpm --filter @avino/web build` и ручной smoke — в финальной задаче.

> Прим. по окружению: некоторые команды `pnpm`/`git` могут требовать подтверждения песочницы — это ожидаемо.

---

## Структура файлов

| Файл | Действие | Ответственность |
|---|---|---|
| `apps/web/src/store/api/baseApi.ts` | Create (port) | `createApi`, tagTypes, точка `injectEndpoints` |
| `apps/web/src/store/api/baseQuery.ts` | Create (port) | Bearer + single-flight авто-refresh на 401 |
| `apps/web/src/store/api/authApi.ts` | Create (port) | OTP request/verify/refresh/logout/me |
| `apps/web/src/store/api/apiError.ts` | Create (port) | `getApiError`/`getApiErrorCode` |
| `apps/web/src/store/slices/authSlice.ts` | Create (port) | токены (access в памяти, refresh в localStorage) |
| `apps/web/src/store/store.ts` | Create (port) | `makeStore`, `RootState`, `AppDispatch` |
| `apps/web/src/store/StoreProvider.tsx` | Create (port) | Provider + `initializeAuth` |
| `apps/web/src/hooks/useLogout.ts` | Create | logout-мутация + `logOut` + редирект |
| `apps/web/src/components/admin/RoleGuard.tsx` | Create | гидрация → getMe → роль ADMIN (новый стиль) |
| `apps/web/src/components/admin/ConditionalShell.tsx` | Create | login chromeless; остальное под guard+shell |
| `apps/web/src/components/admin/login/LoginForm.tsx`? | — | (логин кладём прямо в `app/admin/login/page.tsx`) |
| `apps/web/src/app/admin/login/page.tsx` | Create | двухшаговый EMAIL-OTP (новый стиль) |
| `apps/web/src/app/admin/layout.tsx` | Modify | StoreProvider → ToastProvider → ConditionalShell |
| `apps/web/src/components/admin/icons.tsx` | Modify | + `Mail`, `LogOut` |
| `apps/web/src/components/admin/Topbar.tsx` | Modify | реальные имя/email + кнопка выхода |

---

## Task 1: Портировать слой данных (store/) из web_old

Файлы `web_old` используют только `@reduxjs/toolkit`, `react-redux` и относительные импорты — внешних зависимостей нового web не нарушают, алиас `@/store/*` идентичен. Копируются дословно.

**Files:**
- Create: `apps/web/src/store/api/baseApi.ts`, `baseQuery.ts`, `authApi.ts`, `apiError.ts`
- Create: `apps/web/src/store/slices/authSlice.ts`
- Create: `apps/web/src/store/store.ts`, `apps/web/src/store/StoreProvider.tsx`

- [ ] **Step 1: Скопировать 7 файлов из web_old**

```bash
mkdir -p apps/web/src/store/api apps/web/src/store/slices
cp apps/web_old/src/store/api/baseApi.ts      apps/web/src/store/api/baseApi.ts
cp apps/web_old/src/store/api/baseQuery.ts    apps/web/src/store/api/baseQuery.ts
cp apps/web_old/src/store/api/authApi.ts      apps/web/src/store/api/authApi.ts
cp apps/web_old/src/store/api/apiError.ts     apps/web/src/store/api/apiError.ts
cp apps/web_old/src/store/slices/authSlice.ts apps/web/src/store/slices/authSlice.ts
cp apps/web_old/src/store/store.ts            apps/web/src/store/store.ts
cp apps/web_old/src/store/StoreProvider.tsx   apps/web/src/store/StoreProvider.tsx
```

- [ ] **Step 2: Проверить, что лишних импортов нет**

```bash
grep -RnE "@/(layout|lib/i18n|components)" apps/web/src/store/   # ожидаем: пусто
```
Expected: пустой вывод (файлы самодостаточны). Если что-то найдено — удалить/заменить ссылку.

- [ ] **Step 3: Типы и линт**

```bash
pnpm --filter @avino/web exec tsc --noEmit && pnpm --filter @avino/web lint
```
Expected: без ошибок (файлы компилируются как единый граф; циклы типов TS допустимы).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/store
git commit -m "feat(web): port RTK Query store + auth layer from web_old"
```

---

## Task 2: Хук useLogout

**Files:**
- Create: `apps/web/src/hooks/useLogout.ts`

- [ ] **Step 1: Создать хук**

```tsx
'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch, useSelector } from 'react-redux';
import { useLogoutMutation } from '@/store/api/authApi';
import { logOut, selectRefreshToken } from '@/store/slices/authSlice';

/**
 * useLogout — выход из админки.
 * Отзывает refresh на бэкенде (POST /auth/logout), чистит локальное состояние
 * (logOut: память + localStorage), редиректит на /admin/login. Сетевую ошибку
 * logout игнорируем — локально всё равно разлогиниваемся.
 */
export function useLogout() {
  const router = useRouter();
  const dispatch = useDispatch();
  const refreshToken = useSelector(selectRefreshToken);
  const [logoutMutation] = useLogoutMutation();

  return useCallback(async () => {
    try {
      if (refreshToken) {
        await logoutMutation({ refresh_token: refreshToken }).unwrap();
      }
    } catch {
      /* игнорируем — чистим локально в любом случае */
    } finally {
      dispatch(logOut());
      router.replace('/admin/login');
    }
  }, [refreshToken, logoutMutation, dispatch, router]);
}
```

- [ ] **Step 2: Типы и линт**

```bash
pnpm --filter @avino/web exec tsc --noEmit && pnpm --filter @avino/web lint
```
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/hooks/useLogout.ts
git commit -m "feat(web): add useLogout hook"
```

---

## Task 3: RoleGuard (новый стиль)

Логика 1:1 с web_old (гидрация-гейт → getMe → роль ADMIN), вёрстка переписана под дизайн-токены, RU-строки инлайн.

**Files:**
- Create: `apps/web/src/components/admin/RoleGuard.tsx`

- [ ] **Step 1: Создать RoleGuard**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import {
  selectAuthInitialized,
  selectIsAuthenticated,
} from '@/store/slices/authSlice';
import { useGetMeQuery } from '@/store/api/authApi';
import { useLogout } from '@/hooks/useLogout';

/**
 * RoleGuard — доступ к разделам админки (порт логики ADMIN-06, новый стиль).
 *  1. До гидрации/инициализации — нейтральный экран загрузки (нет hydration mismatch).
 *  2. Нет токенов → редирект /admin/login.
 *  3. Есть токен → GET /auth/me (истёкший access восстановит авто-refresh).
 *  4. Нет роли ADMIN → 403. Не-401 ошибка → «Повторить/Выйти».
 * Монтируется только на не-логин маршрутах (см. ConditionalShell).
 */

const LOGIN_ROUTE = '/admin/login';

export function RoleGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const initialized = useSelector(selectAuthInitialized);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const ready = hydrated && initialized;

  const { data: me, isLoading, isError, refetch } = useGetMeQuery(undefined, {
    skip: !ready || !isAuthenticated,
  });

  useEffect(() => {
    if (ready && !isAuthenticated) router.replace(LOGIN_ROUTE);
  }, [ready, isAuthenticated, router]);

  if (!ready) return <StatusScreen>Загрузка…</StatusScreen>;
  if (!isAuthenticated) return <StatusScreen>Перенаправление…</StatusScreen>;
  if (isLoading) return <StatusScreen>Проверка доступа…</StatusScreen>;

  if (me) {
    if (me.roles.includes('ADMIN')) return <>{children}</>;
    return <ForbiddenScreen email={me.email} />;
  }
  if (isError) return <ErrorScreen onRetry={() => refetch()} />;
  return <StatusScreen>Проверка доступа…</StatusScreen>;
}

// ─── Экраны состояний (дизайн-токены Avino) ─────────────────────────────────

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)', padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 24 }}>
          <span
            style={{
              width: 40, height: 40, borderRadius: 12, background: 'var(--red)',
              color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >A</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Avino</span>
        </div>
        <div className="a-card" style={{ padding: 28 }}>{children}</div>
      </div>
    </main>
  );
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)',
      }}
    >
      <div className="col" style={{ alignItems: 'center', gap: 14 }}>
        <span
          aria-hidden
          style={{
            width: 30, height: 30, borderRadius: '50%',
            border: '3px solid var(--border)', borderTopColor: 'var(--red)',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <p className="muted" style={{ fontSize: 14 }}>{children}</p>
      </div>
    </main>
  );
}

function ForbiddenScreen({ email }: { email: string | null }) {
  const logout = useLogout();
  return (
    <CenteredShell>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Доступ запрещён</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
        {email ? <>Аккаунт <b>{email}</b> не имеет прав администратора.</> : 'У аккаунта нет прав администратора.'}{' '}
        Войдите под другим аккаунтом.
      </p>
      <button className="abtn abtn-primary" style={{ marginTop: 22, width: '100%' }} onClick={logout}>
        Войти под другим аккаунтом
      </button>
    </CenteredShell>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  const logout = useLogout();
  return (
    <CenteredShell>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Не удалось проверить доступ</h1>
      <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
        Проблема с сетью или сервером. Попробуйте ещё раз.
      </p>
      <button className="abtn abtn-primary" style={{ marginTop: 22, width: '100%' }} onClick={onRetry}>
        Повторить
      </button>
      <button className="abtn abtn-outline" style={{ marginTop: 10, width: '100%' }} onClick={logout}>
        Выйти
      </button>
    </CenteredShell>
  );
}
```

- [ ] **Step 2: Добавить keyframes `spin` в globals.css (если отсутствует)**

Проверить:
```bash
grep -n "@keyframes spin" apps/web/src/app/globals.css
```
Если пусто — дописать в конец `apps/web/src/app/globals.css`:
```css
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 3: Типы и линт**

```bash
pnpm --filter @avino/web exec tsc --noEmit && pnpm --filter @avino/web lint
```
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/RoleGuard.tsx apps/web/src/app/globals.css
git commit -m "feat(web): add ADMIN RoleGuard with styled state screens"
```

---

## Task 4: ConditionalShell + монтаж провайдера в layout

**Files:**
- Create: `apps/web/src/components/admin/ConditionalShell.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`

- [ ] **Step 1: Создать ConditionalShell**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { AdminShell } from './AdminShell';
import { RoleGuard } from './RoleGuard';

/**
 * ConditionalShell — /admin/login рендерится полноэкранно (без sidebar/header)
 * и вне guard'а (иначе редирект-петля). Остальные маршруты — под RoleGuard +
 * AdminShell.
 */
const CHROMELESS_ROUTES = ['/admin/login'];

export function ConditionalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (CHROMELESS_ROUTES.includes(pathname)) return <>{children}</>;
  return (
    <RoleGuard>
      <AdminShell>{children}</AdminShell>
    </RoleGuard>
  );
}
```

- [ ] **Step 2: Переписать admin/layout.tsx**

Заменить всё содержимое `apps/web/src/app/admin/layout.tsx` на:
```tsx
import { StoreProvider } from '@/store/StoreProvider';
import { ToastProvider } from '@/components/admin/toast';
import { ConditionalShell } from '@/components/admin/ConditionalShell';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <ConditionalShell>{children}</ConditionalShell>
      </ToastProvider>
    </StoreProvider>
  );
}
```

- [ ] **Step 3: Типы и линт**

```bash
pnpm --filter @avino/web exec tsc --noEmit && pnpm --filter @avino/web lint
```
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/ConditionalShell.tsx apps/web/src/app/admin/layout.tsx
git commit -m "feat(web): mount StoreProvider and ConditionalShell in admin layout"
```

---

## Task 5: Страница логина (EMAIL-OTP, новый стиль)

Логика flow и коды ошибок — из web_old (`store/api/apiError.ts` port уже есть). Вёрстка — дизайн-токены, RU-строки инлайн (без useT/Theme/Language).

**Files:**
- Modify: `apps/web/src/components/admin/icons.tsx` (+ `Mail`)
- Create: `apps/web/src/app/admin/login/page.tsx`

- [ ] **Step 1: Добавить иконку Mail в icons.tsx**

В `apps/web/src/components/admin/icons.tsx` добавить `Mail` в список импорта из `lucide-react` (после `Menu,`):
```tsx
  Menu,
  Mail,
```
и в объект `IC` (после `Menu,`):
```tsx
  Menu,
  Mail,
```

- [ ] **Step 2: Создать страницу логина**

`apps/web/src/app/admin/login/page.tsx`:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '@/store/store';
import { setCredentials } from '@/store/slices/authSlice';
import {
  useRequestOtpMutation,
  useVerifyOtpMutation,
} from '@/store/api/authApi';
import { getApiError, getApiErrorCode } from '@/store/api/apiError';
import { IC } from '@/components/admin/icons';

/**
 * Логин админа — passwordless OTP по EMAIL (API.md §3, коды ошибок §17).
 * Шаг 1: email → POST /auth/otp/request (channel EMAIL).
 * Шаг 2: код → POST /auth/otp/verify → setCredentials → /admin.
 * RU-only (внутренний инструмент). Стиль — дизайн-токены Avino.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_LENGTH = 6;

/** Стабильные коды ошибок API.md §17 → RU-текст. */
const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Проверьте правильность введённых данных.',
  RATE_LIMITED: 'Слишком много попыток. Попробуйте позже.',
  OTP_INVALID: 'Неверный код. Проверьте и попробуйте снова.',
  OTP_EXPIRED: 'Срок действия кода истёк. Запросите новый.',
  OTP_ATTEMPTS_EXCEEDED: 'Превышено число попыток. Запросите новый код.',
  USER_BLOCKED: 'Аккаунт заблокирован. Обратитесь к администратору.',
};
const GENERIC_ERROR = 'Что-то пошло не так. Попробуйте ещё раз.';

function messageForCode(code: string | null, fallback?: string): string {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return fallback ?? GENERIC_ERROR;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [requestOtp, requestState] = useRequestOtpMutation();
  const [verifyOtp, verifyState] = useVerifyOtpMutation();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setInterval(
      () => setResendIn((p) => (p <= 1 ? 0 : p - 1)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  const emailValid = EMAIL_RE.test(email.trim());
  const codeValid = code.length === OTP_LENGTH;
  const destination = () => email.trim().toLowerCase();

  async function sendOtp(): Promise<boolean> {
    const res = await requestOtp({ channel: 'EMAIL', destination: destination() }).unwrap();
    setCode('');
    setResendIn(res.resend_after);
    return true;
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailValid) { setError('Введите корректный email.'); return; }
    try {
      await sendOtp();
      setStep('code');
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  async function handleResend() {
    if (resendIn > 0 || requestState.isLoading) return;
    setError(null);
    try {
      await sendOtp();
      codeInputRef.current?.focus();
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!codeValid) { setError(`Код состоит из ${OTP_LENGTH} цифр.`); return; }
    try {
      const res = await verifyOtp({ channel: 'EMAIL', destination: destination(), code }).unwrap();
      dispatch(setCredentials({
        access_token: res.access_token,
        refresh_token: res.refresh_token,
        user: res.user,
      }));
      router.replace('/admin');
    } catch (err) {
      setError(messageForCode(getApiErrorCode(err as never), getApiError(err as never)?.message));
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg)', padding: 24,
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div className="row" style={{ justifyContent: 'center', gap: 10, marginBottom: 24 }}>
          <span
            style={{
              width: 40, height: 40, borderRadius: 12, background: 'var(--red)',
              color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >A</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Avino</span>
        </div>

        <div className="a-card" style={{ padding: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Вход в админку</h1>
          <p className="muted" style={{ marginTop: 6, fontSize: 14 }}>
            {step === 'email'
              ? 'Введите рабочий email — отправим код для входа.'
              : <>Код отправлен на <b>{destination()}</b>.</>}
          </p>

          {error && (
            <div
              role="alert"
              style={{
                marginTop: 18, borderRadius: 10, padding: '10px 14px',
                background: 'var(--red-bg)', color: 'var(--red)', fontSize: 13.5,
                border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
              }}
            >
              {error}
            </div>
          )}

          {step === 'email' ? (
            <form onSubmit={handleRequest} style={{ marginTop: 20 }} noValidate>
              <label htmlFor="email" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6, color: 'var(--ink)' }}>
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <IC.Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  id="email" type="email" inputMode="email" autoComplete="email"
                  autoFocus required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@avino.uz"
                  className="a-field" style={{ paddingLeft: 36, width: '100%' }}
                />
              </div>
              <button
                type="submit" disabled={requestState.isLoading || !emailValid}
                className="abtn abtn-primary"
                style={{ marginTop: 18, width: '100%', opacity: requestState.isLoading || !emailValid ? 0.55 : 1 }}
              >
                {requestState.isLoading ? 'Отправляем…' : 'Получить код'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} style={{ marginTop: 20 }} noValidate>
              <label htmlFor="code" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 6, color: 'var(--ink)' }}>
                Код из письма
              </label>
              <input
                id="code" ref={codeInputRef} type="text" inputMode="numeric"
                autoComplete="one-time-code" pattern="\d*" maxLength={OTP_LENGTH}
                required value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                placeholder="000000"
                className="a-field"
                style={{ width: '100%', textAlign: 'center', fontSize: 20, fontWeight: 700, letterSpacing: '0.4em' }}
              />
              <button
                type="submit" disabled={verifyState.isLoading || !codeValid}
                className="abtn abtn-primary"
                style={{ marginTop: 18, width: '100%', opacity: verifyState.isLoading || !codeValid ? 0.55 : 1 }}
              >
                {verifyState.isLoading ? 'Проверяем…' : 'Войти'}
              </button>
              <div className="row" style={{ justifyContent: 'space-between', marginTop: 14, fontSize: 13.5 }}>
                <button
                  type="button" className="abtn abtn-ghost abtn-sm"
                  onClick={() => { setStep('email'); setCode(''); setError(null); }}
                >
                  Изменить email
                </button>
                <button
                  type="button" className="abtn abtn-ghost abtn-sm"
                  onClick={handleResend}
                  disabled={resendIn > 0 || requestState.isLoading}
                  style={{ color: resendIn > 0 ? 'var(--muted)' : 'var(--teal)' }}
                >
                  {resendIn > 0 ? `Повторить через ${resendIn}с` : 'Отправить ещё раз'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="muted" style={{ marginTop: 22, textAlign: 'center', fontSize: 12 }}>
          Только для администраторов Avino
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Типы и линт**

```bash
pnpm --filter @avino/web exec tsc --noEmit && pnpm --filter @avino/web lint
```
Expected: без ошибок. (Если линт ругается на `abtn-ghost`/`abtn-sm` — это CSS-классы, eslint их не проверяет; убедиться, что они есть в globals.css: `grep -n "abtn-ghost\|abtn-sm" apps/web/src/app/globals.css`. Если `abtn-ghost` отсутствует — заменить на `abtn-outline`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/icons.tsx apps/web/src/app/admin/login/page.tsx
git commit -m "feat(web): add admin EMAIL-OTP login page"
```

---

## Task 6: Logout + реальный пользователь в Topbar

**Files:**
- Modify: `apps/web/src/components/admin/icons.tsx` (+ `LogOut`)
- Modify: `apps/web/src/components/admin/Topbar.tsx`

- [ ] **Step 1: Добавить иконку LogOut**

В `apps/web/src/components/admin/icons.tsx` добавить `LogOut` в импорт из `lucide-react` и в объект `IC` (рядом с `Mail`).

- [ ] **Step 2: Подключить пользователя и выход в Topbar**

В `apps/web/src/components/admin/Topbar.tsx` добавить импорты:
```tsx
import { useGetMeQuery } from '@/store/api/authApi';
import { useLogout } from '@/hooks/useLogout';
```
Внутри `Topbar`, после `const toast = useToast();`:
```tsx
  const { data: me } = useGetMeQuery();
  const logout = useLogout();
```
Заменить кнопку «На сайт» (блок `<AdminButton variant="outline" size="sm" asChild>…</AdminButton>`) на:
```tsx
        <AdminButton variant="outline" size="sm" asChild>
          <Link href="/">← На сайт</Link>
        </AdminButton>
        {me && (
          <div className="row gap-8" style={{ paddingLeft: 4 }}>
            <span
              className="max-[760px]:hidden"
              style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {me.profile?.display_name || me.email}
            </span>
            <IconButton onClick={logout} title="Выйти">
              <IC.LogOut size={19} />
            </IconButton>
          </div>
        )}
```

- [ ] **Step 3: Типы и линт**

```bash
pnpm --filter @avino/web exec tsc --noEmit && pnpm --filter @avino/web lint
```
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin/icons.tsx apps/web/src/components/admin/Topbar.tsx
git commit -m "feat(web): show admin user and logout in topbar"
```

---

## Task 7: Финальные gate'ы + ручной smoke + оформление PR

**Files:** — (проверки)

- [ ] **Step 1: Полная сборка**

```bash
pnpm --filter @avino/web build
```
Expected: `build` зелёный; все маршруты `/admin/*` (+ `/admin/login`) пререндерятся без ошибок.

- [ ] **Step 2: Dev-smoke (вручную)**

```bash
pnpm --filter @avino/web dev   # http://localhost:3000
```
Проверить:
- `/admin` без токена → редирект на `/admin/login`, форма видна, оболочки нет.
- (При поднятом `apps/api`, env `NEXT_PUBLIC_API_BASE_URL`) реальный вход админа → `/admin` с sidebar/header, имя/email в топбаре.
- Не-админ → экран 403. Logout → `/admin/login`.
- Если `apps/api` не стартует (pre-existing `@types/express` в `chat.controller.ts`) — зафиксировать «live не прогнан, нужен ручной прогон», UI-часть (редирект/форма/сборка) проверить без бэкенда.

- [ ] **Step 3: Push + PR**

```bash
gh auth status || gh auth login --with-token < ~/.gh_token
git push -u origin feat/admin-web-rtk-foundation
gh pr create --title "feat(web): RTK Query auth foundation for redesigned admin" --body "$(cat <<'EOF'
## Что сделано
Цикл 3, PR 1 — фундамент данных/auth для редизайненной админки apps/web:
- Портирован RTK Query store-слой из web_old (baseApi, baseQuery с авто-refresh, authApi, apiError, authSlice, store, StoreProvider).
- ConditionalShell + RoleGuard (роль ADMIN), экраны loading/403/error в новом дизайне.
- Страница логина `/admin/login` — двухшаговый EMAIL-OTP (новый стиль, RU).
- useLogout + реальные имя/email и кнопка выхода в топбаре.

## Почему
После визуального редизайна админка работала на моках без store/auth. Без фундамента защищённые `/admin/*` не могут ходить в реальный API. Бизнес-страницы и мапперы DTO→UI — следующими PR цикла 3.

## Как проверить
- `pnpm --filter @avino/web lint && pnpm --filter @avino/web build` — зелёные.
- `/admin` без токена → `/admin/login`; вход админа → панель; не-админ → 403; logout → логин.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Обновить трекер**

В `docs/TASK_ADMIN_PANEL.md` (или новом разделе «Цикл 3») отметить фундамент как `REVIEW`/`DONE` после merge; перенести в `docs/DONE.md` по правилам CLAUDE.md.

---

## Self-Review

**Spec coverage:**
- §3 архитектура (store/api, slices, hooks, components, app) → Tasks 1–6 ✅
- §4 поток аутентификации (provider→guard→login→logout) → Tasks 1,3,4,5,6 ✅
- §5 хранение токенов → Task 1 (authSlice port) ✅
- §6 env `NEXT_PUBLIC_API_BASE_URL` → Task 1 (baseQuery port) + Task 7 smoke ✅
- §7 границы (моки и бизнес-страницы не трогаем) → ни одна задача их не меняет ✅
- §8 gate'ы lint/build + live → Task 7 ✅
- §9 ветка/PR/коммиты → Task 7 ✅

**Placeholder scan:** код приведён полностью в каждом шаге; «опционального LoginForm.tsx» нет — логин в `page.tsx`. Нет TODO/TBD.

**Type consistency:** `setCredentials`, `logOut`, `selectRefreshToken`, `selectAuthInitialized`, `selectIsAuthenticated`, `useGetMeQuery`, `useRequestOtpMutation`, `useVerifyOtpMutation`, `useLogoutMutation`, `AppDispatch`, `getApiError`/`getApiErrorCode` — все определены в портированных файлах Task 1 и используются с теми же сигнатурами. `me.profile?.display_name`/`me.email`/`me.roles` соответствуют `MeResponse` в authApi.
