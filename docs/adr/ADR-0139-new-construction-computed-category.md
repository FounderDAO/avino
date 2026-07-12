# ADR-0139 — «Новостройка» — вычисляемая категория, а не PropertyType

## Status

Accepted

## Date

2026-07-12

## Context

В `PropertyType` существовало значение `NEW_BUILDING` («Yangi bino») наравне с
APARTMENT/HOUSE/LAND/COMMERCIAL. Это некорректная модель: «новостройка» — не
отдельный вид недвижимости, а свойство возраста здания. Продавец выбирал тип
вручную, объявление «новостройка» навсегда оставалось новостройкой, а квартира
в новом доме, размеченная как APARTMENT, в категорию не попадала.

Запрос клиента (Team Lead, 2026-07-12):
1. Убрать «New Building» из типов недвижимости и перенести в фильтры под именем
   «New Construction» / «Yangi qurilish».
2. Категория определяется автоматически: зданию меньше 3 лет.
3. Год постройки может быть в будущем — продают квартиры в недострое
   («сдача в 2028», дольщик перепродаёт до сдачи дома).

## Decision

1. **`NEW_BUILDING` удалён из enum `PropertyType`** (Prisma + packages/shared +
   оба фронта). Миграция `20260712120000_remove_new_building_property_type`
   переводит существующие объявления в `APARTMENT` и чинит `saved_searches.filters_json`.
2. **Новый параметр поиска `?new_construction=true`** (все эндпоинты `/search*`):
   `year_built >= EXTRACT(year, now()) - (NEW_CONSTRUCTION_MAX_AGE_YEARS - 1)`,
   константа = 3 (`search-listings.dto.ts`). Условие покрывает и будущие годы
   (недострой). `year_built IS NULL` не проходит. Порог вычисляет СЕРВЕР —
   URL стабилен (не протухает 1 января), пригоден как SEO-лендинг
   (`new_construction` включён в SEMANTIC_PARAMS canonical).
3. **`year_built` обязателен** в `POST /listings` для `APARTMENT|HOUSE`
   (`@ValidateIf`), опционален для `LAND|COMMERCIAL` (поле в визарде им не
   показывается). Будущие годы валидны. Клиентские гейты: шаг 3 визарда
   (`canNext`) и `missingRequiredFields` в редакторе.
4. **Legacy-совместимость**: `/search?type=NEW_BUILDING` (старые ссылки) и
   сохранённые поиски с `property_type=NEW_BUILDING` маппятся на
   `new_construction=true` на клиенте; в БД filters_json переписан миграцией.
5. **i18n**: uz «Yangi qurilish» (было «Yangi bino»), en «New construction»
   (было «New building»), ru «Новостройки»/«Новостройка». Ключи
   `nav.newConstruction`, `footer.newConstruction`,
   `home.categories.NEW_CONSTRUCTION`, `search.filters.newConstruction(+Hint)`,
   `listingNew.fields.yearBuiltHint`; `enums.propertyType.NEW_BUILDING` удалён.

## Consequences

Positive:
- Категория «новостройка» всегда актуальна: дом стареет — объявление само
  выпадает из категории; недострой попадает автоматически.
- Продавец не решает сам, «новостройка» ли его объект — меньше спама в категории.
- Enum меньше, фильтр композируется с типами (`type=APARTMENT&new_construction=true`).

Negative / trade-offs:
- BREAKING для API-клиентов, шлющих `property_type=NEW_BUILDING` (400) —
  согласовано: продукт до-MVP, данные локальные/стенд.
- Объявления без `year_built` (старые LAND/COMMERCIAL и legacy-квартиры)
  никогда не попадают в категорию; для новых квартир/домов поле обязательно.
- Порог «3 года» зашит константой на сервере; смена требует деплоя.

## Related files

- apps/api/prisma/migrations/20260712120000_remove_new_building_property_type/migration.sql
- apps/api/src/search/dto/search-listings.dto.ts, apps/api/src/search/search.service.ts
- apps/api/src/listings/dto/create-listing.dto.ts
- packages/shared/src/enums.ts, packages/shared/src/constants.ts
- apps/client: search/page.tsx, FilterBar/FiltersPanel/ActiveFilters, savedSearch.ts,
  Nav/Footer/Header, home/Categories, ListingNew/ListingEdit, messages/{ru,uz,en}.json
- apps/web: adminTypes.ts, lib/mock/*
- docs/API.md §7/§9

## Related task

- Запрос клиента «New Construction / Yangi qurilish» (2026-07-12)
