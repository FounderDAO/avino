# ADR-0145 — Страница «Мои устройства» в публичном портале (UI-слой ADR-0143)

## Status

Accepted

## Date

2026-07-13

## Context

План security-hardening (продолжение ADR-0141/0142/0143). Бэкенд #389 дал
контракт управления сессиями (`GET /auth/sessions`,
`DELETE /auth/sessions/:fid`, docs/API.md §3), но у пользователя не было UI,
чтобы увидеть свои устройства и отозвать подозрительную сессию.

Вопросы дизайна клиентского слоя:

1. Где разместить страницу: отдельный пункт меню кабинета vs секция внутри
   «Настроек».
2. Как показывать «что за устройство»: `user_agent` — сырая строка; тянуть
   парсер-библиотеку (ua-parser-js и т.п.) не хочется ради одного экрана.
3. Как трактовать `404 NOT_FOUND` на DELETE: по контракту это и «чужая», и
   «уже отозванная» сессия (анти-enumeration), для владельца на этой странице
   практически всегда второе.

## Decision

1. **Отдельная вкладка кабинета `/account/devices`** («Устройства») — через
   существующую пару `ACCOUNT_TABS`/`TAB_CONTENT`; список сессий с
   destructive-действием — самостоятельный экран, а не секция настроек.
   «Защищённость» роута — по образцу других вкладок (Notifications): эндпоинт
   Bearer-only, гость получает EmptyState с подсказкой войти,
   `{ skip: !isAuthenticated }` в query-хуке.
2. **`sessionsApi`** (`store/api/sessionsApi.ts`, RTK Query поверх `baseApi`):
   `getSessions` (тег `Session`) + `revokeSession`
   (`invalidatesTags: ['Session']` → авто-рефетч списка). Прямых fetch в
   компонентах нет (CLAUDE.md §4).
3. **Простой парс `user_agent` без библиотек** (`sessionDevice.ts`):
   таблицы regex → семейство браузера (Yandex/Edge/Opera/Samsung/Firefox/
   Chrome/Safari, специфичные маркеры первыми) и ОС (Windows/iOS/Android/
   macOS/Linux), подпись «Chrome · macOS»; нераспознанное → «Неизвестное
   устройство». Точности «какое из моих устройств это» достаточно.
4. **Карточка сессии**: иконка (Monitor/Smartphone по mobile-маркеру), IP,
   «Вход» = `created_at`, «Активность» = `last_rotated_at`
   (локале-зависимый `useFormatter().dateTime`), бейдж «Текущая сессия» по
   `is_current`. Сортировка: текущая первой, дальше по свежести активности.
5. **«Завершить» только у не-текущих** — завершение текущей сессии = logout,
   он уже есть в шапке. Флоу: `window.confirm` (прецедент MyListings) →
   DELETE → success-toast; **404 трактуем как «Сессия уже завершена»** —
   info-toast + ручной `refetch()` (invalidatesTags на ошибке не срабатывает),
   не ошибка. Прочие ошибки — error-toast с `message` из envelope. Эндпоинт
   `revokeSession` добавлен в `SUPPRESSED_ENDPOINTS` — все тосты ручные,
   авто-тост дал бы ошибку на легитимный 404.
6. Старые access-токены без `fid` дают `is_current=false` у всех сессий
   (ADR-0143) — UI это не компенсирует: окно исчезает за accessTtl (15 мин),
   кнопка «Завершить» на своей сессии безопасна (бэк вернёт 204, юзер просто
   разлогинится при следующем refresh).

## Consequences

Positive:

- Пользователь видит все активные сессии и может убить подозрительную —
  завершающий шаг «kill switch» из ADR-0143.
- Ни одной новой зависимости; UA-парсер — 50 строк чистой функции с тестами.
- i18n ru/uz/en; имена браузеров/ОС — имена собственные, не переводятся.

Negative / trade-offs:

- Regex-парсер UA грубее библиотек (не различает версии, экзотические
  браузеры → «Неизвестное устройство») — осознанный размен на 0 зависимостей.
- `window.confirm` вместо стилизованной модалки — консистентно с MyListings;
  красивый confirm — отдельная задача, если появится дизайн.
- Если сессию отозвали с другого устройства, список у открытой вкладки не
  обновится сам (нет realtime-инвалидации) — увидит при следующем заходе или
  после собственного действия.

## Related files

- apps/client/src/store/api/sessionsApi.ts — RTK Query list + revoke
- apps/client/src/store/api/baseApi.ts — тег `Session`
- apps/client/src/store/apiErrorToastMiddleware.ts — `revokeSession` в
  SUPPRESSED_ENDPOINTS
- apps/client/src/features/account/Devices.tsx — вкладка «Устройства»
- apps/client/src/features/account/sessionDevice.ts — парс user_agent
- apps/client/src/features/account/AccountLayout.tsx,
  apps/client/src/app/[locale]/account/[tab]/page.tsx — роутинг вкладки
- apps/client/messages/{ru,uz,en}.json — `account.tabs.devices`,
  `account.devices.*`
- apps/client/src/features/account/Devices.test.tsx,
  sessionDevice.test.ts — vitest

## Related task

- Security-hardening: клиентский слой PR #389 (ADR-0143); предыдущие шаги —
  #387 (ADR-0141), #388 (ADR-0142)
