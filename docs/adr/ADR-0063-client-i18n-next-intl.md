# ADR-0063 — i18n публичного портала (uz/ru/en) на next-intl с [locale]-роутингом

## Status

Accepted

## Date

2026-06-12

## Context

TASK-142 требует три языка интерфейса для публичного портала `apps/client`
(uz/ru/en), определение языка браузера, ручной переключатель и персистентность
выбора (CLAUDE.md §9). До задачи портал был целиком RU-only: ~40 компонентов с
захардкоженными строками, `LangSwitcher` — заглушка с локальным стейтом.

Админка (`apps/web`) решила ту же проблему лёгким кастомным контекстом без
смены URL (ADR-0056) — осознанно «для внутреннего инструмента». Для публичного
портала этот подход не годится:

- первый серверный рендер всегда на дефолтном языке (мерцание после гидрации);
- один URL = один контент для роботов — hreflang/per-language SEO невозможны,
  а TASK-183 явно требует «hreflang for uz/ru/en is set»;
- `generateMetadata` не может быть locale-aware без локали в запросе.

Рассмотренные варианты:
- **next-intl + `[locale]`-роутинг** — per-language URL, SSR сразу на нужном
  языке, ICU из коробки; ценой переноса роутов под `app/[locale]/`.
- **Кастомный i18n как в админке** — ноль зависимостей, но без SSR-локали и SEO.
- **Кастомный + cookie (SSR)** — без мерцания, но по-прежнему один URL на все
  языки, hreflang невозможен.

## Decision

Выбран **next-intl v4 + `[locale]`-роутинг** (утверждено Team Lead; спек —
`docs/superpowers/specs/2026-06-12-client-i18n-design.md`).

- **URL-схема `localePrefix: 'always'`**: `/ru/search`, `/uz/search`,
  `/en/search`; запрос без префикса редиректится middleware по приоритету
  cookie `NEXT_LOCALE` → `Accept-Language` → `ru` (дефолт). Неизвестная локаль
  в URL → 404.
- **Структура**: все роуты в `src/app/[locale]/`; `[locale]/layout.tsx` —
  корневой (`<html lang={locale}>`, `NextIntlClientProvider`,
  `generateStaticParams` по локалям, locale-aware `generateMetadata`).
  `src/i18n/`: `routing.ts` / `request.ts` / `navigation.ts` (locale-aware
  обёртки `Link`/`useRouter`/`usePathname` — все внутренние ссылки через них,
  пути в коде остаются без префикса).
- **Словари**: `apps/client/messages/{ru,uz,en}.json`, ~470 ключей,
  неймспейсы по разделам (common/nav/footer/auth/home/search/listing/sell/
  listingNew/help/account/savedSearch/units/enums). RU — источник истины,
  плюрализация — нативный ICU.
- **Переключатель**: `LangSwitcher` меняет `[locale]`-сегмент через
  `router.replace(pathname, { locale })`, сохраняя путь и query; cookie ставит
  middleware. Query читается в обработчике клика из `window.location.search`
  (не `useSearchParams`) — иначе статический fallback Header требовал бы
  Suspense-границы.
- **Контент объявлений следует за языком UI**: `Accept-Language: <локаль>`
  отправляется и из RTK Query (`baseQuery`, источник — `<html lang>`), и из
  серверного fetch-слоя `lib/api/listings.ts` (параметр `lang` из params
  страницы); API отдаёт перевод листинга с фолбэком на `original_language`
  (ADR-005/012).
- **Форматирование стало locale-aware**: хелперы `lib/format.ts` принимают
  t-функцию неймспейсов `units`/`enums` (паттерн ADR-0056 «хелперы получили
  параметр локали»); `PROPERTY_TYPE_LABELS` заменён ключами `enums.propertyType`;
  модель `Listing.created` (преформатированная RU-строка) заменена на
  `createdAt` (ISO) + рендер через `useFormatter().relativeTime()`; `isFresh`
  считается по дате вместо regex по русскому тексту.

Язык **интерфейса** (этот ADR) не путать с языком **объявления**
(`original_language` + переводы, ADR-0024/0025) — связаны только через
`Accept-Language`.

## Consequences

Positive:
- Три языка с SSR сразу на нужном языке — без мерцания после гидрации.
- Per-language URL: hreflang/sitemap в TASK-183 становятся тривиальными;
  `generateMetadata` локализован уже сейчас.
- Детект браузера + cookie-персистентность «из коробки» middleware.
- ICU-плюрализация вместо ручных `plural()`-функций.
- Язык контента объявлений автоматически совпадает с языком интерфейса.

Negative / trade-offs:
- +1 зависимость (next-intl) и `[locale]`-сегмент во всех URL (`/` → редирект).
- Все внутренние ссылки обязаны идти через обёртки `@/i18n/navigation` —
  прямой `next/link` даст URL без локали (контролируется ревью).
- Качество uz-переводов (латиница) — первичное, правится в `messages/uz.json`.
- Мок-данные (`lib/mock/*`: районы, агенты, демо-пользователь кабинета) не
  локализованы — это данные, ждут geo-reference/profile API.
- Расхождение с админкой: два механизма i18n в монорепо (осознанно — разные
  требования; ADR-0056 остаётся в силе для `apps/web`).

## Related files

- `apps/client/src/i18n/{routing,request,navigation}.ts`, `apps/client/src/middleware.ts`
- `apps/client/next.config.mjs` (плагин next-intl)
- `apps/client/src/app/[locale]/**` (все роуты + корневой layout)
- `apps/client/messages/{ru,uz,en}.json`
- `apps/client/src/components/layout/LangSwitcher.tsx`
- `apps/client/src/store/api/baseQuery.ts`, `apps/client/src/lib/api/listings.ts` (Accept-Language)
- `apps/client/src/lib/format.ts`, `apps/client/src/lib/savedSearch.ts`, `apps/client/src/lib/mock/types.ts` (locale-aware контракт)
- Мигрированные компоненты: `components/layout/*`, `components/ui/*`, `features/{home,search,detail,sell,listing-new,help,account}/*`

## Related task

- TASK-142
