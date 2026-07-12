# Регистрация агента (риелтора): лимит объявлений → заявка → публичный профиль

**Дата:** 2026-07-12
**Статус:** утверждено (brainstorming с владельцем)

## Проблема

Обычный клиент (без роли AGENT/AGENCY) ограничен лимитом активных объявлений
(`active_listing_limit` в app_settings, default 2; занятые слоты = ACTIVE + NEW).
При попытке опубликовать объявление сверх лимита API корректно возвращает
`422 ACTIVE_LISTING_LIMIT_REACHED`, но в веб-визарде ошибка отображается мелким
текстом на последнем шаге — пользователь её не замечает и воспринимает как
«молча не публикуется». Стать агентом самостоятельно невозможно: роль AGENT
назначает только админ (`POST /admin/users/:id/roles`). Блок «Агенты» на
главной — мок-данные (`apps/client/src/lib/mock/agents.ts`).

## Решение (объём)

Четыре части, три PR по границам app-папок:

1. **Заметный UX лимита** — модалка в визарде с объяснением и CTA «Стать агентом».
2. **Флоу «Стать агентом»** — заявка (анкета-минимум) + модерация админом.
3. **Атрибуция риелтора** — бейдж «Риелтор» на detail-странице объявления.
4. **Список риелторов** — блок на главной с реального API + публичная страница агента.

## Ключевые решения

- **Заявка + модерация админом** (не мгновенная самостоятельная регистрация):
  соответствует культуре модерации платформы, защищает список риелторов.
- **Анкета-минимум:** название агентства (опционально — частный маклер) +
  «О себе». Имя/телефон/аватар берутся из профиля пользователя.
- **Отдельная таблица `agent_applications`** (не флаги на users): история
  заявок, причина отказа, видимый пользователю статус.
- **Список:** блок на главной + страница агента `/agents/[id]` с его активными
  объявлениями. Полный каталог `/agents` (страница с поиском) — вне объёма.

## 1. API — заявки агентов (apps/api)

### Модель данных

Prisma-модель `AgentApplication` → таблица `agent_applications`:

| Поле | Тип | Примечание |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users | |
| agency_name | varchar(255) NULL | частный маклер — без агентства |
| about | text | «О себе» |
| status | enum `AgentApplicationStatus` PENDING/APPROVED/REJECTED | новый PG enum |
| reject_reason | text NULL | |
| moderator_id | uuid FK → users NULL | кто решил |
| created_at / resolved_at | timestamptz | |

Partial unique index: `user_id WHERE status = 'PENDING'` — одна активная заявка.

### Эндпоинты (пользователь)

- `POST /api/v1/users/me/agent-application` — body `{ agency_name?, about }`.
  Ошибки: уже есть PENDING → `409 AGENT_APPLICATION_PENDING`; уже AGENT/AGENCY →
  `409 ALREADY_AGENT`. После REJECTED повторная подача разрешена (новая запись).
- `GET /api/v1/users/me/agent-application` — последняя заявка (любой статус)
  или `404 NOT_FOUND`.

### Эндпоинты (админ)

- `GET /api/v1/admin/agent-applications?status=&page=&limit=` — пагинированный
  список с данными заявителя (имя, телефон, аватар).
- `POST /api/v1/admin/agent-applications/:id/approve` — транзакция: статус
  APPROVED + resolved_at + moderator_id + вставка роли AGENT в `user_roles`
  (идемпотентно, если роль уже есть). Не-PENDING → `422 INVALID_STATUS_TRANSITION`.
- `POST /api/v1/admin/agent-applications/:id/reject` — body `{ reason? }`,
  аналогичные правила перехода.

Approve/reject создают уведомление пользователю через существующий
notifications-слой (in-app; email/push — как настроено).

### Лимит: details в ошибке

`ensureActiveListingQuota` дополняет envelope:
`details: { limit, used }` — клиент показывает число в модалке.
(`details` в контракте `ApiError` уже предусмотрен.)

## 2. API — публичные агенты и бейдж (apps/api)

- `GET /api/v1/agents` — публичный. Пользователи с ролью AGENT/AGENCY:
  `{ id, name, avatar_url, agency_name, about, active_listings_count }`,
  сортировка по счётчику убыв., пагинация. `agency_name`/`about` — из последней
  APPROVED-заявки (для назначенных админом напрямую — NULL).
- `GET /api/v1/agents/:id` — профиль агента; не-агент → 404.
- `GET /api/v1/agents/:id/listings` — только ACTIVE, пагинация, card-shape как
  в /search.
- Detail объявления: новое поле `owner_is_agent: boolean` (владелец имеет роль
  AGENT/AGENCY) — для бейджа «Риелтор».
- Регенерация `openapi.public/internal.json` (`pnpm openapi:export`) + новая
  секция в docs/API.md — контракт для мобильной команды. Новый публичный модуль
  добавить в PUBLIC_MODULES (агентские admin-контроллеры — НЕ добавлять,
  известная гоча утечки в openapi.public).

## 3. Веб-клиент (apps/client)

- **Модалка лимита** (`ListingNew`): при `422 ACTIVE_LISTING_LIMIT_REACHED`
  вместо мелкого текста — Dialog: «Достигнут лимит N активных объявлений для
  частных лиц»; пояснение: после одобрения заявки объявления публикуются без
  лимита, отображаются как размещённые риелтором, профиль попадает в список
  риелторов. Кнопки: «Стать агентом» (→ `/become-agent`) и «Понятно».
  Рендер через portal (гоча `.fade-up` ломает fixed). При реализации
  live-проверить исходный сценарий «молчаливой» ошибки — если найдётся реальный
  баг отображения, исправить здесь же.
- **Страница `/become-agent`**: гейт входа (как /sell/new); состояния по
  `GET /users/me/agent-application`: нет заявки/REJECTED → форма (+причина
  отказа при REJECTED); PENDING → «Заявка на рассмотрении»; APPROVED или уже
  агент → сообщение «Вы агент».
- **Блок «Агенты» на главной** (`features/home/Agents.tsx`): с мока на
  `GET /agents` (top-N по счётчику); карточка ведёт на `/agents/[id]`.
  Мок `lib/mock/agents.ts` удалить, если больше нигде не используется.
- **Страница агента `/agents/[id]`**: профиль (аватар, имя, агентство,
  «о себе», счётчик) + сетка активных объявлений (реюз PropertyCard),
  keyset/page-пагинация как на /search-паттернах.
- **Бейдж «Риелтор»** в ContactCard на detail при `owner_is_agent`.
- i18n: все строки в `apps/client/messages/{ru,uz,en}.json`.

## 4. Админка (apps/web)

- Страница «Заявки агентов»: таблица (заявитель, агентство, «о себе», дата,
  статус), фильтр по статусу (default PENDING), действия «Одобрить» /
  «Отклонить» (модалка с причиной). По паттерну существующих модерационных
  страниц (complaints/moderation). Гоча регистра: view snake_case /
  body camelCase.

## Ошибки и коды

Новые коды в `ApiErrorCode`: `AGENT_APPLICATION_PENDING`, `ALREADY_AGENT`.
Переходы статусов заявки — существующий `INVALID_STATUS_TRANSITION` (422).

## Тестирование

- **API:** unit-спеки сервисов (заявки: дубль PENDING, ALREADY_AGENT, approve
  назначает роль, reject с причиной; agents: счётчики, 404 для не-агента;
  details лимита) + int-spec (CI гоняет по одному файлу).
- **Client:** vitest — модалка лимита (открытие по коду ошибки, CTA),
  форма /become-agent (состояния), Agents-блок.
- **Live-verify:** стандартный рецепт (stack up, OTP из логов api):
  клиент с 2 активными объявлениями → 3-е → модалка → заявка → approve в
  админке → 3-е публикуется, бейдж на detail, агент на главной и `/agents/[id]`.

## Раскатка

1. **PR1 (api):** миграция + заявки + публичные агенты + `owner_is_agent` +
   details лимита + openapi/API.md + ADR.
2. **PR2 (client):** модалка, /become-agent, главная, /agents/[id], бейдж, i18n.
3. **PR3 (web):** админ-очередь заявок.

PR2/PR3 зависят от PR1. Спека коммитится в ветке PR1.

## Вне объёма

- Полный каталог агентов с поиском/фильтрами.
- Расширенная анкета (лицензии, документы, районы работы).
- Бейдж риелтора на карточках /search (требует изменения card-shape поиска).
- Отзыв роли агента / повторная модерация.
