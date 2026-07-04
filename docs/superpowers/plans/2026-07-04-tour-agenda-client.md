# Tour Agenda — Client Implementation Plan (PR 2/2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Блок «Предстоящие туры» (единая агенда обеих ролей) на `/account/tours` + контекст объявления (мини-фото, название, ссылка) во всех строках списков.

**Architecture:** Только `apps/client/`. RTK Query slice `tourRequestsApi` получает параметры `status`/`upcoming` и новые поля контракта (`listing`, `owner`). Merge/сортировка агенды — чистый хелпер `tour-agenda.ts` (юнит-тест). Новая карточка `UpcomingTourCard`, редизайн `Tours.tsx`.

**Tech Stack:** Next.js (app router), RTK Query, next-intl, Vitest + RTL, `PhotoImg` (`@/components/ui/photo-img`).

**Spec:** `docs/superpowers/specs/2026-07-04-tour-agenda-design.md`

## Global Constraints

- Работать ТОЛЬКО в `apps/client/`.
- **Зависимость:** backend PR `feat/tour-requests-listing-context` должен быть смёржен раньше — контракт (`listing`/`owner`, `?status=`, `?upcoming=`) приходит оттуда. Указать в PR description.
- Ветка `feat/account-tours-agenda` от свежего `main` (после мёржа API PR). Git-мутации — по одной команде.
- i18n: любой новый user-facing текст — ключи в `apps/client/messages/{ru,uz,en}.json` (все три!). Мокнутый next-intl в тестах НЕ ловит отсутствующие ключи — проверить руками. Узбекский — латиница, без кириллических двойников.
- `rtk next build` может врать «Errors: 1» — финальную сборку проверять raw `pnpm --filter @avino/client exec next build`.
- Известный предсуществующий долг: 2 фейла `LoginModal.test.tsx` (useAppleLoginMutation не замокан) — НЕ регресс, не чинить.
- Бейдж в шапке (`useUnreadCounts`) не трогаем.

---

### Task 1: Контракт RTK Query + хелпер агенды

**Files:**
- Modify: `apps/client/src/store/api/tourRequestsApi.ts`
- Create: `apps/client/src/features/account/tour-agenda.ts`
- Test: `apps/client/src/features/account/tour-agenda.test.ts`

**Interfaces:**
- Consumes (backend PR 1/2): list-item содержит `listing: {id, title, photo_url}`; outgoing — ещё `owner: {name, phone}`; query-параметры `status`, `upcoming`.
- Produces: типы `TourListingInfo`, `TourOwnerInfo`, расширенный `TourRequestItem`, параметр хуков `TourListParams`; `mergeUpcoming(incoming, outgoing): AgendaEntry[]` и типы `TourRole`/`AgendaEntry` для Task 2.

- [ ] **Step 1: Написать падающий тест хелпера**

`apps/client/src/features/account/tour-agenda.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mergeUpcoming } from './tour-agenda';
import type { TourRequestItem } from '@/store/api/tourRequestsApi';

const make = (over: Partial<TourRequestItem>): TourRequestItem => ({
  id: 'TR1',
  listing_id: 'L1',
  requester_id: 'U1',
  status: 'CONFIRMED',
  requested_date: '2026-07-10',
  window_start: '07:00',
  window_end: '10:00',
  requester_name: 'Гость',
  requester_phone: '+998900000001',
  message: null,
  created_at: '2026-07-04T00:00:00.000Z',
  listing: { id: 'L1', title: 'Квартира', photo_url: null },
  ...over,
});

describe('mergeUpcoming', () => {
  it('склеивает обе роли и сортирует по дате, затем по окну', () => {
    const incoming = [make({ id: 'A', requested_date: '2026-07-12' })];
    const outgoing = [
      make({ id: 'B', requested_date: '2026-07-10', window_start: '11:00' }),
      make({ id: 'C', requested_date: '2026-07-10', window_start: '07:00' }),
    ];
    const res = mergeUpcoming(incoming, outgoing);
    expect(res.map((e) => e.item.id)).toEqual(['C', 'B', 'A']);
    expect(res.map((e) => e.role)).toEqual(['guest', 'guest', 'host']);
  });

  it('переживает undefined с обеих сторон', () => {
    expect(mergeUpcoming(undefined, undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @avino/client test -- tour-agenda`
Expected: FAIL — модуль `./tour-agenda` не существует; тип `TourRequestItem` ещё без `listing` (TS-ошибка).

- [ ] **Step 3: Реализация**

1. `tourRequestsApi.ts` — новые типы (после `TourAction`):

```ts
/** Контекст объявления в списках туров (spec 2026-07-04). */
export interface TourListingInfo {
  id: string;
  title: string;
  photo_url: string | null;
}

/** «Кто принимает» (только outgoing); phone приходит только при CONFIRMED. */
export interface TourOwnerInfo {
  name: string | null;
  phone: string | null;
}
```

В `TourRequestItem` добавить поля:

```ts
  listing: TourListingInfo;
  /** Только в outgoing-ответах. */
  owner?: TourOwnerInfo;
```

2. Параметры list-хуков (перед `tourRequestsApi`):

```ts
/** Фильтры списков туров; upcoming=true — агенда (сортировка по дате тура). */
export interface TourListParams {
  status?: TourRequestStatus;
  upcoming?: boolean;
}

const tourListUrl = (base: string, params?: TourListParams | void): string => {
  const sp = new URLSearchParams({ limit: '50' });
  if (params?.status) sp.set('status', params.status);
  if (params?.upcoming) sp.set('upcoming', 'true');
  return `${base}?${sp.toString()}`;
};
```

3. Обновить endpoints (аргумент `TourListParams | void`, прежние вызовы `useGet...Query(undefined)` продолжают работать):

```ts
getOutgoingTours: build.query<TourRequestItem[], TourListParams | void>({
  query: (params) => tourListUrl('/tour-requests/outgoing', params),
  transformResponse: (env: TourListEnvelope) => env.data,
  providesTags: [OUTGOING_TAG],
}),
getIncomingTours: build.query<TourRequestItem[], TourListParams | void>({
  query: (params) => tourListUrl('/tour-requests/incoming', params),
  transformResponse: (env: TourListEnvelope) => env.data,
  providesTags: [INCOMING_TAG],
}),
```

(Теги OUTGOING/INCOMING остаются общими: мутация `updateTourStatus` инвалидирует все варианты аргументов сразу — это и нужно.)

4. `apps/client/src/features/account/tour-agenda.ts`:

```ts
import type { TourRequestItem } from '@/store/api/tourRequestsApi';

/** Роль текущего пользователя в туре: host — принимает (incoming), guest — идёт (outgoing). */
export type TourRole = 'host' | 'guest';

export interface AgendaEntry {
  item: TourRequestItem;
  role: TourRole;
}

/** Единая агенда предстоящих туров обеих ролей: по дате, затем по началу окна. */
export function mergeUpcoming(
  incoming: TourRequestItem[] | undefined,
  outgoing: TourRequestItem[] | undefined,
): AgendaEntry[] {
  const entries: AgendaEntry[] = [
    ...(incoming ?? []).map((item) => ({ item, role: 'host' as const })),
    ...(outgoing ?? []).map((item) => ({ item, role: 'guest' as const })),
  ];
  return entries.sort(
    (a, b) =>
      a.item.requested_date.localeCompare(b.item.requested_date) ||
      a.item.window_start.localeCompare(b.item.window_start),
  );
}
```

- [ ] **Step 4: Прогнать тест**

Run: `pnpm --filter @avino/client test -- tour-agenda`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/store/api/tourRequestsApi.ts apps/client/src/features/account/tour-agenda.ts apps/client/src/features/account/tour-agenda.test.ts
git commit -m "feat(client): tour list params and listing/owner contract in tourRequestsApi"
```

---

### Task 2: UpcomingTourCard + редизайн Tours + i18n

**Files:**
- Create: `apps/client/src/features/account/UpcomingTourCard.tsx`
- Modify: `apps/client/src/features/account/Tours.tsx` (полная замена, код ниже)
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json` (раздел `account.tours`)

**Interfaces:**
- Consumes: `mergeUpcoming`/`AgendaEntry`/`TourRole` из Task 1; `PhotoImg` (`@/components/ui/photo-img`, fill-режим: контейнер `relative` с размерами); `Link`, `useRouter` из `@/i18n/navigation`; `useUpdateTourStatusMutation`.
- Produces: страница `/account/tours` — блок «Предстоящие туры» + строки списков с фото/названием объявления.

- [ ] **Step 1: i18n-ключи**

Во ВСЕ ТРИ файла `apps/client/messages/{ru,uz,en}.json` в объект `account.tours` добавить ключи (рядом с `"outgoing"`):

ru.json:
```json
"upcoming": "Предстоящие туры",
"roleHost": "Вы принимаете",
"roleGuest": "Вы идёте",
```

uz.json (латиница):
```json
"upcoming": "Rejalashtirilgan turlar",
"roleHost": "Siz qabul qilasiz",
"roleGuest": "Siz borasiz",
```

en.json:
```json
"upcoming": "Upcoming tours",
"roleHost": "You're hosting",
"roleGuest": "You're going",
```

- [ ] **Step 2: Создать `UpcomingTourCard.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { PhotoImg } from '@/components/ui/photo-img';
import {
  useUpdateTourStatusMutation,
  type TourAction,
  type TourRequestItem,
} from '@/store/api/tourRequestsApi';
import type { TourRole } from './tour-agenda';

/**
 * Карточка предстоящего (CONFIRMED) тура в агенде /account/tours:
 * фото + название объявления (ссылка), дата и окно, роль-бейдж, контрагент
 * (host видит гостя, guest — владельца; телефон владельца приходит только
 * после CONFIRMED) и «Отменить» (host → DECLINE, guest → CANCEL).
 */
export function UpcomingTourCard({ item, role }: { item: TourRequestItem; role: TourRole }) {
  const t = useTranslations('account');
  const [update, { isLoading }] = useUpdateTourStatusMutation();

  const counterpart =
    role === 'host'
      ? { name: item.requester_name as string | null, phone: item.requester_phone as string | null }
      : { name: item.owner?.name ?? null, phone: item.owner?.phone ?? null };
  const cancelAction: TourAction = role === 'host' ? 'DECLINE' : 'CANCEL';

  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
      <Link
        href={`/listing/${item.listing.id}`}
        className="relative block h-[64px] w-[88px] shrink-0 overflow-hidden rounded-[10px]"
      >
        <PhotoImg src={item.listing.photo_url ?? ''} alt={item.listing.title} sizes="88px" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/listing/${item.listing.id}`}
          className="block truncate text-[15px] font-semibold hover:text-teal"
        >
          {item.listing.title}
        </Link>
        <div className="text-[13px] text-muted-foreground">
          {item.requested_date} {t('tours.on')} {item.window_start}–{item.window_end}
        </div>
        <div className="truncate text-[13px]">
          <span className="rounded-badge bg-mint px-1.5 py-0.5 text-[11px] font-bold text-teal-deep">
            {t(role === 'host' ? 'tours.roleHost' : 'tours.roleGuest')}
          </span>
          {counterpart.name && <span className="ml-1.5">{counterpart.name}</span>}
          {counterpart.phone && (
            <>
              <span className="text-muted-foreground"> · </span>
              <a href={`tel:${counterpart.phone}`} className="text-teal hover:text-teal-deep">
                {counterpart.phone}
              </a>
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => {
          void update({ id: item.id, action: cancelAction })
            .unwrap()
            .catch(() => {});
        }}
        className="rounded-pill border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-bg disabled:opacity-50"
      >
        {t('tours.cancel')}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Переписать `Tours.tsx`**

Полная замена файла:

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
import { useRouter } from '@/i18n/navigation';
import { PhotoImg } from '@/components/ui/photo-img';
import { IncomingTourModal } from './IncomingTourModal';
import { UpcomingTourCard } from './UpcomingTourCard';
import { mergeUpcoming } from './tour-agenda';

const UPCOMING_PARAMS = { status: 'CONFIRMED', upcoming: true } as const;

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
  if (action === 'CONFIRM') return 'bg-green text-white hover:brightness-95';
  if (action === 'DECLINE') return 'bg-red text-white hover:bg-red-press';
  return 'border border-border hover:bg-bg';
}

function Row({
  item,
  kind,
  actions,
  onOpen,
}: {
  item: TourRequestItem;
  /** incoming — первая строка про гостя; outgoing — про объявление. */
  kind: 'incoming' | 'outgoing';
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
        'flex items-center gap-3 rounded-card border border-border bg-surface p-4',
        clickable && 'cursor-pointer hover:border-teal/60',
      )}
    >
      <div className="relative h-[56px] w-[76px] shrink-0 overflow-hidden rounded-[10px]">
        <PhotoImg src={item.listing.photo_url ?? ''} alt={item.listing.title} sizes="76px" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">
          {kind === 'incoming' ? (
            <>
              <span>{item.requester_name}</span>
              <span className="text-muted-foreground"> · {item.requester_phone}</span>
            </>
          ) : (
            item.listing.title
          )}
        </div>
        {kind === 'incoming' && (
          <div className="truncate text-[13px]">{item.listing.title}</div>
        )}
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
              // Клик по кнопке действия не должен открывать модалку/переход строки.
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
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data: outgoing } = useGetOutgoingToursQuery(undefined, { skip: !isAuthenticated });
  const { data: incoming } = useGetIncomingToursQuery(undefined, { skip: !isAuthenticated });
  const { data: upcomingOut } = useGetOutgoingToursQuery(UPCOMING_PARAMS, { skip: !isAuthenticated });
  const { data: upcomingIn } = useGetIncomingToursQuery(UPCOMING_PARAMS, { skip: !isAuthenticated });
  const [selected, setSelected] = React.useState<TourRequestItem | null>(null);

  const upcoming = React.useMemo(
    () => mergeUpcoming(upcomingIn, upcomingOut),
    [upcomingIn, upcomingOut],
  );

  if (!isAuthenticated) return <p className="text-muted-foreground">{t('tours.guest')}</p>;

  const out = outgoing ?? [];
  const inc = incoming ?? [];
  if (out.length === 0 && inc.length === 0 && upcoming.length === 0)
    return <p className="text-muted-foreground">{t('tours.empty')}</p>;

  return (
    <div className="flex flex-col gap-6">
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.upcoming')}</h2>
          {upcoming.map((entry) => (
            <UpcomingTourCard key={`${entry.role}-${entry.item.id}`} item={entry.item} role={entry.role} />
          ))}
        </section>
      )}
      {inc.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.incoming')}</h2>
          {inc.map((it) => (
            <Row
              key={it.id}
              item={it}
              kind="incoming"
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
              kind="outgoing"
              onOpen={() => router.push(`/listing/${it.listing.id}`)}
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

Замечания:
- `UPCOMING_PARAMS` — модульная константа, чтобы ссылка была стабильной (иначе новый объект каждый рендер = лишние ре-подписки RTKQ).
- `useRouter` — именно из `@/i18n/navigation` (локализованные пути), не из `next/navigation`.
- Пустое состояние учитывает и агенду (три источника).

- [ ] **Step 4: Проверки**

Run: `pnpm --filter @avino/client test`
Expected: PASS кроме 2 предсуществующих фейлов `LoginModal.test.tsx` (не регресс).

Run: `pnpm --filter @avino/client lint`
Expected: 0 errors. ВРУЧНУЮ проверить: нет неиспользуемых импортов в `Tours.tsx` (client-eslint их не ловит).

Run: `pnpm --filter @avino/client exec next build`
Expected: успешная сборка (raw-команда, не `rtk next build` — тот даёт ложный «Errors: 1»).

ВРУЧНУЮ проверить i18n: `python3 -c "import json; [print(f, sorted(json.load(open(f'apps/client/messages/{f}.json'))['account']['tours'].keys())) for f in ('ru','uz','en')]"` — наборы ключей во всех трёх файлах совпадают.

- [ ] **Step 5: Commit + push + PR**

```bash
git add apps/client/src/features/account/UpcomingTourCard.tsx apps/client/src/features/account/Tours.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): upcoming tours agenda and listing context on /account/tours"
git push -u origin feat/account-tours-agenda
```

PR title: `feat(client): upcoming tours agenda on /account/tours`

PR description:
- Блок «Предстоящие туры»: единая агенда обеих ролей (CONFIRMED, дата ≥ сегодня, сортировка по дате/окну) — фото/название объявления, роль, контрагент с телефоном, отмена (host → DECLINE, guest → CANCEL)
- Строки списков получили мини-фото + название объявления; outgoing-строки кликабельны → страница объявления
- ⚠️ Мёржить ПОСЛЕ backend PR `feat(tour-requests): listing context...` (контракт `listing`/`owner` и параметры `status`/`upcoming`)
- Как проверить: staging — создать заявку на тур вторым пользователем, подтвердить владельцем, открыть `/account/tours` у обоих

Pre-merge checklist:
- Тесты/линт/сборка зелёные (кроме 2 предсуществующих фейлов LoginModal)
- i18n-ключи в трёх языках, uz — латиница
- Нет файлов вне apps/client
