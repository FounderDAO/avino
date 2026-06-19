# Спека: ежедневный курс USD/UZS + отображение цен в выбранной валюте

- **Дата:** 2026-06-19
- **Ветка:** `feat/currency-display-exchange-rate`
- **Статус:** реализовано — ADR-0093, ветка `feat/currency-display-exchange-rate` (PR pending), 16 задач + polish, final review READY TO MERGE
- **Охват:** только отображение (display-only). Бэкенд-поиск (search) не меняем.

## 1. Проблема и цель

Сейчас у каждого листинга своя валюта: `price Decimal(14,2)` + enum `Currency {UZS, USD}`.
FX-конвертации нет вовсе (прямо отмечено в `schema.prisma`). На практике в UZ продажа
недвижимости чаще в USD, аренда — в сумах, поэтому зрителю выдача показывается в смешанных
валютах и её тяжело сравнивать.

**Цель:** зритель выбирает валюту отображения `[сум | $]`, и все цены показываются в ней —
нативные точно, сконвертированные с пометкой `≈`. Курс берётся автоматически раз в день из
официального источника. Нативная валюта листинга в БД не меняется.

**Не-цели (вне охвата этой итерации):**

- Кросс-валютный фильтр цены (показать сум-листинги внутри `$`-диапазона через конверсию в
  SQL) — это **Phase 2**, документируется ниже, но не реализуется сейчас.
- Любая запись сконвертированных значений в БД. Конверсия — только на лету при отображении.
- Мультивалютность шире USD/UZS.

## 2. Принятые решения (из брейншторма)

1. **Охват — только отображение.** Тоггл валюты на клиенте; нативная валюта листинга в БД не
   трогается; backend search остаётся по нативной валюте.
2. **Источник курса — ЦБ РУз (cbu.uz).** Официальный бесплатный JSON-API, без ключа,
   авторитетный для сума.
3. **Хранение — отдельная таблица `ExchangeRate`** с историей и админ-оверрайдом (Numeric-поле,
   соответствует финправилу проекта).
4. **Тоггл — `[сум | $]`, дефолт `сум`,** конверт с `≈`, выбор запоминается (localStorage).

## 3. Архитектура

### 3.1 Поток данных

```
[cron 06:00 Asia/Tashkent]
        │ BullMQ repeatable job  refresh_exchange_rate
        ▼
ExchangeRateWorker → ExchangeRateService.refreshFromCbu()
        │ fetch cbu.uz USD JSON → parse Rate
        ▼
INSERT exchange_rates (source=CBU)         ← «текущий курс» = последняя строка
        │
        ▼
GET /exchange-rate (public, cacheable)
        │
        ▼
client RTK Query  useGetExchangeRateQuery()
        │  + useCurrencyPreference() (localStorage, дефолт UZS)
        ▼
usePriceFormatter() → formatPrice(listing, { display, rate })
        ▼
PropertyCard / detail / MyListings / метки карты / выдача поиска
```

Параллельно: админ через `/admin/settings` → `PUT /admin/exchange-rate` → INSERT строки
`source=MANUAL` (становится текущей) + запись в `audit_logs`. Следующий успешный прогон CBU
естественно замещает ручное значение новой `CBU`-строкой.

### 3.2 Модель данных (apps/api, Prisma)

```prisma
enum ExchangeRateSource {
  CBU
  MANUAL
}

model ExchangeRate {
  id        String             @id @default(uuid()) @db.Uuid
  base      Currency           // USD
  quote     Currency           // UZS
  rate      Decimal            @db.Decimal(18, 6)   // 1 base = rate quote (1 USD = rate UZS)
  source    ExchangeRateSource
  fetchedAt DateTime           @default(now()) @map("fetched_at") @db.Timestamptz(6)
  createdAt DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)

  @@index([base, quote, fetchedAt(sort: Desc)])
  @@map("exchange_rates")
}
```

- **«Текущий курс»** — последняя строка по `fetchedAt` для пары `(base=USD, quote=UZS)`.
- **История** — это просто все строки таблицы.
- **Ручной оверрайд** — вставка строки `source=MANUAL`.
- `Decimal(18,6)` — сум ≈ 12 600 с дробной частью от ЦБ; запас большой; не Float.
- **Миграция** создаёт таблицу + enum. **Сид** вставляет одну стартовую строку (например,
  актуальное значение CBU на дату сида), чтобы `getCurrent()` работал ещё до первого cron.

### 3.3 Сервис + cron (apps/api, NestJS + BullMQ)

Зеркалим существующий паттерн `promotion-expiry` (queue + worker + repeatable scheduler в
`onModuleInit`, конфиг через `app_settings`/env).

**`ExchangeRateService`:**

- `getCurrent(): Promise<ExchangeRateView>` — последняя строка `(USD, UZS)`; лёгкий in-memory
  кэш с коротким TTL (курс меняется раз в день). Возвращает `{ base, quote, rate, fetchedAt, source }`.
- `refreshFromCbu(): Promise<void>` — `fetch` cbu.uz USD JSON → парс `Rate` → `INSERT` строки
  `source=CBU`. **При сбое:** лог + НЕ вставляем (старый курс остаётся); исключение пробрасываем,
  чтобы BullMQ ретраил.
- `setManual(rate: string, adminId: string): Promise<void>` — `INSERT` строки `source=MANUAL`
  + запись в `audit_logs` (action `EXCHANGE_RATE_MANUAL_SET`, metadata: old/new rate).

**Источник CBU:**

- `GET https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/`
- Ответ — массив с одним объектом: `[{ Ccy: "USD", Rate: "12650.18", Date: "19.06.2026", ... }]`.
- Берём поле `Rate` (строка) → парсим в Decimal. Ключ не нужен. Нативный `fetch` (как Yandex/Eskiz).
- Базовый URL в env `CBU_BASE_URL` (дефолт `https://cbu.uz`).

**Cron (`ExchangeRateQueue` + `ExchangeRateWorker`):**

- Repeatable-job `refresh_exchange_rate`, **дефолт cron `0 6 * * *`, TZ `Asia/Tashkent`**.
- Конфиг: env `EXCHANGE_RATE_CRON` / `EXCHANGE_RATE_TZ` (по умолчанию включён — ключи не нужны).
- Concurrency 1. Идемпотентная регистрация через `upsertJobScheduler` в `onModuleInit`.
- **Холодный старт:** если в таблице нет строк, `onModuleInit` пробует немедленный `refreshFromCbu()`;
  плюс сид-страховка из миграции/сида.

### 3.4 API-эндпоинты

**Публичный:**

- `GET /exchange-rate` → `{ base, quote, rate, fetchedAt, source }`. Кэшируемый; его тянет клиент.
  Документируется в **public Swagger**.

**Админ (роль `ADMIN`):**

- `GET /admin/exchange-rate` → текущий курс + недавняя история (список последних N строк).
- `PUT /admin/exchange-rate { rate }` → ручной оверрайд (валидация Decimal) → `setManual`.
- `POST /admin/exchange-rate/refresh` → немедленный прогон `refreshFromCbu()`.
- Документируются в **internal Swagger** (за basic-auth).

### 3.5 Клиент (apps/client)

- **RTK Query** `useGetExchangeRateQuery()` — длинный кэш (курс меняется раз в день; refetch on
  focus off / большой staleTime).
- **Префа валюты** — хук `useCurrencyPreference()` → `'UZS' | 'USD'`, **дефолт `UZS`**, персист в
  `localStorage`, **hydration-safe**: на SSR/первом рендере — `UZS`, читаем `localStorage` на mount,
  чтобы не было mismatch.
- **Конверсия в `apps/client/src/lib/format.ts`** — расширяем `formatPrice`:
  - новый необязательный аргумент `{ display?: Currency; rate?: number }`;
  - если `display` задан и `display !== listing.currency` → конверт:
    - `USD → UZS`: `value * rate`
    - `UZS → USD`: `value / rate`
  - префикс `≈ ` + формат в целевой валюте; нативная валюта — точно, без `≈`;
  - **округление:** целевой USD → до целых `$`; целевой UZS → до 1000 сум;
  - если `rate` отсутствует (курс ещё не загрузился) → фолбэк на нативное отображение (без `≈`).
  - `pinPrice` (метки карты) — та же логика конверсии.
- **`usePriceFormatter()`** — хук, замыкающий `{ display, rate }` и возвращающий
  `(listing) => string`. `formatPrice` остаётся чистой функцией. Хук подключается в:
  `PropertyCard`, страница детали, `MyListings`, метки карты (`pinPrice`-вызовы), выдача поиска.
- **`CurrencySwitcher`** — сегменты `[сум | $]` в шапке (глобально). На переключение обновляет
  префу. i18n-ключи (лейблы, `units.approx` для `≈`) с паритетом **RU/UZ/EN**.

### 3.6 Фильтр цены (display-only — известное ограничение)

Backend search **не трогаем**. Нюанс: в режиме `$` поле «цена до 100 000» сравнивалось бы с
сырым `price` и для сум-листингов это бессмыслица. **Минимальная клиентская мера** (без правки
search):

- лейбл полей цены показывает активный символ (`$` / `сум`);
- когда введён ценовой порог (`priceMin`/`priceMax`), добавляем уже существующий бэкенд-параметр
  `currency=<display>` — т.е. ценовой фильтр сужается до листингов в этой нативной валюте.
  Параметр добавляется **только при наличии ценового порога**, чтобы без фильтра по цене выдача
  по-прежнему показывала все валюты.

**Phase 2 (вне охвата):** кросс-валютный фильтр — конверсия границ в SQL, чтобы `$`-диапазон
включал и сум-листинги. Требует курс на бэкенде в `search.service` + правку DTO; документируем,
но сейчас не делаем.

### 3.7 Админ-панель (apps/web)

В `/admin/settings` — панель «Курс валют»: текущий курс / источник / время `fetchedAt`, недавняя
история, поле ручного оверрайда + кнопка «обновить сейчас» (`POST /admin/exchange-rate/refresh`).
Зеркало существующих панелей (SMS / Telegram). **Отделимо:** API-оверрайд может уехать в PR раньше
web-UI.

## 4. Обработка ошибок и крайние случаи

- **CBU недоступен / парс не удался** → лог, строку не вставляем (последний курс сохраняется),
  BullMQ ретраит джобу.
- **Холодный старт без строк** → `onModuleInit` пробует немедленный refresh; сид гарантирует
  наличие хотя бы одной строки. `GET /exchange-rate` всегда отдаёт 200 с текущим курсом.
- **Курс на клиенте ещё не загрузился** → цены показываются нативно (тоггл `$` временно не
  конвертит или дизейблится до прихода курса).
- **Приблизительность** → сконвертированные значения всегда с `≈`; нативные — никогда.
  Опционально подпись «Курс ЦБ РУз на DD.MM, ориентировочно».
- **Расхождение фильтр/отображение** → задокументировано в 3.6 (display-only), Phase 2 закрывает.

## 5. Тестирование

**API (дополняем текущий сьют, ~442 теста):**

- юнит `ExchangeRateService`: парс CBU-ответа; фолбэк при сбое fetch (нет вставки); `setManual`
  вставляет строку + `audit_logs`; `getCurrent` возвращает последнюю строку.
- эндпоинты: `GET /exchange-rate` (public, 200, форма ответа); admin `PUT`/`GET`/`refresh`
  (авторизация роли ADMIN, валидация Decimal).
- регистрация cron (зеркало теста `promotion-expiry`).

**Client (vitest + RTL, харнес уже есть):**

- `formatPrice` конверсия: `USD↔UZS`, наличие `≈`, округление (USD→целые, UZS→1000),
  фолбэк без `rate`.
- `usePriceFormatter` — отдаёт корректную строку под текущую префу+курс.
- `CurrencySwitcher` — персист выбора в `localStorage`, hydration-safe дефолт.

## 6. Конфиг / env

- Ключи не требуются (CBU публичный).
- `EXCHANGE_RATE_CRON` (дефолт `0 6 * * *`), `EXCHANGE_RATE_TZ` (дефолт `Asia/Tashkent`),
  `CBU_BASE_URL` (дефолт `https://cbu.uz`).
- Прод-TODO: при необходимости поменять расписание/таймзону — выставить env в deploy.

## 7. Разбивка по app-папкам (для плана)

Затрагивает 3 папки → в плане режем по владению файлами (паттерн Avino), один писатель JSON для
общих i18n-ключей:

- **apps/api** — Prisma (модель+enum+миграция+сид), `ExchangeRateModule` (service/queue/worker/cron),
  публичный + админ-контроллеры, Swagger-аннотации, тесты, `docs/API.md`.
- **apps/client** — RTK endpoint, `useCurrencyPreference`, правки `format.ts`, `usePriceFormatter`,
  `CurrencySwitcher`, разводка по call-site, мягкая привязка `currency` в фильтре, i18n RU/UZ/EN, тесты.
- **apps/web** — панель «Курс валют» в `/admin/settings`.

**Финализация:** ADR + DONE.md-prep бандлим в feature-PR (паттерн проекта); `main` защищён —
мерджит пользователь; стек PR при необходимости.

## 8. Открытые вопросы

- Нет (секция 3.6 — рекомендованная мягкая привязка `currency` — принята; альтернатива «вообще не
  трогать фильтр» отклонена в пользу когерентной выдачи).
