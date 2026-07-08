# Listing Detail Modal (Zillow-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На `/search` (и любой карточке портала) левый клик открывает деталку объявления в модальном окне поверх выдачи; полная страница остаётся доступна по Cmd/Ctrl-клику, кнопке «Открыть страницу» и при прямом заходе/обновлении.

**Architecture:** Next.js App Router Intercepting + Parallel Routes. Слот `@modal` под `[locale]`-лейаутом перехватывает soft-навигацию на `/listing/[id]` и рендерит `Detail` (переиспользуется, `embedded`-режим) внутри клиентского `ListingModal` (radix-ui `Dialog`). Полная страница `/listing/[id]/page.tsx` не меняется — обслуживает hard-nav, новую вкладку, краулеров и SEO.

**Tech Stack:** Next.js 15 (App Router), TypeScript, next-intl, radix-ui Dialog, Tailwind, Vitest + React Testing Library.

## Global Constraints

- Работаем **строго в `apps/client/`** — не трогаем `apps/web/` и `apps/api/`.
- Ветка уже создана: `feature/search-card-listing-modal`. В `main` напрямую не пушим; мёрж — через PR (мёржит Team Lead).
- Conventional Commits (`feat(client): ...`, `test(client): ...`, `docs(...)`).
- Без новых runtime-зависимостей: `radix-ui@^1.5.0` уже в `apps/client/package.json`.
- i18n: все user-facing строки через `t('key')`, ключи добавить в **ru/uz/en** одновременно; для `uz` следить, чтобы не проскочила кириллица (LLM-гоча).
- Build проверять сырым `pnpm --filter @avino/client exec next build` (а не `rtk next build` — он врёт про ошибки).
- Тесты клиента: `pnpm --filter @avino/client test`. Мок `next-intl` скрывает отсутствующие ключи — наличие ключей проверять вручную.
- `PropertyCard.tsx` **не меняется** (остаётся `<Link href="/listing/[id]">`).
- В слоте-перехватчике **не дублировать** `<JsonLd>` / `generateMetadata` — SEO у полной страницы.

---

## Task 1: `ListingModal` (клиентская оболочка модалки) + i18n-ключи

**Files:**
- Create: `apps/client/src/features/detail/ListingModal.tsx`
- Test: `apps/client/src/features/detail/ListingModal.test.tsx`
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json` (namespace `listing`)

**Interfaces:**
- Consumes: `useRouter`, `Link` из `@/i18n/navigation`; `Dialog` из `radix-ui`; `useTranslations` из `next-intl`. Ключи `listing.openFullPage`, `listing.modalTitle`, существующий `common.close`.
- Produces: `export function ListingModal({ listingId, children }: { listingId: string; children: React.ReactNode })` — оборачивает контент в radix `Dialog`; закрытие (Esc/фон/✕) вызывает `router.back()`; тулбар-ссылка «Открыть страницу ↗» (`/listing/${listingId}`, `target="_blank"`). Потребляется Task 4.

- [ ] **Step 1: Добавить i18n-ключи в namespace `listing`**

В `apps/client/messages/ru.json` в объект `"listing"` добавить:

```json
"openFullPage": "Открыть страницу",
"modalTitle": "Объявление",
```

В `apps/client/messages/uz.json` в объект `"listing"`:

```json
"openFullPage": "Sahifani ochish",
"modalTitle": "E'lon",
```

В `apps/client/messages/en.json` в объект `"listing"`:

```json
"openFullPage": "Open full page",
"modalTitle": "Listing",
```

- [ ] **Step 2: Написать падающий тест** `apps/client/src/features/detail/ListingModal.test.tsx`

```tsx
/**
 * Тесты ListingModal — оболочка модалки деталки.
 * Мокаем @/i18n/navigation (useRouter.back, Link→<a>) и next-intl (ключи из ru.json).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ru from '../../../messages/ru.json';

const mockBack = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ back: mockBack }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    (ru as unknown as Record<string, Record<string, string>>)[ns]?.[k] ?? `${ns}.${k}`,
}));

import { ListingModal } from './ListingModal';

describe('ListingModal', () => {
  beforeEach(() => mockBack.mockClear());

  it('рендерит переданный контент', () => {
    render(
      <ListingModal listingId="L1">
        <p>Деталка</p>
      </ListingModal>,
    );
    expect(screen.getByText('Деталка')).toBeInTheDocument();
  });

  it('ссылка «Открыть страницу» ведёт на /listing/[id] в новой вкладке', () => {
    render(
      <ListingModal listingId="L1">
        <p>x</p>
      </ListingModal>,
    );
    const link = screen.getByRole('link', {
      name: new RegExp(ru.listing.openFullPage),
    });
    expect(link).toHaveAttribute('href', '/listing/L1');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('клик по «Закрыть» вызывает router.back', () => {
    render(
      <ListingModal listingId="L1">
        <p>x</p>
      </ListingModal>,
    );
    fireEvent.click(screen.getByRole('button', { name: ru.common.close }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- ListingModal`
Expected: FAIL — `Failed to resolve import "./ListingModal"` (компонента ещё нет).

- [ ] **Step 4: Реализовать `apps/client/src/features/detail/ListingModal.tsx`**

```tsx
/**
 * ListingModal — клиентская оболочка деталки в модальном окне (intercepting route).
 * Десктоп: центрированная панель max-w-1100/max-h-92vh со своим скроллом.
 * Мобайл (<lg): полноэкранный лист h-dvh. Закрытие (Esc/фон/✕/Назад) → router.back().
 * Тулбар: ссылка «Открыть страницу ↗» (полная страница в новой вкладке) + ✕.
 */
'use client';

import * as React from 'react';
import { Dialog } from 'radix-ui';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';

export interface ListingModalProps {
  listingId: string;
  children: React.ReactNode;
}

export function ListingModal({ listingId, children }: ListingModalProps) {
  const t = useTranslations('listing');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = React.useState(true);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) router.back();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-ink/50 backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed z-[81] flex flex-col bg-surface shadow-raised
            inset-0 h-dvh w-full
            lg:inset-auto lg:left-1/2 lg:top-1/2 lg:h-auto lg:max-h-[92vh]
            lg:w-[calc(100%-48px)] lg:max-w-[1100px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[20px]"
        >
          <Dialog.Title className="sr-only">{t('modalTitle')}</Dialog.Title>

          {/* Тулбар */}
          <div className="sticky top-0 z-10 flex items-center justify-end gap-1 border-b border-border/60 bg-surface/95 px-3 py-2 backdrop-blur">
            <Link
              href={`/listing/${listingId}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[13.5px] font-bold text-teal hover:bg-surface-2"
            >
              <ExternalLink size={15} strokeWidth={2.2} />
              {t('openFullPage')}
            </Link>
            <Dialog.Close
              aria-label={tCommon('close')}
              className="rounded-full p-2 text-muted-foreground hover:bg-surface-2 hover:text-ink"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Контент со скроллом */}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client test -- ListingModal`
Expected: PASS (3 теста).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/features/detail/ListingModal.tsx apps/client/src/features/detail/ListingModal.test.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(client): add ListingModal shell + openFullPage i18n"
```

---

## Task 2: `Detail` — режим `embedded` для модалки

**Files:**
- Modify: `apps/client/src/features/detail/Detail.tsx`

**Interfaces:**
- Consumes: существующий `Detail` (async server component).
- Produces: `DetailProps` получает опциональный `embedded?: boolean`. При `embedded`: убираются `fade-up` и `mx-auto max-w-[1280px]` с корня; вместо строки «крошка + Назад + Share» рендерится только `ShareButton` справа. Потребляется Task 4.

- [ ] **Step 1: Расширить `DetailProps`**

В `apps/client/src/features/detail/Detail.tsx` заменить интерфейс:

```tsx
export interface DetailProps {
  listing: Listing;
  /** Если не передан — показываем только ссылку «Назад к поиску» (backward-compat). */
  breadcrumb?: DetailBreadcrumb;
  /** Встроенный режим (внутри модалки): без крошки/«Назад»/fade-up, ширину задаёт модалка. */
  embedded?: boolean;
}
```

И сигнатуру функции:

```tsx
export async function Detail({ listing, breadcrumb, embedded }: DetailProps) {
```

- [ ] **Step 2: Сделать корневой `<div>` условным по `embedded`**

Заменить открывающий `<div className="fade-up mx-auto max-w-[1280px] px-4 pb-12 pt-5 sm:px-6">` на:

```tsx
    <div
      className={
        embedded
          ? 'px-4 pb-10 pt-2 sm:px-6'
          : 'fade-up mx-auto max-w-[1280px] px-4 pb-12 pt-5 sm:px-6'
      }
    >
```

- [ ] **Step 3: Заменить строку «крошка + Назад + Share» на условный блок**

Заменить весь блок:

```tsx
      {/* Хлебная крошка (SEO-видимая) + ссылка «Назад к поиску» */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {breadcrumbItems ? (
          <Breadcrumb items={breadcrumbItems} />
        ) : null}
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-teal hover:text-teal-deep"
          >
            <ChevronLeft size={18} /> {t('backToSearch')}
          </Link>
          <ShareButton listing={listing} />
        </div>
      </div>
```

на:

```tsx
      {/* Внутри модалки своя шапка → крошку и «Назад» скрываем, Share оставляем. */}
      {embedded ? (
        <div className="mb-3 flex justify-end">
          <ShareButton listing={listing} />
        </div>
      ) : (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {breadcrumbItems ? <Breadcrumb items={breadcrumbItems} /> : null}
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-[14.5px] font-bold text-teal hover:text-teal-deep"
            >
              <ChevronLeft size={18} /> {t('backToSearch')}
            </Link>
            <ShareButton listing={listing} />
          </div>
        </div>
      )}
```

- [ ] **Step 4: Проверить типы/линт (Detail — async server component, юнит-тестом не покрываем)**

Run: `pnpm --filter @avino/client exec tsc --noEmit`
Expected: без ошибок типов в `Detail.tsx`. (Если ошибки «stale Prisma» — это не наш кейс; здесь только клиент.)

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/detail/Detail.tsx
git commit -m "feat(client): add embedded mode to Detail for modal reuse"
```

---

## Task 3: Параллельный слот `@modal` в лейауте

**Files:**
- Create: `apps/client/src/app/[locale]/@modal/default.tsx`
- Modify: `apps/client/src/app/[locale]/layout.tsx`

**Interfaces:**
- Consumes: ничего нового.
- Produces: лейаут рендерит слот `modal` рядом с `children` внутри `StoreProvider`/`NextIntlClientProvider`; `default.tsx` отдаёт `null`, когда перехвата нет. Потребляется Task 4 (страница-перехватчик попадает в слот `modal`).

- [ ] **Step 1: Создать фолбэк слота** `apps/client/src/app/[locale]/@modal/default.tsx`

```tsx
/**
 * Фолбэк параллельного слота @modal: когда перехвата нет (полная страница,
 * прочие роуты), слот рендерит пустоту. Обязателен для parallel routes.
 */
export default function Default() {
  return null;
}
```

- [ ] **Step 2: Добавить слот `modal` в пропы лейаута**

В `apps/client/src/app/[locale]/layout.tsx` заменить:

```tsx
interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}
```

на:

```tsx
interface LayoutProps {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ locale: string }>;
}
```

- [ ] **Step 3: Прокинуть и отрендерить `modal`**

Заменить сигнатуру и JSX-возврат. Сигнатуру:

```tsx
export default async function RootLayout({ children, modal, params }: LayoutProps) {
```

И блок внутри `StoreProvider` (рендерим `{modal}` после колоночного `div`, чтобы он жил в контексте Redux/intl; визуально Radix всё равно порталит в body):

```tsx
          <StoreProvider>
            <div className="flex min-h-dvh flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
            {modal}
          </StoreProvider>
```

- [ ] **Step 4: Проверить сборку (слот без перехвата = модалка не появляется)**

Run: `pnpm --filter @avino/client exec next build`
Expected: BUILD успешен; страницы рендерятся как раньше (слот отдаёт `null`).

- [ ] **Step 5: Commit**

```bash
git add "apps/client/src/app/[locale]/@modal/default.tsx" "apps/client/src/app/[locale]/layout.tsx"
git commit -m "feat(client): add @modal parallel slot to locale layout"
```

---

## Task 4: Перехватывающий роут `(.)listing/[id]`

**Files:**
- Create: `apps/client/src/app/[locale]/@modal/(.)listing/[id]/page.tsx`

**Interfaces:**
- Consumes: `ListingModal` (Task 1), `Detail` с `embedded` (Task 2), слот `@modal` (Task 3), `getListingById(id, locale)`, `setRequestLocale`/`getTranslations` из `next-intl/server`.
- Produces: при soft-навигации на `/listing/[id]` рендерит `<ListingModal><Detail embedded/></ListingModal>`; при отсутствии листинга — компактный «не найдено» внутри модалки.

- [ ] **Step 1: Создать страницу-перехватчик** `apps/client/src/app/[locale]/@modal/(.)listing/[id]/page.tsx`

```tsx
/**
 * Перехватчик /listing/[id] для модалки (intercepting route, parallel slot @modal).
 * Срабатывает ТОЛЬКО на soft-навигацию (клик по карточке). Hard-nav / обновление /
 * прямой заход идут на полную страницу listing/[id]/page.tsx (там же SEO/JSON-LD).
 * Здесь JSON-LD и generateMetadata НЕ дублируем.
 */
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getListingById } from '@/lib/api/listings';
import { Detail } from '@/features/detail/Detail';
import { ListingModal } from '@/features/detail/ListingModal';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function InterceptedListingModal({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const listing = await getListingById(id, locale);

  if (!listing) {
    const t = await getTranslations('listing');
    return (
      <ListingModal listingId={id}>
        <div className="px-6 py-16 text-center">
          <h2 className="text-xl font-extrabold text-ink">{t('notFound.title')}</h2>
          <p className="mt-2 text-muted-foreground">{t('notFound.text')}</p>
        </div>
      </ListingModal>
    );
  }

  return (
    <ListingModal listingId={id}>
      <Detail listing={listing} embedded />
    </ListingModal>
  );
}
```

- [ ] **Step 2: Проверить сборку (перехватчик + полная страница сосуществуют)**

Run: `pnpm --filter @avino/client exec next build`
Expected: BUILD успешен; в выводе появляется маршрут `/[locale]/@modal/(.)listing/[id]` рядом с `/[locale]/listing/[id]`.

- [ ] **Step 3: Commit**

```bash
git add "apps/client/src/app/[locale]/@modal/(.)listing/[id]/page.tsx"
git commit -m "feat(client): intercept /listing/[id] into modal on soft-nav"
```

---

## Task 5: Live-verify + финализация (ADR + DONE)

**Files:**
- Create: `docs/adr/ADR-0116-listing-detail-modal-intercepting-routes.md`
- Modify: `docs/DONE.md` (+ `docs/TASKS.md` если задача там заведена)

**Interfaces:**
- Consumes: всё из Task 1–4.
- Produces: зелёные test/lint/build, визуальное подтверждение поведения, ADR + запись в DONE (готовятся в этой же feature-ветке до пуша).

- [ ] **Step 1: Прогнать весь набор проверок клиента**

Run:
```bash
pnpm --filter @avino/client test
pnpm --filter @avino/client lint
pnpm --filter @avino/client exec next build
```
Expected: тесты зелёные (включая `ListingModal`), lint без новых ошибок, build успешен.

- [ ] **Step 2: Поднять стенд и проверить поведение вручную**

Run: `docker compose --profile app up -d --build`
Проверить на `/{locale}/search`:
1. Левый клик по карточке → открывается модалка, URL = `/listing/[id]`, выдача под модалкой сохраняет скролл/нарисованную территорию.
2. Cmd/Ctrl-клик по карточке → полная страница в новой вкладке.
3. Кнопка «Открыть страницу ↗» в модалке → полная страница в новой вкладке.
4. Esc / клик по фону / ✕ / «Назад» браузера → модалка закрывается, возврат на `/search`.
5. Обновление страницы на `/listing/[id]` → полная страница (без модалки).
6. Мобильная ширина (<1000px) → модалка во весь экран (полноэкранный лист).

- [ ] **Step 3: Снять скриншоты desktop + mobile (доказательство)**

Через claude-in-chrome или Chrome headless (`--virtual-time-budget`), как в `avino-client-screenshot-recipe`. Приложить к PR.

- [ ] **Step 4: Создать ADR** `docs/adr/ADR-0116-listing-detail-modal-intercepting-routes.md`

```markdown
# ADR-0116 — Listing detail modal via intercepting + parallel routes

## Status
Accepted

## Date
2026-06-29

## Context
Клиент: клик по карточке на `/search` должен открывать деталку в модальном окне
поверх выдачи (как Zillow), с возможностью открыть полную страницу/новую вкладку.
Нужно сохранить выдачу под модалкой, shareable URL и SEO полной страницы.

## Decision
Используем Next.js App Router Intercepting + Parallel Routes: слот `@modal` под
`[locale]`-лейаутом, перехватчик `@modal/(.)listing/[id]` рендерит переиспользуемый
`Detail` (режим `embedded`) внутри клиентского `ListingModal` (radix-ui Dialog).
Полная страница `/listing/[id]` не меняется и обслуживает hard-nav, новую вкладку,
прямой заход и SEO. Выкатка по умолчанию, без фиче-флага. Перехват действует на
любой soft-nav к `/listing/[id]` под лейаутом (главная/избранное/«похожие»).

## Consequences
Positive:
- Каноничный механизм; выдача `/search` не размонтируется (скролл/территория живут).
- Cmd/Ctrl-клик и «Открыть страницу» нативно дают полную страницу; SEO не дублируется.
- `PropertyCard` не меняется.

Negative / trade-offs:
- Модалка открывается с любой карточки портала, не только со `/search` (намеренно).
- Перехват — файловая магия App Router; нельзя выключить рантайм-флагом без рефактора.

## Related files
- apps/client/src/app/[locale]/@modal/default.tsx
- apps/client/src/app/[locale]/@modal/(.)listing/[id]/page.tsx
- apps/client/src/features/detail/ListingModal.tsx
- apps/client/src/features/detail/Detail.tsx
- apps/client/src/app/[locale]/layout.tsx

## Related task
- Listing detail modal on search card click
```

- [ ] **Step 5: Добавить запись в `docs/DONE.md`** (формат проекта; `PR: pending` до мёржа), при наличии — убрать задачу из `docs/TASKS.md`.

- [ ] **Step 6: Commit финализации**

```bash
git add docs/adr/ADR-0116-listing-detail-modal-intercepting-routes.md docs/DONE.md
git commit -m "docs: ADR-0116 + DONE for listing detail modal"
```

- [ ] **Step 7: Push ветки и открыть PR** (мёржит Team Lead; в `main` напрямую не пушим)

```bash
git push -u origin feature/search-card-listing-modal
```
Затем PR через `gh` (токен из `~/.gh_token`, не печатать в лог). PR-описание по формату проекта (A–G): что сделано, зачем, как проверить, checklist.

---

## Self-Review

**Spec coverage:**
- Модалка по клику (intercepting) → Task 3 (слот) + Task 4 (перехватчик) + Task 1 (оболочка). ✓
- Полноэкранный лист на мобиле → Task 1 (классы `inset-0 h-dvh` / `lg:` центрирование). ✓
- Без фиче-флага, по умолчанию → архитектура intercepting routes (Task 3/4). ✓
- «Открыть страницу ↗» + Cmd/Ctrl-клик → Task 1 (ссылка `target=_blank`) + неизменный `<Link>` `PropertyCard`. ✓
- Открытие с любой карточки (намеренно) → слот под `[locale]`-лейаутом (Task 3). ✓
- SEO не дублируется → Task 4 (без JsonLd/metadata). ✓
- `Detail` переиспользуется без крошки/«Назад»/`fade-up` → Task 2 (`embedded`). ✓
- i18n ru/uz/en → Task 1 Step 1. ✓
- Тест `ListingModal` → Task 1. ✓
- ADR + DONE → Task 5. ✓

**Placeholder scan:** плейсхолдеров нет — весь код приведён целиком.

**Type consistency:** `ListingModal({ listingId, children })` одинаково объявлен (Task 1) и вызван (Task 4); `Detail({ listing, breadcrumb, embedded })` согласован (Task 2 ↔ Task 4); слот-проп `modal` согласован (Task 3 ↔ Task 4); `getListingById(id, locale): Promise<Listing|null>` соответствует фактической сигнатуре.
