# ADR-0106 — SEO structured data, dynamic sitemap, next/image migration

## Status

Accepted

## Date

2026-06-26

## Context

ADR-0104 заложил SEO-фундамент публичного портала (robots, hreflang, metadata,
OG, базовый JSON-LD). SEO-аудит (`scratchpad/seo-audit.md`) выделял ещё четыре
крупных пункта, которые требуют большего объёма работы, чем quick-wins:

- **#1** — нет динамического `sitemap.ts`: поисковики не получают фид URL
  объявлений (самый высокий ROI для маркетплейса).
- **#3/#12** — нет JSON-LD `RealEstateListing`/`Offer` и `BreadcrumbList` на
  детальной странице (теряются rich-результаты по недвижимости).
- **#8** — фото рендерятся сырым `<img loading=lazy>` без размеров и `srcset`
  (риск LCP/CLS, тяжёлые payload на мобильных).
- **#5** — `/search` с фильтрами плодит дубли без canonical.

Эти пункты вынесены в отдельный PR поверх ADR-0104, чтобы не раздувать quick-wins.

## Decision

Реализовано **в `apps/client`**:

1. **Динамический `app/sitemap.ts`** — статические роуты (home, `/search?tx=SALE`,
   `/search?tx=RENT`, `/sell`, `/help`, `/map`) + все объявления, у каждой записи
   `alternates.languages` (uz/ru/en/x-default). Объявления собираются постранично
   через существующий `/api/v1/search` (keyset-курсор, limit 100), потолок
   `MAX_PAGES=50` (≈5000 объявлений); при достижении потолка в лог пишется число
   пропущенных (не молчаливый truncate). При ошибке API сайтмап деградирует до
   статических роутов (не 500). Backend не меняли.
2. **JSON-LD на детальной** — `RealEstateListing` + вложенный `Offer`
   (price/priceCurrency/availability/businessFunction = LeaseOut для RENT, Sell
   для SALE), `image`, `datePosted`, `geo`, `address` — через серверный
   `components/seo/JsonLd.tsx` (из ADR-0104). Плюс `BreadcrumbList`.
3. **Видимый breadcrumb** — компонент `components/ui/breadcrumb.tsx`
   (Home › Купить/Аренда › Район › …), тексты через next-intl; JSON-LD
   `BreadcrumbList` зеркалит видимую крошку.
4. **`PhotoImg` → `next/image`** — `components/ui/photo-img.tsx` мигрирован на
   `next/image` с `remotePatterns` (cdn.avino.uz R2 + `**.r2.dev` + unsplash-моки)
   в `next.config.mjs`; явные размеры/`fill`, `priority` для LCP-изображений.
   Затронуты все места показа фото (gallery, lightbox, PropertyCard, MyListings,
   ListingNew, Sell, Districts) — API компонента сохранён.
5. **Canonical для `/search`** — canonical стрипает волатильные параметры
   (`view`/`sort`/пагинация), оставляя семантические `tx`/`type`/`district_id`;
   длиннохвостые комбинации (`priceMin`/`priceMax`/`rooms`) получают
   `robots:{index:false}`, базовые tx/type/district остаются индексируемыми.

## Consequences

Positive:
- Поисковики получают полный фид объявлений с hreflang → быстрая и полная
  индексация long-tail страниц.
- Rich-результаты `RealEstateListing`/`Offer` и breadcrumb в SERP/AI-overview.
- `next/image`: оптимизация (AVIF/WebP, srcset), фикс LCP/CLS, легче мобильный
  payload.
- `/search` перестаёт плодить дубли из комбинаций фильтров.

Negative / trade-offs:
- Sitemap собирает ID через пагинацию `/search` (до 5000); при росте каталога
  >5000 нужен либо рост `MAX_PAGES`, либо лёгкий backend-эндпоинт «all IDs» и/или
  `generateSitemaps` — follow-up.
- `next/image` оптимизирует фото R2 через `/_next/image`; т.к. URL подписанные
  (sign-on-read), кэш-ключ меняется — оптимизатор перефетчивает. Приемлемо; при
  нагрузке рассмотреть стабильный публичный image-route (см. ADR-0104 note).
- Descriptive slugs (#11) и ISR для детальной (#13) — отдельные задачи (требуют
  backend / решения по freshness).

## Related files

- apps/client/src/app/sitemap.ts (new)
- apps/client/src/components/ui/breadcrumb.tsx (new)
- apps/client/next.config.mjs (images.remotePatterns)
- apps/client/src/app/[locale]/listing/[id]/page.tsx (JSON-LD)
- apps/client/src/app/[locale]/search/page.tsx (canonical)
- apps/client/src/components/ui/photo-img.tsx, gallery.tsx, lightbox.tsx
- apps/client/src/features/{detail/Detail.tsx,search/PropertyCard.tsx,account/MyListings.tsx,home/Districts.tsx,listing-new/ListingNew.tsx,sell/Sell.tsx}
- apps/client/messages/{ru,uz,en}.json (breadcrumb i18n)

## Related task

- TASK-SEO-02 (SEO structured data, sitemap, next/image)
