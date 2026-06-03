# 🏗️ AVINO WEB — Plan

### Next.js · TypeScript · Tailwind CSS · RTK Query · Yandex Maps

> **Дизайн-референс — Zillow** (UX-паттерны: карта+список, карточки объектов,
> фильтры, страница объекта, флоу поиска). Вёрстка и компоненты — собственные,
> **без копирования бренда, логотипа, шрифтов, фото и текстов Zillow**.
> Палитра отстраивается под бренд Avino.
>
> ⚠️ **Источник истины — `docs/CLAUDE.md`, `docs/API.md`, `docs/DB_SCHEMA.md`,
> `docs/ROADMAP.md` (milestone M14).** Если этот файл им противоречит — правила
> выше приоритетнее. Прошлая редакция плана (Zustand/TanStack/Mapbox/NextAuth/
> web-Prisma/Cloudinary) была черновиком и **отменена** — см. §0.

---

## 0. Архитектурные решения (отмена черновика)

`apps/web` — это **только клиент**. Он не имеет своей БД и не делает auth сам —
он ходит в NestJS-бэкенд `apps/api` по REST `/api/v1`. Тот же API использует
будущее Flutter-приложение.

```
apps/api (NestJS + Prisma + PostGIS + Redis + BullMQ + S3)
        │  REST /api/v1   (контракт в docs/API.md)
        ├──────────────► apps/web   (Next.js, RTK Query)   ← этот план
        └──────────────► Flutter mobile (позже)
```

| Тема | Черновик (ОТМЕНЁН) | Действующее решение | Основание |
|---|---|---|---|
| Данные/API | Zustand + TanStack Query | **RTK Query**, слой `store/api/*`, никаких `fetch`/`axios` в компонентах | CLAUDE.md §3,§4 |
| Карты | Mapbox GL | **Yandex Maps JS API** | CLAUDE.md §12 |
| Auth | NextAuth (Google/Email) | **OTP через backend** (`/api/v1/auth/otp/*`), SMS Eskiz | CLAUDE.md §3, API.md §3 |
| БД во web | свой Prisma + `app/api/*` route handlers | web **не имеет** БД и Prisma | ARCHITECTURE.md |
| Файлы | Cloudinary | **S3** через backend (presign/confirm) | API.md §8 |
| Модель Listing | US-поля (zip, state, zestimate) | реальная схема Avino (UZS/USD, регионы UZ, PostGIS, TOP/VIP) | DB_SCHEMA.md |
| Локали | en | **uz / ru / en** + автоопределение | CLAUDE.md §9 |

---

## 1. Стек

| Слой | Технология |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Язык | TypeScript |
| Стили | Tailwind CSS + CSS-переменные (дизайн-токены) |
| Компоненты | собственные Avino UI + (опц.) headless-примитивы (Radix) |
| Глобальное состояние | Redux Toolkit |
| Серверные данные / API | **RTK Query** (`store/api/*`) |
| UI-состояние (фильтры, карта, модалки) | RTK slices (`store/slices/*`) |
| Карта | **Yandex Maps JS API** |
| Формы | React Hook Form + Zod |
| Auth | OTP backend (`/api/v1/auth/*`), access+refresh токены |
| i18n | uz / ru / en (next-intl или собственный `t(key, lang)`) |
| Деплой | согласовать (Vercel / VPS) — решение Team Lead |

Зависимости уже в `apps/web/package.json`: `next`, `react`, `@reduxjs/toolkit`,
`react-redux`, `@avino/shared`. Доустановить по ходу: `react-hook-form`, `zod`,
`@hookform/resolvers`, Yandex Maps loader, i18n-библиотека, `clsx`,
`tailwind-merge`, `lucide-react`, `tailwindcss` + `postcss` + `autoprefixer`.

---

## 2. Структура файлов (`apps/web`)

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx                  ← Root layout (Providers, Header, Footer)
│   │   ├── page.tsx                    ← Главная
│   │   ├── sale/page.tsx               ← Выдача «Купить» (split map+list)
│   │   ├── rent/page.tsx               ← Выдача «Аренда»
│   │   ├── listing/
│   │   │   ├── [id]/page.tsx           ← Детальная карточка
│   │   │   ├── new/page.tsx            ← Создание объявления
│   │   │   └── [id]/edit/page.tsx      ← Редактирование
│   │   └── account/
│   │       ├── listings/page.tsx       ← Мои объявления (owner/agent)
│   │       ├── favorites/page.tsx
│   │       ├── saved-searches/page.tsx
│   │       ├── inbox/page.tsx          ← Чат
│   │       └── notifications/page.tsx
│   │
│   ├── components/
│   │   ├── layout/                     ← Header, Footer, LanguageSwitcher
│   │   ├── ui/                         ← Button, Badge, Card, Input, Chip, Modal
│   │   ├── search/                     ← SearchBar, FilterBar, FilterChip, SortDropdown
│   │   ├── map/                        ← YandexMap, PricePin, ClusterLayer, BoundsControl
│   │   ├── property/                   ← PropertyCard, PhotoGallery, PriceBlock,
│   │   │                                 ContactSidebar, FactsGrid, PromotionBadge
│   │   ├── auth/                       ← OtpRequestForm, OtpVerifyForm, AuthGuard
│   │   └── chat/                       ← ThreadList, MessageList, MessageInput
│   │
│   ├── store/
│   │   ├── index.ts                    ← configureStore
│   │   ├── api/
│   │   │   ├── baseApi.ts              ← fetchBaseQuery + auth header + refresh
│   │   │   ├── authApi.ts
│   │   │   ├── usersApi.ts
│   │   │   ├── listingsApi.ts
│   │   │   ├── searchApi.ts
│   │   │   ├── mediaApi.ts
│   │   │   ├── favoritesApi.ts
│   │   │   ├── savedSearchesApi.ts
│   │   │   ├── chatApi.ts
│   │   │   ├── notificationsApi.ts
│   │   │   └── adminApi.ts
│   │   └── slices/
│   │       ├── filterSlice.ts          ← состояние фильтров выдачи
│   │       ├── mapSlice.ts             ← bounds, центр, зум, выбранный пин
│   │       └── authSlice.ts            ← токены, текущий пользователь
│   │
│   ├── features/                       ← фичевые композиции (по CLAUDE.md §4)
│   ├── lib/                            ← utils, yandexMaps loader, i18n
│   ├── i18n/                           ← uz.json, ru.json, en.json
│   └── styles/
│       ├── globals.css                 ← Tailwind + CSS-переменные
│       └── tokens.css                  ← дизайн-токены
│
├── public/
├── tailwind.config.ts
└── .env.local
```

---

## 3. Дизайн-система (CSS-токены)

> Файл: `src/styles/tokens.css`. Базис Zillow-подобный; **бренд-цвета Avino
> подбираются отдельно**, чтобы не было визуального клона.

```css
:root {
  /* ── Brand (placeholder — отстроить под Avino) ── */
  --color-primary:          #0041D9;
  --color-action:           #006AFF;
  --color-primary-light:    #65B4FF;

  /* ── Text ── */
  --color-text-primary:     #2A2A33;
  --color-text-dark:        #11111A;
  --color-text-secondary:   #596B82;
  --color-text-tertiary:    #D1D1D5;
  --color-text-link:        #0D4599;

  /* ── Backgrounds ── */
  --color-bg-white:         #FFFFFF;
  --color-bg-gray:          #F7F7F7;
  --color-bg-gray-subtle:   #F1F1F4;
  --color-bg-filter-active: #F2FAFF;

  /* ── Status / Promotion ── */
  --color-error:            #A3000B;
  --color-vip:              #8A5700;   /* VIP бейдж */
  --color-vip-bg:           #FFF8E1;
  --color-top:              #0041D9;   /* TOP бейдж */

  /* ── Borders ── */
  --color-border:           #D1D1D5;
  --color-border-active:    #006AFF;
  --color-separator:        #EEEEF0;

  /* ── Radius ── */
  --radius-card:            8px;
  --radius-button:          12px;
  --radius-pill:            999px;

  /* ── Spacing (base 8px) ── */
  --space-4: 4px;  --space-8: 8px;  --space-12: 12px; --space-16: 16px;
  --space-24: 24px; --space-32: 32px; --space-48: 48px;

  /* ── Typography ── */
  --font-ui: 'Inter', system-ui, sans-serif;
  --text-hero: 60px; --text-h1: 44px; --text-h2: 32px; --text-h3: 24px;
  --text-h4: 20px; --text-body: 16px; --text-small: 14px; --text-caption: 12px;

  /* ── Component dims ── */
  --header-height: 72px;
  --filter-bar-height: 56px;
  --search-input-height: 64px;
  --contact-sidebar-width: 320px;
}
```

`tailwind.config.ts` маппит эти токены в `theme.extend` (colors / fontSize /
borderRadius / boxShadow / spacing). Деталь — на этапе TASK-140.

---

## 4. Доменные типы (из реальной схемы)

> Источник — `apps/api/prisma/schema.prisma` + `API.md`. Общие типы держим в
> `packages/shared`, чтобы web и (позже) mobile-SDK переиспользовали контракт.

```ts
export type Language = 'UZ' | 'RU' | 'EN'
export type Currency = 'UZS' | 'USD'
export type TransactionType = 'SALE' | 'RENT'
export type PropertyType = 'APARTMENT' | 'HOUSE' | 'NEW_BUILDING' | 'LAND' | 'COMMERCIAL'
export type ListingStatus = 'NEW' | 'ACTIVE' | 'DRAFT' | 'REJECTED' | 'DELETED' | 'ARCHIVED' | 'SOLD' | 'RENTED'
export type PromotionType = 'NORMAL' | 'TOP' | 'VIP'

export interface ListingMedia {
  id: string
  url: string
  thumbnailUrl?: string
  sortOrder: number
  width?: number
  height?: number
}

export interface ListingTranslation {
  language: Language
  title: string
  description?: string
  addressNote?: string
  featuresText?: string
}

export interface Listing {
  id: string
  ownerId: string
  agencyId?: string
  transactionType: TransactionType
  propertyType: PropertyType
  status: ListingStatus
  originalLanguage: Language
  price: string            // Decimal → string, НЕ number (деньги)
  currency: Currency
  area?: string
  rooms?: number
  floor?: number
  totalFloors?: number
  yearBuilt?: number
  address?: string
  cityId?: string
  districtId?: string
  latitude?: number
  longitude?: number
  promotionType: PromotionType
  promotionExpiresAt?: string
  publishedAt?: string
  createdAt: string
  // join'ы (зависит от endpoint):
  translations?: ListingTranslation[]
  media?: ListingMedia[]
}

export interface ListingFilters {
  transactionType: TransactionType
  propertyType?: PropertyType[]
  priceMin?: number
  priceMax?: number
  currency?: Currency
  roomsMin?: number
  areaMin?: number
  areaMax?: number
  cityId?: string
  districtId?: string
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest'
}
```

> **Финансы — `Decimal` → строка** на фронте (см. stack-preferences: деньги не
> `Float`). Форматирование UZS/USD — через `Intl.NumberFormat`.

---

## 5. Привязка страниц к API (RTK Query)

Все запросы — через RTK Query. Каждый эндпоинт из `API.md` имеет свой slice.

| Страница / фича | Endpoint(ы) `API.md` | Slice |
|---|---|---|
| Главная (карусель) | `GET /api/v1/search` (TOP/VIP в приоритете) | `searchApi` |
| `/sale`, `/rent` (список) | `GET /api/v1/search` (фильтры, пагинация, сорт) | `searchApi` |
| Карта в выдаче | `GET /api/v1/search/bounds`, `/clusters`, `/near-me`, `/radius` | `searchApi` |
| `/listing/[id]` | `GET /api/v1/listings/:id`, `/:id/translations` | `listingsApi` |
| Создание/редакт. | `POST/PATCH /api/v1/listings`, `DELETE /:id` | `listingsApi` |
| Загрузка медиа | `POST /:id/media/presign` → S3 → `/:id/media/confirm`, `/reorder`, `DELETE /:mediaId` | `mediaApi` |
| Мои объявления | `GET /api/v1/listings/mine` | `listingsApi` |
| Auth (OTP) | `POST /auth/otp/request`, `/otp/verify`, `/refresh`, `/logout`, `GET /auth/me` | `authApi` |
| Профиль | `GET/PATCH /api/v1/users/me`, `/me/profile` | `usersApi` |
| Избранное | `GET/POST /favorites`, `DELETE /favorites/:listingId` | `favoritesApi` |
| Сохр. поиски | `GET/POST /saved-searches`, `PATCH/DELETE /:id` | `savedSearchesApi` |
| Чат | `GET/POST /chat/threads`, `GET/POST /:id/messages`, `POST /:id/read` | `chatApi` |
| Уведомления | `GET /notifications`, `POST /:id/read`, `/read-all`, devices | `notificationsApi` |
| Промо (display) | поля `promotionType`/`promotionExpiresAt` в listing | — |

**`baseApi.ts`**: `fetchBaseQuery` с `baseUrl = NEXT_PUBLIC_API_URL + '/api/v1'`,
`prepareHeaders` добавляет `Authorization: Bearer <access>` и `Accept-Language`
(текущая локаль); обёртка делает silent refresh через `/auth/refresh` при 401.

**Чат и уведомления в MVP — polling** (RTK Query `pollingInterval`), WebSocket
позже без смены контракта (CLAUDE.md §10).

---

## 6. Карта страниц Zillow → Avino

| Zillow | Avino | Примечание |
|---|---|---|
| `/` главная | `/` hero + поиск + карусель | TOP/VIP вверху |
| `/buy` | `/sale` | `transactionType=SALE` |
| `/rent` | `/rent` | `transactionType=RENT` |
| `/homedetails/[id]` | `/listing/[id]` | галерея + факты + контакты |
| Sell / создание | `/listing/new` | модерация: статус `NEW` → ACTIVE/DRAFT/REJECTED |
| account: saved/favorites/inbox | `/account/*` | favorites, saved-searches, inbox, notifications |
| `/agents` (каталог агентов) | — | **вне MVP**: публичного endpoint нет в API.md (Phase 1.5) |
| `/mortgage` (калькулятор) | — | **опционально**: client-only калькулятор, без API |

> Недостающие у Avino, но желаемые «как на Zillow» элементы (каталог агентов,
> ипотечный калькулятор, ценовая история/оценка) фиксируются как **Phase 1.5**
> и требуют новых backend-endpoint'ов → отдельное согласование с Team Lead.

---

## 7. Ключевые страницы — состав

### Главная (`/`)
Header → Hero (H1 + SearchBar) → карусель «Рекомендуем» (TOP/VIP) →
блок «Купить / Снять / Разместить» → Footer.

### Выдача (`/sale`, `/rent`)
Header → FilterBar (поиск, тип сделки, цена, комнаты, тип недвижимости,
ещё фильтры, «Сохранить поиск») → split-view: список `PropertyCard` (60%) +
`YandexMap` с пинами/кластерами (40%). Синхронизация bounds карты ↔ выдача.

### Детальная (`/listing/[id]`)
Header (назад, избранное, поделиться) → `PhotoGallery` → слева: цена,
`PromotionBadge`, характеристики, адрес; справа `ContactSidebar` (написать —
создаёт `chat/thread`) → факты (Interior/Property/Financial) → похожие рядом.

### Создание (`/listing/new`)
Многошаговая форма (RHF + Zod): тип сделки/недвижимости → параметры → цена →
адрес + точка на **Yandex-карте** (координаты только с карты, не из EXIF) →
загрузка фото (presign→S3→confirm, reorder) → язык оригинала. Сабмит → `NEW`
(в очередь модерации). Автоперевод на остальные языки — на стороне backend.

### Account
favorites / saved-searches / inbox (чат, polling) / notifications / my listings
(owner/agent dashboard со статусами и промо).

---

## 8. i18n (uz / ru / en)

- Дефолт-язык: по `navigator.language` / `Accept-Language`, переключение вручную
  (CLAUDE.md §9), выбор персистится (cookie/localStorage).
- Все user-facing строки — через `t(key, lang)`, без хардкода (stack-preferences).
- Каждый запрос к API шлёт `Accept-Language`; контент объявления берётся из
  `translations[lang]` с фолбэком на `originalLanguage`.

---

## 9. Env (`apps/web/.env.local`)

```env
NEXT_PUBLIC_API_URL="http://localhost:3001"   # базовый URL NestJS API
NEXT_PUBLIC_YANDEX_MAPS_API_KEY=""            # Yandex Maps JS API
```

> Никаких секретов БД/S3/SMS во web — это всё на backend. Во web только
> публичный URL API и публичный ключ карт.

---

## 10. Разбивка на задачи (уже заведены в TASKS.md)

> Эти задачи **уже существуют** в `docs/TASKS.md` (M14 web foundation +
> M15 web user features + M16 web admin). Здесь — их связь со страницами/API.
> Порядок: каждая = ветка + 1–3 коммита + PR, без прямого пуша в main.

**M14 — Web foundation**

| TASK | Ветка | Содержание | Зависит |
|---|---|---|---|
| **140** | `feat/web-foundation` | Скаффолд Next.js App Router + Tailwind + токены, базовый layout | TASK-010 |
| **141** | `feat/web-rtk-query` | Redux store + RTK Query `baseApi` (`baseUrl=/api/v1`), Provider | TASK-140 |
| **142** | `feat/web-i18n` | i18n uz/ru/en, автоопределение, `LanguageSwitcher`, персист | TASK-140 |

**M15 — Web user features**

| TASK | Ветка | Содержание | Зависит |
|---|---|---|---|
| **150** | `feat/web-auth` | OTP-флоу (`authApi`): request/verify, токены, auth-state | 141, 042 |
| **151** | `feat/web-listing-search` | `/sale` `/rent`: `FilterBar`, `PropertyCard`, сорт (promotion-priority), пагинация (`searchApi`) | 141, 080, 081 |
| **152** | `feat/web-map-search` | `YandexMap`: маркеры, bounds-поиск (`/api/v1/search/map`), превью по клику | 151, 083 |
| **153** | `feat/web-listing-detail` | `/listing/[id]`: галерея, переводы по языку, `PromotionBadge`, чат-CTA | 141, 051 |
| **154** | `feat/web-listing-create` | Создание: форма + точка на карте → статус `NEW` + сообщение о модерации | 050, 142 |
| **155** | `feat/web-favorites-saved-searches` | Избранное + сохранённые поиски (`favoritesApi`, `savedSearchesApi`) | 090, 091, 151 |
| **156** | `feat/web-chat` | Inbox: треды + сообщения (polling), только для авторизованных (`chatApi`) | 110, 111, 141 |

**M16 — Web admin** (TASK-160 layout, 161 модерация листингов, 162 промо) — отдельно.

**Зависимости от backend:** web-задачи требуют соответствующих backend-задач
(в скобках). Где endpoint ещё не готов — страница строится по контракту `API.md`,
интеграция включается по готовности backend.

### Добавленные задачи (бывшие пробелы)

«Как на Zillow» элементы, которых не было в исходном списке, заведены в TASKS.md:

| TASK | Ветка | Содержание | Зависит |
|---|---|---|---|
| **157** | `feat/web-homepage` | Главная: Hero + `SearchBar` + карусель TOP/VIP (`searchApi`) | 142, 151 |
| **158** | `feat/web-notifications` | `/account/notifications`: список + read/read-all, polling | 100, 141 |
| **159** | `feat/web-dashboard` | `/account/listings`: owner/agent dashboard (`GET /listings/mine`) | 052, 150 |
| **183** | `feat/web-seo` | `generateMetadata`, JSON-LD `RealEstateListing`, sitemap, robots, hreflang | 151, 153 |

**Вне MVP (Phase 1.5, требует новых backend-endpoint + согласования):** каталог
агентов (`/agents`), ипотечный калькулятор, ценовая история/оценка.

---

## 11. Критерии приёмки M14 (из ROADMAP §19)

- [ ] Пользователь просматривает объявления
- [ ] Поиск по фильтрам работает
- [ ] Детальная карточка открывается
- [ ] Создание объявления работает (→ модерация `NEW`)
- [ ] Чат работает
- [ ] Избранное и сохранённые поиски работают
- [ ] Переключатель языка (uz/ru/en) работает
- [ ] Весь API-доступ — через RTK Query, без `fetch`/`axios` в компонентах

---

## 12. SEO-checklist

- [ ] `generateMetadata()` на каждой странице (с учётом локали)
- [ ] JSON-LD `RealEstateListing` на детальной
- [ ] `sitemap.xml` (авто) + `robots.txt`
- [ ] Open Graph изображения, canonical, hreflang (uz/ru/en)

---

*План согласован с docs/CLAUDE.md, docs/API.md, docs/DB_SCHEMA.md, docs/ROADMAP.md
(M14). Zillow используется как референс UI/UX, без копирования бренда и контента.*
