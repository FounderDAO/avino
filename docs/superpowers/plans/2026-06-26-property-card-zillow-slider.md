# PropertyCard Zillow-style (слайдер фото, бейдж «N дней», разделители «|») — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приблизить карточку объявления к Zillow — добавить слайдер фото внутри карточки, бейдж «N дней на сайте» и разделители «|» в строке спеков.

**Architecture:** Новый изолированный компонент `CardPhotoCarousel` (свой лёгкий слайдер на `useState`, без новых зависимостей) заменяет статичный `PhotoImg` в `PropertyCard`. Бейдж `DaysBadge` (белый пилюль, считает дни из `createdAt`) заменяет `NewBadge`. Разделитель строки спеков `·` меняется на тонкую вертикальную черту.

**Tech Stack:** Next.js + TypeScript, next-intl (i18n), Tailwind, lucide-react, Vitest + React Testing Library.

## Global Constraints

- Задача строго в `apps/client/` — один PR (граница app-папок, docs/CLAUDE.md §0).
- Никаких новых npm-зависимостей — слайдер свой.
- Все пользовательские строки (включая aria-label) — через `t()`, в трёх локалях `ru/uz/en`. Без хардкода.
- Плюралы — ICU-формат `{count, plural, ...}`, как в существующих `units.rooms`.
- Conventional Commits, частые коммиты.
- `CardPhotoCarousel` обязан корректно деградировать: 0 фото → плейсхолдер, 1 фото → без стрелок/точек, >1 → полный слайдер.
- Имя пакета для команд: `@avino/client`.

---

### Task 1: Хелпер `daysOnSite()`

**Files:**
- Modify: `apps/client/src/lib/format.ts` (добавить функцию рядом с `isFresh`, ~строка 162)
- Test: `apps/client/src/lib/format.test.ts` (Create)

**Interfaces:**
- Produces: `daysOnSite(createdAt: string): number` — целое число дней (>= 0); невалидная/будущая дата → `0`.

- [ ] **Step 1: Написать падающий тест**

Create `apps/client/src/lib/format.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { daysOnSite } from './format';

describe('daysOnSite', () => {
  afterEach(() => vi.useRealTimers());

  it('считает целые дни с момента публикации', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    expect(daysOnSite('2026-06-21T00:00:00.000Z')).toBe(5);
  });

  it('возвращает 0 для будущей даты', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    expect(daysOnSite('2026-06-27T00:00:00.000Z')).toBe(0);
  });

  it('возвращает 0 для невалидной даты', () => {
    expect(daysOnSite('not-a-date')).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/lib/format.test.ts`
Expected: FAIL — `daysOnSite is not a function` / import не резолвится.

- [ ] **Step 3: Реализовать функцию**

В `apps/client/src/lib/format.ts` добавить после `isFresh` (конец файла):

```ts
/** Сколько дней объявление на сайте (>= 0). Невалидная/будущая дата → 0. */
export function daysOnSite(createdAt: string): number {
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/lib/format.test.ts`
Expected: PASS (3 теста).

- [ ] **Step 5: Коммит**

```bash
git add apps/client/src/lib/format.ts apps/client/src/lib/format.test.ts
git commit -m "feat(client): add daysOnSite() helper for listing age"
```

---

### Task 2: Бейдж `DaysBadge` + i18n `units.daysOnSite`

**Files:**
- Modify: `apps/client/src/components/ui/promo-badge.tsx` (добавить `DaysBadge`, импорт `cn` и `daysOnSite`)
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json` (ключ `units.daysOnSite`)
- Test: `apps/client/src/components/ui/promo-badge.test.tsx` (Create)

**Interfaces:**
- Consumes: `daysOnSite(createdAt)` (Task 1).
- Produces: `DaysBadge({ createdAt: string; className?: string })` — белый пилюль с текстом «N дней на сайте».

- [ ] **Step 1: Добавить i18n-ключ `units.daysOnSite` в три файла**

В `apps/client/messages/ru.json` внутри объекта `"units"` добавить ключ:

```json
"daysOnSite": "{count, plural, one {# день на сайте} few {# дня на сайте} many {# дней на сайте} other {# дней на сайте}}"
```

В `apps/client/messages/uz.json` внутри `"units"`:

```json
"daysOnSite": "{count, plural, other {# kun saytda}}"
```

В `apps/client/messages/en.json` внутри `"units"`:

```json
"daysOnSite": "{count, plural, one {# day on site} other {# days on site}}"
```

- [ ] **Step 2: Написать падающий тест**

Create `apps/client/src/components/ui/promo-badge.test.tsx`:

```tsx
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DaysBadge } from './promo-badge';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

describe('DaysBadge', () => {
  afterEach(() => vi.useRealTimers());

  it('показывает количество дней на сайте', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-26T00:00:00.000Z'));
    render(<DaysBadge createdAt="2026-06-21T00:00:00.000Z" />);
    expect(screen.getByText('daysOnSite:{"count":5}')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/components/ui/promo-badge.test.tsx`
Expected: FAIL — `DaysBadge` не экспортирован.

- [ ] **Step 4: Реализовать `DaysBadge`**

В `apps/client/src/components/ui/promo-badge.tsx` обновить импорты (верх файла):

```tsx
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Badge } from './badge';
import { cn } from '@/lib/utils';
import { daysOnSite } from '@/lib/format';
import type { PromotionType } from '@/lib/mock/types';
```

И добавить в конец файла (после `NewBadge`):

```tsx
/** Бейдж «N дней на сайте» (белый пилюль, как у Zillow). */
export function DaysBadge({
  createdAt,
  className,
}: {
  createdAt: string;
  className?: string;
}) {
  const t = useTranslations('units');
  const days = daysOnSite(createdAt);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink shadow-[0_1px_5px_rgba(40,34,24,0.18)]',
        className,
      )}
    >
      {t('daysOnSite', { count: days })}
    </span>
  );
}
```

Примечание: `NewBadge` оставляем в файле — он перестанет использоваться в `PropertyCard` (Task 4), но удалять экспорт в рамках этой задачи не нужно.

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/components/ui/promo-badge.test.tsx`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add apps/client/src/components/ui/promo-badge.tsx apps/client/src/components/ui/promo-badge.test.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): add DaysBadge (days-on-site pill) + i18n"
```

---

### Task 3: Компонент `CardPhotoCarousel` + i18n стрелок/точек

**Files:**
- Create: `apps/client/src/components/ui/card-photo-carousel.tsx`
- Modify: `apps/client/messages/ru.json`, `uz.json`, `en.json` (ключи `common.photoPrev`, `common.photoNext`, `common.goToPhoto`)
- Test: `apps/client/src/components/ui/card-photo-carousel.test.tsx` (Create)

**Interfaces:**
- Consumes: `PhotoImg` из `./photo-img`; `ListingPhoto` из `@/lib/mock/types`.
- Produces: `CardPhotoCarousel({ photos: ListingPhoto[]; alt: string; sizes?: string; className?: string })`.

- [ ] **Step 1: Добавить i18n-ключи стрелок/точек в три файла**

В `apps/client/messages/ru.json` внутри `"common"`:

```json
"photoPrev": "Предыдущее фото",
"photoNext": "Следующее фото",
"goToPhoto": "Фото {n}"
```

В `apps/client/messages/uz.json` внутри `"common"`:

```json
"photoPrev": "Oldingi rasm",
"photoNext": "Keyingi rasm",
"goToPhoto": "{n}-rasm"
```

В `apps/client/messages/en.json` внутри `"common"`:

```json
"photoPrev": "Previous photo",
"photoNext": "Next photo",
"goToPhoto": "Photo {n}"
```

- [ ] **Step 2: Написать падающий тест**

Create `apps/client/src/components/ui/card-photo-carousel.test.tsx`:

```tsx
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { CardPhotoCarousel } from './card-photo-carousel';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));
vi.mock('./photo-img', () => ({
  PhotoImg: ({ src }: { src: string }) => <div data-testid="cur" data-src={src} />,
}));

const photos = [
  { url: 'a', thumb: 'a-thumb' },
  { url: 'b', thumb: 'b-thumb' },
  { url: 'c', thumb: 'c-thumb' },
];

const curSrc = () => screen.getByTestId('cur').getAttribute('data-src');

describe('CardPhotoCarousel', () => {
  it('листает next/prev с заворотом по кругу', () => {
    render(<CardPhotoCarousel photos={photos} alt="x" />);
    expect(curSrc()).toBe('a-thumb');

    fireEvent.click(screen.getByLabelText('photoNext'));
    expect(curSrc()).toBe('b-thumb');

    fireEvent.click(screen.getByLabelText('photoNext'));
    fireEvent.click(screen.getByLabelText('photoNext')); // с последнего → первое
    expect(curSrc()).toBe('a-thumb');

    fireEvent.click(screen.getByLabelText('photoPrev')); // с первого назад → последнее
    expect(curSrc()).toBe('c-thumb');
  });

  it('клик по точке открывает соответствующее фото', () => {
    render(<CardPhotoCarousel photos={photos} alt="x" />);
    fireEvent.click(screen.getByLabelText('goToPhoto:{"n":3}'));
    expect(curSrc()).toBe('c-thumb');
  });

  it('при одном фото нет стрелок и точек', () => {
    render(<CardPhotoCarousel photos={[photos[0]]} alt="x" />);
    expect(screen.queryByLabelText('photoNext')).toBeNull();
    expect(screen.queryByLabelText('goToPhoto:{"n":1}')).toBeNull();
  });

  it('клик по стрелке гасит навигацию (preventDefault)', () => {
    render(<CardPhotoCarousel photos={photos} alt="x" />);
    const btn = screen.getByLabelText('photoNext');
    const ev = createEvent.click(btn);
    fireEvent(btn, ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/components/ui/card-photo-carousel.test.tsx`
Expected: FAIL — модуль `./card-photo-carousel` не найден.

- [ ] **Step 4: Реализовать компонент**

Create `apps/client/src/components/ui/card-photo-carousel.tsx`:

```tsx
/**
 * CardPhotoCarousel — слайдер фото внутри карточки (Zillow-стиль).
 * Стрелки ‹ › появляются при hover карточки; точки-индикаторы снизу (макс 5).
 * Заворачивает по кругу. preventDefault/stopPropagation — чтобы клик по
 * стрелке/точке не триггерил навигацию по карточке-ссылке (как FavButton).
 * Деградация: 0 фото → плейсхолдер PhotoImg, 1 фото → без стрелок/точек.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PhotoImg } from './photo-img';
import { cn } from '@/lib/utils';
import type { ListingPhoto } from '@/lib/mock/types';

const MAX_DOTS = 5;

export interface CardPhotoCarouselProps {
  photos: ListingPhoto[];
  alt: string;
  className?: string;
  sizes?: string;
}

export function CardPhotoCarousel({ photos, alt, className, sizes }: CardPhotoCarouselProps) {
  const t = useTranslations('common');
  const [current, setCurrent] = React.useState(0);
  const n = photos.length;

  // Безопасный модуль (заворот по кругу) + гашение навигации по карточке-ссылке.
  const go = (next: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrent(((next % n) + n) % n);
  };

  const dotCount = Math.min(n, MAX_DOTS);
  // При >5 фото точек всё равно 5; активная — по пропорции позиции.
  const activeDot = n <= MAX_DOTS ? current : Math.round((current / (n - 1)) * (dotCount - 1));
  // Фото, на которое ведёт точка i (инверсия пропорции при усечении).
  const dotTarget = (i: number) =>
    n <= MAX_DOTS ? i : Math.round((i / (dotCount - 1)) * (n - 1));

  const arrowCls =
    'absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center ' +
    'rounded-full bg-white/90 text-ink opacity-0 shadow transition-opacity ' +
    'group-hover:opacity-100';

  return (
    <div className={cn('absolute inset-0', className)}>
      <PhotoImg
        src={photos[current]?.thumb ?? ''}
        alt={alt}
        sizes={sizes}
        className="transition-transform duration-[400ms] group-hover:scale-105"
      />

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label={t('photoPrev')}
            onClick={go(current - 1)}
            className={cn(arrowCls, 'left-2')}
          >
            <ChevronLeft size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            aria-label={t('photoNext')}
            onClick={go(current + 1)}
            className={cn(arrowCls, 'right-2')}
          >
            <ChevronRight size={18} strokeWidth={2.2} />
          </button>

          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {Array.from({ length: dotCount }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={t('goToPhoto', { n: i + 1 })}
                aria-current={i === activeDot}
                onClick={go(dotTarget(i))}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  i === activeDot ? 'bg-white' : 'bg-white/55',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/components/ui/card-photo-carousel.test.tsx`
Expected: PASS (4 теста).

- [ ] **Step 6: Коммит**

```bash
git add apps/client/src/components/ui/card-photo-carousel.tsx apps/client/src/components/ui/card-photo-carousel.test.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): add CardPhotoCarousel photo slider + i18n"
```

---

### Task 4: Внедрить в `PropertyCard` + разделители «|» + обновить тест

**Files:**
- Modify: `apps/client/src/features/search/PropertyCard.tsx`
- Modify: `apps/client/src/features/search/PropertyCard.test.tsx`

**Interfaces:**
- Consumes: `CardPhotoCarousel` (Task 3), `DaysBadge` (Task 2).

- [ ] **Step 1: Обновить мок-зависимости в тесте `PropertyCard.test.tsx`**

В `apps/client/src/features/search/PropertyCard.test.tsx` заменить два мок-блока. Убрать мок `@/components/ui/photo-img`, заменить на мок карусели; в мок `promo-badge` заменить `NewBadge` на `DaysBadge`:

Было:
```ts
vi.mock('@/components/ui/photo-img', () => ({
  PhotoImg: () => <div data-testid="photo" />,
}));
vi.mock('@/components/ui/promo-badge', () => ({
  PromoBadge: () => null,
  NewBadge: () => null,
}));
```

Стало:
```ts
vi.mock('@/components/ui/card-photo-carousel', () => ({
  CardPhotoCarousel: () => <div data-testid="photo" />,
}));
vi.mock('@/components/ui/promo-badge', () => ({
  PromoBadge: () => null,
  DaysBadge: () => null,
}));
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/PropertyCard.test.tsx`
Expected: FAIL — `PropertyCard` ещё импортирует `PhotoImg`/`NewBadge`, мок не совпадает (или ошибка резолва импорта после правки кода ниже). Сейчас падение фиксирует, что код требует обновления.

- [ ] **Step 3: Обновить `PropertyCard.tsx`**

Заменить импорты (строки 13–17). Было:
```tsx
import { MapPin } from 'lucide-react';
import { PhotoImg } from '@/components/ui/photo-img';
import { PromoBadge, NewBadge } from '@/components/ui/promo-badge';
import { FavButton } from '@/components/ui/fav-button';
import { specs, propertyTypeLabel, isFresh } from '@/lib/format';
```

Стало:
```tsx
import { MapPin } from 'lucide-react';
import { CardPhotoCarousel } from '@/components/ui/card-photo-carousel';
import { PromoBadge, DaysBadge } from '@/components/ui/promo-badge';
import { FavButton } from '@/components/ui/fav-button';
import { specs, propertyTypeLabel } from '@/lib/format';
```

Удалить строку `const fresh = isFresh(listing.createdAt);` (была строка 33).

Заменить блок фото (строки 43–58). Было:
```tsx
      {/* Фото */}
      <div className="relative aspect-[3/2] shrink-0 overflow-hidden">
        <PhotoImg
          src={listing.photos[0]?.thumb ?? ''}
          alt={listing.title}
          className="transition-transform duration-[400ms] group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <PromoBadge promo={listing.promo} />
          {fresh && listing.promo === 'NORMAL' && <NewBadge />}
        </div>
        <div className="absolute right-2.5 top-2.5">
          <FavButton listingId={listing.id} />
        </div>
      </div>
```

Стало:
```tsx
      {/* Фото — слайдер */}
      <div className="relative aspect-[3/2] shrink-0 overflow-hidden">
        <CardPhotoCarousel
          photos={listing.photos}
          alt={listing.title}
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
        />
        <div className="absolute left-3 top-3 z-10 flex gap-1.5">
          <PromoBadge promo={listing.promo} />
          <DaysBadge createdAt={listing.createdAt} />
        </div>
        <div className="absolute right-2.5 top-2.5 z-10">
          <FavButton listingId={listing.id} />
        </div>
      </div>
```

Заменить разделитель в строке спеков (была строка 70). Было:
```tsx
              {i > 0 && <span className="mx-[7px] text-border">·</span>}
```

Стало:
```tsx
              {i > 0 && (
                <span
                  className="mx-2 inline-block h-3 w-px bg-border align-middle"
                  aria-hidden
                />
              )}
```

- [ ] **Step 4: Запустить тест PropertyCard — убедиться, что проходит**

Run: `pnpm --filter @avino/client exec vitest run src/features/search/PropertyCard.test.tsx`
Expected: PASS (2 теста — цена/спеки/локация рендерятся, агентство/заголовок/tx-лейбл отсутствуют).

- [ ] **Step 5: Прогнать весь тест-набор, lint и build клиента**

Run: `pnpm --filter @avino/client test`
Expected: PASS (все тесты, включая новые из Task 1–3).

Run: `pnpm --filter @avino/client lint`
Expected: без ошибок.

Run: `pnpm --filter @avino/client build`
Expected: успешная сборка. Если `rtk`-обёртка покажет «Errors: 1» при чистой сборке — перепроверить сырым `pnpm --filter @avino/client exec next build` (известный false-positive, см. memory).

- [ ] **Step 6: Коммит**

```bash
git add apps/client/src/features/search/PropertyCard.tsx apps/client/src/features/search/PropertyCard.test.tsx
git commit -m "feat(client): wire photo slider + days badge + pipe separators into PropertyCard"
```

---

## Self-Review

**Spec coverage:**
- Слайдер фото → Task 3 (`CardPhotoCarousel`) + Task 4 (внедрение). ✅
- Деградация 0/1/>1 фото → Task 3 реализация + тест «при одном фото нет стрелок/точек». ✅
- Стрелки с preventDefault/stopPropagation → Task 3 (`go()`) + тест preventDefault. ✅
- Точки макс 5 + пропорция при >5 → Task 3 (`dotCount`/`activeDot`/`dotTarget`). ✅
- Бейдж «N дней» заменяет «Новое» → Task 2 (`DaysBadge`) + Task 4 (замена `NewBadge`, удаление `isFresh`). ✅
- `daysOnSite()` из `createdAt` → Task 1. ✅
- Разделители «|» → Task 4 (Step 3). ✅
- i18n ru/uz/en для бейджа и aria-стрелок/точек → Task 2 Step 1, Task 3 Step 1. ✅
- Тесты (карусель + `daysOnSite`) → Task 1, 2, 3. ✅
- Только `apps/client/`, без новых зависимостей → соблюдено во всех задачах. ✅
- Вне границ (санузлы, строка агентства, свайп) → не входят. ✅

**Placeholder scan:** плейсхолдеров нет — весь код приведён целиком.

**Type consistency:** `daysOnSite(createdAt: string): number` единообразно используется в Task 2; `CardPhotoCarousel` props (`photos/alt/sizes/className`) совпадают между Task 3 и вызовом в Task 4; `DaysBadge({ createdAt })` совпадает между Task 2 и Task 4. ✅
