# ADR-0126 — Эндпоинт кластеризации карты /api/v1/search/clusters

## Status

Accepted

## Date

2026-07-04

## Context

На широких зумах карта показывает только первые N объявлений из /search/bounds
(keyset-пагинация) — при 10 000+ объявлений «вся страна» выглядит пустой.
Заявка мобильного клиента (BACKEND-REQUESTS.md, 04.07.2026, п.1): стандартная
схема Zillow/Airbnb — сервер отдаёт агрегаты сетки, клиент рисует кластерные
кружки и при < ~200 объектов в боксе переключается на пины /search/bounds.

## Decision

GET /api/v1/search/clusters?sw_lat&sw_lng&ne_lat&ne_lng&zoom&<фильтры /search>
→ { data: [{ latitude, longitude, count, min_price, avg_price }], currency }.

- Сетка: GROUP BY ST_SnapToGrid(location::geometry, cell, cell),
  cell = 360 / 2^zoom / 8 (~8 ячеек на тайл 256px, плотность supercluster).
- Координата кластера — центроид точек ячейки (avg), не угол сетки.
- bbox-фильтр как у /search/bounds: чанкованный geography-префильтр
  (boundsPrefilterSql, TASK-226) + точный ST_Within; применяются все фильтры §9
  (buildWhereSql).
- Цены: min/avg FX-нормализуются к currency (default USD) по курсу ЦБУ
  (priceInCurrencySql); нет курса → сырые цены (деградация как в ADR-0117).
- Без пагинации; LIMIT 2000 ячеек по count DESC (guard патологического bbox×zoom).

## Consequences

Positive:
- Вся страна видна одним запросом; O(ячеек), не O(листингов).
- Фильтры и промо-семантика не дублируются — переиспользован buildWhereSql.

Negative / trade-offs:
- Сетка фиксированного шага (не supercluster-иерархия): визуальные скачки
  кластеров при смене зума приемлемы для MVP.
- Смешанные валюты без строки курса дают «сырые» агрегаты (документировано).
- `ST_SnapToGrid` округляет к ближайшему узлу АБСОЛЮТНОЙ сетки (не относительно
  данных): близкие объекты у границы бина могут разъехаться по соседним
  ячейкам (наблюдалось в int-spec на реальных координатах Ташкента) — приемлемо
  для MVP кластеризации.

## Related files

- apps/api/src/search/search.service.ts
- apps/api/src/search/search.controller.ts
- apps/api/src/search/dto/clusters.dto.ts

## Related task

- TASK-225
