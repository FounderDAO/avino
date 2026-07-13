# ADR-0144 — Ипотечный калькулятор публичного портала (клиентский расчёт)

## Status

Accepted

## Date

2026-07-13

## Context

Мобильное приложение (Flutter) получило ипотечный калькулятор; клиент попросил
1:1 повторить его на вебе. Спека мобильной команды —
`docs/mortgage-calculator-web-spec.md` (математика, экраны, персистентность,
чек-лист приёмки). Ключевые требования: расчёт полностью на клиенте (зарплата
приватна и не покидает устройство), валюта расчёта = валюта показа [сум|$],
вердикт по DTI ≤ 40%, сходимость округлений с мобильным приложением.

## Decision

1. **Backend не участвует.** Никаких новых endpoint'ов; единственный сетевой
   запрос — существующий `GET /api/v1/exchange-rate` (без параметров).
   Зарплата живёт только в Redux + localStorage.
2. **Слои** (все — `apps/client`):
   - `lib/mortgage.ts` — чистая математика (аннуитет, `suggestFix` с приоритетом
     срок→взнос(на 30 годах)→бюджет, `maxAffordablePrice`, `niceFloorPrice`).
     Правила округления спеки закреплены тестами: `monthly` до целого,
     `totalPaid` от округлённого `monthly`, `dtiPct` целый, `affordable = dti <= 40`.
   - `store/slices/mortgageSlice.ts` — параметры пользователя. Ключи localStorage
     совпадают с мобильными (`mortgage_salary`, `mortgage_salary_currency`,
     `mortgage_down_pct`, `mortgage_rate_pct_usd`, `mortgage_rate_pct_uzs`,
     `mortgage_years`). Ставки USD/UZS хранятся раздельно. Ленивый initialState
     по паттерну authSlice (переживает пересоздание store при смене локали, #386).
     Гонка «загрузка vs ввод» из Flutter-спеки на вебе отсутствует —
     localStorage синхронный.
   - `lib/useMortgage.ts` — единственная точка сборки: слайс + валюта показа +
     курс → вход математики (`useMortgageParams`, `useListingMortgage`,
     `salaryInDisplay`, `firstPaymentBreakdown`). Зарплата в чужой валюте без
     загруженного курса → поле пустое/спиннер (не показываем число в другой валюте).
3. **Роуты**: `/[locale]/listing/[id]/mortgage` (форма) и `…/mortgage/result`
   (результат). Оба — server components с SSR-фетчем объявления (цена не
   редактируется), состояние формы/результата общее (store): кнопки
   рекомендаций мутируют слайс, результат пересчитывается на месте.
4. **Виджеты на detail** — est-полоска и карточка «Ежемесячный платёж»
   (структура первого платежа) — только для продажи (`tx === 'SALE'`);
   реактивность через Redux: изменения в калькуляторе сразу видны на detail.
5. **Рекомендация «Смотреть дома до X»** ставит фильтр максимальной цены
   поиска в текущей валюте (конвенция `priceRange` из `/search`), цена
   предварительно округляется вниз `niceFloorPrice` (USD→тысячи, UZS→миллионы).

## Consequences

Positive:

- Приватность зарплаты гарантирована архитектурно (нет transport-слоя).
- Совместимость по неймингу ключей localStorage с мобилкой — единая ментальная
  модель и переносимость дефолтов в будущем WebView/Flutter-web.
- Чистая математика без зависимостей — тестируется точечно, переиспользуема.

Negative / trade-offs:

- Дефолтные ставки (22% UZS / 8% USD) зашиты константами — изменение рыночных
  ставок требует релиза (осознанно, как в мобилке; вынос в publicSettings —
  отдельное решение при необходимости).
- Параметры пользователя не синхронизируются между устройствами (localStorage
  only) — принято, это приватные данные.

## Related files

- apps/client/src/lib/mortgage.ts, mortgage.test.ts
- apps/client/src/lib/useMortgage.ts
- apps/client/src/store/slices/mortgageSlice.ts, mortgageSlice.test.ts
- apps/client/src/app/[locale]/listing/[id]/mortgage/{page.tsx,result/page.tsx}
- apps/client/src/features/mortgage/*
- apps/client/src/features/detail/{MortgageEstBar.tsx,MortgagePaymentCard.tsx}
- apps/client/messages/{ru,en,uz}.json (`mortgage.*`)
- docs/mortgage-calculator-web-spec.md

## Related task

- Ипотечный калькулятор web-клиента (спека мобильной команды, 2026-07-13)
