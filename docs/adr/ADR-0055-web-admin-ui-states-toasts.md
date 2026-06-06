# ADR-0055 — Единые состояния и toast-уведомления админ-панели

## Status

Accepted

## Date

2026-06-06

## Context

К ADMIN-16 веб-админка (`apps/web`) набрала восемь разделов (ADMIN-08..15).
Состояния загрузки/ошибки/пустоты и обратная связь по мутациям сложились
неоднородно:

- Табличные состояния были унифицированы ещё в `DataTable` (ADMIN-08) —
  skeleton/error+retry/empty внутри контейнера таблицы.
- Детальные карточки (`listings/[id]`, `users/[id]`) дублировали свои блоки
  skeleton (6 pulse-строк), not-found и ошибки с кнопкой «Повторить» — копипаста
  1:1 в двух файлах.
- Дашборд (ADMIN-15) рендерил баннер ошибки на семантическом токене
  `--color-error`, тогда как остальные ошибки — на шкале TailAdmin
  (`error-600/500`). Визуальная рассинхронизация.
- Успех/ошибка мутаций показывались inline-баннерами на четырёх экранах
  (`complaints`, `listings/[id]`, `users/[id]`, `PromotionsPanel`): зелёный
  «успех» висел до перехода/перерендера, ошибки жили то в баннере страницы, то
  внутри диалога. Единого механизма не было.

Нужен единый UX состояний по всей админке (acceptance ADMIN-16), без смены стека
и без новых тяжёлых зависимостей.

## Decision

1. **Toast-механизм — in-house, без сторонней зависимости.** Лёгкий React
   Context (`components/admin/toast/ToastProvider.tsx`): очередь эфемерных
   уведомлений, авто-дисмисс (5 c), ручное закрытие, варианты
   `success/error/info`. Хук `useToast()` отдаёт `{ success, error, info }`.
   Viewport — фиксированный top-right, `z-[100]` (поверх модалок `z-50`),
   `role="status"`/`alert` + `aria-live`. Провайдер монтируется один раз в layout
   группы `(admin)`. Это чистое эфемерное UI-состояние, поэтому Context, а не
   Redux/RTK Query (правило §4 — про API-слой, не про UI). Решение в духе
   вендоринга TailAdmin (ADR-0043): не тянем `react-hot-toast`/`sonner`.

2. **Все исходы мутаций → toast.** Успех и серверная ошибка любой мутации
   (модерация листинга, статус/роли пользователя, статус жалобы, активация/
   продление/отмена промо) уходят в toast. Inline-баннеры успеха удалены.
   Клиентская валидация формы («укажите причину») остаётся inline внутри
   диалога — это пред-сабмит проверка, а не исход мутации. При серверной ошибке
   диалог не закрывается (можно поправить и повторить), сообщение — в toast.

3. **Состояния уровня страницы вынесены в общий модуль** `components/admin/states.tsx`:
   `DetailSkeleton`, `ErrorState` (сообщение + «Повторить»), `InfoState`
   (not-found/пусто), `InlineAlert` (компактный баннер, например ошибка
   дашборда). Дубли в детальных карточках заменены на эти примитивы; дашборд
   переведён на `InlineAlert` (единая шкала `error-600/500`).

`DataTable` остаётся отдельным владельцем табличных состояний (они рендерятся
внутри контейнера таблицы, сохраняя заголовок) — переиспользование `states.tsx`
там не требуется.

## Consequences

Positive:
- Единый UX: успех/ошибка мутаций — одинаковый toast по всем разделам;
  состояния детальных карточек — общий код.
- Ноль новых зависимостей; bundle админ-страниц практически не вырос.
- Доступность: toast анонсируется ассистивным технологиям (`aria-live`).
- Меньше дублирования: skeleton/error/not-found описаны один раз.

Negative / trade-offs:
- Самописный toast проще библиотек: нет swipe-to-dismiss, очередь без лимита/
  схлопывания дубликатов, без позиционных пресетов. Для внутреннего инструмента
  достаточно; при необходимости расширяется точечно.
- Toast вне Redux — нельзя дёрнуть из middleware (например, глобальный перехват
  ошибок baseQuery). Сейчас не требуется; при появлении нужды механизм можно
  переключить на slice без смены публичного `useToast()`.

## Related files

- apps/web/src/components/admin/toast/ToastProvider.tsx
- apps/web/src/components/admin/states.tsx
- apps/web/src/app/(admin)/admin/layout.tsx
- apps/web/src/app/globals.css
- apps/web/src/components/admin/DashboardOverview.tsx
- apps/web/src/components/admin/PromotionsPanel.tsx
- apps/web/src/app/(admin)/admin/complaints/page.tsx
- apps/web/src/app/(admin)/admin/listings/[id]/page.tsx
- apps/web/src/app/(admin)/admin/users/[id]/page.tsx

## Related task

- ADMIN-16 (docs/TASK_ADMIN_PANEL.md)
