# PriceFilter — алгоритм фильтра цены (хендофф для мобильного клиента)

Спека клиентской логики фильтра цены из `apps/client` (Zillow-вид: гистограмма +
двойной слайдер + поля Min/Max). Цель — чтобы мобильный разработчик воспроизвёл
**ту же математику**, что и веб.

**Источник в вебе:**
- `apps/client/src/features/search/PriceFilter.tsx` — контейнер, домен, гистограмма
- `apps/client/src/features/search/controls/priceRange.ts` — чистые функции (домен, бакеты, конверсия)
- `apps/client/src/features/search/controls/PriceRangeControl.tsx` — слайдер + поля + подсветка
- `apps/client/src/store/resultPricesSlice.ts` — цены текущей выдачи

---

## 0. Источник данных (читать первым)

Фильтр строится **не запросом к серверу**, а из цен уже загруженной выдачи `/search`.
Серверного эндпоинта распределения цен больше нет (`/search/price-distribution` удалён).

Каждое объявление приходит с **сырой** ценой и **своей** валютой:

```
resultPrices: [{ price: number, currency: "USD" | "UZS" }]   // зеркало текущей выдачи
displayCurrency: "USD" | "UZS"                                // выбранная валюта отображения
rate: number                                                 // курс ЦБУ, 1 USD = rate UZS
```

Правила:
- Храните цены **как есть** (сырые пары), не конвертированные. Конверсия — на лету.
  Тогда переключение валюты пересчитывает фильтр **без нового запроса** к списку.
- При каждом обновлении выдачи (viewport / страница / полигон) переписывайте
  `resultPrices` целиком.

---

## 1. Приведение цен к display-валюте

```
convertPrice(v, from, to, rate):
    if from == to: return v
    return from == USD ? v * rate : v / rate

toDisplayPrices(pairs, display, rate):
    out = []
    for p in pairs:
        if p.currency == display:
            out.push(p.price)
        else if rate is known:
            out.push(convertPrice(p.price, p.currency, display, rate))
        # если курса нет — объявление ПРОПУСКАЕТСЯ (осознанная деградация)
    return out
```

---

## 2. Домен слайдера `[0, max]`

```
prices = toDisplayPrices(resultPrices, displayCurrency, rate)
maxPrice = prices.isEmpty ? 0 : max(prices)

domain.min = 0
domain.max = maxPrice > 0 ? niceCeil(maxPrice) : FALLBACK_MAX[displayCurrency]
```

`niceCeil` — округление вверх до 2 значащих цифр (132 000 → 140 000, отсюда `$140k`):

```
niceCeil(v):
    if v <= 0: return 0
    step = 10 ^ (floor(log10(v)) - 1)
    return ceil(v / step) * step
```

Фолбэк, когда выдача пуста / нет курса:

```
FALLBACK_MAX = { USD: 1_000_000, UZS: 12_000_000_000 }
```

> **Гоча:** пересчёт `domain.max` при дозагрузке данных **не должен** сбрасывать
> уже выбранный пользователем диапазон. Переинициализируйте черновик (`draft`)
> только при смене **валюты** или **типа сделки** (SALE/RENT) — там реально другая
> гистограмма. При простой дозагрузке страниц — нет.

---

## 3. Гистограмма — 30 равных бакетов

```
buildPriceHistogram(prices, domain, n = 30):
    if prices.isEmpty or domain.max <= domain.min: return []
    step = (domain.max - domain.min) / n
    counts = [0] * n
    for p in prices:
        if p < domain.min or p > domain.max: continue
        idx = min(n - 1, floor((p - domain.min) / step))   # ровно max → последний бакет
        counts[idx] += 1
    return [{ from: min + i*step, to: min + (i+1)*step, count } for i, count in counts]
```

Рендер столбиков:

```
maxCount = max(1, ...bucket.counts)
для каждого бакета:
    высота  = (count / maxCount) * 100%     # min-высота ~2px, чтобы пустые были видны
    mid     = (from + to) / 2
    inRange = lo <= mid <= hi                # активный цвет vs приглушённый (25%)
```

`lo/hi` — текущие позиции ползунков (см. §4). Столбик внутри выбранного диапазона —
насыщенный, вне — блёклый. Это вся подсветка на макете.

---

## 4. Черновик значений `draft { min, max }` и семантика `null`

Ключевой приём: границы хранятся как **nullable**.

```
draft.min = null  →  нижней границы нет (визуально = domain.min, левый край)
draft.max = null  →  верхней границы нет (визуально = domain.max, «max+»)
```

Позиции ползунков для отрисовки:

```
lo = draft.min ?? domain.min
hi = draft.max ?? domain.max
```

При движении ползунка — **сворачиваем крайние значения обратно в null**, чтобы
«до упора вправо» означало «без потолка», а не «ровно $140k»:

```
onSliderChange(minVal, maxVal):
    draft.min = minVal <= domain.min ? null : minVal
    draft.max = maxVal >= domain.max ? null : maxVal
```

Шаг слайдера (≈1% ширины домена):

```
step = max(1, round((domain.max - domain.min) / 100))
```

Между ползунками минимум 1 шаг (не сходятся в точку).

Инициализация `draft` из применённых значений query:

```
initDraft(value, domain):
    min = value.priceMin ? clamp(value.priceMin, domain.min, domain.max) : null
    max = value.priceMax ? clamp(value.priceMax, domain.min, domain.max) : null
    return { min, max }
```

---

## 5. Поля Min / Max (ручной ввод)

Дублируют слайдер, пишут в тот же `draft`. Пустое поле = `null`.
Введённое значение зажимается так, чтобы min ≤ max:

```
clamp(v, lo, hi) = min(hi, max(lo, v))

onMinInput(raw):
    draft.min = raw == "" ? null : clamp(raw, domain.min, draft.max ?? domain.max)

onMaxInput(raw):
    draft.max = raw == "" ? null : clamp(raw, draft.min ?? domain.min, domain.max)
```

Слайдер и поля двусторонне связаны через один и тот же `draft`.

---

## 6. Apply / Reset

```
Apply:
    priceMin = draft.min ?? undefined     # null → параметр НЕ отправляется
    priceMax = draft.max ?? undefined
    отправить в /search: { priceMin, priceMax, currency: displayCurrency }
    закрыть поповер

Reset:
    очистить priceMin/priceMax из запроса
    закрыть поповер
```

> **Важно:** применённый диапазон уходит **в display-валюте**, вместе с признаком
> валюты. Бэкенд FX-нормализует границы по курсу ЦБУ и сравнивает с ценой каждого
> объявления в его валюте. Не конвертируйте границы на клиенте перед отправкой.

---

## 7. Подписи осей (`$0 … $140k`)

```
compactPrice(v, USD):
    v >= 1e6 → "$" + trim(v/1e6) + "M"      # $1.5M
    v >= 1e3 → "$" + round(v/1e3) + "k"     # $140k
    else     → "$" + round(v)

compactPrice(v, UZS):
    v >= 1e9 → trim(v/1e9) + " млрд"
    v >= 1e6 → trim(v/1e6) + " млн"
    v >= 1e3 → round(v/1e3) + "k"
    else     → round(v) + " сум"
```

`trim` — убрать `.0` у целых (1.5 → «1.5», 2.0 → «2»).

---

## Порядок сборки на мобилке (чек-лист)

1. Держать `resultPrices` (сырые пары цена+валюта) синхронно с выдачей `/search`.
2. При открытии фильтра: `toDisplayPrices` → `domain` (`niceCeil` / фолбэк)
   → `buildPriceHistogram(30)`.
3. Отрисовать 30 столбиков (высота = `count / maxCount`), поверх — двойной слайдер
   по домену `[0, domain.max]`.
4. `draft` с nullable-границами; слайдер и два поля пишут в один `draft`;
   крайние значения ↔ `null`.
5. Подсветка столбиков по `lo..hi` (mid бакета внутри диапазона → насыщенный цвет).
6. Apply → `{ priceMin, priceMax, currency }` в query (null не шлём); Reset → очистка.
7. Переинициализировать `draft` только при смене **валюты** / **типа сделки**,
   не при дозагрузке данных.

---

## Крайние случаи

| Ситуация | Поведение |
|---|---|
| Выдача пуста | `domain.max = FALLBACK_MAX[currency]`, гистограмма пустая (тонкая линия по низу) |
| Нет курса ЦБУ (`rate` неизвестен) | Объявления чужой валюты пропускаются в `toDisplayPrices` |
| Ползунок до упора вправо | `draft.max = null` → в query `priceMax` не уходит (без потолка) |
| Ползунок до упора влево | `draft.min = null` → в query `priceMin` не уходит |
| Цена ровно `domain.max` | Попадает в последний (30-й) бакет |
| Смена валюты при открытом фильтре | Пересчёт домена + гистограммы, `draft` реинициализируется |

---

## 8. Фильтр «Цена снижена» (`price_reduced`) — NEW

Отдельный boolean-фильтр рядом с ценовым (PR #477, ADR-0158). В вебе это чекбокс
в общих фильтрах; на мобилке сделайте так же — чекбокс/свитч «Цена снижена»
в панели фильтров.

**Источник в вебе:**
- `apps/client/src/features/search/FiltersPanel.tsx` — чекбокс (`CheckboxRow`)
- `apps/client/src/lib/api/listings.ts` → `buildSearchParams` — сериализация в query

### API-контракт

```
GET /api/v1/search?price_reduced=true
```

- Параметр описан в `apps/api/openapi.public.json`.
- Работает во **всех** поисковых эндпоинтах, DTO которых расширяют базовый:
  `/search`, `/search/bounds`, `/search/radius`, `/search/polygon`,
  `/search/clusters`. (К price-distribution неприменим — его больше нет, см. §0.)
- Семантика значений — **фильтр-флажок**, как `new_construction`/`is_basement`:

```
price_reduced=true   → только объявления с последним снижением цены
price_reduced=false  → фильтр НЕ применяется (эквивалент отсутствия)
отсутствует          → фильтр не применяется
мусор («1», «yes»)   → 400 VALIDATION_ERROR
```

Поэтому на мобилке: чекбокс включён → шлите строку `true`; выключен →
**не шлите параметр вообще** (не шлите `false`).

### Что значит «цена снижена» (считает сервер, клиент НЕ вычисляет)

Флаг денормализован на бэке (`listings.price_reduced`) и обновляется при
правке объявления владельцем:

```
снижение цены в той же валюте        → true
повышение цены                       → false
смена валюты (UZS↔USD)               → false   # цены несравнимы
правка без изменения (price,currency)→ флаг не меняется
```

Флаг «вечный» — живёт до следующего повышения (затухания по времени нет).
Мобилке ничего вычислять не нужно: только отправить параметр.

### UI-правила

- Лейблы (те же i18n-ключи, что в вебе — `search.filters.priceReduced`):
  RU «Цена снижена», UZ «Narx tushirilgan», EN «Price reduced».
- Комбинируется с любыми другими фильтрами, включая ценовой диапазон §6
  (это независимые параметры одного query).
- Reset фильтров обязан убирать параметр из запроса (как в §6 Reset).
- В ответах API флага **нет** — бейдж «Цена снижена» на карточках не рисуем
  (осознанно вне скоупа; появится — будет отдельное поле в card-shape).
- История цен объявления для экрана детали — как раньше, `price_history`
  в detail-ответе (ADR-0121); фильтр её не меняет.

### Saved search

Сохранённый поиск хранит фильтр как boolean в `filters_json`:

```json
{ "price_reduced": true }
```

Сервер учитывает его при матчинге. **Гоча:** алерт «уведомить о снижении цены»
из этого не получается — матчер алертов ходит окном по `published_at`, который
при снижении цены не обновляется (см. ADR-0158 Consequences). Фильтр в saved
search влияет на браузинг/восстановление, не на пуши о снижениях.
