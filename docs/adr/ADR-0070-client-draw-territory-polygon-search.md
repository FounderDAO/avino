# ADR-0070 — Client draw-territory uses server-side polygon search (ST_Within)

## Status

Accepted

## Date

2026-06-14

## Context

Поиск по нарисованной территории на `/map` (freehand-ласо, TASK-152) изначально
был MVP-реализацией поверх уже существующего bbox-эндпоинта:

1. брали описанный вокруг полигона bbox (`polygonBounds`);
2. запрашивали `GET /api/v1/search/bounds`;
3. точную форму отсекали на клиенте ray-casting'ом (`pointInPolygon`, `lib/geo`).

Проблемы подхода:
- двойная работа: тянем bbox-надмножество и режем его на клиенте;
- клиентская геометрия (плоское приближение) может расходиться с серверной;
- keyset-страница bbox ограничена `limit` — объекты территории за пределами
  первой bbox-страницы недостижимы;
- дублирование геологики на клиенте.

TASK-193 зализал серверный `GET /api/v1/search/polygon`
(`ST_MakePolygon`/`ST_Within`, promotion-keyset, как у `/search/bounds`).

## Decision

Клиент перестаёт отсекать территорию сам и делегирует фильтрацию серверу:

- кольцо обводки сериализуется в параметр `points` хелпером
  `lib/geo.serializePolygonRing` — требует ≥ 3 вершин в диапазоне WGS84,
  равномерно прореживает длинную обводку до `MAX_POLYGON_VERTICES = 120`
  и округляет координаты до 6 знаков (защита длины query и стоимости ST_Within);
- запрос идёт через RTK Query `searchByPolygon` → `GET /api/v1/search/polygon`;
- авторитетна серверная `ST_Within`; клиентский `pointInPolygon` удалён;
- bbox-поиск при сдвиге/зуме карты (`searchByBounds`) не меняется; сброс
  территории возвращает выдачу текущей видимой области.

## Consequences

Positive:
- точная серверная геометрия территории, согласованная с keyset-пагинацией;
- нет over-fetch bbox-надмножества и расхождений клиент/сервер;
- меньше геокода на клиенте.

Negative / trade-offs:
- каждая завершённая обводка — отдельный сетевой round-trip (раньше переиспользовали
  bbox-данные);
- очень длинная обводка прореживается до 120 вершин — на городском масштабе
  потеря точности пренебрежимо мала.

## Related files

- apps/client/src/lib/geo.ts (`serializePolygonRing`, `MAX_POLYGON_VERTICES`)
- apps/client/src/store/api/searchApi.ts (`searchByPolygon`)
- apps/client/src/features/map/MapSearch.tsx

## Related task

- TASK-216 (client draw-territory → /search/polygon)
- TASK-193 (backend polygon endpoint, ADR-0029 семейство geo-search)
