# Счётчики непрочитанного + звук — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Показать пользователю сколько и чего непрочитано (сообщения / уведомления / входящие туры) в шапке и в кабинете, плюс проигрывать звук при появлении нового.

**Architecture:** Единый auth-aware хук `useUnreadCounts` агрегирует непрочитанное из трёх существующих RTK-ручек. Шапка (`HeaderBody`, смонтирована на всех страницах) владеет фоновым поллингом (20с) и звуком; `AccountLayout` читает тот же кэш без поллинга. Звук — WebAudio, тумблер в Настройках (localStorage).

**Tech Stack:** Next.js (App Router) + React, Redux Toolkit Query 2.5, next-intl, Tailwind, lucide-react, vitest + @testing-library/react (jsdom).

## Global Constraints

- Вся работа — только в `apps/client`. Язык кода/комментариев — как в соседних файлах (комментарии по-русски).
- Все защищённые запросы идут с `skip: !isAuthenticated` (гость получает 401).
- Read-state у туров на бэке нет → «туры» = входящие заявки в статусе `PENDING`.
- Пороги бейджей: шапка `max=9` («9+»), кабинет `max=99` («99+»).
- Звук по умолчанию **включён**; состояние в localStorage-ключе `avino.notifSound`.
- Тесты запускать из `apps/client`: `npx vitest run <path>`. Полный прогон: `npm test`. Проверки: `npm run lint`, `npm run build`.
- Git-коммиты делает оркестратор (субагенты `avino-impl` git не трогают). Перед началом — рабочая ветка `feat/unread-badges-sound` (не `main`).

---

### Task 1: Модуль звука `notificationSound`

**Files:**
- Create: `apps/client/src/lib/notificationSound.ts`
- Test: `apps/client/src/lib/notificationSound.test.ts`

**Interfaces:**
- Produces:
  - `isNotificationSoundEnabled(): boolean`
  - `setNotificationSoundEnabled(on: boolean): void`
  - `nextSoundState(prev: number | null, total: number): { play: boolean; next: number }`
  - `playNotificationSound(): void`

- [ ] **Step 1: Write the failing test**

`apps/client/src/lib/notificationSound.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  nextSoundState,
  playNotificationSound,
} from './notificationSound';

beforeEach(() => window.localStorage.clear());

describe('настройка звука', () => {
  it('включён по умолчанию', () => {
    expect(isNotificationSoundEnabled()).toBe(true);
  });
  it('persist off → on', () => {
    setNotificationSoundEnabled(false);
    expect(isNotificationSoundEnabled()).toBe(false);
    setNotificationSoundEnabled(true);
    expect(isNotificationSoundEnabled()).toBe(true);
  });
});

describe('nextSoundState', () => {
  it('первый замер — без звука, ставит базу', () => {
    expect(nextSoundState(null, 3)).toEqual({ play: false, next: 3 });
  });
  it('рост → play', () => {
    expect(nextSoundState(2, 5)).toEqual({ play: true, next: 5 });
  });
  it('без изменений / уменьшение → тишина', () => {
    expect(nextSoundState(5, 5)).toEqual({ play: false, next: 5 });
    expect(nextSoundState(5, 2)).toEqual({ play: false, next: 2 });
  });
});

describe('playNotificationSound', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('no-op когда звук выключен', () => {
    setNotificationSoundEnabled(false);
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    playNotificationSound();
    expect(ctor).not.toHaveBeenCalled();
  });
  it('создаёт AudioContext и запускает осциллятор когда включён', () => {
    setNotificationSoundEnabled(true);
    const start = vi.fn();
    const connect = vi.fn();
    const ctx = {
      currentTime: 0,
      resume: vi.fn(),
      close: vi.fn(),
      destination: {},
      createGain: () => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect,
      }),
      createOscillator: () => ({
        type: '',
        frequency: { setValueAtTime: vi.fn() },
        connect,
        start,
        stop: vi.fn(),
      }),
    };
    const ctor = vi.fn(() => ctx);
    vi.stubGlobal('AudioContext', ctor);
    playNotificationSound();
    expect(ctor).toHaveBeenCalled();
    expect(start).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx vitest run src/lib/notificationSound.test.ts`
Expected: FAIL — не найден модуль `./notificationSound`.

- [ ] **Step 3: Write minimal implementation**

`apps/client/src/lib/notificationSound.ts`:
```ts
/**
 * notificationSound — локальная настройка и воспроизведение звука уведомлений.
 * Тумблер хранится в localStorage (бэкенд-контракта нет). Звук синтезируется
 * через WebAudio (короткий двухтоновый «динь»), без бинарного ассета.
 */

const STORAGE_KEY = 'avino.notifSound';

/** Включён ли звук. Нет записи → включён (default true). */
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

/** Сохранить состояние тумблера. */
export function setNotificationSoundEnabled(on: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
}

/**
 * Решение о звуке при смене суммарного счётчика непрочитанного.
 * prev === null → первый замер: база без звука. Рост → play.
 */
export function nextSoundState(
  prev: number | null,
  total: number,
): { play: boolean; next: number } {
  if (prev === null) return { play: false, next: total };
  return { play: total > prev, next: total };
}

/**
 * Короткий сигнал. No-op если выключено / нет window / WebAudio недоступен.
 * AudioContext создаётся лениво и resume()-ится (браузер разрешает звук
 * только после взаимодействия пользователя со страницей).
 */
export function playNotificationSound(): void {
  if (typeof window === 'undefined') return;
  if (!isNotificationSoundEnabled()) return;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return;
  try {
    const ctx = new Ctor();
    void ctx.resume?.();
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    gain.connect(ctx.destination);
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      osc.connect(gain);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.2);
    });
    window.setTimeout(() => void ctx.close?.(), 600);
  } catch {
    // Звук не критичен — тихо игнорируем.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx vitest run src/lib/notificationSound.test.ts`
Expected: PASS (все кейсы).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/notificationSound.ts apps/client/src/lib/notificationSound.test.ts
git commit -m "feat(client): модуль notificationSound (WebAudio + localStorage-тумблер)"
```

---

### Task 2: Хук `useUnreadSound`

**Files:**
- Create: `apps/client/src/lib/useUnreadSound.ts`
- Test: `apps/client/src/lib/useUnreadSound.test.ts`

**Interfaces:**
- Consumes: `nextSoundState`, `playNotificationSound` из `./notificationSound` (Task 1).
- Produces: `useUnreadSound(total: number): void`

- [ ] **Step 1: Write the failing test**

`apps/client/src/lib/useUnreadSound.test.ts`:
```ts
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const playSpy = vi.hoisted(() => vi.fn());
vi.mock('./notificationSound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notificationSound')>()),
  playNotificationSound: playSpy,
}));

import { useUnreadSound } from './useUnreadSound';

describe('useUnreadSound', () => {
  it('молчит на первом рендере, звучит при росте, молчит при уменьшении', () => {
    playSpy.mockClear();
    const { rerender } = renderHook(({ n }) => useUnreadSound(n), {
      initialProps: { n: 0 },
    });
    expect(playSpy).not.toHaveBeenCalled();
    rerender({ n: 2 });
    expect(playSpy).toHaveBeenCalledTimes(1);
    rerender({ n: 1 });
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx vitest run src/lib/useUnreadSound.test.ts`
Expected: FAIL — не найден модуль `./useUnreadSound`.

- [ ] **Step 3: Write minimal implementation**

`apps/client/src/lib/useUnreadSound.ts`:
```ts
'use client';

import { useEffect, useRef } from 'react';
import { nextSoundState, playNotificationSound } from './notificationSound';

/**
 * Проигрывает звук при росте `total` (после первого замера — база без звука).
 * Держатель (шапка) смонтирован постоянно → ref переживает навигацию,
 * ложных сигналов на логине/переходах нет.
 */
export function useUnreadSound(total: number): void {
  const prevRef = useRef<number | null>(null);
  useEffect(() => {
    const { play, next } = nextSoundState(prevRef.current, total);
    if (play) playNotificationSound();
    prevRef.current = next;
  }, [total]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx vitest run src/lib/useUnreadSound.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/lib/useUnreadSound.ts apps/client/src/lib/useUnreadSound.test.ts
git commit -m "feat(client): хук useUnreadSound (звук при росте счётчика)"
```

---

### Task 3: Компонент `CountBadge`

**Files:**
- Create: `apps/client/src/components/ui/count-badge.tsx`
- Test: `apps/client/src/components/ui/count-badge.test.tsx`

**Interfaces:**
- Produces: `CountBadge(props: { count: number; max?: number; className?: string; 'aria-label'?: string }): JSX.Element | null` (default `max=9`).

- [ ] **Step 1: Write the failing test**

`apps/client/src/components/ui/count-badge.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CountBadge } from './count-badge';

describe('CountBadge', () => {
  it('рендерит число', () => {
    render(<CountBadge count={3} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
  it('порог по умолчанию 9 → «9+»', () => {
    render(<CountBadge count={42} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });
  it('кастомный max=99 → «99+»', () => {
    render(<CountBadge count={150} max={99} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
  it('null при count <= 0', () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('прокидывает aria-label', () => {
    render(<CountBadge count={2} aria-label="2 непрочитанных" />);
    expect(screen.getByLabelText('2 непрочитанных')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx vitest run src/components/ui/count-badge.test.tsx`
Expected: FAIL — нет модуля `./count-badge`.

- [ ] **Step 3: Write minimal implementation**

`apps/client/src/components/ui/count-badge.tsx`:
```tsx
/**
 * CountBadge — красный бейдж-счётчик непрочитанного. Возвращает null при
 * count <= 0. Позиционирование задаёт потребитель через className
 * (в шапке — absolute поверх иконки, в кабинете — inline).
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CountBadgeProps {
  count: number;
  /** Порог отображения: больше него → «{max}+». По умолчанию 9. */
  max?: number;
  className?: string;
  'aria-label'?: string;
}

export function CountBadge({ count, max = 9, className, ...rest }: CountBadgeProps) {
  if (count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold leading-none text-white',
        className,
      )}
      {...rest}
    >
      {text}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx vitest run src/components/ui/count-badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/ui/count-badge.tsx apps/client/src/components/ui/count-badge.test.tsx
git commit -m "feat(client): компонент CountBadge (красный бейдж-счётчик)"
```

---

### Task 4: Хук `useUnreadCounts` + `computeUnreadCounts`

**Files:**
- Create: `apps/client/src/store/useUnreadCounts.ts`
- Test: `apps/client/src/store/useUnreadCounts.test.ts`

**Interfaces:**
- Consumes: `useGetThreadsQuery` (`./api/chatApi`), `useGetNotificationsQuery` (`./api/notificationsApi`), `useGetIncomingToursQuery` (`./api/tourRequestsApi`), `selectIsAuthenticated` (`./slices/authSlice`), `useAppSelector` (`./hooks`).
- Produces:
  - `interface UnreadCounts { messages: number; notifications: number; tours: number; total: number }`
  - `computeUnreadCounts(threads, notificationsUnread, incomingTours): UnreadCounts`
  - `useUnreadCounts(opts?: { pollingInterval?: number }): UnreadCounts`

- [ ] **Step 1: Write the failing test** (чистая агрегирующая функция)

`apps/client/src/store/useUnreadCounts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeUnreadCounts } from './useUnreadCounts';

describe('computeUnreadCounts', () => {
  it('суммирует unread_count тредов', () => {
    const r = computeUnreadCounts(
      [{ unread_count: 2 }, { unread_count: 0 }, { unread_count: 3 }],
      undefined,
      undefined,
    );
    expect(r.messages).toBe(5);
  });
  it('берёт notifications unread и считает только PENDING-туры', () => {
    const r = computeUnreadCounts(undefined, 4, [
      { status: 'PENDING' as const },
      { status: 'CONFIRMED' as const },
      { status: 'PENDING' as const },
    ]);
    expect(r.notifications).toBe(4);
    expect(r.tours).toBe(2);
  });
  it('total = сумма всех трёх', () => {
    const r = computeUnreadCounts([{ unread_count: 1 }], 2, [
      { status: 'PENDING' as const },
    ]);
    expect(r.total).toBe(4);
  });
  it('всё undefined → нули', () => {
    expect(computeUnreadCounts(undefined, undefined, undefined)).toEqual({
      messages: 0,
      notifications: 0,
      tours: 0,
      total: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx vitest run src/store/useUnreadCounts.test.ts`
Expected: FAIL — нет экспорта `computeUnreadCounts`.

- [ ] **Step 3: Write minimal implementation**

`apps/client/src/store/useUnreadCounts.ts`:
```ts
'use client';

import { useMemo } from 'react';
import { useAppSelector } from './hooks';
import { selectIsAuthenticated } from './slices/authSlice';
import { useGetThreadsQuery, type ApiThread } from './api/chatApi';
import { useGetNotificationsQuery } from './api/notificationsApi';
import {
  useGetIncomingToursQuery,
  type TourRequestItem,
} from './api/tourRequestsApi';

export interface UnreadCounts {
  messages: number;
  notifications: number;
  tours: number;
  total: number;
}

/** Pure: агрегирует непрочитанное из сырых данных запросов. */
export function computeUnreadCounts(
  threads: Pick<ApiThread, 'unread_count'>[] | undefined,
  notificationsUnread: number | undefined,
  incomingTours: Pick<TourRequestItem, 'status'>[] | undefined,
): UnreadCounts {
  const messages = (threads ?? []).reduce(
    (sum, t) => sum + (t.unread_count || 0),
    0,
  );
  const notifications = notificationsUnread ?? 0;
  const tours = (incomingTours ?? []).filter(
    (t) => t.status === 'PENDING',
  ).length;
  return { messages, notifications, tours, total: messages + notifications + tours };
}

export interface UseUnreadCountsOptions {
  /** Интервал поллинга (мс). 0 — без поллинга (только чтение кэша). */
  pollingInterval?: number;
}

/**
 * Единый auth-aware источник счётчиков непрочитанного. Шапка вызывает с
 * pollingInterval (двигатель свежести), остальные потребители — без (читают
 * общий кэш; RTK дедуплицирует подписки на один endpoint).
 */
export function useUnreadCounts(opts: UseUnreadCountsOptions = {}): UnreadCounts {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const queryOpts = {
    skip: !isAuthenticated,
    pollingInterval: opts.pollingInterval ?? 0,
    skipPollingIfUnfocused: true,
  } as const;

  const { data: threads } = useGetThreadsQuery(undefined, queryOpts);
  const { data: notifications } = useGetNotificationsQuery(undefined, queryOpts);
  const { data: incoming } = useGetIncomingToursQuery(undefined, queryOpts);

  return useMemo(
    () => computeUnreadCounts(threads, notifications?.unread, incoming),
    [threads, notifications?.unread, incoming],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx vitest run src/store/useUnreadCounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/store/useUnreadCounts.ts apps/client/src/store/useUnreadCounts.test.ts
git commit -m "feat(client): хук useUnreadCounts (агрегация непрочитанного)"
```

---

### Task 5: Презентационный `UnreadIndicators` + i18n-ключи шапки

**Files:**
- Create: `apps/client/src/components/layout/UnreadIndicators.tsx`
- Test: `apps/client/src/components/layout/UnreadIndicators.test.tsx`
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json` (добавить `nav.messages`, `nav.notifications`)

**Interfaces:**
- Consumes: `CountBadge` (Task 3), i18n-ключи `nav.messages` / `nav.notifications`.
- Produces: `UnreadIndicators(props: { messages: number; notifications: number }): JSX.Element` — две иконки-ссылки (`/account/inbox`, `/account/notifications`).

- [ ] **Step 1: Добавить i18n-ключи**

В `apps/client/messages/ru.json` в объект `"nav"` (рядом с `"favorites"`) добавить:
```json
    "messages": "Сообщения",
    "notifications": "Уведомления",
```
В `apps/client/messages/uz.json` → `"nav"`:
```json
    "messages": "Xabarlar",
    "notifications": "Bildirishnomalar",
```
В `apps/client/messages/en.json` → `"nav"`:
```json
    "messages": "Messages",
    "notifications": "Notifications",
```
(Следить за корректными запятыми JSON — ключи не последние в объекте, либо добавить запятую перед ними.)

- [ ] **Step 2: Write the failing test**

`apps/client/src/components/layout/UnreadIndicators.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('@/i18n/navigation', () => ({
  Link: (p: any) => (
    <a href={p.href} aria-label={p['aria-label']}>
      {p.children}
    </a>
  ),
}));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { UnreadIndicators } from './UnreadIndicators';

describe('UnreadIndicators', () => {
  it('рендерит бейджи сообщений и уведомлений с верными ссылками', () => {
    render(<UnreadIndicators messages={3} notifications={5} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByLabelText(ru.nav.messages)).toHaveAttribute(
      'href',
      '/account/inbox',
    );
    expect(screen.getByLabelText(ru.nav.notifications)).toHaveAttribute(
      'href',
      '/account/notifications',
    );
  });
  it('не рендерит бейдж при нуле', () => {
    render(<UnreadIndicators messages={0} notifications={0} />);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/client && npx vitest run src/components/layout/UnreadIndicators.test.tsx`
Expected: FAIL — нет модуля `./UnreadIndicators`.

- [ ] **Step 4: Write minimal implementation**

`apps/client/src/components/layout/UnreadIndicators.tsx`:
```tsx
/**
 * UnreadIndicators — иконки шапки: непрочит. сообщения (конверт → /account/inbox)
 * и уведомления (колокольчик → /account/notifications). Презентационный:
 * счётчики и поллинг/звук держит HeaderBody.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Mail, Bell } from 'lucide-react';
import { CountBadge } from '@/components/ui/count-badge';

const ICON =
  'relative flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface-2';
const DOT = 'absolute -right-0.5 -top-0.5';

export interface UnreadIndicatorsProps {
  messages: number;
  notifications: number;
}

export function UnreadIndicators({ messages, notifications }: UnreadIndicatorsProps) {
  const t = useTranslations('nav');
  return (
    <>
      <Link href="/account/inbox" aria-label={t('messages')} className={ICON}>
        <Mail size={20} strokeWidth={1.9} />
        <CountBadge count={messages} className={DOT} max={9} />
      </Link>
      <Link
        href="/account/notifications"
        aria-label={t('notifications')}
        className={ICON}
      >
        <Bell size={20} strokeWidth={1.9} />
        <CountBadge count={notifications} className={DOT} max={9} />
      </Link>
    </>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/client && npx vitest run src/components/layout/UnreadIndicators.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/layout/UnreadIndicators.tsx apps/client/src/components/layout/UnreadIndicators.test.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): UnreadIndicators + i18n-ключи nav.messages/notifications"
```

---

### Task 6: Встроить в `Header` (десктоп + мобайл) — поллинг и звук

**Files:**
- Modify: `apps/client/src/components/layout/Header.tsx`

**Interfaces:**
- Consumes: `useUnreadCounts` (Task 4), `useUnreadSound` (Task 2), `UnreadIndicators` (Task 5), `CountBadge` (Task 3).

Логика: `HeaderBody` — единственный постоянно смонтированный владелец фонового поллинга (20с) и звука (работает на любом брейкпоинте). Десктоп рендерит `UnreadIndicators`; мобильное меню показывает бейдж непрочит. сообщений у пункта «Сообщения» (`chat`).

- [ ] **Step 1: Добавить импорты**

В шапке файла `Header.tsx`, рядом с существующими импортами, добавить:
```tsx
import { UnreadIndicators } from './UnreadIndicators';
import { CountBadge } from '@/components/ui/count-badge';
import { useUnreadCounts } from '@/store/useUnreadCounts';
import { useUnreadSound } from '@/lib/useUnreadSound';
```

- [ ] **Step 2: Подключить счётчики, поллинг и звук в `HeaderBody`**

В функции `HeaderBody`, после строки `const { logout, isLoggingOut } = useLogout();` добавить:
```tsx
  // Единый владелец фонового поллинга счётчиков (виден на всех страницах)
  // и звука при появлении нового непрочитанного.
  const { messages: unreadMessages, notifications: unreadNotifications, total: unreadTotal } =
    useUnreadCounts({ pollingInterval: 20000 });
  useUnreadSound(unreadTotal);
```

- [ ] **Step 3: Десктоп — вставить `UnreadIndicators` в залогиненную ветку**

Заменить блок:
```tsx
          {isAuthenticated ? (
            <ProfileMenu />
          ) : (
```
на:
```tsx
          {isAuthenticated ? (
            <>
              <UnreadIndicators
                messages={unreadMessages}
                notifications={unreadNotifications}
              />
              <ProfileMenu />
            </>
          ) : (
```

- [ ] **Step 4: Мобайл — бейдж непрочитанных сообщений у пункта «Сообщения»**

В мобильном меню, где рендерятся пункты аккаунта:
```tsx
                  {[...PROFILE_MENU_LINKS, ...FAVORITE_MENU_LINKS].map((it) => (
                    <Button key={it.key} size="lg" variant="outline" asChild>
                      <Link href={it.href}>{t(it.labelKey)}</Link>
                    </Button>
                  ))}
```
заменить на:
```tsx
                  {[...PROFILE_MENU_LINKS, ...FAVORITE_MENU_LINKS].map((it) => (
                    <Button key={it.key} size="lg" variant="outline" asChild>
                      <Link href={it.href} className="flex items-center justify-center gap-2">
                        {t(it.labelKey)}
                        {it.key === 'chat' && (
                          <CountBadge count={unreadMessages} max={99} />
                        )}
                      </Link>
                    </Button>
                  ))}
```

- [ ] **Step 5: Проверить типы/линт/сборку + существующие тесты**

Run: `cd apps/client && npx vitest run src/components/layout && npm run lint`
Expected: PASS (существующие тесты шапки/ProfileMenu зелёные, линт чист).

Run: `cd apps/client && npm run build`
Expected: успешная сборка (типы сходятся).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/components/layout/Header.tsx
git commit -m "feat(client): индикаторы непрочитанного в шапке + поллинг и звук"
```

---

### Task 7: Бейджи на вкладках кабинета (`AccountLayout`)

**Files:**
- Modify: `apps/client/src/features/account/AccountLayout.tsx`
- Test: `apps/client/src/features/account/AccountLayout.test.tsx`

**Interfaces:**
- Consumes: `useUnreadCounts` (Task 4), `CountBadge` (Task 3).

- [ ] **Step 1: Write the failing test**

`apps/client/src/features/account/AccountLayout.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('@/store/useUnreadCounts', () => ({
  useUnreadCounts: () => ({ messages: 2, notifications: 4, tours: 1, total: 7 }),
}));
vi.mock('@/store/hooks', () => ({ useAppSelector: () => undefined }));
vi.mock('@/i18n/navigation', () => ({
  Link: (p: any) => <a href={p.href}>{p.children}</a>,
}));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { AccountLayout } from './AccountLayout';

describe('AccountLayout — бейджи вкладок', () => {
  it('показывает счётчики у inbox / notifications / tours', () => {
    render(
      <AccountLayout tab="inbox">
        <div />
      </AccountLayout>,
    );
    expect(screen.getByText('2')).toBeInTheDocument(); // сообщения (inbox)
    expect(screen.getByText('4')).toBeInTheDocument(); // уведомления
    expect(screen.getByText('1')).toBeInTheDocument(); // туры (PENDING)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/client && npx vitest run src/features/account/AccountLayout.test.tsx`
Expected: FAIL — бейджи ещё не рендерятся (числа не найдены).

- [ ] **Step 3: Write minimal implementation**

В `AccountLayout.tsx` добавить импорты рядом с существующими:
```tsx
import { CountBadge } from '@/components/ui/count-badge';
import { useUnreadCounts } from '@/store/useUnreadCounts';
```
В теле `AccountLayout`, после `const user = useAppSelector(selectCurrentUser);` добавить:
```tsx
  // Счётчики без поллинга — читаем общий кэш (двигатель поллинга — шапка).
  const { messages, notifications, tours } = useUnreadCounts();
  const tabCounts: Record<string, number> = {
    inbox: messages,
    notifications,
    tours,
  };
```
Внутри `.map((item) => { ... })`, в теле `<Link>` после текста вкладки:
```tsx
                  <Icon size={19} strokeWidth={1.9} className="shrink-0" />{' '}
                  {t(`tabs.${item.labelKey}`)}
```
заменить на:
```tsx
                  <Icon size={19} strokeWidth={1.9} className="shrink-0" />{' '}
                  {t(`tabs.${item.labelKey}`)}
                  {tabCounts[item.key] > 0 && (
                    <CountBadge
                      count={tabCounts[item.key]}
                      max={99}
                      className="ml-auto"
                    />
                  )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/client && npx vitest run src/features/account/AccountLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/account/AccountLayout.tsx apps/client/src/features/account/AccountLayout.test.tsx
git commit -m "feat(client): бейджи непрочитанного на вкладках кабинета"
```

---

### Task 8: Тумблер «Звук уведомлений» в Настройках

**Files:**
- Modify: `apps/client/src/features/account/Settings.tsx`
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json` (добавить `account.settings.notifSound.title` / `.text`)

**Interfaces:**
- Consumes: `isNotificationSoundEnabled`, `setNotificationSoundEnabled` (Task 1); i18n `settings.notifSound.*`.

- [ ] **Step 1: Добавить i18n-ключи**

В `apps/client/messages/ru.json` → `account.settings` добавить объект:
```json
    "notifSound": {
      "title": "Звук уведомлений",
      "text": "Проигрывать сигнал при новом сообщении или уведомлении"
    },
```
В `uz.json` → `account.settings`:
```json
    "notifSound": {
      "title": "Bildirishnoma tovushi",
      "text": "Yangi xabar yoki bildirishnoma kelganda signal chalinsin"
    },
```
В `en.json` → `account.settings`:
```json
    "notifSound": {
      "title": "Notification sound",
      "text": "Play a sound on a new message or notification"
    },
```

- [ ] **Step 2: Реализация тумблера (реально работающий, localStorage)**

В `Settings.tsx` добавить импорт:
```tsx
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
} from '@/lib/notificationSound';
```
В теле `Settings`, рядом с остальным состоянием, добавить:
```tsx
  // Реальный тумблер звука (в отличие от мок-настроек выше) — persist в localStorage.
  const [soundOn, setSoundOn] = React.useState(true);
  React.useEffect(() => setSoundOn(isNotificationSoundEnabled()), []);
  const toggleSound = () =>
    setSoundOn((prev) => {
      const next = !prev;
      setNotificationSoundEnabled(next);
      return next;
    });
```
В карточке «Уведомления», внутри `<div className="flex flex-col divide-y divide-border">`, после блока `{NOTIF_SETTINGS.map(...)}` добавить строку:
```tsx
            <div className="flex items-center justify-between gap-4 py-3.5 last:pb-0">
              <div className="min-w-0">
                <div className="text-[15px] font-bold">
                  {t('settings.notifSound.title')}
                </div>
                <div className="mt-0.5 text-[13.5px] text-muted-foreground">
                  {t('settings.notifSound.text')}
                </div>
              </div>
              <Toggle on={soundOn} onClick={toggleSound} />
            </div>
```

- [ ] **Step 3: Проверить линт/сборку**

Run: `cd apps/client && npm run lint`
Expected: чисто.
Run: `cd apps/client && npm run build`
Expected: успешная сборка.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/features/account/Settings.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): тумблер «Звук уведомлений» в настройках"
```

---

### Task 9: Финальная проверка

**Files:** —

- [ ] **Step 1: Полный прогон тестов клиента**

Run: `cd apps/client && npm test`
Expected: все тесты зелёные.

- [ ] **Step 2: Линт и сборка**

Run: `cd apps/client && npm run lint && npm run build`
Expected: без ошибок.

---

## Self-Review

**Spec coverage:**
- Шапка ✉️+🔔 с бейджами → Task 5 + Task 6. ✅
- Бейджи вкладок кабинета (inbox/notifications/tours) → Task 7. ✅
- Туры = входящие PENDING → `computeUnreadCounts` (Task 4) + Task 7. ✅
- Единый хук + поллинг 20с + `skipPollingIfUnfocused` → Task 4 + Task 6. ✅
- Звук WebAudio, триггер по росту, база без звука → Task 1 + Task 2 + Task 6. ✅
- Тумблер звука в Настройках, localStorage, default on → Task 1 + Task 8. ✅
- Пороги «9+»/«99+» → Task 3 (max), потребители задают max. ✅
- Гость: скип запросов, скрытые бейджи → Task 4 (skip) + Header рендерит `UnreadIndicators` только под `isAuthenticated`. ✅
- i18n ru/uz/en → Task 5 + Task 8. ✅
- Тесты по образцу репо → Tasks 1–5, 7. ✅

**Placeholder scan:** плейсхолдеров нет — во всех шагах реальный код и команды.

**Type consistency:** `UnreadCounts { messages, notifications, tours, total }` едина в Tasks 4/6/7; `CountBadge` пропсы (`count`, `max`, `className`, `aria-label`) едины в Tasks 3/5/6/7; `nextSoundState`/`playNotificationSound` из Task 1 совпадают с потреблением в Task 2. ✅

**Замечание по мобайлу:** уведомления в мобильном меню отдельным пунктом не выводятся (в `PROFILE_MENU_LINKS` его нет) — на мобайле бейдж только у «Сообщений»; уведомления доступны через боковое меню кабинета. Осознанное сокращение (YAGNI), зафиксировано.
