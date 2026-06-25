# ADR-0104 — Public portal SEO foundation (robots, hreflang, metadata, JSON-LD)

## Status

Accepted

## Date

2026-06-25

## Context

Публичный портал `apps/client` (Next.js 15 App Router, трёхъязычный uz/ru/en)
имел крепкий фундамент (настоящий SSR, `generateMetadata` на каждом роуте,
path-based i18n), но **слой обнаружения для поисковиков фактически отсутствовал**.
SEO-аудит (2026-06-25, `scratchpad/seo-audit.md`) зафиксировал, что для
маркетплейса недвижимости, чей рост держится на long-tail запросах по
объявлениям и локациям, это блокирует органический трафик:

- нет `robots.txt` (нет crawl-директив, sitemap не задекларирован, приватные
  страницы краулятся);
- нет `hreflang`/`alternates` — три языковые версии каждой страницы конкурируют
  как дубли, Google не может сопоставить uz↔ru↔en;
- нет канонических URL;
- нет Open Graph/Twitter и не выставлен `metadataBase` — ссылки на объявления в
  Telegram/WhatsApp рендерятся голым текстом;
- нет structured data (Schema.org);
- на детальной карточке объявления отсутствует `<h1>` (иерархия начинается с
  `<h2>`).

Этот ADR покрывает «quick wins» — изменения без зависимостей от backend.
Динамический `sitemap.ts`, полные графы `RealEstateListing`/`BreadcrumbList`,
миграция фото на `next/image` и canonical-стратегия для `/search` вынесены в
отдельный, более крупный PR.

## Decision

В `apps/client` добавлен набор SEO-примитивов App Router:

1. **`robots.ts`** — `MetadataRoute.Robots`: allow `/`, disallow `/*/account/`
   и `/*/sell/new` (с учётом `[locale]`-префикса), декларация `sitemap` и `host`.
2. **`metadataBase`** + **title template** `'%s | Avino'` в корневом
   `[locale]/layout.tsx`.
3. **hreflang/canonical helper** `lib/seo/alternates.ts` (`alternatesFor(path)`)
   и единый базовый URL `lib/seo/base.ts`
   (`NEXT_PUBLIC_SITE_URL ?? 'https://avino.uz'`), подключённые в
   `generateMetadata` всех публичных роутов (home, `/search`, `/map`,
   `/listing/[id]`, `/sell`, `/help`).
4. **noindex приватных страниц** — `robots:{index:false}` на `/sell/new` и через
   segment-layout `account/layout.tsx` на весь `/account/*`.
5. **`<h1>`** с заголовком объявления на детальной карточке (один H1, разделы
   остаются H2).
6. **Open Graph / Twitter** на детальной и home (og:image = первое фото).
7. **JSON-LD** `Organization` + `WebSite`/`SearchAction` в корневом layout
   через серверный компонент `components/seo/JsonLd.tsx`.
8. **meta description** объявления — trim до 155 символов с fallback.
9. **Footer** — соц-иконки из инертных `<span>` в рабочие `<a rel="noopener">`,
   те же URL в `Organization.sameAs`.

## Consequences

Positive:
- Сайт переходит из «технически не индексируемого как мультиязычный маркетплейс»
  в краулибельное состояние; uz/ru/en перестают конкурировать как дубли.
- Ссылки на объявления получают rich-preview в мессенджерах/соцсетях.
- Бренд-сущность (`Organization`/`WebSite` + `SearchAction`) объявлена для Google.

Negative / trade-offs:
- og:image использует резолвнутый R2-URL фото, который сейчас sign-on-read и
  может быть временным/подписанным; стабильный публичный image-route — отдельная
  задача (см. follow-up PR).
- `robots.ts` ссылается на `/sitemap.xml`, который появится только в следующем
  (structured-data/sitemap) PR — до тех пор ссылка ведёт на 404; это сознательно.
- Полные графы `RealEstateListing`/`Offer`/`BreadcrumbList`, `next/image` для фото
  и canonical-стратегия `/search` — в отдельном PR.

## Related files

- apps/client/src/app/robots.ts
- apps/client/src/lib/seo/base.ts
- apps/client/src/lib/seo/alternates.ts
- apps/client/src/components/seo/JsonLd.tsx
- apps/client/src/app/[locale]/layout.tsx
- apps/client/src/app/[locale]/page.tsx
- apps/client/src/app/[locale]/listing/[id]/page.tsx
- apps/client/src/app/[locale]/search/page.tsx
- apps/client/src/app/[locale]/map/page.tsx
- apps/client/src/app/[locale]/sell/page.tsx
- apps/client/src/app/[locale]/sell/new/page.tsx
- apps/client/src/app/[locale]/help/page.tsx
- apps/client/src/app/[locale]/account/layout.tsx
- apps/client/src/features/detail/Detail.tsx
- apps/client/src/components/layout/Footer.tsx

## Related task

- TASK-SEO-01 (SEO quick wins, public portal)
