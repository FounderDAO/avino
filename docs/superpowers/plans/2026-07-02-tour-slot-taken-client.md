# Tour Slot Taken (Client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В модалке заявки на тур занятые окна на выбранную дату дизейблятся с пометкой «занято»; ошибка `TOUR_SLOT_TAKEN` при submit обрабатывается понятно и рефетчит занятость.

**Architecture:** Новый RTK Query endpoint `getTakenSlots` (`GET /tour-requests/taken?listing_id=`) с тегом `TourTakenSlots`; занятость окна вычисляется чистым хелпером `takenWindowKeys` (unit-тесты vitest); `TourRequestModal` дизейблит занятые окна и авто-сдвигает выбор на свободное.

**Tech Stack:** Next.js, TypeScript, RTK Query, next-intl, vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-tour-slot-exclusivity-design.md` (секция B)

**Зависимость:** бэкенд-PR по плану `2026-07-02-tour-slot-exclusivity-api.md` (роут `taken` и код `TOUR_SLOT_TAKEN` должны существовать на API).

## Global Constraints

- Правки ТОЛЬКО внутри `apps/client/` (одна app-папка = один PR, CLAUDE.md).
- Все запросы через RTK Query (никакого fetch в компонентах).
- Комментарии — по-русски, в стиле существующих файлов.
- В `main` не коммитить: ветка `feat/tour-slot-taken-client`, потом PR.
- Команды выполняются из `apps/client/`, если не сказано иное.

**Первый шаг перед Task 1:**

```bash
git checkout -b feat/tour-slot-taken-client
```

---

### Task 1: Хелпер занятости окон `tour-slots.ts` (TDD)

**Files:**
- Create: `apps/client/src/features/detail/tour-slots.ts`
- Test: `apps/client/src/features/detail/tour-slots.test.ts`

**Interfaces:**
- Consumes: тип `TakenSlot` из Task 2 (`@/store/api/tourRequestsApi`). Чтобы Task 1 был самостоятельным, тип объявляется в Task 2, а здесь используется структурно-совместимый локальный импорт — поэтому **Task 1 выполняется ПОСЛЕ Task 2** (см. порядок ниже: сначала Task 2, потом Task 1; нумерация сохранена по слоям).
- Produces:
  - `windowKey(w: { start: string; end: string }): string` — ключ `"HH:MM-HH:MM"`.
  - `takenWindowKeys(slots: TakenSlot[] | undefined, date: string): Set<string>` — ключи окон, занятых на дату `YYYY-MM-DD`.

> **Порядок выполнения задач: Task 2 → Task 1 → Task 3 → Task 4.**

- [ ] **Step 1: Написать падающий тест**

Файл `apps/client/src/features/detail/tour-slots.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { takenWindowKeys, windowKey } from './tour-slots';

describe('windowKey', () => {
  it('строит ключ HH:MM-HH:MM', () => {
    expect(windowKey({ start: '11:00', end: '13:00' })).toBe('11:00-13:00');
  });
});

describe('takenWindowKeys', () => {
  const slots = [
    { requested_date: '2026-07-03', window_start: '11:00', window_end: '13:00' },
    { requested_date: '2026-07-03', window_start: '15:00', window_end: '17:00' },
    { requested_date: '2026-07-04', window_start: '11:00', window_end: '13:00' },
  ];

  it('возвращает только окна выбранной даты', () => {
    expect(takenWindowKeys(slots, '2026-07-03')).toEqual(
      new Set(['11:00-13:00', '15:00-17:00']),
    );
  });

  it('пустой Set без слотов, без даты или для свободной даты', () => {
    expect(takenWindowKeys(undefined, '2026-07-03').size).toBe(0);
    expect(takenWindowKeys(slots, '').size).toBe(0);
    expect(takenWindowKeys(slots, '2026-07-10').size).toBe(0);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `npx vitest run src/features/detail/tour-slots.test.ts`
Expected: FAIL — `Cannot find module './tour-slots'`.

- [ ] **Step 3: Реализация**

Файл `apps/client/src/features/detail/tour-slots.ts`:

```ts
/**
 * Занятость окон тура (spec 2026-07-02-tour-slot-exclusivity, секция B).
 * Чистые хелперы для TourRequestModal: слот = дата (YYYY-MM-DD) + окно (start-end).
 */
import type { TakenSlot } from '@/store/api/tourRequestsApi';

/** Ключ окна для сравнения «занято/свободно»: "HH:MM-HH:MM". */
export const windowKey = (w: { start: string; end: string }): string =>
  `${w.start}-${w.end}`;

/** Set ключей окон, занятых на выбранную дату. Нет данных/даты → пустой Set. */
export function takenWindowKeys(
  slots: TakenSlot[] | undefined,
  date: string,
): Set<string> {
  if (!slots || !date) return new Set();
  return new Set(
    slots
      .filter((s) => s.requested_date === date)
      .map((s) => windowKey({ start: s.window_start, end: s.window_end })),
  );
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `npx vitest run src/features/detail/tour-slots.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/detail/tour-slots.ts src/features/detail/tour-slots.test.ts
git commit -m "feat(tours): taken-window helpers for tour request modal"
```

---

### Task 2: RTK Query — `getTakenSlots` + инвалидация занятости

**Files:**
- Modify: `apps/client/src/store/api/baseApi.ts:16-27` (tagTypes)
- Modify: `apps/client/src/store/api/tourRequestsApi.ts`

**Interfaces:**
- Consumes: контракт API `GET /tour-requests/taken?listing_id=` → `{ data: [{ requested_date, window_start, window_end }] }` (бэкенд-план, Task 3).
- Produces:
  - `export interface TakenSlot { requested_date: string; window_start: string; window_end: string }`
  - `useGetTakenSlotsQuery(listingId: string)` → `TakenSlot[]`
  - Тег `TourTakenSlots` (инвалидируется создание заявки и смена статуса).

- [ ] **Step 1: Добавить тег в baseApi**

В `apps/client/src/store/api/baseApi.ts` в массив `tagTypes` после `'TourRequest',` добавить:

```ts
    'TourTakenSlots',
```

- [ ] **Step 2: Расширить tourRequestsApi**

В `apps/client/src/store/api/tourRequestsApi.ts`:

1. В шапке-комментарии файла добавить строку:

```
 *  - GET    /tour-requests/taken        — занятые слоты листинга (для модалки).
```

2. После `interface TourListEnvelope { ... }` добавить:

```ts
/** Занятый слот тура (GET /tour-requests/taken): анонимно, только дата и окно. */
export interface TakenSlot {
  requested_date: string; // YYYY-MM-DD
  window_start: string;
  window_end: string;
}

interface TakenSlotsEnvelope {
  data: TakenSlot[];
}
```

3. Endpoint `createTourRequest` — заменить `invalidatesTags: [OUTGOING_TAG],` на:

```ts
      invalidatesTags: (result, error, body) => [
        OUTGOING_TAG,
        { type: 'TourTakenSlots' as const, id: body.listing_id },
      ],
```

4. Endpoint `updateTourStatus` — заменить `invalidatesTags: [OUTGOING_TAG, INCOMING_TAG],` на (DECLINE/CANCEL освобождают слот — занятость надо перечитать):

```ts
      invalidatesTags: (result) => [
        OUTGOING_TAG,
        INCOMING_TAG,
        ...(result
          ? [{ type: 'TourTakenSlots' as const, id: result.listing_id }]
          : []),
      ],
```

5. После `updateTourStatus` добавить endpoint:

```ts
    getTakenSlots: build.query<TakenSlot[], string>({
      query: (listingId) => `/tour-requests/taken?listing_id=${listingId}`,
      transformResponse: (env: TakenSlotsEnvelope) => env.data,
      providesTags: (result, error, listingId) => [
        { type: 'TourTakenSlots' as const, id: listingId },
      ],
    }),
```

6. В экспорт хуков добавить `useGetTakenSlotsQuery`:

```ts
export const {
  useCreateTourRequestMutation,
  useGetOutgoingToursQuery,
  useGetIncomingToursQuery,
  useUpdateTourStatusMutation,
  useGetTakenSlotsQuery,
} = tourRequestsApi;
```

- [ ] **Step 3: Проверка типов**

Run: `npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/store/api/baseApi.ts src/store/api/tourRequestsApi.ts
git commit -m "feat(tours): getTakenSlots query + TourTakenSlots tag"
```

---

### Task 3: TourRequestModal — дизейбл занятых окон + обработка `TOUR_SLOT_TAKEN`

**Files:**
- Modify: `apps/client/src/features/detail/TourRequestModal.tsx`
- Modify: `apps/client/messages/ru.json:379-396`, `apps/client/messages/uz.json:379-396`, `apps/client/messages/en.json:379-396` (секция `tourRequest`)

**Interfaces:**
- Consumes: `useGetTakenSlotsQuery` (Task 2), `takenWindowKeys`/`windowKey` (Task 1), `getApiError` (существующий `@/store/api/apiError`).
- Produces: UI-поведение по утверждённому моку — занятое окно: `( ) 11:00–13:00  ⛔ занято`.

- [ ] **Step 1: i18n-ключи**

В секцию `"tourRequest"` каждого файла сообщений добавить после `"dateRequired"` два ключа:

`apps/client/messages/ru.json`:

```json
    "slotTaken": "занято",
    "slotTakenError": "Это время уже занято другим пользователем. Выберите другое.",
```

`apps/client/messages/uz.json`:

```json
    "slotTaken": "band",
    "slotTakenError": "Bu vaqt allaqachon band. Boshqa vaqtni tanlang.",
```

`apps/client/messages/en.json`:

```json
    "slotTaken": "taken",
    "slotTakenError": "This time slot is already taken. Please choose another.",
```

- [ ] **Step 2: Правки TourRequestModal.tsx**

1. Импорты — добавить:

```ts
import { cn } from '@/lib/utils';
import { useCreateTourRequestMutation, useGetTakenSlotsQuery } from '@/store/api/tourRequestsApi';
import { takenWindowKeys, windowKey } from './tour-slots';
```

(строку с существующим импортом `useCreateTourRequestMutation` заменить на расширенную.)

2. В теле компонента после `const windows = React.useMemo(...)` добавить:

```ts
  // Занятые слоты листинга (модалка открывается только авторизованным —
  // ContactCard шлёт гостя в логин, поэтому Bearer-запрос безопасен).
  const { data: takenSlots, refetch: refetchTaken } = useGetTakenSlotsQuery(
    listing.id,
    { skip: !open },
  );
  const takenForDate = React.useMemo(
    () => takenWindowKeys(takenSlots, date),
    [takenSlots, date],
  );

  // Если выбранное окно занято на выбранную дату — сдвигаем на первое свободное
  // (findIndex → -1, когда всё занято: submit упрётся в windowRequired).
  React.useEffect(() => {
    const w = windows[windowIdx];
    if (w && takenForDate.has(windowKey(w))) {
      setWindowIdx(windows.findIndex((x) => !takenForDate.has(windowKey(x))));
    }
  }, [takenForDate, windows, windowIdx]);
```

(`date`, `windowIdx` уже объявлены выше в компоненте.)

3. В `submit` заменить блок `catch`:

```ts
    } catch (err) {
      const apiErr = getApiError(err as Parameters<typeof getApiError>[0]);
      if (apiErr?.code === 'TOUR_SLOT_TAKEN') {
        // Слот заняли, пока заполняли форму: понятный текст + свежая занятость.
        setError(t('slotTakenError'));
        void refetchTaken();
        return;
      }
      setError(apiErr?.message ?? t('error'));
    }
```

и добавить `refetchTaken` в зависимости `useCallback` у `submit` (в конец массива).

4. Рендер радио-окон — заменить `{windows.map((w, i) => ( ... ))}` внутри `<fieldset>` на:

```tsx
                {windows.map((w, i) => {
                  const taken = takenForDate.has(windowKey(w));
                  return (
                    <label
                      key={`${w.start}-${w.end}`}
                      className={cn(
                        'flex items-center gap-2 font-normal',
                        taken && 'text-muted-foreground',
                      )}
                    >
                      <input
                        type="radio"
                        name="tour-window"
                        checked={windowIdx === i}
                        disabled={taken}
                        onChange={() => setWindowIdx(i)}
                      />
                      {w.start}–{w.end}
                      {taken && (
                        <span className="text-[12px]">⛔ {t('slotTaken')}</span>
                      )}
                    </label>
                  );
                })}
```

- [ ] **Step 3: Проверка типов и тестов**

Run: `npx tsc --noEmit && npx vitest run`
Expected: без ошибок, все тесты PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/detail/TourRequestModal.tsx messages/ru.json messages/uz.json messages/en.json
git commit -m "feat(tours): disable taken windows in tour request modal"
```

---

### Task 4: Полная проверка + PR

- [ ] **Step 1: Линт, типы, тесты, сборка**

Run: `pnpm lint && npx tsc --noEmit && pnpm test && pnpm build`
Expected: всё зелёное.

- [ ] **Step 2: Ручная проверка (если поднят локальный API с бэкенд-PR)**

- Открыть листинг с турами, авторизоваться, открыть модалку: выбрать дату с чужой активной заявкой → окно задизейблено с «⛔ занято»; авто-выбор уехал на свободное окно.
- Отправить заявку на свободный слот → успех; повторно открыть модалку → слот показан занятым.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/tour-slot-taken-client
```

PR title: `feat(tours): show and disable taken tour slots in request modal`

PR description:
- Модалка заявки на тур показывает занятые окна на выбранную дату («⛔ занято», radio disabled) через новый `GET /tour-requests/taken`.
- Ошибка `409 TOUR_SLOT_TAKEN` (слот заняли параллельно) — понятный текст + рефетч занятости.
- Как проверить: см. ручную проверку в плане; unit-тесты `tour-slots.test.ts`.
- Зависимость: API-PR `feat(tour-requests): exclusive tour slots + taken-slots endpoint`.

---

## Self-Review (выполнено при написании плана)

- Spec coverage (секция B): B.1 query+теги → Task 2; B.2 модалка (fetch при open, дизейбл, авто-сдвиг, обработка 409, i18n) → Task 1+3. Пробелов нет.
- Placeholders: нет.
- Типы: `TakenSlot` объявлен в Task 2, импортируется хелпером Task 1 (порядок выполнения 2→1→3→4 указан); ключи i18n `slotTaken`/`slotTakenError` совпадают между Step 1 и Step 2 Task 3; строка кода ошибки `'TOUR_SLOT_TAKEN'` совпадает с API-планом.
