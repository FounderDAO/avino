# Property Tour Requests — Client Implementation Plan (PR 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю портала `apps/client` запрашивать просмотр (тур) объявления и управлять заявками; продавцу — включать туры + задавать окна на форме объявления.

**Architecture:** Backend уже в `main` (PR #209). Клиент: новый RTK-слайс `tourRequestsApi`; кнопка «Request a tour» + модалка на детальной (Radix Dialog, как `LoginModal`); секция «Туры» на форме создания/правки; вкладка «Мои туры» в кабинете. Все строки — i18n ru/uz/en.

**Tech Stack:** Next.js (App Router) + TypeScript, RTK Query (`baseApi.injectEndpoints`), Radix Dialog (`radix-ui`), `next-intl`, Vitest + RTL.

**Branch:** `feat/property-tour-requests-client` (off latest `main`). Один PR = только `apps/client`.

**Spec:** `docs/superpowers/specs/2026-06-21-property-tour-requests-design.md` (§6 — клиент).

## Global Constraints

- **Только `apps/client`** (CLAUDE.md §0: одна app-папка = один PR). Не трогать `apps/api`/`apps/web`.
- RTK Query — единственный слой API (CLAUDE.md §4); никаких `fetch`/`axios` в компонентах. baseQuery уже даёт `/api/v1` префикс + `Authorization: Bearer` + `Accept-Language`.
- snake_case в request/response к API; camelCase в доменных типах клиента (`Listing`).
- Кнопка «Request a tour» видна только при `toursEnabled && status === 'ACTIVE'`.
- Окно — формат `HH:MM`; ≤6 окон; включить туры можно только при ≥1 окне; `start < end` (зеркалим бэкенд, который вернёт 422 как защиту).
- Дата тура: не в прошлом (сегодня допустимо), ≤30 дней вперёд (`<input type="date">` `min`/`max`).
- Телефон обязателен; имя предзаполнено из профиля и редактируемо; email read-only из аккаунта.
- Гость, нажав действие, проходит через `LoginModal` (паттерн «pending intent» из `ContactCard`).
- i18n: все новые строки — ключи в `messages/ru.json` + `uz.json` + `en.json` (полный паритет).
- Commit-стиль: Conventional Commits (`feat(tours): …`); каждое сообщение завершать строкой:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Git ведёт ТОЛЬКО контроллер; суб-агенты пишут код и гоняют тесты, НЕ трогают git.
- Тесты: Vitest, мок на границе модулей (`@/store/hooks`, api-модули, `next-intl`, `@/i18n/navigation`) — БЕЗ Redux `<Provider>` (как `ContactCard.test.tsx`/`LoginModal.test.tsx`).

---

## File Structure

**Создаём:**
- `apps/client/src/store/api/tourRequestsApi.ts` — RTK-слайс заявок (типы + 4 эндпоинта).
- `apps/client/src/features/detail/TourRequestModal.tsx` — модалка заявки.
- `apps/client/src/features/detail/TourRequestModal.test.tsx`
- `apps/client/src/features/listing-shared/ToursSection.tsx` — секция «Туры» (тоггл + редактор окон), переиспользуемая edit+new.
- `apps/client/src/features/listing-shared/ToursSection.test.tsx`
- `apps/client/src/features/account/Tours.tsx` — вкладка «Мои туры».
- `apps/client/src/features/account/Tours.test.tsx`

**Изменяем:**
- `apps/client/src/lib/mock/types.ts` — `TourWindow` + поля `Listing.toursEnabled`/`tourWindows`.
- `apps/client/src/lib/api/listings.ts` — `ApiListingDetail` tours-поля + маппер.
- `apps/client/src/store/api/baseApi.ts` — тег `'TourRequest'`.
- `apps/client/src/store/api/createListingApi.ts` — `CreateListingBody` tours-поля.
- `apps/client/src/store/api/listingEditApi.ts` — `EditListingDetail` + `UpdateListingPatch` tours-поля.
- `apps/client/src/features/detail/ContactCard.tsx` — кнопка «Request a tour» + гость-гейт + рендер модалки.
- `apps/client/src/features/listing-edit/ListingEdit.tsx` — секция «Туры» + стейт + `buildPatch`.
- `apps/client/src/features/listing-new/ListingNew.tsx` — секция «Туры» + `FormState` + `buildBody`.
- `apps/client/src/app/[locale]/account/[tab]/page.tsx` — `'tours': Tours` в `TAB_CONTENT`.
- `apps/client/src/features/account/AccountLayout.tsx` — вкладка в `ACCOUNT_TABS`.
- `apps/client/messages/ru.json`, `uz.json`, `en.json` — ключи.

---

## Task 1: Типы + контракт (плумбинг)

**Files:**
- Modify: `apps/client/src/lib/mock/types.ts`, `apps/client/src/lib/api/listings.ts`, `apps/client/src/store/api/createListingApi.ts`, `apps/client/src/store/api/listingEditApi.ts`

**Interfaces:**
- Produces: `interface TourWindow { start: string; end: string }`; `Listing.toursEnabled?: boolean`, `Listing.tourWindows?: TourWindow[]`; `CreateListingBody`/`UpdateListingPatch`/`EditListingDetail` принимают tours-поля; `ApiListingDetail` отдаёт их.

- [ ] **Step 1: `lib/mock/types.ts`** — добавить тип окна (рядом с `Listing`) и поля в `Listing`:

```ts
export interface TourWindow {
  start: string; // "07:00"
  end: string; // "10:00"
}
```
В интерфейс `Listing` (после `status?`):
```ts
  toursEnabled?: boolean;
  tourWindows?: TourWindow[];
```

- [ ] **Step 2: `lib/api/listings.ts`** — в `ApiListingDetail` добавить:
```ts
  tours_enabled: boolean;
  tour_windows: { start: string; end: string }[];
```
Найти функцию-маппер `ApiListingDetail → Listing` (возврат `getListingById`/`mapDetailToListing`) и добавить в объект:
```ts
    toursEnabled: api.tours_enabled,
    tourWindows: api.tour_windows ?? [],
```
(импорт `TourWindow` не обязателен — структурно совместимо.)

- [ ] **Step 3: `createListingApi.ts`** — в `CreateListingBody` (в блок опциональных) добавить:
```ts
  tours_enabled?: boolean;
  tour_windows?: { start: string; end: string }[];
```

- [ ] **Step 4: `listingEditApi.ts`** — в `EditListingDetail` (для префилла) и в `UpdateListingPatch` добавить те же два поля:
```ts
  tours_enabled?: boolean; // в EditListingDetail: boolean (не optional) — бэкенд всегда отдаёт
  tour_windows?: { start: string; end: string }[];
```
(в `EditListingDetail` — `tours_enabled: boolean;` и `tour_windows: { start: string; end: string }[];`; в `UpdateListingPatch` — оба optional.)

- [ ] **Step 5: Проверка типов**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS — нет ошибок типов.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/lib/mock/types.ts apps/client/src/lib/api/listings.ts apps/client/src/store/api/createListingApi.ts apps/client/src/store/api/listingEditApi.ts
git commit -m "feat(tours): client types for tours_enabled/tour_windows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: RTK-слайс `tourRequestsApi`

**Files:**
- Create: `apps/client/src/store/api/tourRequestsApi.ts`
- Modify: `apps/client/src/store/api/baseApi.ts`

**Interfaces:**
- Consumes: `baseApi`.
- Produces: hooks `useCreateTourRequestMutation`, `useGetOutgoingToursQuery`, `useGetIncomingToursQuery`, `useUpdateTourStatusMutation`; types `TourRequestStatus`, `TourRequestItem`, `CreateTourRequestBody`, `TourAction`.

- [ ] **Step 1: `baseApi.ts`** — добавить тег в `tagTypes` (после `'Notification'`):
```ts
    'TourRequest',
```

- [ ] **Step 2: Создать `apps/client/src/store/api/tourRequestsApi.ts`**

```ts
/**
 * tourRequestsApi — заявки на тур (просмотр), backend PR #209 (API.md «tour-requests»).
 *  - POST   /tour-requests              — создать заявку (Bearer).
 *  - GET    /tour-requests/outgoing     — мои отправленные (покупатель).
 *  - GET    /tour-requests/incoming     — входящие по моим объявлениям (владелец).
 *  - PATCH  /tour-requests/:id/status   — { action: CONFIRM|DECLINE|CANCEL }.
 * Списки приходят envelope { data, meta } → transformResponse отдаёт массив.
 */
import { baseApi } from './baseApi';

export type TourRequestStatus = 'PENDING' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED';
export type TourAction = 'CONFIRM' | 'DECLINE' | 'CANCEL';

/** Объект заявки (snake_case контракт бэкенда). */
export interface TourRequestItem {
  id: string;
  listing_id: string;
  requester_id: string;
  status: TourRequestStatus;
  requested_date: string; // YYYY-MM-DD
  window_start: string;
  window_end: string;
  requester_name: string;
  requester_phone: string;
  message: string | null;
  created_at: string;
}

/** Тело POST /tour-requests. */
export interface CreateTourRequestBody {
  listing_id: string;
  requested_date: string;
  window_start: string;
  window_end: string;
  requester_name: string;
  requester_phone: string;
  message?: string;
}

interface TourListEnvelope {
  data: TourRequestItem[];
  meta: { limit: number; total: number; next_cursor: string | null };
}

const OUTGOING_TAG = { type: 'TourRequest' as const, id: 'OUTGOING' };
const INCOMING_TAG = { type: 'TourRequest' as const, id: 'INCOMING' };

export const tourRequestsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    createTourRequest: build.mutation<TourRequestItem, CreateTourRequestBody>({
      query: (body) => ({ url: '/tour-requests', method: 'POST', body }),
      invalidatesTags: [OUTGOING_TAG],
    }),
    getOutgoingTours: build.query<TourRequestItem[], void>({
      query: () => '/tour-requests/outgoing?limit=50',
      transformResponse: (env: TourListEnvelope) => env.data,
      providesTags: [OUTGOING_TAG],
    }),
    getIncomingTours: build.query<TourRequestItem[], void>({
      query: () => '/tour-requests/incoming?limit=50',
      transformResponse: (env: TourListEnvelope) => env.data,
      providesTags: [INCOMING_TAG],
    }),
    updateTourStatus: build.mutation<TourRequestItem, { id: string; action: TourAction }>({
      query: ({ id, action }) => ({ url: `/tour-requests/${id}/status`, method: 'PATCH', body: { action } }),
      invalidatesTags: [OUTGOING_TAG, INCOMING_TAG],
    }),
  }),
  overrideExisting: false,
});

export const {
  useCreateTourRequestMutation,
  useGetOutgoingToursQuery,
  useGetIncomingToursQuery,
  useUpdateTourStatusMutation,
} = tourRequestsApi;
```

- [ ] **Step 3: Проверка типов**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/store/api/tourRequestsApi.ts apps/client/src/store/api/baseApi.ts
git commit -m "feat(tours): tourRequestsApi RTK slice

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: i18n ключи (pre-seed для Tasks 4–6)

**Files:**
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json`

**Interfaces:**
- Produces: namespace `tourRequest.*`; `listing.contact.requestTour`/`loginToTour`; `account.tabs.tours` + `account.tours.*`; `listingEdit.tours.*`. Одинаковые ключи во всех трёх файлах.

- [ ] **Step 1: Добавить ключи в `ru.json`**

В namespace `listing.contact` (рядом с `message`):
```json
"requestTour": "Запросить тур",
"loginToTour": "Войдите, чтобы запросить тур"
```
Новый top-level namespace `tourRequest`:
```json
"tourRequest": {
  "title": "Заявка на тур",
  "name": "Имя и фамилия",
  "email": "Email (из аккаунта)",
  "phone": "Телефон",
  "date": "Дата",
  "window": "Время",
  "message": "Сообщение",
  "messageDefault": "Хочу записаться на тур.",
  "submit": "Отправить заявку",
  "terms": "Отправляя заявку, вы соглашаетесь с Условиями.",
  "success": "Заявка отправлена",
  "error": "Не удалось отправить заявку",
  "windowRequired": "Выберите время",
  "phoneRequired": "Укажите телефон",
  "close": "Закрыть"
}
```
В namespace `account`: в `tabs` добавить `"tours": "Мои туры"`; новый блок:
```json
"tours": {
  "outgoing": "Мои запросы",
  "incoming": "Запросы ко мне",
  "empty": "Пока нет заявок на тур",
  "guest": "Войдите, чтобы видеть заявки на тур",
  "on": "на",
  "confirm": "Подтвердить",
  "decline": "Отклонить",
  "cancel": "Отменить",
  "status": {
    "PENDING": "Ожидает", "CONFIRMED": "Подтверждён",
    "DECLINED": "Отклонён", "CANCELLED": "Отменён"
  }
}
```
В namespace `listingEdit` (и переиспользуем в new) новый блок:
```json
"tours": {
  "title": "Туры (просмотры)",
  "enable": "Принимать заявки на тур",
  "hint": "Выберите время, когда можно прийти осмотреть",
  "addWindow": "Добавить окно",
  "from": "с", "to": "до",
  "remove": "Удалить",
  "needWindow": "Добавьте хотя бы одно окно времени"
}
```

- [ ] **Step 2: Те же ключи в `uz.json`** (узбекская локаль):
```json
"requestTour": "Tur so‘rash", "loginToTour": "Tur so‘rash uchun tizimga kiring"
```
```json
"tourRequest": {
  "title": "Tur uchun ariza", "name": "Ism va familiya", "email": "Email (akkauntdan)",
  "phone": "Telefon", "date": "Sana", "window": "Vaqt", "message": "Xabar",
  "messageDefault": "Turga yozilmoqchiman.", "submit": "Ariza yuborish",
  "terms": "Ariza yuborish bilan Shartlarga rozilik bildirasiz.",
  "success": "Ariza yuborildi", "error": "Arizani yuborib bo‘lmadi",
  "windowRequired": "Vaqtni tanlang", "phoneRequired": "Telefonni kiriting", "close": "Yopish"
}
```
`account.tabs.tours`: `"Mening turlarim"`;
```json
"tours": {
  "outgoing": "Mening so‘rovlarim", "incoming": "Menga so‘rovlar",
  "empty": "Hozircha tur arizalari yo‘q", "guest": "Tur arizalarini ko‘rish uchun tizimga kiring",
  "on": "—", "confirm": "Tasdiqlash", "decline": "Rad etish", "cancel": "Bekor qilish",
  "status": { "PENDING": "Kutilmoqda", "CONFIRMED": "Tasdiqlangan", "DECLINED": "Rad etilgan", "CANCELLED": "Bekor qilingan" }
}
```
`listingEdit.tours`:
```json
"tours": {
  "title": "Turlar (ko‘riklar)", "enable": "Tur arizalarini qabul qilish",
  "hint": "Ko‘rikka kelish mumkin bo‘lgan vaqtni tanlang", "addWindow": "Oyna qo‘shish",
  "from": "dan", "to": "gacha", "remove": "O‘chirish", "needWindow": "Kamida bitta vaqt oynasini qo‘shing"
}
```

- [ ] **Step 3: Те же ключи в `en.json`**:
```json
"requestTour": "Request a tour", "loginToTour": "Sign in to request a tour"
```
```json
"tourRequest": {
  "title": "Request a tour", "name": "First & last name", "email": "Email (from account)",
  "phone": "Phone", "date": "Date", "window": "Time", "message": "Message",
  "messageDefault": "I would like to schedule a tour.", "submit": "Send tour request",
  "terms": "By sending this request, you agree to our Terms.",
  "success": "Request sent", "error": "Failed to send request",
  "windowRequired": "Select a time", "phoneRequired": "Enter a phone number", "close": "Close"
}
```
`account.tabs.tours`: `"My tours"`;
```json
"tours": {
  "outgoing": "My requests", "incoming": "Requests to me",
  "empty": "No tour requests yet", "guest": "Sign in to see tour requests",
  "on": "on", "confirm": "Confirm", "decline": "Decline", "cancel": "Cancel",
  "status": { "PENDING": "Pending", "CONFIRMED": "Confirmed", "DECLINED": "Declined", "CANCELLED": "Cancelled" }
}
```
`listingEdit.tours`:
```json
"tours": {
  "title": "Tours (viewings)", "enable": "Accept tour requests",
  "hint": "Pick the times when visitors can come and view", "addWindow": "Add window",
  "from": "from", "to": "to", "remove": "Remove", "needWindow": "Add at least one time window"
}
```

- [ ] **Step 4: Валидировать JSON** (все три парсятся):

Run: `node -e "['ru','uz','en'].forEach(l=>JSON.parse(require('fs').readFileSync('apps/client/messages/'+l+'.json','utf8')))" && echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(tours): i18n keys for tour requests (ru/uz/en)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Кнопка «Request a tour» + `TourRequestModal`

**Files:**
- Create: `apps/client/src/features/detail/TourRequestModal.tsx`, `apps/client/src/features/detail/TourRequestModal.test.tsx`
- Modify: `apps/client/src/features/detail/ContactCard.tsx`

**Interfaces:**
- Consumes: `useCreateTourRequestMutation` (Task 2); `Listing.toursEnabled`/`tourWindows` (Task 1); `selectCurrentUser`/`selectIsAuthenticated`; i18n (Task 3).
- Produces: `<TourRequestModal listing open onOpenChange />`.

- [ ] **Step 1: Написать падающий тест** `TourRequestModal.test.tsx` (мок на границе модулей, как `ContactCard.test.tsx`)

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

const createSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({ id: 'TR1' }) }));
let mockUser: unknown = { profile: { display_name: 'Tap Links', contact_phone: '+998901112233' }, email: 'a@b.c', phone: null };

vi.mock('@/store/hooks', () => ({ useAppSelector: (sel: (s: unknown) => unknown) => sel({ auth: { accessToken: 't', user: mockUser } }) }));
vi.mock('@/store/api/tourRequestsApi', () => ({ useCreateTourRequestMutation: () => [createSpy, { isLoading: false }] }));
vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => (ns ? (ru as any)[ns]?.[k] ?? k : k) }));

import { TourRequestModal } from './TourRequestModal';

const listing = { id: 'L1', title: 'X', toursEnabled: true, status: 'ACTIVE', tourWindows: [{ start: '07:00', end: '10:00' }] } as any;

describe('TourRequestModal', () => {
  beforeEach(() => { createSpy.mockClear(); });

  it('предзаполняет имя и телефон из профиля', () => {
    render(<TourRequestModal listing={listing} open onOpenChange={vi.fn()} />);
    expect((screen.getByLabelText(ru.tourRequest.name) as HTMLInputElement).value).toBe('Tap Links');
    expect((screen.getByLabelText(ru.tourRequest.phone) as HTMLInputElement).value).toBe('+998901112233');
  });

  it('отправляет заявку с выбранными датой и окном', () => {
    render(<TourRequestModal listing={listing} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(ru.tourRequest.date), { target: { value: '2099-01-01' } });
    fireEvent.click(screen.getByText(ru.tourRequest.submit));
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      listing_id: 'L1', requested_date: '2099-01-01', window_start: '07:00', window_end: '10:00',
      requester_name: 'Tap Links', requester_phone: '+998901112233',
    }));
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @avino/client test -- TourRequestModal`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `TourRequestModal.tsx`** (Radix Dialog, структура как `LoginModal.tsx:152–308`; поля — `<Field>` из `@/components/ui/field` если есть, иначе нативные `<input>` с `<label>`)

```tsx
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useAppSelector } from '@/store/hooks';
import { selectCurrentUser } from '@/store/slices/authSlice';
import { useCreateTourRequestMutation } from '@/store/api/tourRequestsApi';
import { getApiError } from '@/store/api/apiError';
import type { Listing } from '@/lib/mock/types';

export interface TourRequestModalProps {
  listing: Listing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function horizonISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TourRequestModal({ listing, open, onOpenChange }: TourRequestModalProps) {
  const t = useTranslations('tourRequest');
  const user = useAppSelector(selectCurrentUser);
  const [createTour, { isLoading }] = useCreateTourRequestMutation();

  const windows = listing.tourWindows ?? [];
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [date, setDate] = React.useState('');
  const [windowIdx, setWindowIdx] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  // Префилл из профиля при открытии.
  React.useEffect(() => {
    if (!open) return;
    setName(user?.profile?.display_name ?? user?.profile?.first_name ?? '');
    setPhone(user?.profile?.contact_phone ?? user?.phone ?? '');
    setDate('');
    setWindowIdx(0);
    setMessage(t('messageDefault'));
    setError(null);
    setDone(false);
  }, [open, user, t]);

  const submit = React.useCallback(async () => {
    setError(null);
    if (!phone.trim()) { setError(t('phoneRequired')); return; }
    const w = windows[windowIdx];
    if (!w) { setError(t('windowRequired')); return; }
    if (!date) { setError(t('windowRequired')); return; }
    try {
      await createTour({
        listing_id: listing.id,
        requested_date: date,
        window_start: w.start,
        window_end: w.end,
        requester_name: name.trim(),
        requester_phone: phone.trim(),
        message: message.trim() || undefined,
      }).unwrap();
      setDone(true);
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      setError(apiErr?.message ?? t('error'));
    }
  }, [phone, windows, windowIdx, date, createTour, listing.id, name, message, onOpenChange, t]);

  const email = user?.email ?? '';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-7 shadow-raised">
          <Dialog.Title className="text-xl font-extrabold">{t('title')}</Dialog.Title>

          {done ? (
            <p className="mt-4 text-base font-semibold text-teal-deep">{t('success')}</p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('name')}
                <input aria-label={t('name')} value={name} onChange={(e) => setName(e.target.value)}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal" />
              </label>

              <div className="text-[13px] font-semibold">
                {t('email')}<div className="mt-1 text-[15px] font-normal text-muted-foreground">{email}</div>
              </div>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('phone')} *
                <input aria-label={t('phone')} value={phone} onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel" placeholder="+998 ..." className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal" />
              </label>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('date')} *
                <input aria-label={t('date')} type="date" value={date} min={todayISO()} max={horizonISO(30)}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal" />
              </label>

              <fieldset className="flex flex-col gap-1.5 text-[13px] font-semibold">
                <legend>{t('window')} *</legend>
                {windows.map((w, i) => (
                  <label key={`${w.start}-${w.end}`} className="flex items-center gap-2 font-normal">
                    <input type="radio" name="tour-window" checked={windowIdx === i} onChange={() => setWindowIdx(i)} />
                    {w.start}–{w.end}
                  </label>
                ))}
              </fieldset>

              <label className="flex flex-col gap-1 text-[13px] font-semibold">
                {t('message')}
                <textarea aria-label={t('message')} value={message} onChange={(e) => setMessage(e.target.value)}
                  rows={3} maxLength={500} className="rounded-lg border border-border bg-bg px-3 py-2 text-[15px] font-normal" />
              </label>

              {error && <div className="text-[12.5px] text-red">{error}</div>}
              <p className="text-[12px] text-muted-foreground">{t('terms')}</p>

              <Button size="lg" className="w-full" disabled={isLoading} onClick={submit}>
                {t('submit')}
              </Button>
            </div>
          )}

          <Dialog.Close aria-label={t('close')}
            className="absolute right-4 top-4 text-muted-foreground hover:text-ink">✕</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```
> Прим.: если в проекте есть готовый `<Field>` (`@/components/ui/field`), используй его вместо сырых `<input>` для единообразия — лейблы должны оставаться доступными (`aria-label` совпадает с i18n-значением, как в тесте).

- [ ] **Step 4: Запустить — PASS**

Run: `pnpm --filter @avino/client test -- TourRequestModal`
Expected: PASS (2 кейса).

- [ ] **Step 5: Встроить кнопку в `ContactCard.tsx`** (мирроринг паттерна «pendingMessage»)

Импорты — добавить:
```ts
import { CalendarDays } from 'lucide-react';
import { TourRequestModal } from './TourRequestModal';
```
Стейт (рядом с `loginOpen`/`pendingMessage`):
```ts
  const [tourOpen, setTourOpen] = React.useState(false);
  const [pendingTour, setPendingTour] = React.useState(false);
  const canTour = listing.toursEnabled === true && (listing.status ?? 'ACTIVE') === 'ACTIVE';
```
Хэндлер + эффект (рядом с `handleMessage`/его `useEffect`):
```ts
  const handleTour = React.useCallback(() => {
    if (!isAuthenticated) { setPendingTour(true); setLoginOpen(true); return; }
    setTourOpen(true);
  }, [isAuthenticated]);

  React.useEffect(() => {
    if (isAuthenticated && pendingTour) { setPendingTour(false); setTourOpen(true); }
  }, [isAuthenticated, pendingTour]);
```
Кнопка — вставить в блок кнопок ПЕРЕД кнопкой «Написать» (между строкой 123 и 125), видна только при `canTour`:
```tsx
        {canTour && (
          <Button size="lg" className="w-full" onClick={handleTour}>
            <CalendarDays size={18} /> {t('contact.requestTour')}
          </Button>
        )}
```
Рендер модалки — рядом с `<LoginModal …/>` (после строки 150):
```tsx
      <TourRequestModal listing={listing} open={tourOpen} onOpenChange={setTourOpen} />
```
И в существующем `<LoginModal context={…}>` оставить как есть (общая модалка входа подходит и для тура; контекст можно не менять либо завязать на pendingTour — необязательно для MVP).

- [ ] **Step 6: Прогон тестов детали**

Run: `pnpm --filter @avino/client test -- ContactCard TourRequestModal` и `pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS (ContactCard без регрессий + TourRequestModal).

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/features/detail/TourRequestModal.tsx apps/client/src/features/detail/TourRequestModal.test.tsx apps/client/src/features/detail/ContactCard.tsx
git commit -m "feat(tours): Request a tour button + modal on listing detail

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Секция «Туры» на форме (edit + new)

**Files:**
- Create: `apps/client/src/features/listing-shared/ToursSection.tsx`, `apps/client/src/features/listing-shared/ToursSection.test.tsx`
- Modify: `apps/client/src/features/listing-edit/ListingEdit.tsx`, `apps/client/src/features/listing-new/ListingNew.tsx`

**Interfaces:**
- Consumes: i18n `listingEdit.tours.*` (Task 3); `TourWindow` (Task 1).
- Produces: `<ToursSection enabled windows onChange />` — контролируемый компонент; колбэк `(next: { enabled: boolean; windows: TourWindow[] }) => void`.

- [ ] **Step 1: Написать падающий тест** `ToursSection.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => (ru as any)[ns]?.tours?.[k.replace('tours.', '')] ?? (ru as any)[ns]?.[k] ?? k }));

import { ToursSection } from './ToursSection';

describe('ToursSection', () => {
  it('включение тоггла добавляет первое окно и эмитит enabled+window', () => {
    const onChange = vi.fn();
    render(<ToursSection enabled={false} windows={[]} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(ru.listingEdit.tours.enable));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(onChange.mock.calls.at(-1)![0].windows.length).toBeGreaterThanOrEqual(1);
  });

  it('добавляет и удаляет окно', () => {
    const onChange = vi.fn();
    render(<ToursSection enabled windows={[{ start: '07:00', end: '10:00' }]} onChange={onChange} />);
    fireEvent.click(screen.getByText(ru.listingEdit.tours.addWindow));
    expect(onChange.mock.calls.at(-1)![0].windows.length).toBe(2);
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @avino/client test -- ToursSection`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `ToursSection.tsx`**

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { TourWindow } from '@/lib/mock/types';

export interface ToursSectionValue {
  enabled: boolean;
  windows: TourWindow[];
}
export interface ToursSectionProps extends ToursSectionValue {
  onChange: (next: ToursSectionValue) => void;
}

const MAX_WINDOWS = 6;
const DEFAULT_WINDOW: TourWindow = { start: '09:00', end: '12:00' };

export function ToursSection({ enabled, windows, onChange }: ToursSectionProps) {
  const t = useTranslations('listingEdit');

  const toggle = (next: boolean) => {
    // Включение без окон → сразу добавляем дефолтное (бэкенд требует ≥1).
    const w = next && windows.length === 0 ? [DEFAULT_WINDOW] : windows;
    onChange({ enabled: next, windows: w });
  };
  const addWindow = () => {
    if (windows.length >= MAX_WINDOWS) return;
    onChange({ enabled, windows: [...windows, DEFAULT_WINDOW] });
  };
  const removeWindow = (i: number) => {
    onChange({ enabled, windows: windows.filter((_, idx) => idx !== i) });
  };
  const setField = (i: number, key: keyof TourWindow, value: string) => {
    onChange({ enabled, windows: windows.map((w, idx) => (idx === i ? { ...w, [key]: value } : w)) });
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-base font-bold">
        <input type="checkbox" aria-label={t('tours.enable')} checked={enabled} onChange={(e) => toggle(e.target.checked)} />
        {t('tours.enable')}
      </label>
      {enabled && (
        <>
          <p className="text-[13px] text-muted-foreground">{t('tours.hint')}</p>
          {windows.map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[13px]">{t('tours.from')}</span>
              <input type="time" value={w.start} onChange={(e) => setField(i, 'start', e.target.value)}
                className="rounded-lg border border-border bg-bg px-2 py-1.5" />
              <span className="text-[13px]">{t('tours.to')}</span>
              <input type="time" value={w.end} onChange={(e) => setField(i, 'end', e.target.value)}
                className="rounded-lg border border-border bg-bg px-2 py-1.5" />
              <button type="button" onClick={() => removeWindow(i)} className="text-[13px] text-red">{t('tours.remove')}</button>
            </div>
          ))}
          {windows.length < MAX_WINDOWS && (
            <Button type="button" variant="outline" size="sm" onClick={addWindow}>{t('tours.addWindow')}</Button>
          )}
          {windows.length === 0 && <div className="text-[12.5px] text-red">{t('tours.needWindow')}</div>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `pnpm --filter @avino/client test -- ToursSection`
Expected: PASS (2 кейса).

- [ ] **Step 5: Встроить в `ListingEdit.tsx`**

READ `ListingEdit.tsx` сначала. В `EditForm` (≈строка 171) добавить поля `toursEnabled: boolean` и `tourWindows: TourWindow[]`; инициализировать из `getListingForEdit` (`detail.tours_enabled`, `detail.tour_windows`) в эффекте префилла. Добавить секцию после `<Section>` «Описание» (≈строка 490):
```tsx
        <Section title={t('tours.title')}>
          <ToursSection
            enabled={form.toursEnabled}
            windows={form.tourWindows}
            onChange={(v) => { set('toursEnabled', v.enabled); set('tourWindows', v.windows); }}
          />
        </Section>
```
В `buildPatch()` добавить:
```ts
      tours_enabled: form.toursEnabled,
      tour_windows: form.tourWindows,
```
Импорт: `import { ToursSection } from '@/features/listing-shared/ToursSection';` + тип `TourWindow` из `@/lib/mock/types`.

- [ ] **Step 6: Встроить в `ListingNew.tsx`**

READ `ListingNew.tsx`. В `FormState` (≈строки 72–90) добавить `toursEnabled: boolean` (init `false`) и `tourWindows: TourWindow[]` (init `[]`). Добавить `<ToursSection>` как секцию (в шаг «Контакты»/«Превью» или отдельным шагом), завязав на `set('toursEnabled', …)`/`set('tourWindows', …)`. В `buildBody()` добавить (только если включено — иначе бэкенд не требует):
```ts
      ...(form.toursEnabled ? { tours_enabled: true, tour_windows: form.tourWindows } : {}),
```

- [ ] **Step 7: Прогон + типы**

Run: `pnpm --filter @avino/client test -- ToursSection` и `pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS; типы чисто.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/features/listing-shared/ToursSection.tsx apps/client/src/features/listing-shared/ToursSection.test.tsx apps/client/src/features/listing-edit/ListingEdit.tsx apps/client/src/features/listing-new/ListingNew.tsx
git commit -m "feat(tours): tours section (toggle + windows) on listing forms

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Вкладка «Мои туры» в кабинете

**Files:**
- Create: `apps/client/src/features/account/Tours.tsx`, `apps/client/src/features/account/Tours.test.tsx`
- Modify: `apps/client/src/app/[locale]/account/[tab]/page.tsx`, `apps/client/src/features/account/AccountLayout.tsx`

**Interfaces:**
- Consumes: `useGetOutgoingToursQuery`/`useGetIncomingToursQuery`/`useUpdateTourStatusMutation` (Task 2); `selectIsAuthenticated`; i18n `account.tours.*` (Task 3).
- Produces: вкладка `tours` в кабинете.

- [ ] **Step 1: Написать падающий тест** `Tours.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

const updateSpy = vi.fn(() => ({ unwrap: () => Promise.resolve({}) }));
const outgoing = [{ id: 'O1', listing_id: 'L1', status: 'PENDING', requested_date: '2099-01-01', window_start: '07:00', window_end: '10:00', requester_name: 'Me', requester_phone: 'x', message: null, created_at: '' }];
const incoming = [{ id: 'I1', listing_id: 'L2', status: 'PENDING', requested_date: '2099-02-02', window_start: '18:00', window_end: '20:00', requester_name: 'Buyer', requester_phone: 'y', message: null, created_at: '' }];

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/tourRequestsApi', () => ({
  useGetOutgoingToursQuery: () => ({ data: outgoing, isLoading: false, isError: false }),
  useGetIncomingToursQuery: () => ({ data: incoming, isLoading: false, isError: false }),
  useUpdateTourStatusMutation: () => [updateSpy, { isLoading: false }],
}));
vi.mock('next-intl', () => ({ useTranslations: (ns: string) => (k: string) => k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k }));

import Tours from './Tours';

describe('Tours', () => {
  it('рендерит входящую заявку и подтверждает её', () => {
    render(<Tours />);
    expect(screen.getByText('Buyer')).toBeInTheDocument();
    fireEvent.click(screen.getByText(ru.account.tours.confirm));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'I1', action: 'CONFIRM' });
  });

  it('покупатель может отменить свою заявку', () => {
    render(<Tours />);
    fireEvent.click(screen.getByText(ru.account.tours.cancel));
    expect(updateSpy).toHaveBeenCalledWith({ id: 'O1', action: 'CANCEL' });
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @avino/client test -- account/Tours`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `Tours.tsx`** (мирроринг ветвей `Favorites.tsx`: guest/loading/empty/data)

```tsx
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/slices/authSlice';
import {
  useGetOutgoingToursQuery, useGetIncomingToursQuery, useUpdateTourStatusMutation,
  type TourRequestItem, type TourAction,
} from '@/store/api/tourRequestsApi';

function StatusBadge({ status }: { status: TourRequestItem['status'] }) {
  const t = useTranslations('account');
  return <span className="rounded-badge bg-mint px-2 py-0.5 text-[11.5px] font-bold text-teal-deep">{t(`tours.status.${status}`)}</span>;
}

function Row({ item, actions }: { item: TourRequestItem; actions: { label: string; action: TourAction }[] }) {
  const t = useTranslations('account');
  const [update, { isLoading }] = useUpdateTourStatusMutation();
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold">{item.requester_name} · {item.requester_phone}</div>
        <div className="text-[13px] text-muted-foreground">
          {item.requested_date} {t('tours.on')} {item.window_start}–{item.window_end}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={item.status} />
        {actions.map((a) => (
          <button key={a.action} type="button" disabled={isLoading}
            onClick={() => { void update({ id: item.id, action: a.action }).unwrap().catch(() => {}); }}
            className="rounded-pill border border-border px-3 py-1.5 text-[13px] font-semibold hover:bg-bg">
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

  if (!isAuthenticated) return <p className="text-muted-foreground">{t('tours.guest')}</p>;

  const out = outgoing ?? [];
  const inc = incoming ?? [];
  if (out.length === 0 && inc.length === 0) return <p className="text-muted-foreground">{t('tours.empty')}</p>;

  return (
    <div className="flex flex-col gap-6">
      {inc.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.incoming')}</h2>
          {inc.map((it) => (
            <Row key={it.id} item={it}
              actions={it.status === 'PENDING'
                ? [{ label: t('tours.confirm'), action: 'CONFIRM' }, { label: t('tours.decline'), action: 'DECLINE' }]
                : []} />
          ))}
        </section>
      )}
      {out.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-base font-bold">{t('tours.outgoing')}</h2>
          {out.map((it) => (
            <Row key={it.id} item={it}
              actions={it.status === 'PENDING' || it.status === 'CONFIRMED'
                ? [{ label: t('tours.cancel'), action: 'CANCEL' }]
                : []} />
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Запустить — PASS**

Run: `pnpm --filter @avino/client test -- account/Tours`
Expected: PASS (2 кейса).

- [ ] **Step 5: Зарегистрировать вкладку**

В `app/[locale]/account/[tab]/page.tsx` — импорт `import Tours from '@/features/account/Tours';` и в `TAB_CONTENT`:
```ts
  tours: Tours,
```
В `features/account/AccountLayout.tsx` — импорт иконки `CalendarDays` из `lucide-react` и в `ACCOUNT_TABS` (рядом с другими):
```ts
  { key: 'tours', labelKey: 'tabs.tours', icon: CalendarDays },
```
> Проверь сигнатуру элементов `ACCOUNT_TABS`/как резолвится `labelKey` (`t('tabs.'+key)` vs `t(labelKey)`); используй существующую конвенцию (Explore: `{ key, labelKey, icon }`, label через namespace `account`).

- [ ] **Step 6: Прогон + типы**

Run: `pnpm --filter @avino/client test -- account/Tours` и `pnpm --filter @avino/client exec tsc --noEmit`
Expected: PASS; типы чисто.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/features/account/Tours.tsx apps/client/src/features/account/Tours.test.tsx apps/client/src/app/[locale]/account/[tab]/page.tsx apps/client/src/features/account/AccountLayout.tsx
git commit -m "feat(tours): My tours account tab (incoming/outgoing + actions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Финальный прогон + сборка

**Files:** —

- [ ] **Step 1: Весь клиентский тест-набор**

Run: `pnpm --filter @avino/client test`
Expected: 0 failed (включая новые TourRequestModal / ToursSection / Tours).
> Прим.: в репозитории есть предсуществующие падающие `LoginModal.test.tsx` (2 кейса, mock authApi без `useAppleLoginMutation` — НЕ наша фича; см. леджер profile-dropdown). Если падают только они — это не регрессия этого PR; зафиксируй в отчёте, не «чини» в этом PR.

- [ ] **Step 2: Типы + линт + прод-сборка**

Run: `pnpm --filter @avino/client exec tsc --noEmit && pnpm --filter @avino/client lint`
Затем прод-сборка (НЕ `rtk next build` — он врёт; raw):
Run: `pnpm --filter @avino/client exec next build`
Expected: tsc/lint чисто; build OK.

- [ ] **Step 3: Финальная проверка перед PR**

- [ ] `git diff --name-only origin/main...HEAD` — только `apps/client/**` (никаких api/web).
- [ ] Все три `messages/*.json` валидны и в паритете по ключам.
- [ ] PR по формату `docs/CLAUDE.md` §6 (A–G), base = `main`.

---

## Что НЕ входит / follow-up

- Live-verify в Docker: клиент в Docker — это собранный prod-образ (не HMR) → нужен ребилд контейнера `avino-client` после мёржа (см. memory `avino-stale-client-image-suggest-map`).
- Бейдж/счётчик новых заявок в шапке кабинета — позже.
- Клиентский рендер уведомлений `NEW_LEAD`/`TOUR_REQUEST_STATUS_CHANGED` (иконка+текст в ленте) — отдельно, через `notificationContent(type, data, t)` (см. memory `avino-notifications-empty-text-clientrender`); добавить i18n `notifications.types.NEW_LEAD`/`.TOUR_REQUEST_STATUS_CHANGED`.
- Календарь-пикер — пока нативный `<input type="date">` (в репо нет date-picker по дизайну).
- «Apply now» (аренда-анкета) — отдельная фича.
