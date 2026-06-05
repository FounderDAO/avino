# ADR-0046 — Web admin OTP login page + chrome-less route in (admin) group

## Status

Accepted

## Date

2026-06-06

## Context

ADMIN-05 добавляет страницу логина админки (`apps/web`). Авторизация —
passwordless OTP (ADR-0014/0015, API.md §3); хранение токенов и авто-refresh уже
готовы (ADR-0045). Канал для MVP — **EMAIL** (без затрат на SMS, раздел 0
TASK_ADMIN_PANEL.md).

Два решения требуют фиксации:

1. **Размещение и оформление логина.** Route group `(admin)` (ADR-0044) оборачивает
   всё содержимое в TailAdmin-оболочку (`AdminShell`: sidebar + header). Карточка
   задачи фиксирует путь `src/app/(admin)/admin/login/page.tsx` — то есть логин
   физически лежит внутри той же группы, но должен быть **полноэкранным**, без
   sidebar/header (это экран до аутентификации).
2. **Обработка ошибок OTP.** Backend отдаёт стабильные коды (`OTP_INVALID`,
   `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED`, `RATE_LIMITED`, `USER_BLOCKED`,
   `VALIDATION_ERROR`; API.md §17) в унифицированном envelope `{ error: { code,
   message, … } }` (API.md §4). UI должен мапить именно `code`, не завязываясь на
   `message`.

## Decision

**Chrome-less маршрут через `ConditionalShell`.** Вместо альтернативного route
group (например `(auth)`) вводим клиентский компонент
`src/layout/ConditionalShell.tsx`, который по `usePathname()` решает: маршруты из
списка `CHROMELESS_ROUTES` (`/admin/login`) рендерятся как есть, остальные —
обёрнуты в `AdminShell`. Layout `(admin)` теперь рендерит `ConditionalShell`
вместо `AdminShell` напрямую. Провайдеры (`ThemeProvider`, `SidebarProvider`)
остаются на уровне layout, поэтому переключатель темы работает и на логине.

- Сохраняем путь, зафиксированный карточкой задачи (без переноса в новую группу).
- `ConditionalShell` — естественная точка для гарда роли ADMIN (ADMIN-06):
  редирект неаутентифицированных на `/admin/login` и экран 403 встанут сюда.

**Двухшаговая форма.** Шаг 1 — email → `requestOtp({ channel: 'EMAIL' })`; шаг 2 —
6-значный код → `verifyOtp` → `setCredentials` (ADR-0045) → `router.replace('/admin')`.
Таймер повторной отправки берётся из `resend_after` ответа; поле кода принимает
только цифры (`inputMode=numeric`, `autoComplete=one-time-code`).

**Мапинг ошибок по коду.** Хелпер `src/store/api/apiError.ts`
(`getApiError`/`getApiErrorCode`) разбирает envelope; страница переводит код в
RU-текст (`messageForCode`). Хелпер переиспользуем для adminApi (ADMIN-07+).

## Consequences

- (+) Логин полноэкранный без отдельного route group; путь — как в карточке.
- (+) Гард ADMIN-06 имеет готовую точку подключения (`ConditionalShell`).
- (+) Стабильные коды ошибок отвязаны от текста — устойчиво к изменению `message`.
- (−) Список chrome-less маршрутов ведётся вручную в `ConditionalShell`; при
  добавлении новых публичных экранов под `(admin)` его нужно расширять.
- RU-only (i18n — ADMIN-17). httpOnly-cookie для токенов — hardening позже
  (раздел 0).

## Alternatives considered

- **Отдельный route group `(auth)` со своим layout без оболочки.** Чище
  концептуально, но требует увести логин из пути, зафиксированного карточкой, и
  продублировать провайдеры. Отложено как избыточное для одного экрана.
- **Сегментированный 6-боксовый OTP-инпут.** Красивее, но сложнее по a11y и
  вставке кода; одно поле с `one-time-code` надёжнее для MVP.
