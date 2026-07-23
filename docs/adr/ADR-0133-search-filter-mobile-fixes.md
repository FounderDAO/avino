# ADR-0133 — Мобильные фиксы поиска: точная семантика rooms, полигон в /search и /search/bounds, world-bbox

## Status

Accepted

## Date

2026-07-06

## Context

Три связанных дефекта/пробела в поисковых эндпоинтах (`GET /api/v1/search*`),
обнаруженные при интеграции мобильного клиента:

1. **`rooms` — баг + отсутствие мультивыбора (TASK-247).** `buildWhereSql`
   трактовал одиночное `rooms=N` как «N и более» при `N >= 4`
   (`rooms >= 4 : rooms = N`). Это значит `rooms=5` возвращал 4, 5 И 6 комнат —
   пользователь, выбравший чип «5», видел квартиры с 4 комнатами. Плюс `rooms`
   в DTO был скаляром (`@Type(() => Number)`), поэтому повторяющийся параметр
   (`rooms=2&rooms=3`, мультивыбор чипов на мобилке) падал с `400
   VALIDATION_ERROR` (`forbidNonWhitelisted`/дубли ключа не проходили как
   массив).
2. **Полигон территории только в `/search/polygon` (TASK-249).** Server-side
   матчинг по нарисованному лассо уже существовал как отдельный endpoint
   (`/search/polygon`, TASK-193), но карта мобилки хочет применять полигон
   ВМЕСТЕ с остальными фильтрами и bbox на `/search`/`/search/bounds` — то есть
   пересечение «видимая область + рука-нарисованный контур + цена/комнаты/...»,
   а не выбор одного из двух режимов.
3. **Bbox «весь мир» → пусто (TASK-250).** Репортился как всё ещё
   воспроизводимый баг мобилки (`/search/bounds?sw_lat=-85&sw_lng=-180&ne_lat=
   85&ne_lng=180` → `total: 0`). При аудите выяснилось, что это уже
   исправлено — коммит `9a1c685` (TASK-226, слит в `main` до старта этой
   задачи) добавил чанкинг GIST-префильтра (`boundsPrefilterSql`, широкий bbox
   режется на куски ≤ 90° по долготе) именно под этот сценарий, и
   `search.service.geo.int-spec.ts` уже содержит регресс-тест `bounds
   full-extent bbox (whole world) returns all geo listings`, ожидающий
   `total > 0`. Финальный `ST_Within(location::geometry, envelope)` использует
   **planar geometry** (не `geography`), поэтому полный `ST_MakeEnvelope(-180,
   -85, 180, 85)` НЕ вырождается (в отличие от geography-каста, где дуги
   большого круга «коротким путём» схлопывают полноширинные рёбра) — только
   GIST-префильтр (`&&` по `geography`) был подвержен багу, и он уже чанкуется.
   Новый код для этой части не писался — см. Decision, пункт 3.

## Decision

### 1. `rooms` — массив + точная семантика (BREAKING)

`SearchListingsQueryDto.rooms` меняет тип с `number` на `number[]`
(`apps/api/src/search/dto/search-listings.dto.ts`): `@Transform(toNumberArray)`
(новый helper, зеркалит уже существующий `toArray` для `property_type`/
`amenities`, но дополнительно приводит элементы к `Number`) + `@IsArray()` +
`@IsInt({ each: true })` + `@Min(0, { each: true })`. Одиночное значение
(`rooms=5`) заворачивается в массив из 1 элемента — тот же паттерн, что уже
принят для `property_type`/`amenities`/`listing_source`.

Семантика в `SearchService.buildWhereSql`: значения 0..4 — ТОЧНОЕ совпадение
(`rooms IN (...)`), значение 5 — «5 и более» (`rooms >= 5`); ветки
комбинируются через `OR`. **BREAKING**: раньше одиночное `rooms=4` трактовалось
как «4 и более» (охватывало 4/5/6…) — теперь `rooms=4` означает РОВНО 4. Для
старого поведения «4+» клиент должен использовать `rooms_min=4` (не тронут) или
явный список `rooms=4&rooms=5`.

`buildWhereSql` принимает `query.rooms` НАТИВНО как `number | number[]`
(`Array.isArray` в рантайме независимо от статического типа DTO), потому что
`SearchService.matchNewlyActiveListings` (сохранённые поиски, ARCHITECTURE §16)
передаёт сырой `filters_json` в обход DTO-валидации
(`filters as unknown as SearchListingsQueryDto`) — старые записи могли хранить
`rooms` как одиночное число. `extractFilters`
(`saved-search-alert.service.ts`) и `FiltersJsonDto.filters` уже типизированы
свободно (`Record<string, unknown>`) — правок там не потребовалось, массив
доходит до `buildWhereSql` без потерь.

### 2. Полигон в `/search` и `/search/bounds` (TASK-249)

`points?: string` добавлен как НЕОБЯЗАТЕЛЬНОЕ поле в БАЗОВЫЙ
`SearchListingsQueryDto` (наследуется в `BoundsSearchQueryDto` автоматически) с
новым декоратором `@IsPolygonRingOptional()`
(`apps/api/src/search/dto/polygon-ring.util.ts`) — `undefined` валиден,
заданное значение проверяется тем же `parsePolygonRing`, что и у
`/search/polygon`.

**Гоча наследования class-validator (важно для ревью).** Изначально
планировалось `@IsOptional() @IsPolygonRing()` на базовом поле. Но
`MetadataStorage.getTargetValidationMetadatas` (class-validator) наследует
validation-метаданные между базовым и производным классом ПО ИМЕНИ СВОЙСТВА,
де-дуп — только по совпадению `(propertyName, type)`. `PolygonSearchQueryDto`
(TASK-193, `/search/polygon`) — подкласс `SearchListingsQueryDto`, и его
`points` обязателен (`@IsString() @IsPolygonRing()`, без `@IsOptional()`). Если
бы базовый `points` использовал `@IsOptional()`/`@ValidateIf()`
(`type: 'conditionalValidation'`), это условие унаследовалось бы в
`PolygonSearchQueryDto` (там нет своей `conditionalValidation`-метаданной для
`points`, де-дуп не сработал бы) и **молча сделало бы обязательный контур
необязательным** — `/search/polygon` перестал бы отдавать 400 при отсутствующем
`points`. Решение: `IsPolygonRingOptional()` — отдельный custom-валидатор
(`type: 'customValidation'`), сам решающий «`undefined` → валиден» внутри своей
`validate()`, без единой `conditionalValidation`-метаданной на базовом классе.
`PolygonSearchQueryDto` полностью переопределяет `customValidation`-слот своим
`@IsPolygonRing()` (де-дуп по `type` срабатывает), поэтому утечки в обратную
сторону нет. Регресс закрыт тестом
(`apps/api/src/search/dto/geo-search.dto.spec.ts`): `PolygonSearchQueryDto` без
`points` по-прежнему падает 400.

Побочный эффект (принят осознанно): `points` также наследуется в
`RadiusSearchQueryDto`/`NearMeSearchQueryDto`/`ClustersSearchQueryDto` (все —
подклассы `SearchListingsQueryDto`/`GeoSearchQueryDto`) как необязательное
поле, но фильтрация по нему НЕ применяется в `searchRadius`/`searchNearMe`/
`searchClusters` (их сервисные методы не вызывают новый `pointsFilterSql`) —
задача просила только `/search` и `/search/bounds`. Клиент, отправивший
`points` на эти эндпоинты, не получит 400, но параметр будет молча
проигнорирован.

**Wiring в `SearchService`** (новый приватный `pointsFilterSql(points)`,
переиспользует существующий `polygonSql()` — тот же путь построения геометрии,
что у `searchPolygon`/`matchNewlyActiveListings`):
- `search()`: `buildWhereSql(...) + pointsFilterSql(query.points)` — полигон
  подмешивается ДОПОЛНИТЕЛЬНО к скалярным фильтрам (не вместо).
- `searchBounds()`: тот же паттерн поверх уже существующего
  bbox-префильтра+`ST_Within` — пересечение bbox И контура.
- `searchRadius`/`searchNearMe`/`searchClusters`/`searchPolygon` — без
  изменений (не в скоупе задачи).

### 3. World-bbox (TASK-250) — уже исправлено, изменений не потребовалось

Аудит `boundsPrefilterSql`/`envelopeSql`/`searchBounds` (см. Context) показал,
что чанкинг GIST-префильтра (коммит `9a1c685`, уже в `main` и в этой ветке) и
regression-тест на полный экстент уже покрывают ровно тот сценарий, что был
описан как всё ещё сломанный. Финальный `ST_Within` использует `geometry`
(planar), не `geography`, поэтому не подвержен вырождению «дуги большого круга
коротким путём» — только `&&`-префильтр по `geography` был подвержен, и он уже
чанкуется на куски ≤ 90°. Никаких изменений в код внесено не было; если баг
всё ещё воспроизводится в проде — вероятная причина: устаревший образ
(redeploy), а не регрессия в коде. См. финальный отчёт агента для деталей
аудита.

## Consequences

Positive:
- Чип «N комнат» на мобилке даёт точную выдачу без «протечки» соседних
  значений; мультивыбор чипов (`rooms=2&rooms=3&rooms=5`) больше не 400.
- Нарисованная территория работает как composable-фильтр на `/search` и
  `/search/bounds`, а не как отдельный режим — карта мобилки может сочетать
  bbox видимой области с ручным контуром.
- `matchNewlyActiveListings` (сохранённые поиски) автоматически подхватывает
  новую семантику `rooms` — общий `buildWhereSql`, без дублирования логики.

Negative / trade-offs:
- **BREAKING**: `rooms=4` больше не «4+». Клиенты (веб/мобилка), полагавшиеся
  на старое поведение, должны перейти на `rooms_min=4` или явный список
  значений ДО деплоя этого изменения (иначе чип «4+» станет «ровно 4»).
- `points` молча принимается (без ошибки) на `/search/radius`/`/near-me`/
  `/clusters`, но не фильтрует — расширение DTO ради избежания риска
  class-validator inheritance-гочи; если это окажется путающим, точечный fix —
  явно исключить `points` из `RadiusSearchQueryDto`/`NearMeSearchQueryDto`/
  `ClustersSearchQueryDto` через `@Exclude()`/переопределение (не сделано в
  рамках этой задачи).
- World-bbox фикс не подтверждён живым SQL в этой сессии (нет поднятой
  PostgreSQL/PostGIS в среде агента) — только статический аудит кода +
  существующий int-spec (не запускался, требует БД).

## Related files

- apps/api/src/search/dto/search-listings.dto.ts
- apps/api/src/search/dto/geo-search.dto.ts
- apps/api/src/search/dto/polygon-ring.util.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/dto/search-listings.dto.spec.ts
- apps/api/src/search/dto/geo-search.dto.spec.ts
- apps/api/src/search/search.service.int-spec.ts

## Related task

- TASK-247 — rooms: точная семантика + мультивыбор
- TASK-249 — points (полигон) в /search и /search/bounds
- TASK-250 — bbox «весь мир» → пусто (уже исправлено в TASK-226/#358-9a1c685,
  изменений не потребовалось)
