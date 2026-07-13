# ADR-0143 — Управление сессиями пользователя (list + revoke по session family)

## Status

Accepted

## Date

2026-07-13

## Context

План security-hardening (аудит 2026-07, PR-3; продолжение ADR-0141/0142). У
пользователя может быть несколько долгоживущих refresh-сессий (телефон, ноутбук,
чужой компьютер), но до этого PR не было способа увидеть их и отозвать
конкретную: `POST /auth/logout` гасит только ту family, чей refresh-токен
предъявлен, т.е. только «этот» девайс.

Инфраструктура уже была готова (TASK-042/043, ADR-0010):

- `refresh_tokens` хранит `family_id` (fid = сессия), `jti`, `created_at`,
  `revoked_at`, `expires_at`, **а также `user_agent` и `ip`** — колонки
  записываются при каждом выпуске/ротации с самого начала. Отдельная миграция
  для «что за устройство» не потребовалась.
- Инвариант ротации (`rotateSession`): старая строка отзывается в той же
  транзакции, где создаётся новая → в family максимум одна активная строка.
  Активная строка целиком описывает сессию: её `created_at` — момент последней
  ротации, `min(created_at)` по family — момент логина.
- `revokeFamily` (отзыв всех активных строк family) уже реализован для
  reuse-detection и logout.

Открытый вопрос дизайна — как пометить **текущую** сессию в списке
(`is_current`), не заставляя клиента отправлять refresh-токен: access-токен нёс
только `sub`+`roles`, `fid` в payload не было.

## Decision

1. **`GET /api/v1/auth/sessions`** (Bearer) — по одной записи на активную
   family: `id` (fid), `created_at` (min по family), `last_rotated_at`
   (`created_at` активной строки), `user_agent`, `ip` (последний выпуск),
   `is_current`. Реализация: `findMany` активных строк + `groupBy _min(createdAt)`
   — без raw SQL и новых колонок.
2. **`DELETE /api/v1/auth/sessions/:fid`** (Bearer) → 204. Принадлежность
   проверяется парой `family_id + user_id`; чужая или несуществующая family →
   **404 NOT_FOUND** (не 403 — существование чужой сессии не раскрывается).
   Повторный отзыв своей family идемпотентен (204). Отзыв — существующим
   `revokeFamily`; успех пишется в `audit_logs`
   (`action='SESSION_REVOKED'`, `entity_type='refresh_token_family'`).
3. **Лимит активных сессий** (дополнение 2026-07-13): у пользователя не больше
   `AUTH_MAX_SESSIONS` (config `jwt.maxSessions`, дефолт 5) активных family.
   Enforcement — в `issueSession` (единственная точка создания family; ротация
   новых не создаёт) по схеме «создать, потом отрезать хвост» в одной
   транзакции: после вставки новой строки family сортируются по последней
   активности (`max(created_at)` = последняя ротация) и всё за пределами первых
   maxSessions отзывается существующим механизмом `revoked_at`. Логин никогда
   не отклоняется (UX-паттерн Google/банков: не блокировать вход из-за забытого
   устройства); вытесняется реально заброшенная сессия, а не самая ранняя по
   дате логина. Подрезка идемпотентна и самочинится: гонка параллельных логинов
   максимум кратковременно превышает лимит до следующего логина. Альтернатива
   «отклонять новый логин с ошибкой лимита» отвергнута: хуже UX, требует
   клиентского флоу разблокировки.
4. **`fid` добавлен в payload access-токена** (`issueSession`/`rotateSession`),
   guard кладёт его в `request.user.sessionFamilyId`. Это решает `is_current`
   без предъявления refresh-токена (альтернативы отвергнуты: refresh в body у
   GET — ломает семантику и гоняет секрет; отдельный `POST /auth/sessions/current`
   — лишний roundtrip). Обратная совместимость: access-токены, выпущенные до
   деплоя, `fid` не несут → у них все сессии `is_current=false`; окно исчезает
   за accessTtl (15 мин).

## Consequences

Positive:

- Пользователь (после клиентского PR) сможет увидеть свои устройства и убить
  подозрительную сессию; «kill switch» не зависит от владения refresh-токеном
  этой сессии.
- Ни одной миграции БД и ни одной новой колонки; переиспользованы
  `revokeFamily` и существующие индексы (`family_id`, `user_id`).
- 404 вместо 403 на чужой fid — не подтверждаем существование сессий других
  пользователей (анти-enumeration, тот же принцип, что 204 у logout).

Negative / trade-offs:

- Payload access-токена вырос на одно поле (`fid`) — размер JWT +~50 байт.
- `fid` в access-токене — идентификатор family, не секрет: подделка `fid` не
  даёт ничего, кроме неверной метки `is_current` в собственном списке.
- Отзыв действует на refresh-ротацию; уже выпущенный access-токен отозванной
  сессии живёт до конца accessTtl (15 мин) — стандартный компромисс stateless
  JWT (guard не ходит в БД).

Follow-ups (вне этого PR):

- Клиентская страница «Мои устройства» (apps/client) — следующий PR.
- Сокращение refresh TTL (сейчас 30 дней) — отдельное решение с Team Lead.
- Человекочитаемый парсинг user_agent (девайс/браузер) — на клиенте.

## Related files

- apps/api/src/auth/token.service.ts — `SessionInfo`, `listSessions`,
  `revokeUserFamily`, `fid` в access-payload, лимит сессий в `issueSession`
- apps/api/src/config/configuration.ts, env.validation.ts — `AUTH_MAX_SESSIONS`
- apps/api/src/auth/auth.service.ts — `listSessions` (маппинг контракта),
  `revokeSessionById` (404 + audit)
- apps/api/src/auth/auth.controller.ts — `GET /auth/sessions`,
  `DELETE /auth/sessions/:fid`
- apps/api/src/auth/dto/session-response.dto.ts — контракт ответа
- apps/api/src/common/guards/jwt-auth.guard.ts — `sessionFamilyId` в
  `request.user`
- apps/api/src/auth/auth-sessions.int-spec.ts — сквозной int-тест на живом PG
- docs/API.md §3

## Related task

- Security-hardening PR-3 (план ADR-0141), PR #387/#388 — предыдущие шаги
