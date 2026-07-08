# Именованные сохранённые фильтры: точное восстановление + EDIT/DELETE — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю сохранять несколько именованных поисков через модалку, открывать их с точным восстановлением состояния (включая нарисованный полигон, мультитип, сортировку, валюту) и переименовывать/удалять их в списке аккаунта.

**Architecture:** Backend уже полностью готов (`SavedSearch` c `name` + `filters_json`, CRUD-маршруты). Вся работа — в `apps/client`. Восстановление идёт через URL: сохранённые фильтры мапятся в query-параметры `/search`, полигон едет как `?points=` и сидит локальный стейт `SearchResults`, валюта — как `?currency=` и диспатчится в Redux. Модалка именования — переиспользуемый Radix Dialog для create (в FilterBar) и rename (в списке аккаунта).

**Tech Stack:** Next.js 15 (App Router, RSC), React 19, RTK Query, radix-ui Dialog, next-intl, sonner (toasts), Vitest + React Testing Library.

## Global Constraints

- Только `apps/client`. Backend/Prisma/миграции НЕ трогаем. `is_active` (колокольчик-алерт) без изменений. Частоту алертов НЕ добавляем.
- Все bash-команды через `rtk` (см. `~/.claude/RTK.md`).
- i18n: любые новые user-facing строки — в `messages/ru.json`, `messages/uz.json`, `messages/en.json` (все три). Гоча: мокнутый next-intl в тестах прячет пропущенные ключи → проверять руками. Для `uz` — не допускать кириллических двойников.
- Формат денег — en-US (`format.ts`), даты — ru-RU (не затрагивается здесь).
- Субагент НЕ трогает git (контроллер владеет всеми git-операциями). Абсолютные пути в командах.
- Ветка: `feat/saved-search-named-restore-edit` (уже создана, spec закоммичен).
- Полное имя пакета для тестов: `@avino/client`. Запуск: `rtk vitest run <path>` из `apps/client`.

---

### Task 1: `deserializePolygonRing` в `lib/geo.ts`

Обратный к `serializePolygonRing`: парсит строку `points` (`lat,lng;lat,lng;…`) обратно в вершины `LatLng[]` для восстановления нарисованной территории. Симметрично сериализатору: ≥3 валидных вершины WGS84, иначе `null`.

**Files:**
- Modify: `apps/client/src/lib/geo.ts` (добавить экспорт после `serializePolygonRing`, ~строка 178)
- Test: `apps/client/src/lib/geo.test.ts` (добавить describe-блок)

**Interfaces:**
- Consumes: `type LatLng` (`[number, number]`), `serializePolygonRing` (уже в geo.ts).
- Produces: `deserializePolygonRing(raw: string | null | undefined): LatLng[] | null`

- [ ] **Step 1: Написать падающий тест**

В конец `apps/client/src/lib/geo.test.ts` добавить (импорт `deserializePolygonRing` в существующую строку импорта из `./geo`):

```ts
describe('deserializePolygonRing', () => {
  it('round-trips a serialized ring', () => {
    const ring: LatLng[] = [
      [41.3, 69.27],
      [41.3, 69.29],
      [41.32, 69.29],
    ];
    const serialized = serializePolygonRing(ring)!;
    expect(deserializePolygonRing(serialized)).toEqual(ring);
  });

  it('returns null for empty/nullish input', () => {
    expect(deserializePolygonRing(null)).toBeNull();
    expect(deserializePolygonRing(undefined)).toBeNull();
    expect(deserializePolygonRing('')).toBeNull();
  });

  it('returns null for fewer than 3 vertices', () => {
    expect(deserializePolygonRing('41.3,69.27;41.31,69.28')).toBeNull();
  });

  it('returns null when any coord is non-finite or out of WGS84 range', () => {
    expect(deserializePolygonRing('41.3,69.27;x,69.29;41.32,69.29')).toBeNull();
    expect(deserializePolygonRing('91,69.27;41.3,69.29;41.32,69.29')).toBeNull();
    expect(deserializePolygonRing('41.3,200;41.3,69.29;41.32,69.29')).toBeNull();
  });

  it('returns null for malformed pairs (not exactly lat,lng)', () => {
    expect(deserializePolygonRing('41.3;41.3,69.29;41.32,69.29')).toBeNull();
    expect(deserializePolygonRing('41.3,69.27,5;41.3,69.29;41.32,69.29')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk vitest run src/lib/geo.test.ts`
Expected: FAIL — `deserializePolygonRing is not a function` / import undefined.

- [ ] **Step 3: Реализовать**

В `apps/client/src/lib/geo.ts` сразу после `serializePolygonRing` (после строки 178) добавить:

```ts
/**
 * Обратный к {@link serializePolygonRing}: строка `lat,lng;lat,lng;…` →
 * массив вершин `[lat, lng]`. Возвращает `null`, если вершин < 3 или любая
 * пара невалидна/вне WGS84 (симметрично сериализатору — вызывающий тогда
 * не восстанавливает территорию и остаётся на скалярной выдаче).
 */
export function deserializePolygonRing(
  raw: string | null | undefined,
): LatLng[] | null {
  if (!raw) return null;
  const out: LatLng[] = [];
  for (const pair of raw.split(';')) {
    const parts = pair.split(',');
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    out.push([lat, lng]);
  }
  return out.length >= 3 ? out : null;
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk vitest run src/lib/geo.test.ts`
Expected: PASS (все кейсы, включая существующие).

- [ ] **Step 5: Коммит**

```bash
git add apps/client/src/lib/geo.ts apps/client/src/lib/geo.test.ts
git commit -m "feat(client): deserializePolygonRing для восстановления территории"
```

---

### Task 2: Round-trip восстановления в `filtersToSearchHref`

Расширить маппинг сохранённых фильтров обратно в URL `/search`: добавить `sort`, `currency`, `points` (нарисованный полигон) и починить мультивыбор типа недвижимости (сейчас эмитится только один `type`).

**Files:**
- Modify: `apps/client/src/lib/savedSearch.ts:132-178` (функция `filtersToSearchHref`)
- Test: `apps/client/src/lib/savedSearch.test.ts`

**Interfaces:**
- Consumes: `SavedSearchFilters` (`Record<string, unknown>`), `isPropertyType` (уже в файле), `PROPERTY_TYPES`.
- Produces: `filtersToSearchHref(filters): string` — тот же контракт, но URL теперь содержит `sort`, `currency`, `points` и повторяемый `type` для мультивыбора.

- [ ] **Step 1: Написать падающие тесты**

Дописать в `apps/client/src/lib/savedSearch.test.ts` (проверить, что импортирован `filtersToSearchHref`):

```ts
describe('filtersToSearchHref — точное восстановление', () => {
  it('эмитит sort и currency', () => {
    const href = filtersToSearchHref({ sort: 'price_asc', currency: 'USD', price_max: '50000' });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('sort')).toBe('price_asc');
    expect(qs.get('currency')).toBe('USD');
  });

  it('эмитит points (нарисованную территорию)', () => {
    const href = filtersToSearchHref({ points: '41.3,69.27;41.3,69.29;41.32,69.29' });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('points')).toBe('41.3,69.27;41.3,69.29;41.32,69.29');
  });

  it('повторяет type для мультивыбора property_types[]', () => {
    const href = filtersToSearchHref({ property_types: ['APARTMENT', 'HOUSE'] });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.getAll('type')).toEqual(['APARTMENT', 'HOUSE']);
  });

  it('фолбэк на одиночный property_type, если массива нет', () => {
    const href = filtersToSearchHref({ property_type: 'APARTMENT' });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.getAll('type')).toEqual(['APARTMENT']);
  });
});
```

> Примечание: значения `PropertyType` (`'APARTMENT'`, `'HOUSE'`) должны присутствовать в `PROPERTY_TYPES` (`src/lib/mock/types.ts`). Если имена в enum иные — подставить реальные значения из `PROPERTY_TYPES` перед запуском.

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk vitest run src/lib/savedSearch.test.ts`
Expected: FAIL — `sort`/`currency`/`points` = null; `getAll('type')` для мультивыбора пуст.

- [ ] **Step 3: Реализовать**

В `apps/client/src/lib/savedSearch.ts`, функция `filtersToSearchHref`:

1. Заменить строку 139 `set('type', asString(filters.property_type));` на блок мультивыбора:

```ts
  // Мультивыбор типа: повторяем ?type= для каждого, иначе фолбэк на одиночный.
  const propertyTypes = Array.isArray(filters.property_types)
    ? (filters.property_types as unknown[]).filter(isPropertyType)
    : [];
  if (propertyTypes.length > 0) {
    for (const pt of propertyTypes) params.append('type', pt);
  } else {
    set('type', asString(filters.property_type));
  }
```

2. Добавить `sort` и `currency` рядом с остальными `set(...)` (например, после строки 172 `set('query', ...)`):

```ts
  set('sort', asString(filters.sort));
  set('currency', asString(filters.currency));
```

3. Заменить намеренный skip `points` (строки 174-175) на реальное восстановление:

```ts
  // `points` (нарисованная территория) восстанавливаем в URL: SearchResults
  // сидит из него локальный полигон и перезапускает polygon-поиск.
  set('points', asString(filters.points));
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk vitest run src/lib/savedSearch.test.ts`
Expected: PASS (новые + существующие кейсы).

- [ ] **Step 5: Коммит**

```bash
git add apps/client/src/lib/savedSearch.ts apps/client/src/lib/savedSearch.test.ts
git commit -m "feat(client): точное восстановление saved-search (sort, currency, points, мультитип)"
```

---

### Task 3: Переиспользуемая модалка `SaveSearchModal`

Radix Dialog с одним полем «Название поиска» (префилл), кнопкой сохранения и режимами `create`/`rename`. «Тупой» компонент: логику create/update и toast делает родитель. i18n — собственный namespace `saveSearchModal`.

**Files:**
- Create: `apps/client/src/features/search/SaveSearchModal.tsx`
- Modify: `apps/client/src/messages/ru.json`, `apps/client/src/messages/uz.json`, `apps/client/src/messages/en.json` (namespace `saveSearchModal`)
- Test: `apps/client/src/features/search/SaveSearchModal.test.tsx`

**Interfaces:**
- Produces:
```ts
export interface SaveSearchModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  initialName: string;
  onSubmit: (name: string) => Promise<void> | void;
  onClose: () => void;
  isSubmitting?: boolean;
}
export function SaveSearchModal(props: SaveSearchModalProps): JSX.Element;
```

- [ ] **Step 1: Добавить i18n-ключи (все три локали)**

В каждый из `apps/client/src/messages/{ru,uz,en}.json` добавить объект верхнего уровня `saveSearchModal`.

`ru.json`:
```json
"saveSearchModal": {
  "titleCreate": "Сохранить поиск",
  "titleRename": "Переименовать поиск",
  "nameLabel": "Название поиска",
  "namePlaceholder": "Например: 2-комн. до 500 000 000",
  "submitCreate": "Сохранить",
  "submitRename": "Сохранить",
  "cancel": "Отмена",
  "close": "Закрыть"
}
```

`uz.json`:
```json
"saveSearchModal": {
  "titleCreate": "Qidiruvni saqlash",
  "titleRename": "Qidiruvni qayta nomlash",
  "nameLabel": "Qidiruv nomi",
  "namePlaceholder": "Masalan: 2 xonali, 500 000 000 gacha",
  "submitCreate": "Saqlash",
  "submitRename": "Saqlash",
  "cancel": "Bekor qilish",
  "close": "Yopish"
}
```

`en.json`:
```json
"saveSearchModal": {
  "titleCreate": "Save search",
  "titleRename": "Rename search",
  "nameLabel": "Name your search",
  "namePlaceholder": "e.g. 2-room under 500,000,000",
  "submitCreate": "Save",
  "submitRename": "Save",
  "cancel": "Cancel",
  "close": "Close"
}
```

- [ ] **Step 2: Написать падающий тест**

`apps/client/src/features/search/SaveSearchModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SaveSearchModal } from './SaveSearchModal';

const messages = {
  saveSearchModal: {
    titleCreate: 'Save search',
    titleRename: 'Rename search',
    nameLabel: 'Name your search',
    namePlaceholder: 'e.g. ...',
    submitCreate: 'Save',
    submitRename: 'Save',
    cancel: 'Cancel',
    close: 'Close',
  },
};

function renderModal(props: Partial<React.ComponentProps<typeof SaveSearchModal>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SaveSearchModal
        open
        mode="create"
        initialName="My search"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('SaveSearchModal', () => {
  it('префилл именем и submit передаёт (возможно отредактированное) имя', async () => {
    const onSubmit = vi.fn();
    renderModal({ onSubmit });
    const input = screen.getByLabelText('Name your search') as HTMLInputElement;
    expect(input.value).toBe('My search');
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Renamed'));
  });

  it('пустое имя блокирует submit', () => {
    const onSubmit = vi.fn();
    renderModal({ initialName: '', onSubmit });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk vitest run src/features/search/SaveSearchModal.test.tsx`
Expected: FAIL — модуль `./SaveSearchModal` не существует.

- [ ] **Step 4: Реализовать компонент**

`apps/client/src/features/search/SaveSearchModal.tsx` (паттерн Radix взят из `LoginModal.tsx`; портал в body — правило `.fade-up`+`position:fixed`):

```tsx
/**
 * SaveSearchModal — модалка именования сохранённого поиска (Zillow-style).
 * Переиспользуется для создания (FilterBar) и переименования (SavedSearches).
 * «Тупой» компонент: create/update-мутацию и toast выполняет родитель через onSubmit.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

export interface SaveSearchModalProps {
  open: boolean;
  mode: 'create' | 'rename';
  initialName: string;
  onSubmit: (name: string) => Promise<void> | void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function SaveSearchModal({
  open,
  mode,
  initialName,
  onSubmit,
  onClose,
  isSubmitting = false,
}: SaveSearchModalProps) {
  const t = useTranslations('saveSearchModal');
  const [name, setName] = React.useState(initialName);

  // Ресинк префилла при повторном открытии/смене элемента.
  React.useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const submit = () => {
    if (!canSubmit) return;
    void onSubmit(trimmed);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content className="fade-up fixed left-1/2 top-1/2 z-[81] w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-8 shadow-raised">
          <Dialog.Close
            aria-label={t('close')}
            className="absolute right-4 top-4 p-1 text-muted-foreground hover:text-ink"
          >
            <X size={22} />
          </Dialog.Close>

          <Dialog.Title className="text-[24px]">
            {mode === 'create' ? t('titleCreate') : t('titleRename')}
          </Dialog.Title>

          <label htmlFor="save-search-name" className="mt-5 block text-[13px] font-bold text-ink">
            {t('nameLabel')}
          </label>
          <Field
            id="save-search-name"
            className="mt-2"
            maxLength={150}
            placeholder={t('namePlaceholder')}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />

          <Button size="lg" className="mt-5 w-full" disabled={!canSubmit} onClick={submit}>
            {mode === 'create' ? t('submitCreate') : t('submitRename')}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

> Проверить в `field.tsx`, что `Field` пробрасывает `id`/`htmlFor` (это обычный `<input>` через forwardRef с `...props`, поэтому `id` пройдёт). `getByLabelText` в тесте требует связки `htmlFor`↔`id`.

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk vitest run src/features/search/SaveSearchModal.test.tsx`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add apps/client/src/features/search/SaveSearchModal.tsx apps/client/src/features/search/SaveSearchModal.test.tsx apps/client/src/messages/ru.json apps/client/src/messages/uz.json apps/client/src/messages/en.json
git commit -m "feat(client): переиспользуемая SaveSearchModal + i18n"
```

---

### Task 4: Подключить модалку в FilterBar + сохранять sort/currency

Заменить мгновенный авто-сейв на открытие `SaveSearchModal`; `buildFilters` дополнительно сериализует `sort` (если не дефолт) и `currency` (когда задана цена — чтобы `price_min/max` интерпретировались правильно). Гость по-прежнему сначала логинится, затем открывается модалка.

**Files:**
- Modify: `apps/client/src/features/search/FilterBar.tsx` (импорты; `buildFilters` ~351-388; save-флоу ~344-421; кнопка ~631-653; рендер модалок ~677-682)
- Modify: `apps/client/src/messages/{ru,uz,en}.json` (toast-ключ `savedSearchSaved` в namespace `toasts`)

**Interfaces:**
- Consumes: `SaveSearchModal` (Task 3), `useCreateSavedSearchMutation`, `useCurrencyPreference`, `describeFilters`, `buildFilters` (локальная).
- Produces: (никаких для других задач).

- [ ] **Step 1: Добавить toast-ключ `savedSearchSaved`**

В каждый `apps/client/src/messages/{ru,uz,en}.json` в существующий объект `toasts` добавить:
- ru: `"savedSearchSaved": "Поиск сохранён"`
- uz: `"savedSearchSaved": "Qidiruv saqlandi"`
- en: `"savedSearchSaved": "Search saved"`

- [ ] **Step 2: Обновить импорты FilterBar**

В `apps/client/src/features/search/FilterBar.tsx`:
- Добавить: `import { toast } from 'sonner';`
- Добавить: `import { SaveSearchModal } from './SaveSearchModal';`
- Убедиться, что уже импортированы `useCreateSavedSearchMutation` (стр. 30), `useCurrencyPreference` (стр. 35), `describeFilters` (стр. 31), `selectTerritoryPoints` (стр. 29).
- После правки удалить ставший неиспользуемым импорт `getApiError` (стр. 33), если `saveApiError` больше нигде не используется (см. Step 5).

- [ ] **Step 3: Расширить `buildFilters` (сохранение sort + currency)**

В `buildFilters` (внутри `React.useCallback`, ~351-388) добавить объявление валюты и две сериализации. Добавить рядом с `const territoryPoints = ...` (стр. 346):

```tsx
  const displayCurrency = useCurrencyPreference();
```

Внутри `buildFilters`, перед `return filters;` (после строки 386 `if (values.amenities ...)`):

```tsx
    // Сортировка — только если пользователь отошёл от дефолта 'promotion'.
    if (values.sort && values.sort !== 'promotion') filters.sort = values.sort;
    // Валюта — только когда задана цена (иначе price_min/max нечем интерпретировать).
    if (values.priceMin || values.priceMax) filters.currency = displayCurrency;
```

И добавить `displayCurrency` в массив зависимостей `useCallback` (сейчас `[values, territoryPoints]` → `[values, territoryPoints, displayCurrency]`).

- [ ] **Step 4: Заменить save-флоу на открытие модалки**

Заменить блок `doSave`/`handleSaveSearch`/эффект (строки ~394-419) на:

```tsx
  const [saveModalOpen, setSaveModalOpen] = React.useState(false);
  const [createSavedSearch] = useCreateSavedSearchMutation();

  // «Сохранить поиск»: гость → вход (LoginModal) + отложенное открытие модалки;
  // авторизован → сразу модалка именования.
  const handleSaveSearch = React.useCallback(() => {
    if (!isAuthenticated) {
      setPendingSave(true);
      setLoginOpen(true);
      return;
    }
    setSaveModalOpen(true);
  }, [isAuthenticated]);

  // После входа гостя — открыть модалку именования.
  React.useEffect(() => {
    if (isAuthenticated && pendingSave) {
      setPendingSave(false);
      setSaveModalOpen(true);
    }
  }, [isAuthenticated, pendingSave]);

  // Создание из модалки. Ошибку тостит apiErrorToastMiddleware (эндпоинт не
  // в suppress-list) → при ошибке модалку не закрываем, catch глушим.
  const handleCreateSubmit = React.useCallback(
    async (name: string) => {
      try {
        await createSavedSearch({ name, filters: buildFilters() }).unwrap();
        toast.success(tToasts('savedSearchSaved'));
        setSaveModalOpen(false);
      } catch {
        /* ошибка показана тост-middleware */
      }
    },
    [createSavedSearch, buildFilters, tToasts],
  );
```

Требуется `tToasts` — добавить рядом с другими translator-хуками в теле компонента (искать `useTranslations`): `const tToasts = useTranslations('toasts');`.

Удалить прежние объявления, которые больше не нужны: старый `const [createSavedSearch, { isLoading: isSaving, isSuccess: isSaved, error: saveError }] = useCreateSavedSearchMutation();` (стр. 347-348) — заменён на `const [createSavedSearch] = useCreateSavedSearchMutation();` выше. Удалить `const saveApiError = getApiError(saveError);` (стр. 421).

- [ ] **Step 5: Упростить кнопку «Сохранить поиск» и отрендерить модалку**

Заменить кнопку (строки 631-653) на статичную (состояния saving/saved теперь в модалке/тосте):

```tsx
          <button
            type="button"
            onClick={handleSaveSearch}
            className="inline-flex flex-shrink-0 items-center gap-2 rounded-pill border-[1.5px] border-border bg-surface px-4 py-[9px] text-sm font-bold text-teal transition-colors hover:border-teal"
          >
            <Bell size={16} strokeWidth={1.9} />
            {tSearch('filters.saveSearch')}
          </button>
```

После `<LoginModal ... />` (строка 682) добавить модалку именования:

```tsx
      {/* Именование при сохранении поиска. */}
      <SaveSearchModal
        open={saveModalOpen}
        mode="create"
        initialName={describeFilters(buildFilters(), t) || tSearch('filters.mySearch')}
        onSubmit={handleCreateSubmit}
        onClose={() => setSaveModalOpen(false)}
      />
```

> `t` — корневой translator (уже есть в компоненте: `const t = useTranslations();` рядом с `tSearch`; если корневого нет — добавить). `tSearch('filters.mySearch')` уже используется в текущем коде как фолбэк-имя.

- [ ] **Step 6: Lint + build**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk lint src/features/search/FilterBar.tsx && rtk vitest run src/features/search/SaveSearchModal.test.tsx`
Expected: без ошибок; тест модалки всё ещё зелёный.
> Client-eslint не всегда ловит unused imports (гоча из памяти) → глазами проверить, что `getApiError`, `isSaving`, `isSaved`, `saveError`, `saveApiError` больше не упоминаются.

- [ ] **Step 7: Живой прогон (Chrome)**

Поднять клиент (рецепт: API :4000, client :3001; см. память `avino-client-screenshot-recipe`/`avino-local-live-verify-recipe`). На `/search`: залогиниться → задать фильтры (цена + комнаты) → «Сохранить поиск» → появляется модалка с префилл-именем → отредактировать имя → «Сохранить» → toast «Поиск сохранён», модалка закрылась. В `/account/saved` — новая запись с этим именем.

- [ ] **Step 8: Коммит**

```bash
git add apps/client/src/features/search/FilterBar.tsx apps/client/src/messages/ru.json apps/client/src/messages/uz.json apps/client/src/messages/en.json
git commit -m "feat(client): модалка именования при сохранении поиска + сохранение sort/currency"
```

---

### Task 5: Восстановление полигона и валюты в выдаче

Серверная страница парсит `?points=` в `initialPolygon` и передаёт в `SearchResults`; `SearchResults` сидит локальный полигон (перезапускает polygon-поиск + рисует оверлей на карте) и применяет `?currency=` к display-префе.

**Files:**
- Modify: `apps/client/src/app/[locale]/search/page.tsx` (парсинг `points` ~после 176; проп в `<SearchResults>` ~331-339)
- Modify: `apps/client/src/features/search/SearchResults.tsx` (проп `initialPolygon`; sync-эффект полигона; эффект валюты)

**Interfaces:**
- Consumes: `deserializePolygonRing` (Task 1), `serializePolygonRing` (уже импортирован в SearchResults), `useSetCurrency`/`useCurrencyPreference`, `useSearchParams`.
- Produces: `SearchResultsProps.initialPolygon?: LatLng[]`.

- [ ] **Step 1: Добавить проп `initialPolygon` в SearchResults**

В `apps/client/src/features/search/SearchResults.tsx`:
- В `SearchResultsProps` (интерфейс ~54-71) добавить:
```ts
  /** Восстановленная из ?points= нарисованная территория (saved-search open). */
  initialPolygon?: LatLng[] | null;
```
- В деструктуризацию пропсов (`export function SearchResults({ ... })`) добавить `initialPolygon = null,`.

- [ ] **Step 2: Sync-эффект полигона + эффект валюты**

Импорты в начало `SearchResults.tsx`:
```ts
import { useSearchParams } from 'next/navigation';
import { useSetCurrency, useCurrencyPreference } from '@/lib/useCurrencyPreference';
import { deserializePolygonRing } from '@/lib/geo'; // если ещё не импортирован рядом с serializePolygonRing
```
> `useCurrencyPreference` уже используется в файле (`displayCurrency`) — не дублировать импорт, только добавить `useSetCurrency`. `serializePolygonRing` уже импортирован (стр. 27) — добавить в тот же импорт `deserializePolygonRing`.

Рядом с объявлением `const [polygon, setPolygon] = React.useState<LatLng[] | null>(null);` (стр. 98) добавить sync-эффект (после того как `dispatch` объявлен, ~стр. 132):

```ts
  // Восстановление нарисованной территории из saved-search: сидим локальный
  // полигон из initialPolygon. Ключ — сериализованное кольцо (стабильная строка),
  // чтобы эффект не зациклился на новой ссылке массива и не перетёр ручную обводку.
  const initialPolyKey = initialPolygon ? serializePolygonRing(initialPolygon) : null;
  React.useEffect(() => {
    setPolygon(initialPolyKey ? deserializePolygonRing(initialPolyKey) : null);
    setDrawing(false);
    // Сид/ресид только при появлении/смене восстановленной территории.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPolyKey]);
```

Эффект восстановления валюты (после объявления `displayCurrency` / рядом с currency-логикой):

```ts
  const searchParams = useSearchParams();
  const setCurrencyPref = useSetCurrency();
  const currencyParam = searchParams.get('currency');
  React.useEffect(() => {
    if (currencyParam === 'UZS' || currencyParam === 'USD') {
      setCurrencyPref(currencyParam);
    }
  }, [currencyParam, setCurrencyPref]);
```

> `setDrawing` уже есть в компоненте (стр. 97). `displayCurrency` (стр. 91) читает Redux и после `setCurrencyPref` пересоберёт `filterWithCurrency` → выдача перезапросится в нужной валюте (как при ручном тоггле).

- [ ] **Step 3: Парсинг `points` и проп на странице**

В `apps/client/src/app/[locale]/search/page.tsx`:
- Импорт: добавить `deserializePolygonRing` к существующему импорту из `@/lib/geo` (там уже берётся `parseBoundsParams`), и тип `LatLng` из `@/lib/geo`, если понадобится (проп типизируется в SearchResults — тип на странице не обязателен).
- После парсинга `types`/bounds (например, после строки 264 где считается `initialBounds`) добавить:
```ts
  const initialPolygon = deserializePolygonRing(first(sp.points)) ?? undefined;
```
- В JSX `<SearchResults ... />` (строки 331-339) добавить проп:
```tsx
        initialPolygon={initialPolygon}
```

- [ ] **Step 4: Юнит-тесты компонентов не нужны — проверка типов + сборка**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk vitest run src/lib && rtk lint src/features/search/SearchResults.tsx 'src/app/[locale]/search/page.tsx'`
Expected: тесты `lib` зелёные; lint без ошибок.
> Полноценная проверка — живым прогоном (Step 5); polygon-поиск и карта клиентские, юнитом не покрываются.

- [ ] **Step 5: Живой прогон (Chrome)**

На `/search`: нарисовать территорию (лассо) + задать сортировку «Сначала дешёвые» + валюту (тоггл) + мультивыбор типа → «Сохранить поиск» → сохранить с именем. Затем `/account/saved` → открыть эту запись (клик по строке) → на `/search`:
- на карте отрисован тот же полигон, выдача — по территории;
- сортировка = «Сначала дешёвые»; валюта = сохранённая; выбраны те же типы (чипы `ActiveFilters`).
Подтвердить, что есть аффорданс сброса территории (существующий контрол очистки полигона в `SearchResults`/`MapView`).

- [ ] **Step 6: Коммит**

```bash
git add 'apps/client/src/app/[locale]/search/page.tsx' apps/client/src/features/search/SearchResults.tsx
git commit -m "feat(client): восстановление полигона территории и валюты из saved-search"
```

---

### Task 6: EDIT (переименование) в списке сохранённых поисков

Добавить кнопку-карандаш в строку списка аккаунта → открывает `SaveSearchModal` в режиме `rename` → `updateSavedSearch({ id, name })` → toast. DELETE уже существует.

**Files:**
- Modify: `apps/client/src/features/account/SavedSearches.tsx` (`SavedSearchRow` ~92-146)
- Modify: `apps/client/src/messages/{ru,uz,en}.json` (`account.savedSearches.editAria`, `toasts.savedSearchRenamed`)

**Interfaces:**
- Consumes: `SaveSearchModal` (Task 3), `useUpdateSavedSearchMutation` (уже импортирован).
- Produces: (нет).

- [ ] **Step 1: i18n-ключи (все три локали)**

В `account.savedSearches` добавить `editAria`; в `toasts` — `savedSearchRenamed`:
- ru: `"editAria": "Переименовать"`, `"savedSearchRenamed": "Поиск переименован"`
- uz: `"editAria": "Qayta nomlash"`, `"savedSearchRenamed": "Qidiruv qayta nomlandi"`
- en: `"editAria": "Rename"`, `"savedSearchRenamed": "Search renamed"`

- [ ] **Step 2: Реализовать EDIT в `SavedSearchRow`**

В `apps/client/src/features/account/SavedSearches.tsx`:
- Импорты: добавить `Pencil` в существующий импорт из `lucide-react` (стр. 16) и `import { SaveSearchModal } from '@/features/search/SaveSearchModal';`.
- В `SavedSearchRow` добавить состояние и обработчик (после хуков мутаций, ~стр. 97):
```tsx
  const [renameOpen, setRenameOpen] = React.useState(false);
  const handleRename = async (name: string) => {
    try {
      await updateSearch({ id: item.id, name }).unwrap();
      toast.success(tToasts('savedSearchRenamed'));
      setRenameOpen(false);
    } catch {
      /* ошибка показана тост-middleware */
    }
  };
```
- В кластер действий (`<div className="flex items-center gap-3">`, стр. 111) добавить кнопку-карандаш перед колокольчиком:
```tsx
        <button
          type="button"
          disabled={isUpdating}
          onClick={() => setRenameOpen(true)}
          aria-label={tAccount('savedSearches.editAria')}
          className="p-1 text-muted-foreground hover:text-ink disabled:opacity-50"
        >
          <Pencil size={17} />
        </button>
```
- Перед закрывающим `</div>` строки (после кнопки delete, ~стр. 143) отрендерить модалку:
```tsx
      <SaveSearchModal
        open={renameOpen}
        mode="rename"
        initialName={item.name}
        isSubmitting={isUpdating}
        onSubmit={handleRename}
        onClose={() => setRenameOpen(false)}
      />
```
> `tToasts` уже объявлен в `SavedSearchRow` (стр. 95). `updateSearch`/`isUpdating` уже есть (стр. 96) — используются и колокольчиком, и переименованием.

- [ ] **Step 3: Lint**

Run: `cd /Users/founder/Desktop/hermes/projects/avino/apps/client && rtk lint src/features/account/SavedSearches.tsx`
Expected: без ошибок.

- [ ] **Step 4: Живой прогон (Chrome)**

`/account/saved` → у записи нажать карандаш → модалка «Переименовать поиск» с текущим именем → изменить → «Сохранить» → toast «Поиск переименован», имя в списке обновилось. Проверить, что клик по строке по-прежнему открывает выдачу.

- [ ] **Step 5: Коммит**

```bash
git add apps/client/src/features/account/SavedSearches.tsx apps/client/src/messages/ru.json apps/client/src/messages/uz.json apps/client/src/messages/en.json
git commit -m "feat(client): EDIT (переименование) в списке сохранённых поисков"
```

---

## Финальная проверка (после всех задач)

- [ ] **Полный round-trip:** сохранить поиск со ВСЕМ (полигон + сортировка + валюта + мультитип + цена + удобства) → открыть из списка → состояние совпадает.
- [ ] **Несколько записей:** сохранить 2–3 разных поиска → все в списке, каждый со своим именем и восстановлением.
- [ ] **EDIT/DELETE:** переименовать одну, удалить другую → списки/тосты корректны.
- [ ] **i18n:** переключить locale ru/uz/en → все новые строки локализованы, нет «сырых» ключей.
- [ ] **Сборка:** `cd apps/client && rtk vitest run && rtk lint src` — зелёно. Финальную сборку проверять сырым `pnpm exec next build` (гоча: `rtk next build` врёт про ошибки).

## Self-review (выполнено автором плана)

- **Покрытие спеки:** модалка именования → Task 3+4; точное восстановление (sort/currency/points/мультитип) → Task 2+5; полигон → Task 1+5; EDIT → Task 6; DELETE → уже есть; несколько записей → уже есть; i18n три локали → Task 3/4/6. Backend не трогаем — соответствует спеке.
- **Плейсхолдеры:** нет — весь код приведён.
- **Согласованность типов:** `deserializePolygonRing`/`serializePolygonRing` (`LatLng[]`), `SaveSearchModalProps` одинаково используются в FilterBar и SavedSearches, `filters.sort`/`filters.currency`/`filters.points` пишутся в buildFilters (Task 4) и читаются в filtersToSearchHref (Task 2) — имена совпадают.
- **Риск:** восстановление полигона — sync-эффект по `initialPolyKey` не должен перетирать ручную обводку (ключ выведен из пропа, а не из локального стейта); проверяется живым прогоном Task 5 Step 5.
