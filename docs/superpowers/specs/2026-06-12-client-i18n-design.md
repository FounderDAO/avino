# Дизайн: i18n публичного портала (TASK-142, apps/client)

Дата: 2026-06-12
Статус: утверждён Team Lead
Задача: TASK-142 — Add i18n foundation (M14, пути задачи относятся к `apps/client` по ADR-0057)

## Цель

Три языка интерфейса (uz/ru/en) для публичного портала `apps/client`:
определение языка браузера, ручной переключатель, персистентность выбора,
полная миграция всех захардкоженных RU-строк. Контент объявлений следует за
языком интерфейса.

## Решения (утверждены Team Lead)

1. **Механизм: next-intl v4 + `[locale]`-роутинг** — в отличие от админки
   (ADR-0056, кастомный контекст без смены URL): портал публичный, нужны
   per-language URL для SEO/hreflang (TASK-183) и серверный рендер сразу на
   нужном языке.
2. **Объём: всё сразу** — фундамент + миграция строк всех страниц в одном PR.
3. **URL-схема: `localePrefix: 'always'`** — `/ru/search`, `/uz/search`,
   `/en/search`; `/` редиректит на локаль по cookie → Accept-Language → ru.
4. **Дефолтная локаль: `ru`** (fallback, когда язык браузера не определён или
   не поддерживается).

## Архитектура

### Роутинг и middleware

- Все роуты переезжают `src/app/*` → `src/app/[locale]/*`
  (7 страниц: `/`, `/search`, `/listing/[id]` (+ not-found), `/sell`,
  `/sell/new`, `/help`, `/account/[tab]`).
- `app/[locale]/layout.tsx` — корневой layout (`<html lang={locale}>`),
  оборачивает в `NextIntlClientProvider`.
- `src/middleware.ts` — next-intl middleware: locale detection
  (cookie `NEXT_LOCALE` → `Accept-Language` → `ru`), редиректы, установка cookie.
- `src/i18n/routing.ts` — `defineRouting({ locales: ['uz','ru','en'],
  defaultLocale: 'ru', localePrefix: 'always' })`.
- `src/i18n/request.ts` — загрузка словаря текущей локали.
- `src/i18n/navigation.ts` — locale-aware `Link`/`useRouter`/`usePathname`/
  `redirect`; все внутренние ссылки в компонентах переходят на эти обёртки.
- `next.config.mjs` — плагин `createNextIntlPlugin`.

### Словари

- `apps/client/messages/{ru,uz,en}.json`.
- Неймспейсы: `common`, `nav`, `footer`, `auth`, `home`, `search`, `listing`,
  `sell`, `listingNew`, `help`, `account`, `errors`.
- RU — источник истины (текущие строки извлекаются как есть); EN и UZ
  (латиница) — первичный перевод, правится в словарях (трейдофф как в ADR-0056).
- Плюрализация/интерполяция — нативный ICU next-intl.

### Компоненты

- Клиентские компоненты — `useTranslations()`; серверные — `getTranslations()`.
- `generateMetadata` (главная, listing detail) — locale-aware (задел под TASK-183).
- `LangSwitcher` — реальное переключение: `useRouter`/`usePathname` из
  `i18n/navigation`, тот же путь + query с новой локалью; cookie ставит middleware.

### Форматирование (`lib/format.ts`)

RU-хардкоды («сум», «м²», «комн», «эт», «Аренда/Продажа», относительные даты
с ручной плюрализацией, `PROPERTY_TYPE_LABELS`) → locale-aware контракт:
подписи и единицы через ключи словаря с ICU-плюралами, относительная дата —
`useFormatter().relativeTime()` из next-intl (ручной `plural()` удаляется).
Числовой форматтер цены остаётся `Intl.NumberFormat`.

### Контент объявлений

API отдаёт перевод листинга по `Accept-Language`/`?lang` с фолбэком на
`original_language` (ADR-005/012). Добавляем `Accept-Language: <локаль UI>`:
- в `baseQuery` (RTK Query);
- в серверный fetch listing detail (`lib/api/listings.ts`).

## Edge cases

- Неизвестная локаль в URL (`/de/...`) → 404 (`notFound()`).
- Отсутствующий ключ перевода → фоллбэк на сам ключ + dev-ворнинг.
- Первый рендер без мерцания: локаль известна на сервере из URL.

## Acceptance criteria (TASK-142 + утверждённые расширения)

- Supports uz/ru/en — все страницы и layout на трёх языках.
- Detects browser language — middleware по `Accept-Language`.
- User can switch language manually — рабочий `LangSwitcher`, путь и query
  сохраняются.
- Language state persists — cookie `NEXT_LOCALE`.
- `Accept-Language` уходит в API, контент объявлений локализован.
- `next build` зелёный; изменения только внутри `apps/client`.

## Git

- Ветка: `feat/client-i18n` (имя из TASKS.md `feat/web-i18n` скорректировано —
  работа в `apps/client`).
- Один PR; ~50 файлов.
- После мержа: TASK-142 → DONE.md; новый ADR — выбор next-intl +
  `[locale]`-роутинг для публичного портала (в противовес ADR-0056 для админки).

## Вне объёма

- hreflang/sitemap/JSON-LD — TASK-183.
- Переводы контента объявлений (серверная механика) — уже есть (ADR-0024/0025).
- Локализация админки — сделана (ADR-0056).
