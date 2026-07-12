# ADR-0140 — Регистрация агента: заявка + модерация, публичный каталог, `agent_id`-фильтр

## Status

Accepted

## Date

2026-07-12

## Context

Обычный клиент (без роли AGENT/AGENCY) ограничен лимитом активных объявлений
(`active_listing_limit` в `app_settings`, default 2; занятые слоты = ACTIVE +
NEW). При попытке опубликовать объявление сверх лимита API корректно
возвращает `422 ACTIVE_LISTING_LIMIT_REACHED`, но в веб-визарде ошибка
отображалась мелким текстом на последнем шаге — пользователь её не замечал и
воспринимал как «молча не публикуется». Стать агентом самостоятельно было
невозможно: роль `AGENT` назначал только админ (`POST
/admin/users/:id/roles`). Блок «Агенты» на главной клиента был на моках
(`apps/client/src/lib/mock/agents.ts`).

Запрос клиента (Team Lead, брейнсторм 2026-07-12, спека
`docs/superpowers/specs/2026-07-12-agent-registration-design.md`): дать
пользователю заметный путь «Стать агентом» вместо тихого отказа, и показать
риелторов на платформе (список + профиль + бейдж на объявлении).

## Decision

1. **Заявка + модерация админом**, а не мгновенная самостоятельная
   регистрация — соответствует существующей культуре модерации платформы
   (все листинги тоже проходят очередь) и защищает список риелторов от спама.
   Новая таблица `agent_applications` (не флаги на `users`) — хранит историю
   заявок и причину отказа, видимую пользователю (`DB_SCHEMA.md` §18).
   Partial unique index `user_id WHERE status='PENDING'` — одна активная
   заявка на пользователя; после `REJECTED` разрешена новая подача (новая
   строка, история сохраняется).
2. **Анкета-минимум**: `agency_name` (опционально — частный маклер без
   агентства) + `about` («о себе»). Имя/телефон/аватар берутся из профиля
   пользователя — не дублируются в анкете.
3. **Эндпоинты** (`API.md` §21): пользователь —
   `POST/GET /users/me/agent-application`; админ —
   `GET /admin/agent-applications` + `:id/approve|:id/reject`. `approve` —
   одна транзакция: статус → `APPROVED` + идемпотентный `upsert` роли `AGENT`
   (переживает роль, выданную админом вручную ранее) + `audit_logs(ROLE_CHANGE)`
   + уведомление. Новые коды ошибок: `409 AGENT_APPLICATION_PENDING`,
   `409 ALREADY_AGENT`; переходы статуса — существующий
   `422 INVALID_STATUS_TRANSITION`.
4. **Публичный каталог `GET /agents` + `GET /agents/:id`** — не ADMIN-only.
   Агент = `ACTIVE`-пользователь с ролью `AGENT`/`AGENCY`, независимо от того,
   назначена роль по заявке или админом напрямую (в последнем случае
   `agency_name`/`about` — `NULL`, источника-заявки нет). Счётчик активных
   объявлений — агрегат по `listings`, сортировка по нему.
5. **`agent_id`-фильтр вместо `/agents/:id/listings`**: страница профиля
   агента переиспользует существующий публичный поиск (§9) с новым query-
   параметром `agent_id` (= `owner_id`, без проверки роли — `owner_id` и так
   публичен в detail-ответе). Параметр добавлен в базовый
   `SearchListingsQueryDto`, поэтому автоматически наследован во всех
   гео-эндпоинтах (`/search/bounds`, `/search/radius`, `/search/near-me`,
   `/search/polygon`, `/search/clusters`) без отдельного контроллера/сервиса
   и без дублирования card-shape/пагинации/промо-сортировки. Отклонение от
   исходной спеки (там был отдельный `/agents/:id/listings`) — сознательное
   упрощение: одна точка правды для card-shape листинга вместо двух.
6. **Отказ от `owner_is_agent` в detail-ответе листинга**: бейдж «Риелтор» на
   detail-странице реализуется клиентом через уже существующее поле
   `contact.type` (`owner`/`agent`/`agency`, ADR-0069, §7) — оно уже
   вычисляется из ролей владельца. Добавление отдельного булева поля было бы
   дублированием одного и того же факта двумя полями ответа.
7. **Отказ от `details: { limit, used }` в `422 ACTIVE_LISTING_LIMIT_REACHED`**:
   `details` в конверте ошибки (`API.md` §4/§17) зарезервирован под
   структурированные issues валидации тела/query (`{ field, issue }`), не под
   произвольную бизнес-полезную нагрузку — смешение назначений усложнило бы
   контракт для остальных `422`. Число активных объявлений клиент при
   необходимости получает отдельным запросом (`GET /listings/mine`), лимит —
   через уже существующий публичный `GET /settings/public → activeListingLimit`.
8. **Уведомление `AGENT_APPLICATION_RESOLVED` — канал только `IN_APP`**
   (routing-конфиг `notification-routing.ts`, не email/push): решение по
   заявке не настолько срочно, чтобы прерывать пользователя пуш-уведомлением;
   пользователь видит его в ленте `GET /notifications` при следующем визите.
   `data_json: { application_id, status, reject_reason }`.
9. **Аватары** в админ-списке заявок и в публичном каталоге агентов — общий
   хелпер `resolveAvatarUrl` (ADR-0134): storageKey (загружен пользователем)
   → sign-on-read; иначе внешний `avatarUrl` (Google/Apple OAuth) как есть —
   без прогона через `resolveMediaUrl`, которое сломало бы внешнюю ссылку.

## Consequences

Positive:
- Заметный, предсказуемый путь роста «клиент → агент» вместо тихого 422 в
  визарде; лимит объясняется пользователю на его языке, а не кодом ошибки.
- Публичный каталог агентов — реальные данные вместо моков на главной клиента;
  бейдж «Риелтор» не требует нового поля в контракте листинга.
- `agent_id` как обычный поисковый параметр — переиспользует всю
  инфраструктуру `/search*` (промо-приоритет, пагинация, FX, гео) без нового
  дублирующего сервиса.
- История заявок (включая отклонённые с причиной) сохраняется — полезно для
  будущей аналитики модерации агентов.

Negative / trade-offs:
- Модерация — не мгновенная активация: пользователь ждёт решения админа
  (соответствует продуктовой модели платформы, но требует, чтобы админ не
  игнорировал очередь).
- `agent_id` не проверяет, что владелец действительно ещё агент на момент
  запроса (значение просто фильтрует по `owner_id`) — если роль отозвана
  (вне охвата, отзыва роли ещё нет), старые ссылки на `/search?agent_id=`
  продолжат отдавать его объявления; приемлемо, т.к. отзыва роли агента в
  MVP нет.
- `IN_APP`-only уведомление о решении заявки может быть не замечено сразу,
  если пользователь не открывает ленту уведомлений — компенсируется тем, что
  `GET /users/me/agent-application` сам отдаёт актуальный статус при заходе
  на `/become-agent`.
- Расширенная анкета (лицензии, документы, районы работы), полный каталог с
  поиском/фильтрами и бейдж риелтора на карточках `/search` — вне охвата
  (см. спеку, раздел «Вне объёма»).

## Related files

- apps/api/prisma/schema.prisma (`AgentApplication`, `AgentApplicationStatus`,
  `NotificationType.AGENT_APPLICATION_RESOLVED`)
- apps/api/prisma/migrations/20260712150000_add_agent_applications/migration.sql
- apps/api/src/agent-applications/* (сервис, оба контроллера, DTO)
- apps/api/src/agents/* (сервис, контроллер, DTO)
- apps/api/src/notifications/notifications.service.ts (`queueAgentApplicationResolved`)
- apps/api/src/notifications/delivery/notification-routing.ts
- apps/api/src/search/dto/search-listings.dto.ts, apps/api/src/search/search.service.ts (`agent_id`)
- apps/api/src/common/dto/error-response.dto.ts (`AGENT_APPLICATION_PENDING`, `ALREADY_AGENT`)
- apps/api/src/common/openapi/swagger.documents.ts (`PUBLIC_MODULES`)
- apps/api/src/admin/admin.module.ts (`AdminAgentApplicationsController`)
- apps/api/openapi.public.json, apps/api/openapi.internal.json
- docs/API.md §7, §9, §14, §17, §21
- docs/DB_SCHEMA.md §18

## Related task

- Спека: docs/superpowers/specs/2026-07-12-agent-registration-design.md
- PR1 (api): миграция + заявки + публичные агенты + `agent_id`-фильтр + openapi/API.md + ADR
