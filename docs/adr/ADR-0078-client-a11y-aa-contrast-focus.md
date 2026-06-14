# ADR-0078 — A11y-базис портала: AA-контраст третичного текста + focus-visible (apps/client)

## Status

Accepted

## Date

2026-06-15

## Context

Два барьера доступности на публичном портале:

1. **Контраст третичного текста.** Токен `--muted-2` (третичный текст) был
   `#908a7e` в светлой теме (≈3.43:1 на белом) и `#7a746a` в тёмной (≈3.59:1) —
   ниже WCAG AA для мелкого текста (нужно ≥4.5:1).
2. **Фокус-состояния.** Кастомные интерактивы (`Pill`/`Chip`, `Segment`,
   `TriggerButton`/`ViewToggleButton` и `<select>` в `FilterBar`) полагались
   только на глобальный `* { outline-ring/50 }` — слабый/неявный фокус при
   клавиатурной навигации.

## Decision

Зафиксировать AA-базис для текста и явные focus-visible-кольца на интерактивах.

- **Контраст `--muted-2`** в `globals.css` поднят до ≥4.5:1, тёплый оттенок
  сохранён:
  - светлая: `#908a7e` → `#6b655a` (≈**5.78:1** на `#ffffff`);
  - тёмная: `#7a746a` → `#9b958a` (≈**5.59:1** на тёмной поверхности).
- **focus-visible-кольца** добавлены на `Pill`/`Chip` (`pill.tsx`), кнопки
  `Segment` (`segment.tsx`), `TriggerButton`/`ViewToggleButton` и `<select>`
  сортировки (`FilterBar.tsx`):
  `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
  focus-visible:ring-offset-2 focus-visible:ring-offset-surface`.
- **Цвет — не единственный индикатор**: активный фильтр-чип (TASK-200) различим
  бордером и иконкой `×`, а не только заливкой.

## Consequences

Positive:
- Весь третичный/вторичный текст соответствует WCAG AA (≥4.5:1 для мелкого).
- Клавиатурная навигация (Tab) даёт чёткое видимое кольцо на всех кастомных
  контролах фильтр-бара и чипах.

Negative / trade-offs:
- Это базовый проход по компонентам фильтра/чипов; полный a11y-аудит остальных
  страниц портала — отдельная задача.
- `--muted-2` визуально темнее/контрастнее прежнего (намеренно).

## Related files

- apps/client/src/app/globals.css
- apps/client/src/components/ui/pill.tsx
- apps/client/src/components/ui/segment.tsx
- apps/client/src/features/search/FilterBar.tsx

## Related task

- TASK-206
