# ADR-0123 — Toast-уведомления клиента: sonner + глобальный перехват ошибок мутаций

## Status

Accepted

## Date

2026-07-04

## Context

Пользователь публичного портала не получал системной обратной связи об успехе
или причине сбоя действий. Часть форм показывала ошибки инлайн (LoginModal,
TourRequestModal), но многие мутации молча глотали сбои (`.catch(() => {})` в
списках туров, Google/Apple-логин, смена статуса объявления, удаление
сохранённого поиска), а успех подтверждался в лучшем случае ad-hoc надписью
(Profile). Единого паттерна не было; каждый новый экран решал задачу заново
или не решал вовсе.

## Decision

1. **Библиотека — sonner** (~5kb): imperative API `toast.success/error`
   вызывается из любого места, включая Redux-middleware. `<Toaster
   position="top-center">` монтируется один раз в `StoreProvider`, стилизован
   под токены проекта (surface/ink/border; успех — teal, ошибка — red),
   `z-[90]` — выше модалок.

2. **Ошибки мутаций перехватываются глобально**:
   `store/apiErrorToastMiddleware.ts` ловит `isRejectedWithValue` для мутаций
   RTK Query и эмитит событие в модульный bus (`lib/apiErrorToastBus.ts`);
   клиентский компонент `components/ApiErrorToasts.tsx` (внутри StoreProvider)
   переводит ошибку через `useTranslations('toasts')` (известный код → свой
   текст, сетевой сбой → «Нет соединения», иначе generic) и показывает
   `toast.error`. Разделение обязательно: middleware живёт вне React и не
   имеет доступа к i18n.

3. **Suppress-list**: эндпоинты с инлайн-обработкой ошибок и фоновая
   инфраструктура (refresh/logout, трекинг просмотров/звонков, отметки
   прочтения) перечислены в `SUPPRESSED_ENDPOINTS` и не тостятся
   автоматически. Queries не тостятся вовсе — у них свои error/empty-состояния.

4. **Успехи — вручную** в значимых точках: вход (OTP/Google/Apple), сохранение
   профиля/настроек/объявления, смена статуса объявления, подтверждение/
   отклонение/отмена тура, удаление сохранённого поиска. Частые действия
   (избранное) и флоу с собственными success-экранами (ListingNew,
   TourRequestModal, кнопка «Сохранить поиск» в FilterBar) не тостятся.

## Consequences

Positive:

- Ни одна ошибка мутации не теряется молча — включая будущие эндпоинты,
  которые получают обратную связь «бесплатно».
- Единый визуальный паттерн фидбэка на 3 языках (`toasts.*` в messages).
- Инлайн-обработка форм сохранена без дублей благодаря suppress-list.

Negative / trade-offs:

- Suppress-list нужно пополнять при добавлении эндпоинтов с инлайн-обработкой
  (иначе двойной показ ошибки).
- Новая зависимость sonner (компенсируется размером и де-факто статусом
  стандарта).

## Related files

- apps/client/src/store/apiErrorToastMiddleware.ts
- apps/client/src/lib/apiErrorToastBus.ts
- apps/client/src/components/ApiErrorToasts.tsx
- apps/client/src/store/StoreProvider.tsx
- docs/superpowers/plans/2026-07-04-client-toast-notifications.md

## Related task

- Toast-уведомления клиента (задача Team Lead от 2026-07-04)
