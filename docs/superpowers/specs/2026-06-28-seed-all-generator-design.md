# Спека: `seed-all.cjs` — комплексный генератор каталога под новую архитектуру

_Дата: 2026-06-28 · Статус: согласование · Только тест-стенд (staging), НЕ production-данные_

## Цель

Один скрипт, который наполняет каталог демо-объявлениями **по всем 14 регионам**
(не только Ташкент) и **заполняет все новые поля** так, чтобы на стенде можно было
вживую проверить весь свежий функционал: Zillow-фильтры Фазы 2 (санузлы, парковка,
участок, удобства), каскад Регион→Район, карту/полигон-поиск, гистограмму цен,
компактный бейдж «времени на сайте» (DaysBadge), промо, очередь модерации и туры.

Существующие `seed-catalog.cjs` (Ташкент-only, без новых полей) и `seed-regions.cjs`
(все регионы, но бедный) **не покрывают** это вместе. Создаём новый файл; старые не трогаем.

## Файл и инварианты

- **Путь:** `apps/api/prisma/seed-all.cjs` (CommonJS, как остальные seed-скрипты).
- **Идемпотентность:** фиксированные UUID с префиксом `5a…` + `upsert`. Повторный
  запуск не плодит дубли и не ломает уже созданное.
- **Самодостаточность:** всё из `process.env` контейнера (`DATABASE_URL`, `S3_*`),
  одинаково локально и на staging. Районы берутся рантайм-запросом по `region_id`
  (UUID не хардкодятся).
- **Не трогает:** `seed-catalog.cjs`, `seed-regions.cjs`, прочие seed-*.

## Объём

| Регион | Кол-во |
|---|---|
| Ташкент-город (`toshkent-shahri`) | `SEED_TASHKENT`, default **20** (покрывает больше из 12 районов) |
| Остальные 13 регионов | `SEED_PER_REGION`, default **4** каждый |
| **Итого** | **≈ 72** |

Оба числа переопределяются env. Районы региона берутся по алфавиту; если их меньше
нужного — крутятся по кругу (как в `seed-regions`).

## Детерминированное покрытие фильтров

Глобальный счётчик `i` гонит значения по циклу, чтобы при ~72 карточках задеть
каждое значение каждого фильтра.

| Поле | Покрытие |
|---|---|
| `propertyType` | цикл всех 5: APARTMENT / NEW_BUILDING / HOUSE / COMMERCIAL / LAND |
| `transactionType` | SALE + RENT (RENT не выдаётся для LAND и NEW_BUILDING) |
| `currency` | USD/UZS микс (для тоггла валют и гистограммы цен) |
| `price` | разброс по типу/валюте/сделке (как в `seed-catalog`) |
| `bathrooms` | 1–4; `null` для LAND |
| `parkingType` | цикл YARD/COVERED/GARAGE/UNDERGROUND; `null` для LAND |
| `amenities` | разные комбинации `Amenity[]`, в сумме покрывают все 8 значений |
| `lotArea` | соток для HOUSE и LAND (для диапазон-фильтра участка) |
| `rooms` / `area` / `floor` / `totalFloors` / `yearBuilt` | по типу недвижимости |
| `promotionType` | преимущественно NORMAL, несколько TOP и VIP (с `promotionExpiresAt` в будущем) |
| `status` | большинство ACTIVE; несколько NEW (очередь модерации); 1–2 DRAFT |
| **`createdAt`** | разброс по возрасту: часть <24ч («Новое»), часть дни/недели/месяцы/годы — для проверки DaysBadge; `publishedAt` согласован с возрастом |
| `toursEnabled` + `tourWindows` | включены на части ACTIVE-карточек |
| переводы | RU / UZ / EN на каждое объявление |

## География

- `REGION_CENTER` (центры 14 областей, из `seed-regions`) + точные центры районов
  Ташкента (`CENTER`, из `seed-catalog`) + детерминированный джиттер ±~500–1500 м.
- Пишем только `latitude`/`longitude`; колонку `location` (`geography`) проставит
  существующий sync-триггер (migration `20260603150000_add_listings`). Благодаря
  этому карта на `/search` и полигон-поиск (`ST_Within`) работают по seed-данным.
- Адрес: `${region.nameRu}, ${district.nameRu}, …` — без хардкода «Ташкент».

## Фото

Как в `seed-catalog`: картинки реально скачиваются (loremflickr → picsum fallback)
и **аплоадятся в R2**, в `listing_media` пишется `storage_key`. Это обязательно
из-за sign-on-read (ADR-0086): внешний URL превратился бы в несуществующий R2-ключ
→ presigned 404 → заглушка «AVINO». Пул тематический по комнатам, идемпотентный
(HeadObject → skip). Без S3 — `preflight` падает (без R2 фото всё равно не показать).

## Владельцы

5 демо-владельцев с `contactPhone` (контакт-карточка показывает
`profile.contactPhone`), свой UUID-префикс. `User.phone` не трогаем (partial-unique,
для логина не нужен) — избегаем коллизий на стенде.

## Запуск (staging)

Предусловие: на стенде накатан `prisma migrate deploy` (миграции
`add_districts`, `add_regions`, `add_listing_bathrooms/parking_type/lot_area/amenities`).

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.staging.yml \
  exec -T -e SEED_PER_REGION=4 -e SEED_TASHKENT=20 api node < apps/api/prisma/seed-all.cjs
```

Локально — без overlay-файлов staging.

## Вне scope

chat / favorites / saved-search alerts / complaints / broadcast — у них свои seed-скрипты
(`seed-chat`, `seed-demo-moderation`) и/или требуют интерактива. `seed-all` покрывает
каталог/поиск/фильтры/карточки/карту/регионы/модерацию/туры/промо — поверхность,
которой касались последние фичи.

## Заметки по реализации

- Скрипт `apps/api`-only, в одной app-папке. Git не трогаем во время реализации
  (контроллер владеет git).
- Тестов нет: dev/ops-скрипт, запускается вручную, как и существующие seed-*.
- В конце печатает сводку: счётчики по `status/tx/type`, по регионам, итог ACTIVE.
