# 🏗️ AVINO WEB — Plan
### Next.js · TypeScript · Tailwind CSS · на паттернах Zillow

---

## СТЕК

| Слой | Технология |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Язык | TypeScript |
| Стили | Tailwind CSS + CSS Variables |
| Компоненты | shadcn/ui + кастомные Avino |
| Состояние | Zustand (UI) + TanStack Query (данные) |
| Карта | Mapbox GL JS |
| Формы | React Hook Form + Zod |
| Auth | NextAuth.js (Google + Email) |
| База данных | PostgreSQL + Prisma ORM |
| Файлы | Cloudinary |
| Деплой | Vercel |

---

## СТАРТ ПРОЕКТА

\`\`\`bash
npx create-next-app@latest avino-web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd avino-web
npx shadcn@latest init

npm install zustand @tanstack/react-query
npm install react-hook-form zod @hookform/resolvers
npm install next-auth @auth/prisma-adapter
npm install @prisma/client prisma
npm install mapbox-gl @types/mapbox-gl
npm install lucide-react
npm install clsx tailwind-merge
npm install cloudinary
\`\`\`

---

## СТРУКТУРА ФАЙЛОВ

\`\`\`
avino-web/
├── src/
│   ├── app/
│   │   ├── page.tsx                    ← Главная
│   │   ├── layout.tsx                  ← Root layout
│   │   ├── buy/
│   │   │   └── page.tsx                ← Выдача покупки (SRP)
│   │   ├── rent/
│   │   │   └── page.tsx                ← Выдача аренды
│   │   ├── homedetails/
│   │   │   └── [id]/
│   │   │       └── page.tsx            ← Детальная карточка
│   │   ├── agents/
│   │   │   ├── page.tsx                ← Поиск агентов
│   │   │   └── [id]/
│   │   │       └── page.tsx            ← Профиль агента
│   │   ├── mortgage/
│   │   │   └── page.tsx                ← Ипотечный калькулятор
│   │   ├── account/
│   │   │   ├── favorites/page.tsx
│   │   │   ├── saved-searches/page.tsx
│   │   │   └── inbox/page.tsx
│   │   └── api/
│   │       ├── listings/route.ts
│   │       ├── agents/route.ts
│   │       └── auth/[...nextauth]/route.ts
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── ui/                         ← shadcn/ui + кастомные
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Chip.tsx
│   │   ├── search/
│   │   │   ├── SearchBar.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   ├── FilterChip.tsx
│   │   │   └── SortDropdown.tsx
│   │   ├── map/
│   │   │   ├── MapView.tsx
│   │   │   ├── PricePin.tsx
│   │   │   └── BoundaryDraw.tsx
│   │   ├── property/
│   │   │   ├── PropertyCard.tsx        ← variant: hero | srp
│   │   │   ├── PropertyCarousel.tsx
│   │   │   ├── PhotoGallery.tsx
│   │   │   ├── PriceBlock.tsx
│   │   │   ├── ContactSidebar.tsx
│   │   │   ├── FactsGrid.tsx
│   │   │   ├── BadgeOverlay.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── PriceCutBadge.tsx
│   │   │   └── EstPaymentStrip.tsx
│   │   └── agent/
│   │       ├── AgentCard.tsx
│   │       └── AgentSearch.tsx
│   │
│   ├── lib/
│   │   ├── utils.ts                    ← clsx + tailwind-merge
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   └── mapbox.ts
│   │
│   ├── hooks/
│   │   ├── useListings.ts
│   │   ├── useFilters.ts
│   │   └── useMap.ts
│   │
│   ├── store/
│   │   ├── filterStore.ts              ← Zustand
│   │   └── mapStore.ts
│   │
│   ├── types/
│   │   ├── listing.ts
│   │   ├── agent.ts
│   │   └── filter.ts
│   │
│   └── styles/
│       ├── globals.css                 ← CSS Variables + Tailwind
│       └── tokens.css                  ← Дизайн-токены
│
├── prisma/
│   └── schema.prisma
├── public/
└── .env.local
\`\`\`

---

## ДИЗАЙН-СИСТЕМА (CSS ТОКЕНЫ)

> Файл: src/styles/tokens.css

\`\`\`css
:root {
  /* ── Brand ─────────────────────────────── */
  --color-primary:          #0041D9;
  --color-action:           #006AFF;
  --color-primary-light:    #65B4FF;
  --color-teal:             #004550;
  --color-mint:             #9FF17B;
  --color-dark-green:       #136F65;

  /* ── Text ──────────────────────────────── */
  --color-text-primary:     #2A2A33;
  --color-text-dark:        #11111A;
  --color-text-secondary:   #596B82;
  --color-text-tertiary:    #D1D1D5;
  --color-text-link:        #0D4599;

  /* ── Backgrounds ───────────────────────── */
  --color-bg-white:         #FFFFFF;
  --color-bg-gray:          #F7F7F7;
  --color-bg-gray-subtle:   #F1F1F4;
  --color-bg-cream:         #FAF9F5;
  --color-bg-filter-active: #F2FAFF;
  --color-bg-payment:       #E0F2FF;
  --color-bg-light-blue:    #E2F0FF;

  /* ── Status ────────────────────────────── */
  --color-error:            #A3000B;
  --color-price-cut-bg:     #FFE3E2;
  --color-team-badge-bg:    #FFF8E1;
  --color-team-badge-text:  #8A5700;

  /* ── Borders ───────────────────────────── */
  --color-border:           #D1D1D5;
  --color-border-subtle:    #A7A6AB;
  --color-border-active:    #006AFF;
  --color-separator:        #EEEEF0;

  /* ── Border Radius ─────────────────────── */
  --radius-chip:            4px;
  --radius-card:            4px;
  --radius-card-hero:       12px;
  --radius-button:          12px;
  --radius-button-compact:  4px;
  --radius-sidebar:         11px;
  --radius-pill:            999px;
  --radius-tag:             12px;

  /* ── Shadows ───────────────────────────── */
  --shadow-card:      0px 2px 4px rgba(0,0,0,0.30);
  --shadow-card-hero: 0px 4px 15px rgba(0,0,0,0.15);
  --shadow-map-pin:   0px 2px 2px rgba(0,0,0,0.25);

  /* ── Spacing (base: 8px) ───────────────── */
  --space-2:   2px;
  --space-4:   4px;
  --space-8:   8px;
  --space-12:  12px;
  --space-16:  16px;
  --space-20:  20px;
  --space-24:  24px;
  --space-32:  32px;
  --space-48:  48px;

  /* ── Typography ────────────────────────── */
  --font-ui:        'Inter', 'Adjusted Arial', sans-serif;
  --font-display:   'Nunito', 'Inter', sans-serif;

  --text-hero:      60px;
  --text-h1:        44px;
  --text-h2:        32px;
  --text-h3:        24px;
  --text-h4:        20px;
  --text-h5:        16px;
  --text-body:      16px;
  --text-small:     14px;
  --text-caption:   12px;
  --text-micro:     10px;

  /* ── Component Dimensions ──────────────── */
  --header-height:        80px;
  --sidebar-width:        77px;
  --filter-bar-height:    36px;
  --btn-primary-height:   56px;
  --btn-action-height:    60px;
  --btn-secondary-height: 44px;
  --search-input-height:  72px;
  --card-srp-width:       351px;
  --card-hero-width:      345px;
  --contact-sidebar-width: 311px;
}
\`\`\`

---

## ТИПОГРАФИКА — TAILWIND CONFIG

> Файл: tailwind.config.ts

\`\`\`ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        primary:    '#0041D9',
        action:     '#006AFF',
        teal:       '#004550',
        mint:       '#9FF17B',
        'dark-green': '#136F65',
        text: {
          primary:   '#2A2A33',
          dark:      '#11111A',
          secondary: '#596B82',
          tertiary:  '#D1D1D5',
          link:      '#0D4599',
        },
        bg: {
          white:    '#FFFFFF',
          gray:     '#F7F7F7',
          subtle:   '#F1F1F4',
          cream:    '#FAF9F5',
          filter:   '#F2FAFF',
          payment:  '#E0F2FF',
        },
        border: {
          DEFAULT: '#D1D1D5',
          subtle:  '#A7A6AB',
          active:  '#006AFF',
          sep:     '#EEEEF0',
        },
        error:    '#A3000B',
        'price-cut': '#FFE3E2',
      },
      fontFamily: {
        ui:      ['Inter', 'sans-serif'],
        display: ['Nunito', 'sans-serif'],
      },
      fontSize: {
        'hero': ['60px', { lineHeight: '72px', fontWeight: '700' }],
        'h1':   ['44px', { lineHeight: '52px', fontWeight: '700' }],
        'h2':   ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'h3':   ['24px', { lineHeight: '32px', fontWeight: '700' }],
        'h4':   ['20px', { lineHeight: '28px', fontWeight: '700' }],
        'price-lg': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'price-card': ['20px', { lineHeight: '24px', fontWeight: '700' }],
      },
      borderRadius: {
        'chip':    '4px',
        'card':    '4px',
        'hero':    '12px',
        'button':  '12px',
        'sidebar': '11px',
        'pill':    '999px',
        'tag':     '12px',
      },
      boxShadow: {
        'card':      '0px 2px 4px rgba(0,0,0,0.30)',
        'card-hero': '0px 4px 15px rgba(0,0,0,0.15)',
        'map-pin':   '0px 2px 2px rgba(0,0,0,0.25)',
      },
      height: {
        'header':     '80px',
        'filter-bar': '36px',
        'btn-lg':     '56px',
        'btn-action': '60px',
        'btn-md':     '44px',
        'search':     '72px',
      },
      width: {
        'sidebar':  '77px',
        'card-srp': '351px',
        'card-hero': '345px',
        'contact':  '311px',
      },
    },
  },
  plugins: [],
}

export default config
\`\`\`

---

## ТИПЫ (TypeScript)

> Файл: src/types/listing.ts

\`\`\`ts
export interface Listing {
  id: string
  price: number
  address: {
    street: string
    city: string
    state: string
    zip: string
    lat: number
    lng: number
  }
  beds: number
  baths: number
  sqft: number
  propertyType: 'house' | 'condo' | 'townhouse' | 'land' | 'apartment'
  status: 'active' | 'pending' | 'sold'
  photos: string[]
  description: string
  features: {
    interior?: Record<string, string[]>
    property?: Record<string, string[]>
    financial?: Record<string, string>
  }
  agent: {
    id: string
    name: string
    company: string
    phone?: string
    photo?: string
  }
  listedAt: Date
  daysOnMarket: number
  views?: number
  saves?: number
  estimatedPayment?: number
  priceHistory?: { date: Date; price: number }[]
  zestimate?: number
  pricePerSqft?: number
  lotSize?: number
  yearBuilt?: number
  hoa?: number
}

export interface ListingFilters {
  type: 'buy' | 'rent'
  priceMin?: number
  priceMax?: number
  bedsMin?: number
  bathsMin?: number
  propertyTypes?: string[]
  sqftMin?: number
  sqftMax?: number
  yearBuiltMin?: number
  hasGarage?: boolean
  hasPool?: boolean
  sortBy: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'sqft'
}
\`\`\`

---

## СТРАНИЦЫ И КОМПОНЕНТЫ — ДЕТАЛИ

### 1. Главная (/)

**Layout:**
\`\`\`
Header (80px)
  └─ Logo | Nav: Buy/Rent/Sell/Mortgage/Agents | Auth
Hero Section
  └─ bg-image | H1 (60px/700) | SearchBar (72px h)
PropertyCarousel
  └─ H2 "Homes For You" | prev/next | cards (345px)
CTATriptych
  └─ 3 cols: Buy/Rent/Sell + CTA button each
Footer
\`\`\`

**Компоненты:**
- `<Header>` — height 80px, bg white, shadow on scroll
- `<SearchBar>` — input 72px + submit btn, radius 12px
- `<PropertyCarousel>` — snap scroll, 345px cards
- `<PropertyCard variant="hero">` — radius 12px, shadow-hero
- `<BadgeOverlay>` — pill rgba(0,0,0,0.6)
- `<CTATriptych>` — 3 col grid

---

### 2. Выдача — SRP (/buy, /rent)

**Layout:**
\`\`\`
Header
FilterBar (36px)
  └─ SearchInput | ForSale▾ | Price▾ | Beds▾ | Type▾ | Filters▾ | SaveSearch
SplitView (flex row-reverse)
  ├─ MapPanel (534px → 40%)
  │    └─ GoogleMap/Mapbox + PricePins + BoundaryBtn + Controls
  └─ ListPanel (750px → 60%, overflow-y scroll)
       ├─ H1 "Real Estate..." | Count | SortBtn
       └─ Grid 2-col PropertyCards (351px)
\`\`\`

**Компоненты:**
- `<FilterBar>` — height 36px, flex, border-bottom
- `<FilterChip>` — active: bg #F2FAFF + border 2px #006AFF
- `<SaveSearchBtn>` — bg #006AFF, h 36px, radius 4px
- `<MapView>` — Mapbox GL
- `<PricePin>` — bg #A3000B, pill, shadow-map-pin
- `<PropertyCard variant="srp">` — 351×281px, radius 4px

---

### 3. Детальная (/homedetails/[id])

**Layout:**
\`\`\`
Header (Back to search + Save/Share/Hide/More)
PhotoGallery (grid 4-col, gap 8px, h 445px)
  └─ "See all X photos" btn
PriceSection
  ├─ LEFT: StatusBadge | PriceCutBadge | Price (32px) | Stats | Address | EstPayment
  └─ RIGHT: ContactSidebar (311px, border, radius 11px)
       ├─ RequestTourBtn (h 60px, #006AFF)
       └─ ContactAgentBtn (h 44px, outline)
StatsRow (days on Zillow | views | saves)
OverviewGrid (3-col tiles: icon + label)
FactsAccordion (Interior | Property | Financial)
MortgageCalculator
NearbyListings
\`\`\`

---

### 4. Агенты (/agents)

**Layout:**
\`\`\`
Hero (bg-image) + H1 (60px/700/white)
SearchCard (white card, Location|Name tabs + input)
H3 + subtext
AgentCards Grid (2-col, 612px cards)
\`\`\`

**Стили agent card:**
- bg white, border 1px #D1D1D5, radius 4px
- box-shadow: shadow-card
- padding 24px
- photo: 160×160px square

---

## PRISMA SCHEMA

> Файл: prisma/schema.prisma

\`\`\`prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  favorites     Favorite[]
  savedSearches SavedSearch[]
  createdAt     DateTime  @default(now())
}

model Listing {
  id            String    @id @default(cuid())
  price         Int
  street        String
  city          String
  state         String
  zip           String
  lat           Float
  lng           Float
  beds          Int
  baths         Float
  sqft          Int
  propertyType  String
  status        String    @default("active")
  photos        String[]
  description   String?
  agentId       String
  agent         Agent     @relation(fields: [agentId], references: [id])
  listedAt      DateTime  @default(now())
  favorites     Favorite[]
}

model Agent {
  id       String    @id @default(cuid())
  name     String
  company  String
  phone    String?
  photo    String?
  listings Listing[]
  rating   Float?
  reviews  Int?
}

model Favorite {
  id        String   @id @default(cuid())
  userId    String
  listingId String
  user      User     @relation(fields: [userId], references: [id])
  listing   Listing  @relation(fields: [listingId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, listingId])
}

model SavedSearch {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  name      String
  filters   Json
  createdAt DateTime @default(now())
}
\`\`\`

---

## ENV VARIABLES

> Файл: .env.local

\`\`\`env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/avino"

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Map
NEXT_PUBLIC_MAPBOX_TOKEN=""

# Media
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""
\`\`\`

---

## ТАЙМЛАЙН

| Неделя | Задачи |
|--------|--------|
| 1 | Дизайн-система + tokens.css + tailwind.config + Header + Footer |
| 2 | Главная страница (Hero + SearchBar + Carousel + CTA) |
| 3 | Выдача SRP (FilterBar + MapView + PropertyCard) |
| 4 | Детальная карточка (Gallery + PriceBlock + ContactSidebar) |
| 5 | Auth (NextAuth) + Избранное + Сохранённые поиски |
| 6 | Агенты + Профиль агента + Ипотечный калькулятор |
| 7 | SEO (metadata, sitemap, JSON-LD) + Деплой на Vercel |

---

## SEO CHECKLIST

- [ ] generateMetadata() на каждой странице
- [ ] JSON-LD Schema (RealEstateListing)
- [ ] sitemap.xml (auto-generated)
- [ ] robots.txt
- [ ] Open Graph images
- [ ] Canonical URLs
- [ ] generateStaticParams для популярных городов

---

## БЫСТРЫЙ СТАРТ

\`\`\`bash
# 1. Создать проект
npx create-next-app@latest avino-web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd avino-web

# 2. Установить зависимости
npm install zustand @tanstack/react-query @tanstack/react-query-devtools
npm install react-hook-form zod @hookform/resolvers
npm install next-auth @auth/prisma-adapter
npm install @prisma/client prisma
npm install mapbox-gl @types/mapbox-gl react-map-gl
npm install lucide-react
npm install clsx tailwind-merge
npm install cloudinary
npm install @next/font

# 3. Инициализировать shadcn
npx shadcn@latest init

# 4. Инициализировать Prisma
npx prisma init

# 5. Запустить dev сервер
npm run dev
\`\`\`

---

*Создано на основе анализа дизайна Zillow — паттерны UI/UX, без копирования контента и бренда.*
