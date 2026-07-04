# ADR-0124 — Viewport-driven поиск на /search (Zillow-режим карты)

## Status

Accepted

## Date

2026-07-04

## Context

На /search карта была пассивной витриной SSR-выдачи: пан/зум не влияли на
список, клик по пину лишь подсвечивал карточку. Пользователи ожидают
Zillow-поведение: список = видимая область карты, клик по пину — превью,
клик по превью — модалка деталей. На /map это уже работало (bounds-поиск,
превью, intercepting-модалка), но логика была приватной для MapSearch.

## Decision

1. Общий хук `features/map/useViewportSearch` (mode 'gesture' для /search,
   'always' для /map) и общий `MapPreviewCard`; /search и /map используют их.
2. Гео-приоритет как у Zillow: полигон-территория > явный гео-фильтр
   (district/region) > viewport. Пока активен полигон/гео-фильтр, движение
   карты выдачу не меняет.
3. Viewport-режим на /search активируется жестом пользователя (MapView
   различает жест и программный setBounds), грузит `GET /api/v1/search/bounds`
   с полным набором фильтров §9, limit=100; список раскрывается локальными
   батчами по 24 (серверный keyset в viewport-режиме не используется).
   Ответы bounds-запросов защищены от гонки (guard по идентичности области).
4. bbox зеркалится в URL (`sw_lat/sw_lng/ne_lat/ne_lng`) shallow
   `history.replaceState` (НЕ router.replace — тот дёргал бы RSC-ре-рендер
   на каждый пан); SSR /search восстанавливает область и выдачу
   (`searchListingsByBounds`); bbox-URL — noindex (long-tail).
5. Попутный фикс: `/search/bounds`, `/search/polygon` и keyset-страницы теперь
   сериализуют фильтры через общий `buildSearchParams` (раньше терялись
   amenities/parking/мультитип/диапазоны Фазы 2).

## Consequences

Positive:
- Идентичное Zillow-поведение на /search и /map из одного кода.
- Шеринг/refresh сохраняют область карты; фильтры Фазы 2 работают в гео-поиске.

Negative / trade-offs:
- Эвристика «жеста» (DOM-события контейнера карты) — при ложном срабатывании
  возможна нежелательная активация viewport-режима.
- В viewport-режиме счётчик = размер выдачи (cap 100), а не meta.total.
- Follow-up бэклог: monotonic requestId против узкой гонки «same bounds,
  different filter»; счётчик при упавшем первом bounds-запросе.

## Related files

- apps/client/src/features/map/useViewportSearch.ts
- apps/client/src/features/map/MapPreviewCard.tsx
- apps/client/src/features/map/MapView.tsx
- apps/client/src/features/map/MapSearch.tsx
- apps/client/src/features/search/SearchResults.tsx
- apps/client/src/app/[locale]/search/page.tsx
- apps/client/src/lib/geo.ts
- apps/client/src/lib/api/listings.ts
- apps/client/src/store/api/searchApi.ts

## Related task

- Спека: docs/superpowers/specs/2026-07-04-search-map-viewport-zillow-design.md
- План: docs/superpowers/plans/2026-07-04-search-map-viewport-zillow.md
