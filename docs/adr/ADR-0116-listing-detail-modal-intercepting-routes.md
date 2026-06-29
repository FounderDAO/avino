# ADR-0116 — Listing detail modal via intercepting + parallel routes

## Status
Accepted

## Date
2026-06-29

## Context
Клиент: клик по карточке на `/search` должен открывать деталку в модальном окне
поверх выдачи (как Zillow), с возможностью открыть полную страницу/новую вкладку.
Нужно сохранить выдачу под модалкой, shareable URL и SEO полной страницы.

## Decision
Используем Next.js App Router Intercepting + Parallel Routes: слот `@modal` под
`[locale]`-лейаутом, перехватчик `@modal/(.)listing/[id]` рендерит переиспользуемый
`Detail` (режим `embedded`) внутри клиентского `ListingModal` (radix-ui Dialog).
Полная страница `/listing/[id]` не меняется и обслуживает hard-nav, новую вкладку,
прямой заход и SEO. Выкатка по умолчанию, без фиче-флага. Перехват действует на
любой soft-nav к `/listing/[id]` под лейаутом (главная/избранное/«похожие»).

## Consequences
Positive:
- Каноничный механизм; выдача `/search` не размонтируется (скролл/территория живут).
- Cmd/Ctrl-клик и «Открыть страницу» нативно дают полную страницу; SEO не дублируется.
- `PropertyCard` не меняется.

Negative / trade-offs:
- Модалка открывается с любой карточки портала, не только со `/search` (намеренно).
- Перехват — файловая магия App Router; нельзя выключить рантайм-флагом без рефактора.

## Related files
- apps/client/src/app/[locale]/@modal/default.tsx
- apps/client/src/app/[locale]/@modal/(.)listing/[id]/page.tsx
- apps/client/src/features/detail/ListingModal.tsx
- apps/client/src/features/detail/Detail.tsx
- apps/client/src/app/[locale]/layout.tsx

## Related task
- Listing detail modal on search card click
