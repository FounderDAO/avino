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

## Follow-up (2026-06-30) — лайтбокс галереи внутри модалки

Баг: внутри модалки клик по фото открывал лайтбокс, но любое взаимодействие с ним
закрывало модалку и не давало листать. Причина: radix `Dialog` в modal-режиме
ставит `body { pointer-events: none }` (интерактивен только `Dialog.Content`), а
`Lightbox` порталится в `document.body` (вне `Dialog.Content`) — он становился
мёртвым, а его клики проваливались на Radix-оверлей → dismiss.

Фикс: на корень `Lightbox` добавлены `pointer-events-auto` + маркер `data-lightbox`;
в `ListingModal` `onInteractOutside`/`onEscapeKeyDown` гасят dismiss/escape, когда
взаимодействие идёт по `[data-lightbox]`. На полной странице поведение не меняется
(там `body` уже `auto`). Правило на будущее: любой портал-оверлей, открываемый
поверх модалки, должен нести `pointer-events-auto` и `data-lightbox`-подобный маркер.

Related files: apps/client/src/components/ui/lightbox.tsx,
apps/client/src/features/detail/ListingModal.tsx.

## Related task
- Listing detail modal on search card click
