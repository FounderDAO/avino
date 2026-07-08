# Incoming Tour Request Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Владелец объявления в секции «Запросы ко мне» может открыть модалку с деталями входящего запроса на тур (включая сообщение) и подтвердить/отклонить его; кнопки действий получают зелёную/красную заливку.

**Architecture:** Новый компонент `IncomingTourModal` (radix-ui `Dialog`, паттерн `TourRequestModal`) получает уже загруженный `TourRequestItem` через props — новых запросов к API нет. `Tours.tsx` хранит `selected`-состояние, делает строки входящих запросов кликабельными и рендерит модалку. Действия идут через существующую мутацию `useUpdateTourStatusMutation`.

**Tech Stack:** Next.js (App Router), React, TypeScript, radix-ui Dialog, RTK Query, next-intl, Tailwind (токены `globals.css`), vitest + @testing-library/react.

## Global Constraints

- Приложение: `apps/client` (публичный портал). Не трогать `apps/web`/`apps/api`.
- Модалка только для **входящих** запросов («Запросы ко мне»). Исходящие не менять.
- Никаких новых запросов к API и изменений бэкенда — данные берём из уже загруженного `TourRequestItem`.
- Локализованный `Link` импортировать из `@/i18n/navigation` (НЕ из `next/link`).
- Ссылка на объявление: `href={`/listing/${listing_id}`}`.
- Кнопки: «Подтвердить» — `bg-green` (#34c759), «Отклонить» — `bg-red hover:bg-red-press` (#e03c42), оба белым жирным текстом. Применить и в строке списка, и в модалке.
- Переводы добавить во все три файла: `messages/ru.json`, `messages/en.json`, `messages/uz.json`.
- Комментарии в коде — на русском (стиль проекта).
- Проверка: `cd apps/client && npx vitest run src/features/account/` и `npx tsc --noEmit`.

---

### Task 1: Переводы `account.tours.*` для модалки

**Files:**
- Modify: `apps/client/messages/ru.json` (объект `account.tours`)
- Modify: `apps/client/messages/en.json` (объект `account.tours`)
- Modify: `apps/client/messages/uz.json` (объект `account.tours`)

**Interfaces:**
- Produces: новые ключи в `account.tours`: `modalTitle`, `message`, `noMessage`, `openListing`, `close`. Их читает `IncomingTourModal` через `useTranslations('account')` как `t('tours.modalTitle')` и т.д.

- [ ] **Step 1: Добавить ключи в `ru.json`**

В `apps/client/messages/ru.json` внутри объекта `account.tours` (рядом с `"cancel"`) добавить:

```json
    "modalTitle": "Запрос на тур",
    "message": "Сообщение",
    "noMessage": "Без сообщения",
    "openListing": "Открыть объявление",
    "close": "Закрыть",
```

- [ ] **Step 2: Добавить ключи в `en.json`**

В `apps/client/messages/en.json` внутри объекта `account.tours` добавить:

```json
    "modalTitle": "Tour request",
    "message": "Message",
    "noMessage": "No message",
    "openListing": "Open listing",
    "close": "Close",
```

- [ ] **Step 3: Добавить ключи в `uz.json`**

В `apps/client/messages/uz.json` внутри объекта `account.tours` добавить:

```json
    "modalTitle": "Tur so'rovi",
    "message": "Xabar",
    "noMessage": "Xabarsiz",
    "openListing": "E'lonni ochish",
    "close": "Yopish",
```

- [ ] **Step 4: Проверить валидность JSON**

Run: `cd apps/client && node -e "['ru','en','uz'].forEach(l=>{const t=require('./messages/'+l+'.json').account.tours; ['modalTitle','message','noMessage','openListing','close'].forEach(k=>{if(!t[k])throw new Error(l+' missing '+k)})}); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/en.json apps/client/messages/uz.json
git commit -m "i18n(client): ключи модалки входящего запроса на тур"
```

---

### Task 2: Компонент `IncomingTourModal`

**Files:**
- Create: `apps/client/src/features/account/IncomingTourModal.tsx`
- Test: `apps/client/src/features/account/IncomingTourModal.test.tsx`

**Interfaces:**
- Consumes: `TourRequestItem`, `TourAction`, `useUpdateTourStatusMutation` из `@/store/api/tourRequestsApi`; `getApiError` из `@/store/api/apiError`; `Link` из `@/i18n/navigation`; переводы `account.tours.*` из Task 1.
- Produces:
  ```ts
  export interface IncomingTourModalProps {
    item: TourRequestItem | null;   // модалка открыта, когда item != null
    onClose: () => void;
  }
  export function IncomingTourModal(props: IncomingTourModalProps): JSX.Element
  ```

- [ ] **Step 1: Написать падающий тест**

Create `apps/client/src/features/account/IncomingTourModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
vi.mock('@/store/api/tourRequestsApi', () => ({
  useUpdateTourStatusMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({ Link: (p: any) => <a href={p.href}>{p.children}</a> }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { IncomingTourModal } from './IncomingTourModal';

const base = {
  id: 'I1', listing_id: 'L2', requester_id: 'R1', status: 'PENDING' as const,
  requested_date: '2099-02-02', window_start: '18:00', window_end: '20:00',
  requester_name: 'Buyer', requester_phone: '+998900000000',
  message: 'Хочу посмотреть вечером', created_at: '',
};

describe('IncomingTourModal', () => {
  it('показывает сообщение и подтверждает запрос', () => {
    const onClose = vi.fn();
    render(<IncomingTourModal item={base} onClose={onClose} />);
    expect(screen.getByText('Хочу посмотреть вечером')).toBeInTheDocument();
    fireEvent.click(screen.getByText(ru.account.tours.confirm));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'I1', action: 'CONFIRM' });
  });

  it('показывает «Без сообщения» когда message пустой', () => {
    render(<IncomingTourModal item={{ ...base, message: null }} onClose={vi.fn()} />);
    expect(screen.getByText(ru.account.tours.noMessage)).toBeInTheDocument();
  });

  it('не показывает кнопки действий для не-PENDING', () => {
    render(<IncomingTourModal item={{ ...base, status: 'CONFIRMED' }} onClose={vi.fn()} />);
    expect(screen.queryByText(ru.account.tours.confirm)).not.toBeInTheDocument();
    expect(screen.queryByText(ru.account.tours.decline)).not.toBeInTheDocument();
  });

  it('не рендерит содержимое когда item = null', () => {
    render(<IncomingTourModal item={null} onClose={vi.fn()} />);
    expect(screen.queryByText(ru.account.tours.modalTitle)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd apps/client && npx vitest run src/features/account/IncomingTourModal.test.tsx`
Expected: FAIL — `Failed to resolve import "./IncomingTourModal"` / модуль не найден.

- [ ] **Step 3: Реализовать компонент**

Create `apps/client/src/features/account/IncomingTourModal.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  useUpdateTourStatusMutation,
  type TourRequestItem,
  type TourAction,
} from '@/store/api/tourRequestsApi';
import { getApiError } from '@/store/api/apiError';

export interface IncomingTourModalProps {
  item: TourRequestItem | null;
  onClose: () => void;
}

/** Модалка входящего запроса на тур: детали + подтвердить/отклонить (только PENDING). */
export function IncomingTourModal({ item, onClose }: IncomingTourModalProps) {
  const t = useTranslations('account');
  const [update, { isLoading }] = useUpdateTourStatusMutation();
  const [error, setError] = React.useState<string | null>(null);

  // Сброс ошибки при смене/закрытии запроса.
  React.useEffect(() => {
    setError(null);
  }, [item?.id]);

  const act = React.useCallback(
    async (action: TourAction) => {
      if (!item) return;
      setError(null);
      try {
        await update({ id: item.id, action }).unwrap();
        onClose();
      } catch (err) {
        const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
        setError(apiErr?.message ?? t('tours.actionError'));
      }
    },
    [item, update, onClose, t],
  );

  const open = item != null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          {item && (
            <>
              <div className="flex items-center justify-between gap-3">
                <Dialog.Title className="text-xl font-extrabold">
                  {t('tours.modalTitle')}
                </Dialog.Title>
                <span className="rounded-badge bg-mint px-2 py-0.5 text-[11.5px] font-bold text-teal-deep">
                  {t(`tours.status.${item.status}`)}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <div>
                  <div className="text-[15px] font-semibold">{item.requester_name}</div>
                  <a
                    href={`tel:${item.requester_phone}`}
                    className="text-[14px] text-teal hover:text-teal-deep"
                  >
                    {item.requester_phone}
                  </a>
                </div>

                <div className="text-[14px] text-muted-foreground">
                  {item.requested_date} {t('tours.on')} {item.window_start}–{item.window_end}
                </div>

                <div className="flex flex-col gap-1">
                  <div className="text-[13px] font-semibold">{t('tours.message')}</div>
                  {item.message?.trim() ? (
                    <p className="whitespace-pre-wrap text-[14px]">{item.message}</p>
                  ) : (
                    <p className="text-[14px] text-muted-foreground">{t('tours.noMessage')}</p>
                  )}
                </div>

                <Link
                  href={`/listing/${item.listing_id}`}
                  className="text-[14px] font-semibold text-teal hover:text-teal-deep"
                >
                  {t('tours.openListing')}
                </Link>

                {error && <div className="text-[12.5px] text-red">{error}</div>}

                {item.status === 'PENDING' && (
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => void act('CONFIRM')}
                      className="rounded-pill bg-green px-4 py-2 text-[14px] font-bold text-white hover:brightness-95 disabled:opacity-50"
                    >
                      {t('tours.confirm')}
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => void act('DECLINE')}
                      className="rounded-pill bg-red px-4 py-2 text-[14px] font-bold text-white hover:bg-red-press disabled:opacity-50"
                    >
                      {t('tours.decline')}
                    </button>
                  </div>
                )}
              </div>

              <Dialog.Close
                aria-label={t('tours.close')}
                className="absolute right-4 top-4 text-muted-foreground hover:text-ink"
              >
                ✕
              </Dialog.Close>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 4: Добавить ключ `actionError` в переводы**

`act()` использует `t('tours.actionError')` как фолбэк. Добавить ключ во все три файла внутри `account.tours`:

- `ru.json`: `"actionError": "Не удалось обновить запрос",`
- `en.json`: `"actionError": "Could not update the request",`
- `uz.json`: `"actionError": "So'rovni yangilab bo'lmadi",`

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `cd apps/client && npx vitest run src/features/account/IncomingTourModal.test.tsx`
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/account/IncomingTourModal.tsx apps/client/src/features/account/IncomingTourModal.test.tsx apps/client/messages/ru.json apps/client/messages/en.json apps/client/messages/uz.json
git commit -m "feat(client): модалка IncomingTourModal с действиями подтвердить/отклонить"
```

---

### Task 3: Кликабельные строки + цветные кнопки в `Tours.tsx`

**Files:**
- Modify: `apps/client/src/features/account/Tours.tsx`
- Test: `apps/client/src/features/account/Tours.test.tsx`

**Interfaces:**
- Consumes: `IncomingTourModal` из `./IncomingTourModal` (Task 2).
- Produces: обновлённый компонент `Tours` с состоянием `selected` и модалкой. `Row` получает опциональный `onOpen?: () => void` (клик по строке) и рендерит цветные кнопки для действий `CONFIRM`/`DECLINE`.

- [ ] **Step 1: Обновить тест — клик по строке открывает модалку, инлайн-кнопка нет**

Заменить содержимое `apps/client/src/features/account/Tours.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const outgoing = [{ id: 'O1', listing_id: 'L1', requester_id: 'R0', status: 'PENDING', requested_date: '2099-01-01', window_start: '07:00', window_end: '10:00', requester_name: 'Me', requester_phone: 'x', message: null, created_at: '' }];
const incoming = [{ id: 'I1', listing_id: 'L2', requester_id: 'R1', status: 'PENDING', requested_date: '2099-02-02', window_start: '18:00', window_end: '20:00', requester_name: 'Buyer', requester_phone: 'y', message: 'Здравствуйте', created_at: '' }];

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/tourRequestsApi', () => ({
  useGetOutgoingToursQuery: () => ({ data: outgoing, isLoading: false, isError: false }),
  useGetIncomingToursQuery: () => ({ data: incoming, isLoading: false, isError: false }),
  useUpdateTourStatusMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({ Link: (p: any) => <a href={p.href}>{p.children}</a> }));
vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k }));

import Tours from './Tours';

describe('Tours', () => {
  it('клик по строке входящего запроса открывает модалку с сообщением', () => {
    render(<Tours />);
    fireEvent.click(screen.getByText('Buyer'));
    // Заголовок модалки + сообщение видны
    expect(screen.getByText(ru.account.tours.modalTitle)).toBeInTheDocument();
    expect(screen.getByText('Здравствуйте')).toBeInTheDocument();
  });

  it('инлайн «Подтвердить» вызывает мутацию и НЕ открывает модалку', () => {
    render(<Tours />);
    fireEvent.click(screen.getAllByText(ru.account.tours.confirm)[0]);
    expect(updateSpy).toHaveBeenCalledWith({ id: 'I1', action: 'CONFIRM' });
    expect(screen.queryByText(ru.account.tours.modalTitle)).not.toBeInTheDocument();
  });

  it('покупатель может отменить свою заявку', () => {
    render(<Tours />);
    fireEvent.click(screen.getByText(ru.account.tours.cancel));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'O1', action: 'CANCEL' });
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd apps/client && npx vitest run src/features/account/Tours.test.tsx`
Expected: FAIL — модалка не открывается (`modalTitle` не найден), т.к. `Tours` ещё не рендерит `IncomingTourModal`.

- [ ] **Step 3: Реализовать изменения в `Tours.tsx`**

Полностью заменить `apps/client/src/features/account/Tours.tsx`:

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useGetOutgoingToursQuery,
  useGetIncomingToursQuery,
  useUpdateTourStatusMutation,
  type TourRequestItem,
  type TourAction,
} from '@/store/api/tourRequestsApi';
import { cn } from '@/lib/utils';
import { IncomingTourModal } from './IncomingTourModal';

function StatusBadge({ status }: { status: TourRequestItem['status'] }) {
  const t = useTranslations('account');
  return (
    <span className="rounded-badge bg-mint px-2 py-0.5 text-[11.5px] font-bold text-teal-deep">
      {t(`tours.status.${status}`)}
    </span>
  );
}

/** Класс заливки для цветных действий: CONFIRM — зелёный, DECLINE — красный, иначе обводка. */
function actionClass(action: TourAction): string {
  if (action === 'CONFIRM')
    return 'bg-green text-white hover:brightness-95';
  if (action === 'DECLINE')
    return 'bg-red text-white hover:bg-red-press';
  return 'border border-border hover:bg-bg';
}

function Row({
  item,
  actions,
  onOpen,
}: {
  item: TourRequestItem;
  actions: { label: string; action: TourAction }[];
  onOpen?: () => void;
}) {
  const t = useTranslations('account');
  const [update, { isLoading }] = useUpdateTourStatusMutation();
  const clickable = Boolean(onOpen);
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4',
        clickable && 'cursor-pointer hover:border-teal/60',
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold">
          <span>{item.requester_name}</span>
          <span className="text-muted-foreground"> · {item.requester_phone}</span>
        </div>
        <div className="text-[13px] text-muted-foreground">
          {item.requested_date} {t('tours.on')} {item.window_start}–{item.window_end}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={item.status} />
        {actions.map((a) => (
          <button
            key={a.action}
            type="button"
            disabled={isLoading}
            onClick={(e) => {
              // Клик по кнопке действия не должен открывать модалку строки.
              e.stopPropagation();
              void update({ id: item.id, action: a.action })
                .unwrap()
                .catch(() => {});
            }}
            className={cn(
              'rounded-pill px-3 py-1.5 text-[13px] font-semibold disabled:opacity-50',
              actionClass(a.action),
            )}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Tours() {
  const t = useTranslations('account');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data: outgoing } = useGetOutgoingToursQuery(undefined, { skip: !isAuthenticated });
  const { data: incoming } = useGetIncomingToursQuery(undefined, { skip: !isAuthenticated });
  const [selected, setSelected] = React.useState<TourRequestItem | null>(null);

  if (!isAuthenticated) return <p className="text-muted-foreground">{t('tours.guest')}</p>;

  const out = outgoing ?? [];
  const inc = incoming ?? [];
  if (out.length === 0 && inc.length === 0)
    return <p className="text-muted-foreground">{t('tours.empty')}</p>;

  return (
    <div className="flex flex-col gap-6">
      {inc.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.incoming')}</h2>
          {inc.map((it) => (
            <Row
              key={it.id}
              item={it}
              onOpen={() => setSelected(it)}
              actions={
                it.status === 'PENDING'
                  ? [
                      { label: t('tours.confirm'), action: 'CONFIRM' },
                      { label: t('tours.decline'), action: 'DECLINE' },
                    ]
                  : []
              }
            />
          ))}
        </section>
      )}
      {out.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.outgoing')}</h2>
          {out.map((it) => (
            <Row
              key={it.id}
              item={it}
              actions={
                it.status === 'PENDING' || it.status === 'CONFIRMED'
                  ? [{ label: t('tours.cancel'), action: 'CANCEL' }]
                  : []
              }
            />
          ))}
        </section>
      )}

      <IncomingTourModal item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd apps/client && npx vitest run src/features/account/Tours.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/account/Tours.tsx apps/client/src/features/account/Tours.test.tsx
git commit -m "feat(client): клик по строке открывает модалку запроса, цветные кнопки действий"
```

---

### Task 4: Проверка типов и всего набора тестов

**Files:**
- (без изменений — проверочная задача)

**Interfaces:**
- Consumes: результат Tasks 1–3.

- [ ] **Step 1: Прогнать тесты аккаунта**

Run: `cd apps/client && npx vitest run src/features/account/`
Expected: PASS — все тесты `Tours.test.tsx` и `IncomingTourModal.test.tsx` зелёные.

- [ ] **Step 2: Проверка типов**

Run: `cd apps/client && npx tsc --noEmit`
Expected: без ошибок (exit 0). Если `tsc` печатает предсуществующие ошибки в несвязанных файлах — убедиться, что среди них нет `features/account/IncomingTourModal.tsx` или `features/account/Tours.tsx`.

- [ ] **Step 3: Финальный коммит (если были правки)**

Если Steps 1–2 потребовали исправлений — закоммитить:

```bash
git add -A
git commit -m "fix(client): правки по результатам tsc/тестов модалки тура"
```

Если правок не было — задача завершена без коммита.

---

## Self-Review

**Spec coverage:**
- Модалка `IncomingTourModal` (radix Dialog, паттерн `TourRequestModal`) → Task 2 ✅
- Показ имени, телефона (`tel:`), даты/окна, статуса, **сообщения** (+ «Без сообщения») → Task 2 ✅
- Ссылка «Открыть объявление» → `/listing/{listing_id}` через `@/i18n/navigation` → Task 2 ✅
- Действия CONFIRM/DECLINE через `useUpdateTourStatusMutation`, закрытие при успехе, ошибка внутри, disable при загрузке → Task 2 ✅
- Просмотр без кнопок для не-PENDING → Task 2 ✅
- Клик по строке входящего открывает модалку (role/tabIndex/Enter-Space, hover) → Task 3 ✅
- `stopPropagation` на инлайн-кнопках → Task 3 ✅
- Исходящие не меняются → Task 3 (секция out без `onOpen`) ✅
- Цвета: зелёная/красная заливка и в строке, и в модалке → Task 2 + Task 3 ✅
- Переводы ru/en/uz → Task 1 + Task 2 (Step 4) ✅
- Тесты vitest+RTL (5 сценариев спеки распределены по Task 2 и Task 3) ✅

**Placeholder scan:** плейсхолдеров нет — весь код и команды приведены полностью.

**Type consistency:** `IncomingTourModalProps { item, onClose }` идентичны в Task 2 (определение) и Task 3 (использование `<IncomingTourModal item={selected} onClose={...} />`). `TourAction` значения `'CONFIRM'|'DECLINE'|'CANCEL'` совпадают с `tourRequestsApi.ts`. `actionClass` покрывает все три. Ключ `actionError` добавляется в Task 2 Step 4 во всех трёх языках и используется там же.

**Примечание:** сценарий спеки «клик по инлайн-кнопке не открывает модалку» покрыт тестом в Task 3 Step 1 (проверка `stopPropagation`). Сценарий «message: null → Без сообщения» покрыт в Task 2 Step 1.
