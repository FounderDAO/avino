# ADR-0093 — Daily USD/UZS exchange rate + currency display toggle

## Status

Accepted

## Date

2026-06-19

## Context

Каждое объявление хранит цену в своей валюте (`price Decimal(14,2)` + enum
`Currency {UZS, USD}`); FX-конвертации не было вовсе. На практике в Узбекистане
продажа недвижимости чаще номинируется в USD, аренда — в сумах, поэтому выдача
показывает смешанные валюты, и сравнивать цены тяжело. Нужна возможность
смотреть все цены в одной валюте по актуальному курсу, при этом нельзя менять
нативную валюту объявления и нельзя ломать существующий поиск.

## Decision

Реализован **display-only** слой курса валют:

- **Источник и хранение.** Ежедневный BullMQ repeatable-job `refresh_exchange_rate`
  (дефолт `0 6 * * *`, TZ `Asia/Tashkent`) тянет курс USD у ЦБ РУз
  (`cbu.uz/.../json/USD/`, без ключа) и пишет строку в новую таблицу
  `exchange_rates` (`Decimal(18,6)`, `source CBU|MANUAL`). «Текущий курс» = последняя
  строка; история — все строки. При сбое запроса строка не пишется (сохраняется
  последний курс), BullMQ ретраит; на холодном старте воркер делает один fetch.
- **API.** Публичный `GET /api/v1/exchange-rate` (кэшируемый) + админ
  `GET/PUT/POST refresh /api/v1/admin/exchange-rate` (ADMIN-gated, ручной оверрайд
  пишет `audit_logs`).
- **Клиент (apps/client).** Глобальный тоггл `[сум | $]` в шапке (дефолт `$` —
  см. Update 2026-07-04; персист в `localStorage`, redux-слайс по образцу
  `favoritesSlice`). Конверсия —
  на лету при отображении в `format.ts` (`usePriceFormatter`): нативные цены
  показываются точно, сконвертированные — с префиксом `≈`; округление USD→целые,
  UZS→до 1000; при отсутствии курса — фолбэк на нативную валюту. Фильтр цены
  отправляет `currency=<display>` только когда задан ценовой порог.
- **Админка (apps/web).** Панель «Курс валют» в `/admin/settings` (текущий курс,
  история, ручной оверрайд, «обновить из ЦБ») вместо прежнего статичного инпута.

**Out of scope (Phase 2):** кросс-валютный SQL-фильтр (показать сум-листинги
внутри `$`-диапазона через конверсию в поиске). Backend search не тронут.

## Consequences

Positive:
- Зритель видит все цены в выбранной валюте по официальному курсу ЦБ.
- Нативная валюта объявления в БД не меняется; перевод — только при отображении.
- История курсов + ручной оверрайд дают операционный контроль (если API ЦБ лёг).
- Никаких новых обязательных env (CBU без ключа); фича бутится с дефолтами.

Negative / trade-offs:
- Сконвертированные цены приблизительные (помечены `≈`).
- Курс на клиенте — глобальный тоггл, не учитывает региональные предпочтения.
- **Нюанс SSR-пагинации:** первая страница `/search` рендерится сервером без
  currency-параметра; currency-привязка ценового фильтра действует на догрузку
  («показать ещё») и polygon-запросы. При активном ценовом пороге в режиме `$`
  страница 1 может включать листинги другой нативной валюты, а догрузка — нет.
  Это граница display-only; полноценное кросс-валютное сужение — Phase 2.
- `GET /exchange-rate` бьёт в БД на каждый вызов (индексированный `findFirst`);
  кэширование — на клиенте (RTK Query). Лёгкий серверный TTL-кэш — возможный
  follow-up.

## Update 2026-07-04 — дефолтная валюта отображения: USD

Дефолт display-валюты сменён `UZS → USD` (initialState слайса + фолбэк
`readCurrencyFromStorage`). Причина: продажа недвижимости в Узбекистане
преимущественно номинируется в USD, и SSR-дефолт `сум` расходился с
сохранённым выбором `$` большинства пользователей — до гидратации тоггл в
шапке показывал `сум`, тогда как цены уже рендерились/конвертировались в `$`
(наблюдалось на staging как «выбран UZS, а показывает доллары»). С дефолтом
USD SSR-разметка и типичное клиентское состояние совпадают, окно рассинхрона
исчезает для основного сценария. Выбор `сум` по-прежнему персистится и
восстанавливается после перезагрузки. Известная граница: пользователь с
сохранённым `сум` до гидратации мгновение видит SSR-дефолт `$` — класс
рассинхрона устраним только cookie-SSR-инициализацией (осознанно не делаем:
`cookies()` в корневом layout сделал бы весь портал динамическим).

## Related files

- `apps/api/prisma/schema.prisma` (модель `ExchangeRate`, enum `ExchangeRateSource`) + миграция/сид
- `apps/api/src/exchange-rates/*` (provider, service, queue, worker, module, controllers, dto)
- `apps/api/src/config/configuration.ts`, `src/queues/queue.constants.ts`, `src/queues/queues.module.ts`, `src/app.module.ts`
- `apps/client/src/store/api/exchangeRateApi.ts`, `src/store/currencySlice.ts`, `src/lib/useCurrencyPreference.ts`, `src/lib/usePriceFormatter.ts`, `src/lib/format.ts`
- `apps/client/src/components/layout/CurrencySwitcher.tsx`, `src/features/search/{FilterBar,SearchResults}.tsx`, `src/features/detail/DetailPrice.tsx`
- `apps/web/src/store/api/adminExchangeRateApi.ts`, `src/components/admin/ExchangeRatePanel.tsx`, `src/app/admin/settings/page.tsx`
- `docs/API.md` §19, `docs/ENV.md` §6.1
- Spec/plan: `docs/superpowers/specs/2026-06-19-currency-display-exchange-rate-design.md`, `docs/superpowers/plans/2026-06-19-currency-display-exchange-rate.md`

## Related task

- TASK-222 (курс валют + переключатель отображения)
