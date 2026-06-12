# ADR-0066 — Yandex Maps map-search with draw-territory (apps/client)

## Status

Accepted

## Date

2026-06-13

## Context

Публичный портал (`apps/client`) должен искать объявления по карте (CLAUDE.md §12:
карты — только Yandex Maps; геопоиск — PostgreSQL + PostGIS). До этой задачи карта
выдачи `/search` была на **Leaflet + OpenStreetMap** и моках — это нарушало §12.
Нужен поиск по видимой области карты и «рисование территории» (обводка
произвольной области с показом только тех объявлений, что внутри).

Бэкенд уже отдаёт `GET /api/v1/search/bounds` (TASK-083, PostGIS
`ST_MakeEnvelope`/`ST_Within` по углам bbox `sw_*`/`ne_*`), но **endpoint'а
поиска по произвольному полигону нет**. Поиск интерактивный (пан/зум, рисование),
поэтому данные должны жить в клиентском слое (RTK Query, §4), тогда как
существующий `/search` — server component с пропсами.

## Decision

1. **Yandex Maps JS API 2.1** грузится на клиенте по ключу
   `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` (singleton-loader `features/map/useYmaps.ts`).
   Без ключа/при ошибке карта деградирует до подсказки, страница не падает.
2. Единый компонент **`features/map/MapView.tsx`** (Yandex) заменяет прежний
   Leaflet MapView. Пропсы списка↔карты стабильны
   (`listings/activeId/onSelect/onHover`); добавлены режимы рисования
   (`drawMode: 'radius' | 'polygon' | null`), оверлеи (`circle`/`polygon`) и
   дебаунс-отчёт о видимой области (`onBoundsChange`). Маркеры кластеризуются
   (`ymaps.Clusterer`); ценовые пины брендовые (ADR-0060): VIP золотой, TOP
   красный, активный — ink.
3. **Leaflet удалён полностью** из `apps/client` (зависимости `leaflet`,
   `react-leaflet`, `@types/leaflet` и старый `features/search/MapView.tsx`).
   Карта `/search` (радиусный поиск, ADR-0064) переведена на новый Yandex
   `MapView` без изменения контракта `SearchResults`.
4. **`searchByBounds`** добавлен в RTK Query (`store/api/searchApi.ts`,
   `baseApi.injectEndpoints`) → `GET /api/v1/search/bounds`; ответ маппится тем же
   `mapListing`, что и серверный слой `lib/api/listings` (без дублирования).
5. Новый маршрут **`/map`** (`features/map/MapSearch.tsx`): server-страница даёт
   SSR-стартовую выдачу, дальше клиент ведёт поиск по видимой области (дебаунс) и
   рисование территории. Рисование — **freehand-лассо** (зажал → обвёл → отпустил,
   на событиях карты Yandex; путь прореживается по мин. шагу), отпускание замыкает
   территорию. Точность территории — MVP на клиенте: bbox полигона →
   `searchByBounds` → отсечение `point-in-polygon` (ray casting, `lib/geo`).
6. Связь список↔карта сохранена: наведение на карточку панорамирует (`panTo`) и
   подсвечивает пин; клик по пину открывает превью (`PropertyCard`) и выбирает
   объявление в списке.

## Consequences

Positive:
- §12 закрыт на публичном портале: и `/search`, и `/map` на Yandex; OSM/Leaflet нет.
- Геопоиск остаётся PostGIS (бэкенд); клиент только рисует карту и грубо отсекает.
- Нет новых зависимостей (Yandex SDK грузится скриптом; типы `ymaps` — локальный `any`).
- Один `MapView` обслуживает оба экрана; контракт `SearchResults` не изменился.

Negative / trade-offs:
- Точность территории — приближённая: bbox-запрос + клиентский `point-in-polygon`,
  ограничен размером страницы (`limit=100`). Объекты в bbox, но вне полигона
  отсекаются на клиенте; объекты за пределами одной страницы не видны.
- `ymaps` типизирован как `any` (изолировано в `useYmaps`/`MapView`).
- Рантайм-поведение Yandex проверяется только с реальным ключом (live verify);
  CI/сборка валидируют типы и линт.

Follow-ups (отдельные задачи, НЕ в этом PR):
- **apps/api**: `GET /api/v1/search/polygon` с `ST_Within(polygon)` для серверной
  точности территории и снятия лимита страницы (заменит клиентский point-in-polygon).

## Related files

- apps/client/src/features/map/useYmaps.ts
- apps/client/src/features/map/MapView.tsx
- apps/client/src/features/map/MapSearch.tsx
- apps/client/src/app/[locale]/map/page.tsx
- apps/client/src/store/api/searchApi.ts
- apps/client/src/lib/geo.ts (bbox + point-in-polygon)
- apps/client/src/features/search/SearchResults.tsx (migrated to Yandex MapView)
- docs/ENV.md (§10 Yandex key now also apps/client)

## Related task

- TASK-152 (extends ADR-0064 client radius map search; depends on TASK-083 /search/bounds)
