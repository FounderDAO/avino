# ADR-0060 — Цветовая палитра публичного портала (тёплая нейтраль + красный бренд)

## Status

Accepted

## Date

2026-06-08

## Context

`apps/client` инициализирован на shadcn/ui (ADR-0059) с временной нейтральной
палитрой shadcn (baseColor neutral) и бренд-цветом из ADR-0043 (синий `#0041d9`).
Team Lead утвердил фактическую бренд-палитру портала: тёплая кремовая нейтраль с
красным акцентом и вспомогательными teal / green, отдельной светлой и тёмной
темами.

## Decision

Палитра задаётся в `apps/client/src/app/globals.css` через CSS-переменные и
маппится на shadcn semantic-токены (`@theme inline`), плюс вводятся бренд-акценты
как Tailwind-утилиты (`bg-teal`, `bg-mint`, `bg-green`, `bg-segment-track`).

Light (`:root`):

| Токен | Значение | shadcn-роль |
|---|---|---|
| bg `#F7F4EF` | тёплый крем | `--background` |
| surface `#FFFFFF` | поверхность | `--card`, `--popover`, `--sidebar` |
| primary `#E03C42` | красный бренд | `--primary`, `--ring`, `--destructive` |
| ink `#1A1A1A` | текст | `--foreground` |
| muted `#6F6F6F` | вторичный текст | `--muted-foreground` |
| border `#E4E0D8` | бордеры | `--border`, `--input` |
| segment-track `#ECE8DF` | трек/secondary | `--secondary`, `--muted` |
| teal `#157E84` | акцент | `--accent-foreground`, `--color-teal` |
| mint `#E4F2F2` | фон-акцент | `--accent`, `--color-mint` |
| green `#1E8E3E` | success | `--color-green` |

Dark (`.dark`): bg `#14130F`, surface `#201E1A`, ink `#F2EEE6`, teal `#3FB3B8`,
mint `#16302F`, green `#34C759`, muted `#9B958A`, border `#34322B`,
segment-track `#2A2823`; primary остаётся `#E03C42`.

Замечания:
- `--primary-foreground` = `#FFFFFF` (белый текст на красном).
- Dark-mode — class-стратегия (`<html class="dark">`, ADR-0043/0059), а не
  `[data-theme]`.
- Синий бренд из ADR-0043/0059 более не используется в `apps/client`; этот ADR
  заменяет цветовую часть тех решений (структура shadcn из ADR-0059 в силе).
- Tailwind v4 `@theme inline` — единый источник; отдельный `tailwind.config.js`
  не вводится.

## Consequences

Positive:
- Единая брендовая палитра, согласованная light/dark; компоненты shadcn (Button и
  будущие) подхватывают её автоматически через semantic-токены.
- Бренд-акценты teal/mint/green доступны как обычные утилиты.

Negative / trade-offs:
- Расхождение с исходным синим брендом ADR-0043 (осознанная смена).
- Подбор `chart-*` под бренд приблизительный — уточняется при появлении графиков.

## Related files

- apps/client/src/app/globals.css
- apps/client/src/app/layout.tsx
- apps/client/src/app/page.tsx

## Related task

- TASK-151
