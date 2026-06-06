# DONE.md — Avino

Human-readable history of completed (merged) work.

Rules (see `docs/CLAUDE.md` → "Task tracking, DONE.md and ADR rules"):

- A task is added here **only after its PR is merged**.
- When a task is completed and merged, it is moved from `docs/TASKS.md` to this file.
- This log does **not** replace git history, Pull Requests, or ADR files.

Entry format:

```markdown
## YYYY-MM-DD

### TASK-XXX — Task title

Status: DONE
Branch: <branch-name>
PR: <PR link or PR number>

Files changed:
- <file-1>
- <file-2>

Summary:
- What was implemented
- Why it was needed
- Important notes

Commit messages:
- <commit message>

Related ADR:
- docs/adr/ADR-XXXX-short-title.md
```

---

## 2026-06-07

### ADMIN-16 — Полиш: единые состояния + toasts (web)

Status: DONE (2026-06-06)
Branch: feat/admin-web-polish
PR: #94

Files changed:
- apps/web/src/components/admin/toast/ToastProvider.tsx (new)
- apps/web/src/components/admin/states.tsx (new)
- apps/web/src/app/(admin)/admin/layout.tsx
- apps/web/src/app/globals.css
- apps/web/src/components/admin/DashboardOverview.tsx
- apps/web/src/components/admin/PromotionsPanel.tsx
- apps/web/src/app/(admin)/admin/complaints/page.tsx
- apps/web/src/app/(admin)/admin/listings/[id]/page.tsx
- apps/web/src/app/(admin)/admin/users/[id]/page.tsx
- docs/adr/ADR-0055-web-admin-ui-states-toasts.md (new)
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Единый UX состояний по всей админке (ADMIN-08..15). Добавлен in-house
  toast-механизм без сторонней зависимости (Context + `useToast()`,
  авто-дисмисс 5 c, ручное закрытие, `role`/`aria-live`, viewport `z-[100]`
  поверх модалок), смонтирован один раз в layout группы `(admin)`.
- Все исходы мутаций (модерация листинга, статус/роли пользователя, статус
  жалобы, активация/продление/отмена промо) переведены на toast: inline-баннеры
  успеха удалены, серверные ошибки уходят в toast (диалог остаётся открытым),
  клиентская валидация формы остаётся inline.
- Состояния уровня страницы вынесены в общий `components/admin/states.tsx`
  (`DetailSkeleton`, `ErrorState`, `InfoState`, `InlineAlert`); дубли
  skeleton/not-found/error в детальных карточках заменены; дашборд переведён на
  единую `error`-шкалу TailAdmin. `DataTable` остаётся владельцем табличных
  состояний (ADMIN-08).
- Почему: к концу ADMIN-15 состояния и обратная связь по мутациям сложились
  неоднородно (копипаста skeleton/error, рассинхрон цветовых токенов, отсутствие
  единого toast). ADMIN-16 закрывает acceptance «единый UX состояний».
- Проверки: `lint` + `build` (type-check + prerender всех 10 маршрутов) зелёные;
  dev-smoke — все admin-маршруты отдают 200 без ошибок компиляции/рантайма.
  Live e2e toasts (успех/ошибка мутаций) требует поднятого `apps/api` + ADMIN-OTP.

Commit messages:
- feat(web): add admin toast system and shared state components
- feat(web): route admin mutation feedback to toasts
- docs: record ADMIN-16 (ADR-0055, tracker, DONE)

Related ADR:
- docs/adr/ADR-0055-web-admin-ui-states-toasts.md

---

## 2026-06-06

### ADMIN-15 — Дашборд (живые счётчики, web + API)

Status: DONE (2026-06-06) — live-verified против стека
Branch: feat/admin-web-dashboard
PR: #93

Files changed:
- apps/api/src/admin/admin-stats.service.ts
- apps/api/src/admin/admin-stats.controller.ts
- apps/api/src/admin/admin-stats.service.spec.ts
- apps/api/src/admin/admin.module.ts
- apps/web/src/store/api/adminStatsApi.ts
- apps/web/src/store/api/adminTypes.ts (тип `AdminStats`)
- apps/web/src/components/admin/DashboardOverview.tsx
- apps/web/src/app/(admin)/admin/page.tsx
- docs/API.md (§16 — `GET /admin/stats`)
- docs/adr/ADR-0054-admin-dashboard-stats.md
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Главная `/admin` теперь показывает четыре живых счётчика TailAdmin: листинги
  NEW, жалобы NEW, пользователи (всего), активные промо (VIP/TOP).
- Отклонение от карты задачи (с подтверждением Team Lead, ADR-0054): счётчики
  нельзя было собрать из `meta.total` существующих списков — глобального списка
  промо нет (промо адресуется только по листингу, `AdminListingFilters` не
  фильтрует по промо). Заведён один лёгкий read-only `GET /api/v1/admin/stats`
  (MODERATOR/ADMIN): `prisma.*.count` по статусам параллельно (`Promise.all`),
  ответ snake_case `{ listings_new, complaints_new, users_total, promotions_active }`.
- Frontend: отдельный RTK Query-слайс `adminStatsApi` (инъекция в `adminApi`,
  `providesTags: ['Admin']` → счётчики освежаются после любой админ-мутации).
  `page.tsx` остался серверным (metadata) и рендерит клиентский
  `DashboardOverview`; три карточки кликабельны (ведут в разделы), «активные
  промо» — без ссылки (отдельной страницы-списка нет). Loading `…` / error `—`
  точечно (единый UX состояний — ADMIN-16); админка RU-only (i18n — ADMIN-17).
- Верифицировано: API `tsc` чисто; web `tsc` чисто; ESLint чисто в обоих
  приложениях; 23/23 unit-теста админ-модуля зелёные (вкл. 2 новых для
  `AdminStatsService`). Live против пересобранного стека: `401` без токена,
  `200` с ADMIN-токеном → `{"listings_new":8,"complaints_new":0,"users_total":2,
  "promotions_active":1}`, значения совпали с прямым `COUNT` в Postgres (8/0/2/1).

Commit messages:
- feat(api): add admin dashboard stats endpoint
- feat(web): add admin dashboard overview

Related ADR:
- docs/adr/ADR-0054-admin-dashboard-stats.md

### TASK-185 — Fix: мёртвая ссылка «Промо» в сайдбаре админки

Status: DONE (2026-06-06)
Branch: fix/admin-sidebar-dead-promo-link
PR: pending

Files changed:
- apps/web/src/layout/AppSidebar.tsx
- docs/adr/ADR-0052-web-admin-promotions.md
- docs/DONE.md

Summary:
- Bugfix: страница `/admin/promotions` открывалась пустой. Причина — пункт
  сайдбара «Промо» (`AppSidebar.tsx:36`) вёл на маршрут `/admin/promotions`,
  которого не существует (его никогда не делали). По ADMIN-13/ADR-0052 из двух
  вариантов scope («карточка листинга или /admin/promotions») реализована
  карточка листинга: управление промо — панель `PromotionsPanel` внутри
  `/admin/listings/<id>`, отдельного раздела нет.
- Удалён мёртвый пункт сайдбара и ставший неиспользуемым импорт `StarIcon`
  (иначе lint). ADR-0052 дополнен: подтверждено отсутствие standalone-страницы
  промо. ESLint по `AppSidebar.tsx` чистый.

Commit messages:
- fix(web): remove dead promo link from admin sidebar

Related ADR:
- docs/adr/ADR-0052-web-admin-promotions.md (дополнен)

### TASK-184 — Fix: активация промо блокировалась CORS-preflight'ом

Status: DONE (2026-06-06)
Branch: fix/cors-idempotency-key-header
PR: pending

Files changed:
- apps/api/src/common/cors/cors.options.ts
- apps/api/src/common/cors/cors.options.spec.ts
- docs/adr/ADR-0047-api-cors-allowlist.md
- docs/DONE.md

Summary:
- Bugfix: «Активация промо не работает». Корень — CORS, не бизнес-логика.
  Активация (`POST /api/v1/admin/listings/:id/promotions`, ADMIN-13/ADR-0033)
  отправляет кастомный заголовок `Idempotency-Key` (§15/§24). Это единственное
  admin-действие с нестандартным request-заголовком, поэтому браузер шлёт
  CORS-preflight `OPTIONS`. Сервер отдавал `Access-Control-Allow-Headers:
  Content-Type, Authorization, Accept` — без `Idempotency-Key` (ADR-0047,
  `cors.options.ts:49`). Браузер блокировал сам `POST` ещё до отправки; RTK Query
  получал generic `FETCH_ERROR` без `code`, и UI показывал fallback «Не удалось
  выполнить действие». История/cancel/extend работали — у них нет кастомных
  заголовков.
- Фикс: добавлен `Idempotency-Key` в `allowedHeaders` (`buildCorsOptions`).
  Бэкенд-сервис `AdminPromotionsService.activate()` был корректен — запрос просто
  до него не доходил. Баг не ловился `curl`'ом (CORS проверяет только браузер).
- Регрессионный тест в `cors.options.spec.ts` фиксирует наличие
  `Idempotency-Key` в allowlist. `tsc --noEmit` чисто, 8/8 CORS-тестов зелёные.
- Прод-нюанс: preflight кешируется браузером (`maxAge: 86400`) — после деплоя
  может понадобиться сброс кеша/перезапуск api-контейнера.

Commit messages:
- fix(api): allow Idempotency-Key header in CORS

Related ADR:
- docs/adr/ADR-0047-api-cors-allowlist.md (дополнен)

### ADMIN-14 — Логи (4 вкладки, web)

Status: DONE (2026-06-06) — live-verified против стека
Branch: feat/admin-web-logs
PR: #90

Files changed:
- apps/web/src/store/api/adminLogsApi.ts (4 read-only query + хуки)
- apps/web/src/lib/logs.ts (вкладки + подписи журналов и badge статуса уведомления)
- apps/web/src/components/admin/logs/filters.tsx (общие FilterSelect/TextFilter/FilterGrid + useDebouncedValue)
- apps/web/src/components/admin/logs/AuditLogsTab.tsx
- apps/web/src/components/admin/logs/ModerationLogsTab.tsx
- apps/web/src/components/admin/logs/PromotionLogsTab.tsx
- apps/web/src/components/admin/logs/NotificationLogsTab.tsx
- apps/web/src/app/(admin)/admin/logs/page.tsx
- docs/adr/ADR-0053-web-admin-logs.md
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Реализован фронтенд просмотра журналов (TASK-131, API.md §16) — страница
  `/admin/logs` с переключателем из 4 вкладок: Аудит (`GET /admin/audit-logs`),
  Модерация (`GET /admin/moderation-logs`), Промо (`GET /admin/promotion-logs`),
  Уведомления (`GET /admin/notification-logs`). В каждой вкладке — таблица на
  общих `DataTable`/`Pagination` (ADMIN-08), свои фильтры и page-based пагинация.
  Только RTK Query (CLAUDE.md §4), RU-only (i18n — ADMIN-17).
- `adminLogsApi` — 4 read-only `query`-эндпоинта (инъекция в `adminApi`), все
  `providesTags: ['Admin']`: журнал перечитывается после любой админ-мутации.
  `toQueryParams` отбрасывает пустые фильтры (forward-compatible, §4).
- Рендерится только активная вкладка → один RTK-запрос за раз; при возврате
  RTK Query отдаёт данные из кэша. Фильтры по UUID (actor/entity/listing/
  moderator/admin/user) — текстовые с дебаунсом; по enum — селекты. Подписи
  `MODERATION_ACTION_LABELS` и `PROMOTION_TYPE_*` переиспользованы; новые
  справочники журналов — в `lib/logs.ts`. Общие фильтр-контролы вынесены в
  `components/admin/logs/filters.tsx` (страницы модерации/жалоб не трогались —
  одна задача, один PR; унификация копий — ADMIN-16).
- Контракт выверен live против стека (docker compose) с ADMIN-OTP токеном:
  все 4 эндпоинта отдают данные ровно в форме фронт-типов (`AuditLog`/
  `ModerationLog`/`PromotionLog`/`NotificationLog`, snake_case, nullable-поля);
  фильтр `moderation-logs?action=APPROVE` → только APPROVE-строки; невалидный
  enum (`notification-logs?status=BOGUS`) → `400 VALIDATION_ERROR`; запрос без
  токена → `401` (ADMIN-only RolesGuard). Gates: `lint` + `tsc --noEmit` +
  `next build` зелёные, роут `/admin/logs` присутствует в сборке.

Commit messages:
- feat(web): add admin logs viewer
- docs(admin): record ADMIN-14 (ADR-0053, tracker, DONE)

Related ADR:
- docs/adr/ADR-0053-web-admin-logs.md

---

### ADMIN-13 — Промо VIP/TOP (web)

Status: DONE (2026-06-06) — live-verified против стека
Branch: feat/admin-web-promotions
PR: #89

Files changed:
- apps/web/src/store/api/adminTypes.ts (промо request-DTO + nullable даты ledger)
- apps/web/src/store/api/adminPromotionsApi.ts (4 эндпоинта + хуки)
- apps/web/src/lib/promotions.ts (подписи/badge тиров и статусов, каталог-превью, маппер ошибок)
- apps/web/src/components/admin/PromotionsPanel.tsx (панель управления промо)
- apps/web/src/app/(admin)/admin/listings/[id]/page.tsx (встраивание панели)
- docs/adr/ADR-0052-web-admin-promotions.md
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Реализован фронтенд ручного управления промо VIP/TOP (TASK-120/121/122,
  API.md §15) в карточке листинга `/admin/listings/[id]` поверх ADMIN-09. Панель
  (`PromotionsPanel`): активация тарифа (тир `TOP|VIP` × период `7|14|30`,
  превью цены из зеркала каталога), продление и отмена активной промо (диалоги),
  история ledger таблицей. Только RTK Query (CLAUDE.md §4), RU-only (i18n —
  ADMIN-17).
- `adminPromotionsApi`: `listListingPromotions` (`GET .../promotions`),
  `activatePromotion` (`POST .../promotions`, заголовок `Idempotency-Key` —
  свежий UUID на попытку), `cancelPromotion`/`extendPromotion`
  (`PATCH /admin/listing-promotions/:id/cancel|extend`). Асимметрия роутов
  (активация/история по листингу, cancel/extend по `id` промо) сохранена как на
  бэкенде. Все мутации инвалидируют тег `Admin` → история и read-cache карточки
  перечитываются.
- Активная промо вычисляется из истории (`status === 'ACTIVE'`); форма активации
  видна всегда с пометкой «заменит текущую» (бэкенд авто-замещает в одной
  транзакции). Ошибки мапятся по стабильному `error.code` через
  `promotionErrorMessage` (`ACTIVE_PROMOTION_EXISTS`/`INVALID_PERIOD`/
  `PROMOTION_NOT_ACTIVE`/`NOT_FOUND`/`FORBIDDEN`/`VALIDATION_ERROR`).
- **Live-verify 2026-06-06** против стека (docker compose, ADMIN-OTP токен) на
  существующем листинге: активация VIP/30→`201` ACTIVE; повтор того же
  `Idempotency-Key`→тот же `id` (идемпотентно, `201`); `extend +14`→`200`
  (expires `07-06`→`07-20`); `period_days:10`→`422 INVALID_PERIOD`;
  `cancel`→`200` CANCELLED; `extend` отменённой→`422 PROMOTION_NOT_ACTIVE`;
  история отражает изменения. Коды совпали 1:1 с картой.
- Gates: `next lint` — без ошибок; `next build` — чистая сборка, маршрут
  `/admin/listings/[id]` (dynamic, 8.73 kB) собран.

Commit messages:
- feat(web): add admin promotions management

Related ADR:
- docs/adr/ADR-0052-web-admin-promotions.md

### ADMIN-12 — Пользователи: статус + роли (web)

Status: DONE (2026-06-06) — live-verified против стека
Branch: feat/admin-web-users-actions
PR: #88

Files changed:
- apps/web/src/store/api/adminTypes.ts (request-DTO статуса/роли)
- apps/web/src/store/api/adminUsersApi.ts (3 мутации + хуки)
- apps/web/src/lib/users.ts (подписи/intent статус-действий, маппер ошибок)
- apps/web/src/app/(admin)/admin/users/[id]/page.tsx (панель управления)
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновление ADMIN-12)
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Реализовал write-часть TASK-130 (API.md §6): смена статуса пользователя и
  управление ролями в карточке `/admin/users/[id]` поверх read-only ADMIN-11.
  Смена статуса — через диалог подтверждения с причиной (обязательной для
  `BLOCKED`/`DELETED`, попадает в аудит `ADMIN_USER_UPDATE`); роли —
  назначение из `/roles` (минус уже выданные) и снятие через `✕` на чипах.
  Только RTK Query (CLAUDE.md §4), RU-only (i18n — ADMIN-17).
- `adminUsersApi`: добавлены мутации `updateAdminUserStatus`
  (`PATCH /admin/users/:id`), `assignAdminUserRole` (`POST .../roles`),
  `removeAdminUserRole` (`DELETE .../roles/:role`) — все инвалидируют тег
  `Admin`, поэтому карточка/список перечитываются после действия (как заложено
  в ADMIN-11). `PATCH`/`POST` типизированы возвратом полного `AdminUserDetail`
  (сверено с контроллером — бэкенд отдаёт обновлённую карточку, не пустой 200),
  `DELETE` → `void` (`204`).
- Гард самоблокировки на фронте: ADMIN не может заблокировать/удалить себя и
  снять у себя роль `ADMIN` (бэкенд это допускает — гард UX-уровня, чтобы не
  потерять доступ). Ошибки мапятся по стабильному `error.code` через
  `userActionErrorMessage` (`ROLE_ALREADY_GRANTED`/`VALIDATION_ERROR`/
  `NOT_FOUND`/`FORBIDDEN`).
- **Live-verify 2026-06-06** против стека (docker compose, ADMIN-OTP токен) на
  тест-пользователе: `PATCH BLOCKED`+reason→`200` (полный `AdminUserDetail`),
  невалидный статус→`400`, `POST AGENT`→`201` (`roles:[AGENT]`), повтор→`409
  ROLE_ALREADY_GRANTED`, `GUEST`→`400 VALIDATION_ERROR`, `DELETE AGENT`→`204`,
  повтор→`404 NOT_FOUND`, restore `ACTIVE`→`200`. Коды совпали 1:1 с картой.
- Gates: `next lint` — без ошибок; `next build` — чистая сборка, маршрут
  `/admin/users/[id]` (dynamic, 6.11 kB) собран.

Commit messages:
- feat(web): add admin user status and role management

Related ADR:
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновлён — мутации
  статуса/ролей, live-сверка контракта)

### TASK-132 — Complaints backend (table + module + routes)

Status: DONE
Branch: feat/api-complaints-module
PR: #85

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260606120000_add_complaints/migration.sql
- apps/api/src/complaints/complaints.module.ts
- apps/api/src/complaints/complaints.controller.ts
- apps/api/src/complaints/admin-complaints.controller.ts
- apps/api/src/complaints/complaints.service.ts
- apps/api/src/complaints/complaints.service.spec.ts
- apps/api/src/complaints/dto/create-complaint.dto.ts
- apps/api/src/complaints/dto/list-complaints.dto.ts
- apps/api/src/complaints/dto/update-complaint-status.dto.ts
- apps/api/src/complaints/index.ts
- apps/api/src/admin/admin.module.ts
- apps/api/src/app.module.ts
- docs/DB_SCHEMA.md
- docs/adr/ADR-0051-complaints-module.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Реализован отсутствовавший complaints-бэкенд (API.md §16, DB_SCHEMA.md §7):
  модель `Complaint` + enum `complaint_status` (`NEW|IN_REVIEW|RESOLVED|REJECTED`)
  и миграция `add_complaints`. Разблокирует ADMIN-10 (PR #84), смерженный
  contract-only.
- `POST /api/v1/complaints` (USER) — пожаловаться на листинг → `201 { id, status }`;
  `404` если листинг отсутствует/`DELETED` (как в FavoritesService).
- `GET /api/v1/admin/complaints?status&listing_id&page&limit` и
  `PATCH /api/v1/admin/complaints/:id { status }` (MODERATOR/ADMIN); PATCH
  проставляет `handled_by`/`handled_at` (модератор из токена + текущее время).
- Page-based пагинация (limit default 20 / max 100, `meta.total`), сорт
  `created_at DESC, id DESC`, AND-фильтры, snake_case-контракт. Колонка
  `reporter_id` отдаётся как `user_id` — совпадает с FE-типом `Complaint`.
- `listing_id` NOT NULL + `ON DELETE CASCADE`; `reporter_id`/`handled_by` →
  `users` `ON DELETE SET NULL` (DB_SCHEMA §7, поправлен с противоречивого
  `ON DELETE CASCADE NULL`). Админ-роут подключён в `AdminModule`,
  переиспользует паттерны moderation / admin-logs.
- Unit-тесты ComplaintsService (Prisma мокается, 9 тестов); `tsc`/eslint чистые.
  Миграцию нужно применить на dev/live (`prisma migrate deploy`) перед
  live-verify ADMIN-10.

Commit messages:
- feat(api): add complaints module and migration
- docs(api): add ADR-0051 and finalize TASK-132 tracking

Related ADR:
- docs/adr/ADR-0051-complaints-module.md

### ADMIN-11 — Пользователи: список + карточка (web)

Status: DONE (2026-06-06) — PR #87, live-verified против стека
Branch: feat/admin-web-users-list
PR: #87

Files changed:
- apps/web/src/store/api/adminTypes.ts (сверка user/role-типов с бэкендом)
- apps/web/src/store/api/adminUsersApi.ts (new)
- apps/web/src/lib/users.ts (new)
- apps/web/src/app/(admin)/admin/users/page.tsx (new)
- apps/web/src/app/(admin)/admin/users/[id]/page.tsx (new)
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновление ADMIN-11)
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Реализовал веб-страницы пользователей (read-only часть TASK-130, API.md §6) поверх базы ADMIN-07. `/admin/users` — таблица с фильтрами (статус, роль, поиск `q` по контакту/имени) + page-based пагинация; опции фильтра по роли берутся из `GET /roles`; контакт ведёт в карточку. `/admin/users/[id]` — карточка: аккаунт (телефон/email + верификация, статус, язык), профиль, роли, аудит-таймстемпы; `404` → «недоступен». Только RTK Query (CLAUDE.md §4), RU-only.
- `adminUsersApi.ts`: `listAdminUsers` (`GET /admin/users`), `getAdminUser` (`GET /admin/users/:id`), `listRoles` (`GET /roles`) — все с тегом `Admin`, чтобы ADMIN-12 инвалидировал список/карточку после мутаций. `lib/users.ts`: подписи/badge статусов пользователя, подписи ролей/языков. Смена статуса и управление ролями — **ADMIN-12**.
- **Live-сверка DTO выполнена** (как ADMIN-08/09): спекулятивные типы ADMIN-07 приведены 1:1 к живому контракту — `AdminUserRow` +`is_phone_verified`/`is_email_verified`/`last_login_at`; `AdminUserDetail` теперь `extends AdminUserRow` + `deleted_at` и nullable `profile`, `updated_at` non-null; `AdminUserProfile.preferred_language` nullable; `RoleDict` без `id` (бэкенд отдаёт `{code, description}`).
- **Live-verify 2026-06-06** против стека (docker compose) с ADMIN-OTP токеном (EMAIL OTP для `admin@avino.uz`, dev-код из логов api): `GET /admin/users` → строка = `AdminUserRow` 1:1, `meta {page,limit,total}`; `GET /admin/users/:id` → `AdminUserDetail` 1:1 (`profile:null`); `GET /roles` → `{code, description}` ×8; фильтры `role=ADMIN`→1, `q=e2e`→1, `status=BLOCKED`→0; невалидный `status` → `400`, без токена → `401`, битый uuid → `400`.
- Gates: `next lint` — без ошибок; `tsc --noEmit` — чисто; `next build` — чистая сборка, маршруты `/admin/users` (static, 2.58 kB) и `/admin/users/[id]` (dynamic, 4.16 kB) собраны.

Commit messages:
- feat(web): add admin users list and detail
- docs(admin): record ADMIN-11 (PR #87)

Related ADR:
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновлён — слайс пользователей/ролей, live-сверка DTO)

---

### ADMIN-10 — Жалобы (web)

Status: DONE (2026-06-06) — FE PR #84 + backend TASK-132 PR #85, live-verified E2E
Branch: feat/admin-web-complaints
PR: #84 (FE) + #85 (backend, TASK-132)

Files changed:
- apps/web/src/store/api/adminComplaintsApi.ts (new)
- apps/web/src/lib/complaints.ts (new)
- apps/web/src/app/(admin)/admin/complaints/page.tsx (new)
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновление ADMIN-10)
- docs/TASK_ADMIN_PANEL.md
- docs/TASKS.md (новый TASK-132 — complaints backend)
- docs/DONE.md

Summary:
- Реализовал веб-страницу жалоб `/admin/complaints` (API.md §16) поверх базы ADMIN-07: список с фильтрами (status=NEW по умолчанию, listing_id) + page-based пагинация, диалог обработки жалобы со сменой статуса. Ссылка на листинг ведёт в карточку модерации (ADMIN-09). Только RTK Query (CLAUDE.md §4), RU-only.
- `adminComplaintsApi.ts`: `listAdminComplaints` (`GET /admin/complaints`) + мутация `updateComplaintStatus` (`PATCH /admin/complaints/:id { status }`), инвалидирует тег `Admin` → список перечитывается после действия. `lib/complaints.ts`: подписи/badge статусов, маппинг кодов ошибок в RU. DTO `Complaint`/`ComplaintStatus`/`ComplaintFilters` — из базы ADMIN-07 как есть.
- Бэкенд жалоб реализован отдельной задачей **TASK-132** (PR #85): модель `Complaint`, enum `complaint_status`, миграция `add_complaints`, роуты `POST /complaints` + `GET|PATCH /admin/complaints`. FE мёрджился contract-only (по образцу ADMIN-07), затем разблокирован.
- **Live-verify E2E выполнен 2026-06-06** против поднятого стека (docker compose) с ADMIN-OTP токеном: миграция `20260606120000_add_complaints` применена; `POST /complaints` → `201 {id, status:NEW}`; `GET /admin/complaints?status=NEW` отдаёт жалобу `{data, meta}`; `PATCH /admin/complaints/:id {status:IN_REVIEW}` меняет статус, сервер проставляет `handled_by`/`handled_at`; фильтр `?listing_id` работает; невалидный статус → `400`, без токена → `401`. FE-тип `Complaint`/`ComplaintFilters` совпал 1:1 с живым контрактом (`user_id`/`handled_by`/`handled_at`); страница `/admin/complaints` рендерится.
- Gates: `pnpm --filter @avino/web lint` — без ошибок; `tsc --noEmit` — чисто; `next build` — чистая сборка, маршрут `/admin/complaints` собран (static, 5.45 kB).

Commit messages:
- feat(web): add admin complaints page
- docs(admin): record ADMIN-10 (PR #84) + TASK-132 complaints backend

Related ADR:
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновлён — слайс жалоб, backend-гэп, TASK-132)

---

### ADMIN-09 — Модерация: карточка + действия + история

Status: DONE
Branch: feat/admin-web-moderation-detail
PR: #83

Files changed:
- apps/web/src/store/api/adminTypes.ts
- apps/web/src/store/api/adminListingsApi.ts
- apps/web/src/lib/moderation.ts
- apps/web/src/app/(admin)/admin/listings/[id]/page.tsx
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Реализовал карточку модерации `/admin/listings/[id]` (API.md §7/§16) поверх базы ADMIN-07/08: данные листинга, действия модерации с reason, история.
- `adminListingsApi.ts`: добавлены `getAdminListing` (`GET /listings/:id` — MODERATOR/ADMIN видят непубличные статусы через публичный роут с `OptionalJwtAuthGuard`), `listingModerationLogs` (`GET /admin/listings/:id/moderation-logs`) и мутация `moderateListing` (`PATCH /admin/listings/:id/status`). Мутация инвалидирует тег `Admin` → карточка/история/очередь (ADMIN-08) перечитываются после действия. Хуки `useGetAdminListingQuery`/`useListingModerationLogsQuery`/`useModerateListingMutation`.
- **Live-сверка DTO против запущенного стека** (обещание базы ADR-0050): `ListingDetail` приведён к реальной форме `ListingDetailResponse` — `area`/`city_id` стали nullable, спекулятивного `features: ListingFeature[]` из черновика ADMIN-07 в detail-ответе нет (только `features_text`), поле и неиспользуемый интерфейс удалены. Добавлены `ModerateListingRequest`/`ModerationResult` и `ListingModerationLogEntry` (per-listing лог **без `listing_id`**, в отличие от глобального `ModerationLog`).
- `lib/moderation.ts`: гейтинг переходов зеркалом бэкенда (`MODERATABLE_STATUSES`+`ACTION_TO_STATUS`) — недопустимые для текущего статуса действия задизейблены; подписи/intent-цвета кнопок; маппинг кодов ошибок (`INVALID_STATUS_TRANSITION`/`FORBIDDEN`/`NOT_FOUND`/`VALIDATION_ERROR`) в RU-сообщения.
- Страница: данные листинга (поля + галерея медиа), панель действий (APPROVE/SEND_TO_DRAFT/REJECT/DELETE) с диалогом подтверждения и reason (обязателен для REJECT), таблица истории через переиспользуемый `DataTable`. Состояния loading/error/not-found (удалён/скрыт → дружелюбный текст). Данные — только RTK Query (CLAUDE.md §4), RU-only (i18n — ADMIN-17).
- Gates: `tsc --noEmit` чисто; `next lint` без ошибок; `next build` — чистая сборка, маршрут `/admin/listings/[id]` собран (dynamic).
- **Live-прогон против стека** (ADMIN OTP-flow, dev-код из логов api): `GET /listings/:id` под ADMIN на NEW-листинге → форма ровно совпала с `ListingDetail` (без `features`, `city_id=null`, `area` decimal-строкой, `media[]`). `PATCH .../status` `NEW → SEND_TO_DRAFT` → `{id,status:DRAFT,published_at:null}`; история обновилась (запись без `listing_id`, ключи `action/old_status/new_status/moderator_id/reason/created_at`); повтор того же действия → `INVALID_STATUS_TRANSITION` (fallback в UI).

Commit messages:
- feat(web): add admin moderation detail and actions

Related ADR:
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновлён — live-сверка `ListingDetail` + эндпоинты карточки/действий)

---

### ADMIN-08 — Модерация: очередь листингов

Status: DONE
Branch: feat/admin-web-moderation-list
PR: #82

Files changed:
- apps/web/src/store/api/adminListingsApi.ts
- apps/web/src/store/api/adminTypes.ts
- apps/web/src/lib/labels.ts
- apps/web/src/lib/format.ts
- apps/web/src/components/admin/DataTable.tsx
- apps/web/src/components/admin/Pagination.tsx
- apps/web/src/app/(admin)/admin/listings/page.tsx
- apps/web/src/app/globals.css
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Реализовал очередь модерации `/admin/listings` (API.md §16) — первую фичу админ-панели поверх базы ADMIN-07.
- `adminListingsApi.ts`: эндпоинт `listAdminListings` (`GET /admin/listings?status&property_type&transaction_type&q&page&limit`) через `adminApi.injectEndpoints` — RTK Query, тег `Admin`, пустые фильтры отбрасываются `toQueryParams` (§4). Хук `useListAdminListingsQuery`. Сюда же ADMIN-09 добавит карточку/действия.
- **Live-сверка DTO (обещание ADR-0050):** `AdminListingRow` приведён к реальной форме `AdminListingListItem` из `apps/api/src/moderation` — добавлены `title`/`original_language`/`published_at`, `city_id` стал nullable, удалены отсутствующие в списке `area`/`rooms`/`promotion_*` (они только в `ListingDetail`).
- Страница `/admin/listings`: фильтры (status=NEW по умолчанию, тип недвижимости, тип сделки, дебаунс-поиск по заголовку), смена любого фильтра сбрасывает страницу на 1, page-based пагинация, ссылка с заголовка на карточку модерации (ADMIN-09).
- Переиспользуемые примитивы для ADMIN-09..14: `components/admin/DataTable` (рендер по контракту `Column<Row>` из ADMIN-07, базовые loading/error/empty), `components/admin/Pagination` (page-based по `meta`), `lib/labels` (RU-подписи enum + badge-классы статуса), `lib/format` (Decimal-строка цены без потери точности, даты ru-RU).
- `globals.css`: добавлены семантические шкалы `success`/`warning`/`error-*` (значения TailAdmin) — нужны для badge статусов и тостов (ADMIN-16).
- Gates: `pnpm --filter @avino/web lint` — без ошибок; `pnpm --filter @avino/web build` — чистая сборка + type-check (Next 15), маршрут `/admin/listings` собран.
- **Live-прогон против запущенного стека** (`docker compose --profile app up`): залогинился ADMIN'ом (OTP-flow, dev-код из логов), прогнал `GET /api/v1/admin/listings` на сид-данных (25 листингов). Подтверждено: дефолт `status=NEW` → 13 строк; пагинация `limit=5` → стр.1/2/3 = 5/5/3 при `total=13`; фильтры `status=ACTIVE`(4)/`property_type=LAND`(5)/`transaction_type=RENT`(13)/combined `NEW+COMMERCIAL`(3); поиск `q=Участок`(5); пустой результат `q=zzz`(0). Форма строки — ровно 13 ключей `AdminListingRow` (`price` decimal-строкой, `city_id` nullable), без лишних/недостающих полей. Без токена → `401`.

Commit messages:
- feat(web): add admin moderation queue page

Related ADR:
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md (обновлён — live-сверка `AdminListingRow`)

---

### ADMIN-07 — adminApi base + shared admin types & pagination

Status: DONE
Branch: feat/admin-web-admin-api
PR: #81

Files changed:
- apps/web/src/store/api/pagination.ts
- apps/web/src/store/api/adminTypes.ts
- apps/web/src/store/api/adminApi.ts
- apps/web/src/lib/table.ts
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Заложил базовый слой админ-API для `apps/web`, который потребляют задачи ADMIN-08..15. Бизнес-эндпоинты намеренно **не** реализованы (это их scope) — здесь только точка инъекции RTK Query, переиспользуемые DTO/enum и хелперы пагинации/таблиц.
- `store/api/pagination.ts`: единый `Paginated<T> = { data, meta }` с `PageMeta`, где cursor- и page-поля опциональны, так что один тип покрывает оба режима пагинации API.md §4 (page-based для админ-списков + keyset для публичного поиска). Хелперы: `toQueryParams()` (отбрасывает `undefined`/`null`/пустые строки перед отправкой фильтров — forward-compatible §4), `clampLimit()` (зажим в `[1,100]`), `totalPages()`; константы `DEFAULT_PAGE/DEFAULT_LIMIT/MAX_LIMIT`.
- `store/api/adminTypes.ts`: enum-юнионы как зеркало DB_SCHEMA §3 (значения = часть контракта: `ListingStatus`, `PropertyType`, `TransactionType`, `PromotionType/Status`, `PaymentStatus`, `ModerationAction`, `PromotionAdminAction`, `ComplaintStatus`, `Notification*`, `RoleCode`, …), snake_case DTO (`AdminListingRow`, `ListingDetail`, `AdminUserRow/Detail`, `RoleDict`, `ListingPromotion`, `Complaint`, `AuditLog`, `ModerationLog`, `PromotionLog`, `NotificationLog`) и per-list фильтр-типы, наследующие `PageParams`. `Language`/`UserStatus` импортируются из `authApi` (единый источник, без дублей).
- `store/api/adminApi.ts`: `adminApi = baseApi.injectEndpoints({ endpoints: () => ({}) })` — точка роста, в которую ADMIN-08..15 добавляют эндпоинты (тег кэша `Admin` уже в `baseApi.tagTypes`); реэкспорт `pagination`+`adminTypes` как единый импорт-сурфейс + шаблон добавления эндпоинта в комментарии.
- `lib/table.ts`: структурные UI-примитивы таблиц без стилей (`Column<Row>`, `SelectOption<T>`, `PaginationState`, `SortDirection`, хелперы `optionsFromLabels`/`hasNextPage`) — контракт данных между страницами и TailAdmin-таблицами.
- Gates: `pnpm --filter @avino/web lint` — без ошибок; `pnpm --filter @avino/web build` — чистая сборка + type-check (Next 15). DTO зафиксированы по API.md/DB_SCHEMA и **не прогнаны live против `apps/api`** в этой сессии (база не вызывает сеть) — расхождение формы вскроется и поправится в ADMIN-08..15 при первом реальном запросе.

Commit messages:
- feat(web): add adminApi base and shared types

Related ADR:
- docs/adr/ADR-0050-web-admin-api-base-shared-types.md

---

### ADMIN-06 — Web admin ADMIN role guard and logout

Status: DONE
Branch: feat/admin-web-role-guard
PR: #79

Files changed:
- apps/web/src/layout/RoleGuard.tsx
- apps/web/src/layout/UserMenu.tsx
- apps/web/src/layout/ConditionalShell.tsx
- apps/web/src/layout/AppHeader.tsx
- apps/web/src/hooks/useLogout.ts
- docs/adr/ADR-0049-web-admin-role-guard.md
- docs/TASK_ADMIN_PANEL.md
- docs/DONE.md

Summary:
- Защитил разделы админки (`/admin/*`) гардом роли `ADMIN` (ADMIN-06). Новый клиентский `RoleGuard` вешается в `ConditionalShell` **только на не-логин маршруты** — `/admin/login` остаётся вне гарда, поэтому редирект на логин не зацикливается.
- Поток гарда: флаг `hydrated` (false на сервере и при первом клиентском рендере) + `selectAuthInitialized` гейтят первый рендер нейтральным экраном «Загрузка…» — это убирает hydration mismatch (на сервере `localStorage` нет, `isAuthenticated` всегда false, на клиенте зависит от refresh-токена). Нет токенов → `router.replace('/admin/login')`. Есть токен → `GET /auth/me` через существующий `useGetMeQuery`: истёкший access восстанавливает авто-refresh (ADMIN-04), невалидный refresh приводит к `logOut` в `baseQueryWithReauth` → гард видит «нет токенов» → редирект на логин. Профиль без роли `ADMIN` → полноэкранный экран 403. Ошибка `/auth/me` не по 401 (сеть / 5xx) → экран «Повторить/Выйти».
- Выход вынесен в переиспользуемый хук `useLogout`: `POST /auth/logout` (`{ refresh_token }`) → `logOut()` (очистка access из памяти + refresh из `localStorage` + user) → редирект на `/admin/login`. Сетевые ошибки самого `/auth/logout` игнорируются — локальный разлогин выполняется всегда. Хук используется кнопкой выхода в шапке и экранами 403/ошибки.
- Статичная заглушка «AD / Администратор» в шапке заменена на `UserMenu`: реальные имя/email из кэша `/auth/me`, dropdown с кнопкой «Выйти» (закрытие по клику вне и Escape, фокус-стили, без emoji-иконок — inline SVG).
- Gates: `pnpm --filter @avino/web lint` — без ошибок; `pnpm --filter @avino/web build` — чистая сборка + type-check (Next 15, 6 страниц). Live end-to-end против `apps/api` не прогнан: backend не стартует из-за pre-existing проблем (нет `@types/express` в `chat.controller.ts` + ESM в `packages/shared`), к ADMIN-06 отношения не имеют — нужен ручной прогон при поднятом api (не-админ → 403, logout → `/admin/login`).

Commit messages:
- feat(web): add ADMIN role guard and logout

Related ADR:
- docs/adr/ADR-0049-web-admin-role-guard.md

---

### TASK-045 — Implement GET /auth/me

Status: DONE
Branch: feat/api-auth-me
PR: #78

Files changed:
- apps/api/src/auth/auth.controller.ts
- apps/api/src/auth/auth.service.ts
- apps/api/src/auth/dto/me-response.dto.ts
- apps/api/src/auth/auth.controller.spec.ts
- apps/api/src/auth/auth.service.spec.ts
- docs/adr/ADR-0048-api-auth-me-contract.md
- docs/TASKS.md

Summary:
- Реализован `GET /api/v1/auth/me` под `JwtAuthGuard` — последний недостающий
  auth-эндпоинт. Был задокументирован в API.md §3 и типизирован на фронте
  (`authApi.getMe`, `MeResponse`, ADMIN-03), но в `apps/api` отсутствовал
  (обнаружено на live e2e ADMIN-05).
- `@CurrentUser('id')` → `AuthService.getMe(userId)`; ответ строго по контракту
  §3 и фронтовому `MeResponse` (snake_case): `{ id, phone, email, status,
  default_language, is_phone_verified, is_email_verified, roles, profile }`.
- Роли читаются из БД (актуальные, а не из access-токена). `profile`
  присутствует всегда: без строки `user_profiles` поля `null`, а
  `preferred_language` фолбэчится на `default_language` (фронтовый тип языка
  non-null). DELETED/несуществующий субъект валидного токена → `401
  UNAUTHORIZED`.
- Разблокирует ADMIN-06 (гард роли ADMIN на фронте).
- Новый `auth.controller.spec.ts` + 4 теста `getMe` в `auth.service.spec.ts`;
  суммарно 323/323 зелёные, lint чистый.

Commit messages:
- feat(auth): implement GET /auth/me endpoint
- docs(auth): add ADR-0048, mark TASK-045 in review

Related ADR:
- docs/adr/ADR-0048-api-auth-me-contract.md

### TASK-024 — Enable CORS for web clients

Status: DONE
Branch: chore/api-enable-cors
PR: #77

Files changed:
- apps/api/src/main.ts
- apps/api/src/common/cors/cors.options.ts
- apps/api/src/common/cors/cors.options.spec.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- .env.example
- docs/ENV.md
- docs/TASKS.md
- docs/adr/ADR-0047-api-cors-allowlist.md

Summary:
- Включён CORS в `main.ts` через `buildCorsOptions` — раньше `enableCors()` не
  вызывался, что блокировало ВСЕ браузерные вызовы admin↔api (обнаружено на live
  e2e ADMIN-05; curl CORS не проверяет).
- Origin-allowlist берётся из `CORS_ORIGINS` (CSV), без хардкода; dev-дефолт
  `http://localhost:3000`. Явный allowlist (без wildcard), `credentials: true`,
  `exposedHeaders: X-Request-Id`, методы с `OPTIONS`, `maxAge: 86400`.
- Логика парсинга/опций вынесена в `common/cors/cors.options.ts` (по аналогии с
  `validation.options.ts`) + 7 unit-тестов.
- `CORS_ORIGINS` добавлена в `env.validation.ts`, `.env.example`, ENV.md §15.
- Mobile (Flutter) не затронут — CORS применяется только к браузеру.

Commit messages:
- chore(api): enable CORS for web clients
- docs(api): document CORS env, add ADR-0047, mark TASK-024 in review

Related ADR:
- docs/adr/ADR-0047-api-cors-allowlist.md

### TASK-131 — Add admin audit and logs endpoints

Status: DONE
Branch: feat/admin-logs
PR: #70

Files changed:
- apps/api/src/audit/audit.service.ts
- apps/api/src/audit/audit.service.spec.ts
- apps/api/src/audit/audit.module.ts
- apps/api/src/audit/index.ts
- apps/api/src/audit/dto/list-audit-logs.dto.ts
- apps/api/src/admin/admin-logs.controller.ts
- apps/api/src/admin/admin-logs.service.ts
- apps/api/src/admin/admin-logs.service.spec.ts
- apps/api/src/admin/dto/list-moderation-logs.dto.ts
- apps/api/src/admin/dto/list-promotion-logs.dto.ts
- apps/api/src/admin/dto/list-notification-logs.dto.ts
- apps/api/src/admin/admin.module.ts
- docs/API.md
- docs/adr/ADR-0042-admin-log-read-endpoints.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added four ADMIN-only read-only log endpoints under `/api/v1/admin/`:
  `audit-logs`, `moderation-logs`, `promotion-logs`, `notification-logs`.
- `audit_logs` is cross-domain (written by many modules), so its read-side lives
  in a dedicated `AuditModule`/`AuditService`; the three domain logs
  (`moderation_logs`/`promotion_logs`/`notifications`) are served by
  `AdminLogsService` in the admin module. One `AdminLogsController` wires all four.
- `moderation-logs` is a global feed across all listings, complementing the
  per-listing `GET /admin/listings/:id/moderation-logs` (TASK-053).
- Application-layer over existing tables — no Prisma migrations. Uniform
  page-based pagination (limit default 20 / max 100, `meta.total`), sort
  `created_at DESC, id DESC`, optional AND filters, snake_case contract.
- Unit-tested with Prisma mocked (9 new tests; full suite 311 green). Build gate
  `nest build` has a pre-existing, unrelated `@types/express` error in
  `chat/chat.controller.ts` (present on `main`).

Commit messages:
- feat(admin): add logs endpoints
- docs(admin): add ADR-0042 and API.md log endpoints; finalize TASK-131 tracking

Related ADR:
- docs/adr/ADR-0042-admin-log-read-endpoints.md

### TASK-130 — Add admin users endpoint

Status: DONE
Branch: feat/admin-users
PR: #69

Files changed:
- apps/api/src/admin/admin-users.controller.ts
- apps/api/src/admin/admin-users.service.ts
- apps/api/src/admin/admin-users.service.spec.ts
- apps/api/src/admin/admin.module.ts
- apps/api/src/admin/dto/list-admin-users.dto.ts
- apps/api/src/admin/dto/update-admin-user.dto.ts
- apps/api/src/admin/dto/assign-role.dto.ts
- apps/api/src/roles/roles.controller.ts
- apps/api/src/roles/roles.service.ts
- apps/api/src/roles/roles.service.spec.ts
- apps/api/src/roles/roles.module.ts
- apps/api/src/roles/index.ts
- docs/TASKS.md
- docs/DONE.md
- docs/adr/ADR-0041-admin-users-roles-management.md

Summary:
- Реализован admin-блок управления пользователями и ролями (API.md §6, ADR-0041):
  `GET /api/v1/admin/users` (список с фильтрами status/role/q + пагинация),
  `GET /api/v1/admin/users/:id` (карточка), `PATCH /api/v1/admin/users/:id`
  (смена статуса), `POST /api/v1/admin/users/:id/roles` (назначить роль),
  `DELETE /api/v1/admin/users/:id/roles/:role` (снять роль → 204),
  `GET /api/v1/roles` (справочник ролей).
- Все мутации только для ADMIN (`/roles` — ADMIN/MODERATOR), guards
  `JwtAuthGuard`+`RolesGuard`. Каждая мутация атомарна и пишет аудит:
  `ADMIN_USER_UPDATE` (смена статуса) и `ROLE_CHANGE` (`op: grant|revoke`).
- Контракт snake_case, переиспользует `PaginatedResponse` (moderation) и
  `toProfileResponse` (profiles). Без новых миграций — поверх существующей схемы.
- Инвариант `DELETED ⇒ deleted_at` (ADR-0013) соблюдён; GUEST отклоняется как
  неизвестная роль (не сидируется, ADR-0011). Маршруты взяты из API.md
  (авторитетнее формулировки карточки задачи).

Commit messages:
- feat(admin): add user management endpoints
- feat(roles): add roles dictionary endpoint
- docs(adr): add ADR-0041 admin users & roles management
- docs(tasks): move TASK-130 to DONE

Related ADR:
- docs/adr/ADR-0041-admin-users-roles-management.md

---

## 2026-06-05

### TASK-111 — Add chat messages

Status: DONE
Branch: feat/chat-messages
PR: #68

Files changed:
- apps/api/src/chat/chat.controller.ts
- apps/api/src/chat/chat.service.ts
- apps/api/src/chat/chat.service.spec.ts
- apps/api/src/chat/chat.module.ts
- apps/api/src/chat/dto/send-message.dto.ts
- apps/api/src/chat/dto/list-messages.dto.ts
- apps/api/src/chat/index.ts
- apps/api/src/notifications/notifications.service.ts
- apps/api/src/notifications/notifications.service.spec.ts
- apps/api/src/notifications/index.ts
- docs/TASKS.md
- docs/DONE.md
- docs/adr/ADR-0040-chat-messages-module.md

Summary:
- Достроены сообщения внутреннего чата поверх тредов (M11, API.md §13):
  `GET /api/v1/chat/threads/:id/messages`, `POST /api/v1/chat/threads/:id/messages`,
  `POST /api/v1/chat/threads/:id/read`. Маршруты по API.md (карточка писала
  `GET …/:id` и `PATCH …/read`, но API.md авторитетен — как в ADR-0036).
- Поверх существующей схемы (`ChatMessage`, DB_SCHEMA §10) — без новых миграций;
  `unread_count` тредов (ADR-0039) заработал с реальными сообщениями.
- Доступ: чтение сообщений — участник треда ИЛИ `MODERATOR`/`ADMIN`
  (complaint-flow); отправка и отметка прочтения — только участник. Нет треда →
  `404`, нет доступа → `403`. `sender_id` берётся из Bearer-токена, не из тела.
- Отправка, сдвиг `last_message_at` и постановка уведомления — в одной
  `prisma.$transaction`. Слать нельзя на `DELETED`-листинге (`422
  LISTING_NOT_AVAILABLE`); на `SOLD`/`ARCHIVED` переписка продолжается.
- Новое сообщение ставит `NEW_CHAT_MESSAGE` второму участнику через
  `NotificationsService.queueChatMessage` (PENDING-строка, канал `IN_APP`).
- `GET …/messages` — keyset `created_at DESC, id DESC` (`meta = { limit,
  next_cursor }`, без `total`); `POST …/read` помечает входящие
  (`sender_id != user`) прочитанными, идемпотентно. → `204`.
- Тесты: 28 юнит-тестов ChatService + queueChatMessage зелёные; полный suite API
  — 286/286; eslint чист.

Commit messages:
- feat(chat): add chat messages
- feat(chat): add chat read status

Related ADR:
- docs/adr/ADR-0040-chat-messages-module.md

### TASK-110 — Add chat threads

Status: DONE
Branch: feat/chat-threads
PR: #67

Files changed:
- apps/api/src/chat/chat.controller.ts
- apps/api/src/chat/chat.service.ts
- apps/api/src/chat/chat.module.ts
- apps/api/src/chat/chat.service.spec.ts
- apps/api/src/chat/dto/create-thread.dto.ts
- apps/api/src/chat/dto/list-threads.dto.ts
- apps/api/src/chat/index.ts
- apps/api/src/app.module.ts
- docs/TASKS.md
- docs/DONE.md
- docs/adr/ADR-0039-chat-threads-module.md

Summary:
- Реализован внутренний чат — треды (M11, API.md §13): `POST /api/v1/chat/threads`
  (создать/получить тред с создателем листинга) и `GET /api/v1/chat/threads`
  (треды пользователя как initiator или owner).
- Поверх существующей схемы (`ChatThread`/`ChatMessage`, DB_SCHEMA §10) — без
  новых миграций. Привязка `initiator_id`/`owner_id` (не buyer/seller, ADR-0003).
- `POST` идемпотентен по `UNIQUE (listing_id, initiator_id, owner_id)`: новый тред
  → `201`, существующий → `200`; гонка ловится по `P2002`. Новый тред только на
  `ACTIVE`-листинге (иначе `422 LISTING_NOT_AVAILABLE`); писать себе нельзя
  (`403`); `GUEST` отсекается `JwtAuthGuard` (`401`).
- `GET` — keyset-пагинация по `last_message_at DESC NULLS LAST, created_at, id`;
  для каждого треда `unread_count` (`chatMessage.groupBy`, без N+1) и
  `listing_preview` (карточка как в `/search` через `SearchService.cardsByIds`).
- Создание сообщений и уведомление `NEW_CHAT_MESSAGE` — TASK-111. `body` в
  `POST /threads` принимается ради совместимости контракта, но в TASK-110 не
  персистится.
- Тесты: 13 юнит-тестов ChatService зелёные; полный suite API — 270/270; tsc и
  eslint чисты.

Commit messages:
- feat(chat): add chat threads

Related ADR:
- docs/adr/ADR-0039-chat-threads-module.md

### TASK-102 — Add saved search alert job

Status: DONE
Branch: feat/saved-search-alerts
PR: pending

Files changed:
- apps/api/src/queues/queue.constants.ts
- apps/api/src/queues/saved-search.queue.ts
- apps/api/src/queues/saved-search.queue.spec.ts
- apps/api/src/queues/queues.module.ts
- apps/api/src/queues/index.ts
- apps/api/src/saved-searches/saved-search-alert.service.ts
- apps/api/src/saved-searches/saved-search-alert.service.spec.ts
- apps/api/src/saved-searches/saved-search.worker.ts
- apps/api/src/saved-searches/saved-searches.module.ts
- apps/api/src/saved-searches/index.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/index.ts
- apps/api/src/notifications/notifications.service.ts
- apps/api/src/notifications/index.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- .env.example
- docs/ENV.md
- docs/TASKS.md
- docs/DONE.md
- docs/adr/ADR-0038-saved-search-alert-job.md

Summary:
- Added a polling matcher that re-runs active saved searches on a schedule and
  emits deduplicated alerts for listings that became ACTIVE since the previous
  check (`saved_search_queue` / `check_saved_searches` repeatable job, mirroring
  the promotion-expiry sweep).
- `SavedSearchAlertService.run()`: per active saved search, matches new ACTIVE
  listings in the half-open `(last_checked_at ?? created_at, now]` window by
  `published_at`, atomically advances `last_checked_at` (optimistic guard) and
  queues one `SAVED_SEARCH_NEW_LISTING` notification per match, then queues one
  digest email per search per run via `email_queue` (best-effort).
- Reused `SearchService` filters via a new public
  `matchNewlyActiveListings(filters, after, until, limit)` that wraps the same
  `buildWhereSql` as `/search` (`status = 'ACTIVE'` enforced); geo filters are
  intentionally out of scope for MVP alerts.
- Why: ARCHITECTURE §11/§16 require email alerts for new saved-search matches;
  acceptance — only ACTIVE listings trigger alerts, duplicates avoided, email
  queued, last_checked_at updated.
- Notes: per-search cap (`MAX_LISTINGS`, default 50) advances the watermark to
  the last match on truncation so the remainder is picked up next run (logged).
  Watermark advances every run (even with zero matches) to bound the window.
  All new env vars have defaults. Worker runs in-process (MVP). Target
  architecture is reverse-matching at publish time (ADR-0038).

Commit messages:
- feat(saved-searches): add alert matcher job

Related ADR:
- docs/adr/ADR-0038-saved-search-alert-job.md

### TASK-101 — Add email queue

Status: DONE
Branch: feat/email-queue
PR: #64

Files changed:
- apps/api/src/queues/queue.constants.ts
- apps/api/src/queues/email.queue.ts
- apps/api/src/queues/email.queue.spec.ts
- apps/api/src/queues/queues.module.ts
- apps/api/src/queues/index.ts
- apps/api/src/email/email-sender.service.ts
- apps/api/src/email/email-sender.service.spec.ts
- apps/api/src/email/email.worker.ts
- apps/api/src/email/email.service.ts
- apps/api/src/email/email.service.spec.ts
- apps/api/src/email/email.module.ts
- apps/api/src/email/index.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/package.json
- pnpm-lock.yaml
- .env.example
- docs/ENV.md
- docs/adr/ADR-0037-email-queue-foundation.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Implemented the email delivery queue foundation (TASK-101, ARCHITECTURE §23). Promotes the TASK-041 `EmailService` stub ("conceptually queued") to genuine async delivery through BullMQ `email_queue` with a worker that performs real SMTP send and logs the delivery result. Reuses the translation/promotion BullMQ pattern (dedicated Redis connection, `attempts` + exponential backoff, producer in global `QueuesModule`, worker in the domain module).
- Producer `EmailQueue.enqueueSendEmail` adds a `send_email` job (`EMAIL_QUEUE_ATTEMPTS`, default 3; no dedup `jobId` — repeat OTPs to one address are distinct jobs). Consumer `EmailWorker` (`EMAIL_QUEUE_CONCURRENCY`, default 2) delegates to `EmailSender` and logs `Email job <id> → <to>: <status>`; transport errors propagate so BullMQ retries.
- `EmailSender` uses **nodemailer** for provider-agnostic SMTP (ADR-0037 — SMTP has no `fetch` equivalent). Three branches mirror `SmsService`: SMTP configured → `SENT` + `messageId`; no SMTP in dev → logged `SKIPPED_DEV`; no SMTP in prod → `SKIPPED_NOT_CONFIGURED` (not sent, no pointless retries).
- `EmailService` is now a thin enqueue facade (`sendOtp` / `sendEmail`); `sendOtp` signature unchanged, so `OtpService`/`AuthModule` are untouched — OTP email delivery just became asynchronous via the queue. SMTP config already existed (TASK-041); added `EMAIL_QUEUE_ATTEMPTS`/`EMAIL_QUEUE_CONCURRENCY` and a non-secret `SMTP_FROM` default.
- Verified: `tsc --noEmit` clean, `eslint` clean on changed dirs, full unit suite **241/241** green (11 new across `email.queue.spec`, `email-sender.service.spec`, `email.service.spec` covering queue name/payload/retry/no-jobId, all three delivery branches incl. port-465 implicit TLS and transport-error propagation, and facade enqueue). No migration, no new enum.

Commit messages:
- feat(email): add email queue foundation

Related ADR:
- docs/adr/ADR-0037-email-queue-foundation.md

### TASK-100 — Add notification records module

Status: DONE
Branch: feat/notifications-records
PR: #64

Files changed:
- apps/api/src/notifications/notifications.controller.ts
- apps/api/src/notifications/notifications.service.ts
- apps/api/src/notifications/notifications.service.spec.ts
- apps/api/src/notifications/dto/list-notifications.dto.ts
- apps/api/src/notifications/notifications.module.ts
- apps/api/src/notifications/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0036-notifications-read-endpoints.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Implemented the read side of notifications (TASK-100, API.md §14) on top of the existing producer (`NotificationsService.queuePromotionExpired`, TASK-123): in-app feed `GET /api/v1/notifications` plus mark-read actions. Registered `NotificationsModule` in `AppModule` (previously only imported by `PromotionsModule` as a provider) and added `RolesModule` for Bearer auth.
- `GET /api/v1/notifications` — keyset feed (`created_at DESC, id DESC`, opaque base64url cursor, mirrors `/favorites`), optional `status`/`type` filters, `meta: { limit, total, unread, next_cursor }`. `unread` is the global badge `count(user_id, read_at IS NULL)`, independent of filters; a corrupted cursor → `400 VALIDATION_ERROR`.
- Mark-read uses **POST** per `API.md §14` (the TASK-100 card says `PATCH`, but `API.md` is authoritative for route wording — same precedent as ADR-0012): `POST /api/v1/notifications/:id/read` and `POST /api/v1/notifications/read-all`, both → `204`. Read sets `read_at = now`, `status → READ`; single-mark is scoped by `(id, user_id)` so other users' notifications return `404` and don't leak existence; mark-all touches only `read_at IS NULL`. Both idempotent.
- Device registration (`POST/DELETE /notifications/devices`, push-stub ADR-010) is out of scope for TASK-100 (not in its acceptance criteria); deferred to a focused follow-up to keep the PR single-purpose (CLAUDE.md §5).
- Verified: `nest build` clean, `eslint` clean, full unit suite 230/230 green (9 in `notifications.service.spec.ts` covering producer + feed order/total/unread/next_cursor + status/type filters + corrupted cursor 400 + single/all mark-read incl. 404 on foreign). No migration, no new enum.

Commit messages:
- feat(notifications): add notification read endpoints and feed

Related ADR:
- docs/adr/ADR-0036-notifications-read-endpoints.md

### TASK-123 — Add promotion expiration job

Status: DONE
Branch: feat/promotion-expiration-job
PR: #62

Files changed:
- apps/api/src/queues/queue.constants.ts
- apps/api/src/queues/promotion.queue.ts
- apps/api/src/queues/promotion.queue.spec.ts
- apps/api/src/queues/queues.module.ts
- apps/api/src/queues/index.ts
- apps/api/src/promotions/promotion-expiry.service.ts
- apps/api/src/promotions/promotion-expiry.service.spec.ts
- apps/api/src/promotions/promotion.worker.ts
- apps/api/src/promotions/promotions.module.ts
- apps/api/src/promotions/index.ts
- apps/api/src/notifications/notifications.service.ts
- apps/api/src/notifications/notifications.service.spec.ts
- apps/api/src/notifications/notifications.module.ts
- apps/api/src/notifications/index.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- docs/adr/ADR-0035-promotion-expiration-job.md
- .env.example
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the background expiration of VIP/TOP promotions (acceptance: `promotion_queue` + `expire_listing_promotions` job). A new `PromotionQueue` producer (global `QueuesModule`) registers a **repeatable** sweep via BullMQ `upsertJobScheduler` (cron `PROMOTION_EXPIRY_CRON`, default every minute); `PromotionWorker` (in `PromotionsModule`) consumes it and delegates to `PromotionExpiryService.run()`.
- `PromotionExpiryService` selects `ACTIVE` promotions with `expires_at <= now()` (batch-bounded) and, per row in its own transaction: conditional flip `status → EXPIRED` (`updateMany WHERE status=ACTIVE` — idempotent, race-safe), resets the `listings` read-cache to `NORMAL` **guarded by `promotion_expires_at <= now()`** so a fresh re-activation isn't clobbered, queues a PENDING notification to the owner, and writes a system `audit_logs(LISTING_PROMOTION_EXPIRE, actor_id=null)`.
- "Notification job is queued" is implemented as a PENDING `notifications` row (DB_SCHEMA §11, like ModerationService) via a new `NotificationsService.queuePromotionExpired` (`PROMOTION_EXPIRED / EMAIL / PENDING`) in a new `NotificationsModule`.
- "Search still treats expired promotion as NORMAL even if job is delayed" required **no change**: search already time-guards the tier in SQL (`promotion_expires_at > now()`) and in `effectiveTier()` (ADR-0027), independent of the job — already covered by `search.service.spec.ts`.

Important notes:
- System expiry logs to `audit_logs` only, NOT `promotion_logs` (that journal is scoped to *admin* actions; its `PromotionAdminAction` enum has no `EXPIRE` value) — avoids a migration. Decision recorded in ADR-0035.
- The job is eventual-consistency cleanup, not the ranking source of truth — safe to lag or be down without affecting search correctness.
- New env vars (defaults, not secrets): `PROMOTION_EXPIRY_CRON`, `PROMOTION_EXPIRY_CONCURRENCY`, `PROMOTION_EXPIRY_BATCH_SIZE` (added to `.env.example`, following the `TRANSLATE_QUEUE_*` precedent).
- Coverage: unit tests with mocked Prisma/BullMQ — expiry happy-path (EXPIRED + cache→NORMAL guard + notification + audit), concurrent-skip (flip count=0), per-row failure isolation, batch-size default; queue scheduler cron + default; notification row shape. Verified: jest 27 suites / 222 tests green (+9), `tsc --noEmit` and ESLint clean.

Commit messages:
- feat(promotions): add expiration job

Related ADR:
- docs/adr/ADR-0035-promotion-expiration-job.md

### TASK-122 — Add promotion cancel and extend

Status: DONE
Branch: feat/admin-promotion-management
PR: #61

Files changed:
- apps/api/src/promotions/admin-promotions.service.ts
- apps/api/src/promotions/admin-promotions.service.spec.ts
- apps/api/src/promotions/dto/cancel-promotion.dto.ts
- apps/api/src/promotions/dto/extend-promotion.dto.ts
- apps/api/src/admin/admin-listing-promotions.controller.ts
- apps/api/src/admin/admin.module.ts
- docs/adr/ADR-0034-admin-promotion-cancel-extend.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added cancel and extend for existing promotions (API.md §15): `PATCH /api/v1/admin/listing-promotions/:id/cancel` and `PATCH /api/v1/admin/listing-promotions/:id/extend`. Unlike activate/history (which key off the listing), these key off the **promotion id**, so they live in a new `AdminListingPromotionsController` at `/admin/listing-promotions`. Access is **ADMIN only** (RolesGuard), consistent with TASK-121.
- Both ops require the promotion to be `ACTIVE` (shared `requireActivePromotion` guard): missing row → `404 NOT_FOUND`, non-active → `422 PROMOTION_NOT_ACTIVE`. The error catalog (§17) scopes `PROMOTION_NOT_ACTIVE` to both extend and cancel.
- **cancel**: in one transaction sets `status → CANCELLED`, resets the `listings` read-cache to NORMAL (`promotion_type = NORMAL`, both dates `null`), and writes `promotion_logs(CANCEL_PROMOTION)` (delta `old_type → NORMAL`, with optional `reason`) + `audit_logs(LISTING_PROMOTION_CHANGE)`. This preserves the "one ACTIVE per listing" invariant.
- **extend**: validates `period_days` against the tier catalog (`422 INVALID_PERIOD`), then `expires_at += period_days` anchored on the current `expires_at` (an ACTIVE promo is future-dated → this is a prolongation, not a restart; falls back to `now` only if data is desynced). Syncs the cache `promotion_expires_at` and writes `promotion_logs(EXTEND_PROMOTION)` (delta) + `audit_logs`.

Important notes:
- "Only one ACTIVE promotion remains" holds because neither op ever creates a second row: cancel removes one from the ACTIVE set, extend mutates a single existing row.
- `audit_logs(LISTING_PROMOTION_CHANGE)` is written in addition to the contract-mandated `promotion_logs`, mirroring activation (ADR-0033) for a complete security audit trail; it does not change the API response shape. Decision recorded in ADR-0034.
- Coverage is unit tests with mocked Prisma (mirrors TASK-121): cancel happy-path + cache reset + logging + null reason; extend happy-path + delta; 404 / 422 PROMOTION_NOT_ACTIVE / 422 INVALID_PERIOD for both. Verified: jest 24 suites / 213 tests green (+8 for cancel/extend), `tsc --noEmit` and ESLint clean.

Commit messages:
- feat(promotions): add cancel and extend actions

Related ADR:
- docs/adr/ADR-0034-admin-promotion-cancel-extend.md

### TASK-121 — Add admin promotion activation

Status: DONE
Branch: feat/admin-promotion-activation
PR: #60

Files changed:
- apps/api/src/promotions/admin-promotions.service.ts
- apps/api/src/promotions/admin-promotions.service.spec.ts
- apps/api/src/promotions/dto/activate-promotion.dto.ts
- apps/api/src/promotions/promotions.catalog.ts
- apps/api/src/promotions/promotions.module.ts
- apps/api/src/promotions/index.ts
- apps/api/src/admin/admin-promotions.controller.ts
- apps/api/src/admin/admin.module.ts
- docs/adr/ADR-0033-admin-promotion-activation.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added manual VIP/TOP promotion activation and history (API.md §15): `POST /api/v1/admin/listings/:id/promotions` and `GET /api/v1/admin/listings/:id/promotions`. The `listing_promotions` ledger is the source of truth; the `listings.promotion_*` read-cache is updated in the same transaction. Online payments are out of scope in MVP — activation is manual with `payment_status = NOT_REQUIRED` and price/currency pulled from the static `PROMOTION_PLANS` catalog (ADR-0032).
- Access is **ADMIN only** (API.md §15 takes precedence over the task card's looser "admin/moderator" wording — MODERATOR moderates content, not paid tiers).
- Activation auto-supersedes: any previous `ACTIVE` promo is set to `CANCELLED`, a new `ACTIVE` row is created, the cache is synced, and one `promotion_logs` row (old→new delta) + `audit_logs(LISTING_PROMOTION_CHANGE)` are written — all atomically. This keeps the "one ACTIVE per listing" PARTIAL UNIQUE invariant.
- Idempotency: the optional `Idempotency-Key` header is stored as `payment_reference` (the PARTIAL UNIQUE column already reserved for this); a repeated key replays the existing promo (pre-check + P2002 race replay) instead of creating a duplicate. A concurrent non-idempotent race maps to `409 ACTIVE_PROMOTION_EXISTS`.

Important notes:
- Period is validated against the catalog in the service → `422 INVALID_PERIOD` (not `400`), as the contract requires; `type` is restricted to `TOP|VIP` by the DTO. Missing/DELETED listing → `404`.
- No `PROMOTION_ACTIVATED` notification is emitted here — the POST contract (API.md §15) lists only promotion_logs + audit_logs. Generic idempotency middleware for payment callbacks is deferred to Phase 1.5. Both decisions recorded in ADR-0033.
- Coverage is unit tests with mocked Prisma (mirrors ModerationService): activation/supersede/logging, idempotency replay (pre-check and P2002), 422/404/409 paths, and history. Verified: jest green, `tsc --noEmit` and ESLint clean.

Commit messages:
- feat(promotions): add admin promotion activation

Related ADR:
- docs/adr/ADR-0033-admin-promotion-activation.md

### TASK-120 — Add promotion plans endpoint

Status: DONE
Branch: feat/promotion-plans
PR: pending

Files changed:
- apps/api/src/promotions/promotions.catalog.ts
- apps/api/src/promotions/promotions.service.ts
- apps/api/src/promotions/promotions.controller.ts
- apps/api/src/promotions/promotions.module.ts
- apps/api/src/promotions/promotions.service.spec.ts
- apps/api/src/promotions/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0032-promotion-plans-static-catalog.md
- docs/API.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the promotions module with the public `GET /api/v1/promotions/plans` endpoint (API.md §15). Auth is public (no guard, like `/search`) — the price catalog must be visible to guests, web and the future Flutter app.
- The plan catalog (tier × period × price) is a static in-code constant (`PROMOTION_PLANS` in `promotions.catalog.ts`), not a DB table — there is no `promotion_plans` table in the schema and prices rarely change in MVP (ADR-0032). The service has no Prisma/Redis dependency and returns a shallow copy so external mutation can't corrupt the constant.
- Price matrix (UZS, confirmed with Team Lead): TOP 50k/90k/150k, VIP 120k/210k/350k for 7/14/30 days. The 7- and 30-day prices come from API.md §15; the 14-day prices (TOP 90k, VIP 210k — midpoint) are introduced by this task and recorded in ADR-0032. Prices are returned as `Decimal` strings (`"50000.00"`); currency is `UZS`.

Important notes:
- Only `TOP` and `VIP` tiers are listed (`NORMAL` means "no promo"). Admin activation, the `listing_promotions` ledger, cancel/extend and the expiration job are out of scope here (TASK-121/122/123); `PromotionsService` is exported so those tasks reuse the catalog for period validation and price lookup.
- Changing prices requires a code deploy (no DB/admin override) — a conscious MVP trade-off; the response shape stays stable if the catalog later moves to a table/config.
- Coverage is unit tests (no DB): 6-plan shape, tier/period completeness, exact price matrix, `Decimal` format, and return immutability.
- Verified: `jest` 23 suites / 193 tests green (+5 for promotions); `nest build` and ESLint clean.

Commit messages:
- feat(promotions): add promotion plans endpoint

Related ADR:
- docs/adr/ADR-0032-promotion-plans-static-catalog.md

### TASK-091 — Add saved searches module

Status: DONE
Branch: feat/saved-searches
PR: #58

Files changed:
- apps/api/src/saved-searches/saved-searches.controller.ts
- apps/api/src/saved-searches/saved-searches.service.ts
- apps/api/src/saved-searches/saved-searches.module.ts
- apps/api/src/saved-searches/saved-searches.service.spec.ts
- apps/api/src/saved-searches/dto/filters-json.dto.ts
- apps/api/src/saved-searches/dto/create-saved-search.dto.ts
- apps/api/src/saved-searches/dto/update-saved-search.dto.ts
- apps/api/src/saved-searches/dto/list-saved-searches.dto.ts
- apps/api/src/saved-searches/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0031-saved-searches-module.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the saved-searches module on top of the existing schema (no new migrations — the `SavedSearch` model / `saved_searches` table already exist from migration `20260603180000_add_favorites_saved_searches`, DB_SCHEMA §9): `GET /api/v1/saved-searches`, `POST /api/v1/saved-searches`, `PATCH /api/v1/saved-searches/:id`, `DELETE /api/v1/saved-searches/:id`. The whole controller is under `JwtAuthGuard`, so a guest without a Bearer token gets `401` (API.md §12). `SearchModule` is NOT imported (unlike favorites) — saved searches return their own records, no listing-card hydration.
- `filters_json` is versioned (`{ schemaVersion, filters }`, API.md §12) and validated in two layers: `FiltersJsonDto` enforces structure (`schemaVersion` int, `filters` object) → a bad type is `400 VALIDATION_ERROR`; the service then checks the version against `SUPPORTED_SCHEMA_VERSIONS = { 1 }` → a structurally-valid but unknown version (e.g. `99`) is `422 UNSUPPORTED_FILTER_SCHEMA`. The inner `filters` object is intentionally freeform (not validated against the `/search` DTO) for forward compatibility — the saved-search matcher stays tolerant to versions and the search filter set grows (TASK-081/082).
- Ownership is enforced at the write level: `PATCH`/`DELETE` use `(id, user_id)` filters via `updateMany`/`deleteMany`; `count === 0` → `404` (a stranger's search is unreachable and not leaked by existence). `PATCH` is partial (`name` / `filters_json` / `is_active`), and after a successful `updateMany` re-reads the row for the `200` body. `:id` is validated by `ParseUUIDPipe`.
- `GET` lists by `created_at DESC, id DESC` (newest first) and returns `meta: { limit, total }` exactly per the §12 contract (no keyset cursor — saved searches are a short personal list); `limit` default 20, max 100 (API.md §4).

Important notes:
- `filters` content is not validated against the search schema — a malformed filter set is accepted and simply matches nothing later, rather than failing on write. Conscious trade-off for forward compatibility; strict checking deferred to the versioned matcher (M10).
- `is_active=false` lets a user pause alerts without deleting the saved search.
- Coverage is unit tests (Prisma mocked), as with favorites; no live-PostgreSQL integration spec was added.
- Verified: `jest` 22 suites / 188 tests green (+9 for saved-searches create/update/remove/list, including `422` on unknown schemaVersion and `404` owner guard); `tsc --noEmit` and ESLint clean.

Commit messages:
- feat(saved-searches): add saved search CRUD

Related ADR:
- docs/adr/ADR-0031-saved-searches-module.md

### TASK-090 — Add favorites module

Status: DONE
Branch: feat/favorites
PR: #57

Files changed:
- apps/api/src/favorites/favorites.controller.ts
- apps/api/src/favorites/favorites.service.ts
- apps/api/src/favorites/favorites.module.ts
- apps/api/src/favorites/favorites.service.spec.ts
- apps/api/src/favorites/dto/create-favorite.dto.ts
- apps/api/src/favorites/dto/list-favorites.dto.ts
- apps/api/src/favorites/index.ts
- apps/api/src/search/search.service.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0030-favorites-module.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the favorites module on top of the existing schema (no new migrations — the `Favorite` model / `favorites` table with `UNIQUE (user_id, listing_id)` already exist from migration `20260603180000_add_favorites_saved_searches`, DB_SCHEMA §9): `GET /api/v1/favorites`, `POST /api/v1/favorites`, `DELETE /api/v1/favorites/:listingId`. The whole controller is under `JwtAuthGuard`, so a guest without a Bearer token gets `401` (API.md §11) — "guest cannot use favorites".
- Routes follow docs/API.md (`POST /favorites` with body `{ listing_id }`, `DELETE /favorites/:listingId`), which is authoritative over the task-card wording (`POST/DELETE /favorites/:listingId`). `POST` validates the listing exists and is not `DELETED` (else `404`), then `create`s; duplicates are prevented atomically by catching the `P2002` unique-index violation → `409 ALREADY_FAVORITED` (no TOCTOU pre-check). `DELETE` removes by `(user_id, listing_id)` via `deleteMany` (cannot delete someone else's favorite); nothing to remove → `404`.
- `GET /favorites` lists by favorite recency (`created_at DESC, id DESC`, newest first) with its own opaque keyset cursor (`{ created_at, id }`), not the tier-aware `/search` cursor. `DELETED` listings are excluded by a relation filter at the DB level so `limit + 1` keyset and `total` stay correct. A corrupted cursor → `400 VALIDATION_ERROR`.
- The list returns the same §9 card as `/search` (API.md §11: "карточки как в /search") via a new public `SearchService.cardsByIds(ids, lang, acceptLanguage)` that hydrates listings by id (same `SEARCH_SELECT` — translations + cover media), preserves input order, and maps through the existing private `toSearchItem`. This reuses the translation language selection (TASK-070) and card shape without duplicating them; `SEARCH_SELECT`/`toSearchItem` stay encapsulated in `SearchService`.

Important notes:
- Favorites list ordering is by add-time only (a personal list, not a promotion showcase); no promotion prioritization in MVP.
- Coverage is unit tests (Prisma/SearchService mocked), as with `listing-media`; no live-PostgreSQL integration spec was added for favorites.
- Verified: `jest` 21 suites / 179 tests green (+13 for favorites add/remove/list, cursor, DELETED relation filter); `tsc --noEmit` and ESLint clean.

Commit messages:
- feat(favorites): add favorite listings module
- feat(search): expose cardsByIds for card reuse
- docs(adr): add ADR-0030 favorites module

Related ADR:
- docs/adr/ADR-0030-favorites-module.md

### TASK-083 — Add map bounds search

Status: DONE
Branch: feat/search-map-bounds
PR: #56

Files changed:
- apps/api/src/search/dto/geo-search.dto.ts
- apps/api/src/search/search.controller.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/search.service.spec.ts
- apps/api/src/search/search.service.geo.int-spec.ts
- docs/adr/ADR-0029-search-map-bounds.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added a public map-bounds endpoint on top of the existing PostGIS schema (no new migrations — `location` trigger + GIST index `idx_listings_location` already exist from TASK-035, ADR-0003): `GET /api/v1/search/bounds`. Returns ACTIVE listings inside the visible map rectangle (`ST_MakeEnvelope` + exact `ST_Within`), with the same promotion-priority ordering + keyset as `/search` and `/search/radius`. No `distance_m` (a bbox has no center point); the field stays optional and absent (non-breaking).
- The bbox predicate uses `location && <envelope>::geography` (GIST-indexed bbox prefilter) followed by `ST_Within(location::geometry, <envelope>)` (exact). The envelope is `ST_MakeEnvelope(sw_lng, sw_lat, ne_lng, ne_lat, 4326)` (longitude first, matching `pointSql`/the sync trigger). NULL-`location` rows are excluded.
- Route and params follow docs/API.md (`/search/bounds`, `sw_lat/sw_lng/ne_lat/ne_lng`), which is authoritative over the task-card wording (`/search/map`, `north/south/east/west`). Promotion fields (`promotion_type`, `promotion_expires_at`, `effective_tier`) are already part of the §9 card, so map markers get VIP/TOP data for the marker UI.
- Coordinate validation per acceptance criteria: `BoundsSearchQueryDto` requires `sw_lat`/`ne_lat` (−90..90) and `sw_lng`/`ne_lng` (−180..180); invalid/missing → `400 VALIDATION_ERROR`. Reused the ranking pipeline (`buildWhereSql`/`hydrateCards`/`buildKeysetEnvelope`); only a small `envelopeSql` helper was added.

Important notes:
- Antimeridian-crossing bboxes (`sw_lng > ne_lng`) are not supported (not needed for Uzbekistan); an inverted/degenerate bbox yields an empty result, not an error.
- Verified: `pnpm test` 20 suites / 169 tests (was 166, +3 unit tests for bounds SQL shape, no-`distance_m`, keyset). `pnpm test:int` 2 suites / 7 tests on live PostGIS — `search.service.geo.int-spec.ts` now seeds listings at known coordinates and asserts bbox inclusion/exclusion (incl. NULL-geo) and a stable bounds keyset. `nest build` (tsc) and ESLint clean.

Commit messages:
- feat(search): add map bounds search

Related ADR:
- docs/adr/ADR-0029-search-map-bounds.md

### TASK-082 — Add PostGIS radius and near-me search

Status: DONE
Branch: feat/search-postgis-radius
PR: #54

Files changed:
- apps/api/src/search/dto/geo-search.dto.ts
- apps/api/src/search/search.controller.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/search.service.spec.ts
- apps/api/src/search/search.service.geo.int-spec.ts
- docs/adr/ADR-0028-search-postgis-radius-near-me.md
- docs/API.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added two public geo endpoints on top of the existing PostGIS schema (no new migrations — `location` trigger + GIST index `idx_listings_location` already exist from TASK-035, ADR-0003): `GET /api/v1/search/radius` (ST_DWithin within `radius_m`, GIST-indexed, promotion-priority ordering + keyset like `/search`) and `GET /api/v1/search/near-me` (ST_Distance ASC, promotion as a tie-breaker, single page sized by `limit`). Both attach `distance_m` (meters, rounded) to each card — an optional, non-breaking field absent from plain `/search`.
- Route names follow docs/API.md (`/radius` + `/near-me`), which is authoritative over the task-card wording (`/nearby`). The query point is built as `ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography` (longitude first, matching the sync trigger); NULL-`location` rows are excluded.
- Coordinate validation per acceptance criteria: `GeoSearchQueryDto` requires `lat` (−90..90) / `lng` (−180..180); `radius_m` is bounded to 1..50000 m; invalid/missing → `400 VALIDATION_ERROR`.
- Reused the ranking pipeline: extracted shared `hydrateCards` / `buildKeysetEnvelope` so `search`, `searchRadius` and `searchNearMe` share hydration and keyset assembly (DRY); `search` behavior unchanged.

Important notes:
- Verified: `pnpm test` 20 suites / 166 tests (was 161, +5 unit tests for radius/near-me SQL shape, distance_m, keyset). `pnpm test:int` 2 suites / 5 tests on live PostGIS — new `search.service.geo.int-spec.ts` seeds listings at known coordinates and asserts ST_DWithin radius exclusion (incl. NULL-geo), ST_Distance ascending order, distance_m magnitude, and stable radius keyset. `tsc --noEmit` and ESLint clean.
- "GIST index is used" is satisfied by radius's ST_DWithin; near-me orders by ST_Distance per the acceptance criterion (KNN `<->` optimization is backlog M8).

Commit messages:
- feat(search): add PostGIS radius and near-me search

Related ADR:
- docs/adr/ADR-0028-search-postgis-radius-near-me.md

### TASK-081 — Promotion-aware sorting: live-PostgreSQL integration test (follow-up)

Status: DONE
Branch: test/search-promotion-sorting-integration
PR: #53

Files changed:
- apps/api/src/search/search.service.int-spec.ts
- apps/api/jest.int.config.js
- apps/api/test/load-env.ts
- apps/api/package.json
- docs/adr/ADR-0027-search-promotion-sorting.md
- docs/DONE.md

Summary:
- Added an opt-in integration suite that verifies the actual `ORDER BY` against a live PostgreSQL (the unit suite mocks Prisma and only checks SQL shape). It seeds VIP/TOP/NORMAL listings plus an expired-VIP and a `created_at`-tie pair, then asserts the real ranking: `VIP > TOP > NORMAL`, expired promotion ranked as NORMAL, `created_at desc` / `id desc` final tie-breakers, and keyset pagination stable across pages (no gaps/duplicates).
- Kept separate from the default suite: new `*.int-spec.ts` convention + `jest.int.config.js` + `pnpm test:int` (requires DB with migrations). `test/load-env.ts` loads the root `.env` so `PrismaClient` finds `DATABASE_URL` under ts-jest.
- Self-isolating: a unique `city_id` scopes the search; data is seeded in `beforeAll` and removed in `afterAll`.

Important notes:
- Closes the previously-open integration checkbox of TASK-081 (PR #52). Run: `docker compose up -d postgres && pnpm --filter @avino/api prisma:migrate && pnpm --filter @avino/api test:int`.
- Default `pnpm test` unchanged (20 suites / 161 tests); the int suite (2 tests) runs only via `test:int`. `tsc --noEmit` and ESLint clean.

Commit messages:
- test(search): add live-PostgreSQL integration test for promotion sorting

Related ADR:
- docs/adr/ADR-0027-search-promotion-sorting.md

## 2026-06-02

### TASK-DOCS-INIT — Initial project tracking documents (DONE.md + ADR)

Status: DONE
Branch: docs/initial-done-and-adr
PR: #12

Files changed:
- docs/DONE.md
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0004-vip-top-promotion-model.md

Summary:
- Initialized DONE.md as the human-readable log of merged work, with the entry format.
- Added 4 ADR records: project stack, API versioning v1, PostGIS via Prisma, VIP/TOP promotion model.
- Records existing decisions before coding starts — restates ARCHITECTURE.md §28, no architecture changed.

Commit messages:
- docs(adr): add initial architecture decisions

Related ADR:
- docs/adr/ADR-0001-project-stack.md
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0004-vip-top-promotion-model.md

### TASK-010 — Initialize monorepo structure

Status: DONE
Branch: chore/monorepo-setup
PR: #14

Files changed:
- packages/config/package.json
- packages/config/tsconfig.base.json
- packages/config/prettier-preset.cjs
- packages/config/README.md
- packages/shared/package.json
- packages/shared/tsconfig.json
- pnpm-lock.yaml

Summary:
- Completed the M1 monorepo structure. The scaffold (apps/api, apps/web, packages/shared, root package.json, pnpm-workspace.yaml, docker-compose.yml, .env.example, .gitignore, README.md, docs/) already existed; the only acceptance-criteria gap was the missing packages/config package.
- Added @avino/config: a business-logic-free shared configuration package with a base tsconfig (tsconfig.base.json) and a Prettier preset (prettier-preset.cjs).
- Wired packages/shared to extend @avino/config/tsconfig.base.json and added @avino/config as a workspace:* devDependency, removing duplicated compiler options and proving the config package is consumed within the pnpm workspace.
- Verified: pnpm install links @avino/config; pnpm --filter @avino/shared build passes; prettier --check on new files passes. Note: apps/api lint failure (missing ESLint config) is pre-existing from the scaffold and out of scope.

Commit messages:
- chore(repo): add packages/config shared configuration package
- chore(shared): extend @avino/config base tsconfig

Related ADR:
- docs/adr/ADR-0001-project-stack.md (monorepo / pnpm / stack decision; mechanical structure completion, no new ADR required per TASKS.md Rule 4)

### TASK-011 — Add Docker infrastructure

Status: DONE
Branch: chore/docker-infrastructure
PR: #16

Files changed:
- docs/adr/ADR-0005-docker-infrastructure.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- All physical deliverables of TASK-011 (docker-compose.yml with postgis/postgis:16-3.4 and redis:7-alpine, .env.example with DATABASE_URL and REDIS_URL, README.md `pnpm infra:up` startup command, and the infra:up/infra:down scripts in package.json) already existed in main — they were added by the TASK-010 monorepo scaffold (commit 9d0ca01). All five acceptance criteria were therefore already met.
- The only outstanding gap was the missing decision record: added docs/adr/ADR-0005-docker-infrastructure.md formalizing the local Docker infrastructure (PostgreSQL/PostGIS + Redis, healthchecks, named volumes, env-driven ports/credentials, local-dev scope).
- No code or compose/env changes were made — the infrastructure was already present and verified against each acceptance criterion.

Commit messages:
- docs(adr): record local Docker infrastructure decision (TASK-011)

Related ADR:
- docs/adr/ADR-0005-docker-infrastructure.md

### TASK-012 — Add shared constants package

Status: DONE
Branch: chore/shared-constants (feature), chore/finalize-task-012 (DONE/ADR)
PR: #18 (feature), #19 (DONE/ADR finalization)

Files changed:
- packages/shared/src/enums.ts
- packages/shared/src/constants.ts
- packages/shared/src/index.ts
- docs/adr/ADR-0004-vip-top-promotion-model.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added `PromotionType` enum and a new `constants.ts` module to the shared package (`@avino/shared`) so backend (apps/api) and frontend (apps/web) consume one source of enum-like codes: roles, languages, listing statuses, property/deal types, currencies, and promotion types.
- `enums.ts` now holds only enum definitions; derived collections (`USER_ROLES`, `SUPPORTED_LANGUAGES`, `LISTING_STATUSES`, `MVP_LISTING_STATUSES`, `PROPERTY_TYPES`, `DEAL_TYPES`, `SUPPORTED_CURRENCIES`, `PROMOTION_TYPES`, `PAID_PROMOTION_TYPES`) and defaults (`DEFAULT_LANGUAGE`, `DEFAULT_CURRENCY`, `DEFAULT_PROMOTION_TYPE`) live in `constants.ts`.
- Aligned `PromotionType` with ADR-0004 by including `NORMAL` (priority VIP > TOP > NORMAL); the merged feature PR initially shipped only VIP/TOP. No backend logic — data only.

Commit messages:
- chore(shared): add common constants and enums
- chore(shared): align PromotionType with ADR-0004 (add NORMAL)

Related ADR:
- docs/adr/ADR-0004-vip-top-promotion-model.md (updated: linked shared enum/constants and TASK-012)

### TASK-020 — Initialize NestJS API app

Status: DONE
Branch: feat/api-foundation
PR: #21

Files changed:
- apps/api/src/app.controller.ts
- apps/api/src/app.service.ts
- apps/api/src/app.module.ts
- docs/TASKS.md
- docs/DONE.md

Summary:
- The bootable NestJS app (apps/api/package.json, src/main.ts, src/app.module.ts, nest-cli.json, tsconfig.json) already existed in main — it was added by the TASK-010 monorepo scaffold (commit 9d0ca01). The app already starts, uses TypeScript, and has no business modules, satisfying all three acceptance criteria.
- The only gap versus TASK-020's expected files was the standard root controller/service: added src/app.controller.ts (`@Controller()` → GET /api/v1) and src/app.service.ts (returns service/status/apiVersion), and registered both in app.module.ts (AppController in controllers, AppService in providers).
- Verified: `pnpm --filter @avino/api build` passes; the app starts and `GET /api/v1` returns `{service:"avino-api",status:"ok",apiVersion:"v1"}`, `GET /api/v1/health` returns ok, and unversioned `GET /health` returns 404.
- No new ADR required — the NestJS stack decision is already recorded in ADR-0001 (project stack). Versioning groundwork present in main.ts predates this task and is finalized under TASK-021.
- Note: `pnpm lint` fails repo-wide because no ESLint config exists yet (pre-existing gap, not introduced here); deferred to a dedicated tooling task.

Commit messages:
- feat(api): add root AppController and AppService

Related ADR:
- docs/adr/ADR-0001-project-stack.md

### TASK-021 — Add API versioning and global prefix

Status: DONE
Branch: feat/api-versioning
PR: #22

Files changed:
- apps/api/src/health/health.controller.ts (moved from apps/api/src/health.controller.ts)
- apps/api/src/health/health.module.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0002-api-versioning-v1.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Global `api` prefix and URI-based versioning (`defaultVersion: '1'`) already existed in `main.ts` from the TASK-010 scaffold (commit 9d0ca01), so two of the four acceptance criteria were already met. `main.ts` was left unchanged.
- Refactored the placeholder root `health.controller.ts` into a proper `health/` module: moved the controller into `apps/api/src/health/health.controller.ts` (via `git mv`, preserving history) and added `apps/api/src/health/health.module.ts`, matching the task's expected file layout.
- Made the version explicit on the health controller (`@Controller({ path: 'health', version: '1' })`) per CLAUDE.md §14, and registered `HealthModule` in `app.module.ts` (removed the direct `HealthController` registration).
- Verified: `pnpm --filter @avino/api build` passes; `GET /api/v1/health` → `{status:"ok",service:"avino-api"}`; `GET /api/v1` → ok; both routes log `version: 1`; unversioned `GET /health` and `GET /api/health` return 404 — no unversioned routes exist.
- No new ADR — ADR-0002 already records the versioning decision; updated it to link the implementation files and TASK-021.

Commit messages:
- feat(health): move health endpoint into versioned HealthModule

Related ADR:
- docs/adr/ADR-0002-api-versioning-v1.md (updated: linked implementation files and TASK-021)

### TASK-022 — Add config and validation foundation

Status: DONE
Branch: feat/api-config-validation
PR: #23

Files changed:
- apps/api/src/config/config.module.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/config/index.ts
- apps/api/src/common/validation/validation.options.ts
- apps/api/src/app.module.ts
- apps/api/src/main.ts
- apps/api/package.json
- .env.example
- docs/adr/ADR-0006-config-and-validation.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added a global config foundation under `apps/api/src/config/`: `AppConfigModule` wraps `ConfigModule.forRoot` (`isGlobal`, `cache`, `envFilePath: ['../../.env', '.env']`), replacing the inline `ConfigModule.forRoot` previously in `app.module.ts`.
- Env validation (`env.validation.ts`) via `class-validator` + `class-transformer` runs on boot (fail-fast): `DATABASE_URL` and `REDIS_URL` are required; S3/Yandex/Eskiz/Translate/SMTP groups are optional until wired in. Numeric vars carry explicit type annotations so `enableImplicitConversion` parses string env values correctly.
- Typed namespaced config (`configuration.ts`) via `registerAs` (`app`, `database`, `redis`, `s3`, `maps`, `sms`, `translate`, `mail`), loaded through `ConfigModule`'s `load`; `main.ts` now reads the port via `ConfigService.get('app.port')`.
- Global `ValidationPipe` enabled in `main.ts` with options centralized in `common/validation/validation.options.ts`: `whitelist`, `forbidNonWhitelisted`, `transform`, `transformOptions.enableImplicitConversion`.
- `.env.example` annotated to mark required vs optional groups, matching the validation contract.
- Added runtime deps `class-validator@^0.14.1` and `class-transformer@^0.5.1` to `@avino/api`.
- Verified: `pnpm --filter @avino/api build` passes; app boots reading port from config, `GET /api/v1/health` → `{status:"ok",service:"avino-api"}`, unversioned `GET /health` → 404; fail-fast confirmed — missing `DATABASE_URL`/`REDIS_URL` or out-of-range `API_PORT` aborts startup with a clear error.
- Note: `pnpm --filter @avino/api lint` still fails repo-wide because no ESLint config exists yet (pre-existing gap from TASK-021, not introduced here).

Commit messages:
- feat(config): add environment configuration and validation
- feat(api): add global validation pipe

Related ADR:
- docs/adr/ADR-0006-config-and-validation.md

---

### TASK-023 — Add response and error format

Status: DONE
Branch: feat/api-error-format
PR: #25

Files changed:
- apps/api/src/common/dto/error-response.dto.ts
- apps/api/src/common/filters/all-exceptions.filter.ts
- apps/api/src/common/interceptors/request-id.interceptor.ts
- apps/api/src/common/validation/validation.options.ts
- apps/api/src/main.ts
- docs/adr/ADR-0007-api-error-envelope.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added a unified API error envelope foundation under `apps/api/src/common/`, implementing docs/API.md §4 ("Error format") and §17 ("Error catalog"). Error shape is identical for web (RTK Query) and the future Flutter client (CLAUDE.md §3, §18).
- `common/dto/error-response.dto.ts` defines the envelope types (`ApiErrorResponse`, `ApiErrorBody`, `ApiErrorDetail`) and the `ApiErrorCode` enum mirroring the API.md §17 catalog (stable UPPERCASE codes, part of the contract).
- `common/filters/all-exceptions.filter.ts` is a global `@Catch()` filter rendering every exception as `{ error: { code, message, details?, request_id } }`. It uses an explicit `{ code, message, details }` payload when present, otherwise derives `code` from the HTTP status (e.g. `401 → UNAUTHORIZED`, `404 → NOT_FOUND`) with a stable fallback to the status name. Any non-`HttpException` and any `5xx` becomes `500 INTERNAL_ERROR` with a generic message; the real cause is logged server-side only and never leaks.
- `common/validation/validation.options.ts` now sets an `exceptionFactory` that flattens the `class-validator` error tree into `details: [{ field, issue }]` (nested DTO fields become dotted paths, e.g. `address.city`) and throws a structured `VALIDATION_ERROR`, matching API.md §4 exactly.
- `common/interceptors/request-id.interceptor.ts` assigns each request a `request_id` (reuses an incoming `X-Request-Id` header or generates a UUID) and echoes it via the `X-Request-Id` response header; the filter falls back to the incoming header so not-found / guard-rejected paths stay correlated.
- `main.ts` wires the interceptor, the validation pipe, and the filter globally. Success responses are intentionally NOT wrapped (documented bare-object / `{ data, meta }` shapes are produced per-endpoint); only the `X-Request-Id` header is added on success.
- Verified: `pnpm --filter @avino/api build` and `tsc --noEmit` pass; app boots and `GET /api/v1/health` → 200 with `X-Request-Id` header; unknown route → `{"error":{"code":"NOT_FOUND",...,"request_id":...}}`; an incoming `X-Request-Id` is echoed back; `validationPipeOptions.exceptionFactory` produces the documented `VALIDATION_ERROR` + `details` shape (incl. nested `address.city`).
- Note: `pnpm --filter @avino/api lint` still fails repo-wide because no ESLint config exists yet (pre-existing gap from TASK-021, not introduced here).

Commit messages:
- feat(api): add standard error handling
- feat(api): add response formatting foundation

Related ADR:
- docs/adr/ADR-0007-api-error-envelope.md

---

### TASK-030 — Add Prisma foundation

Status: DONE
Branch: feat/prisma-foundation
PR: #26

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/src/prisma/prisma.module.ts
- apps/api/src/prisma/prisma.service.ts
- apps/api/src/prisma/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0003-postgis-prisma.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the Prisma runtime foundation for `apps/api` so future feature modules (users, listings, chat) can inject a database client. `@prisma/client` / `prisma` were already in `package.json` and `schema.prisma` already declared the `postgresqlExtensions` preview feature + `postgis` extension (ADR-0003); this task adds the NestJS integration layer.
- `apps/api/src/prisma/prisma.service.ts` extends `PrismaClient` and owns the connection lifecycle: `onModuleInit` calls `$connect` (fail-fast on startup), `onModuleDestroy` calls `$disconnect`. Logs connect/disconnect via Nest `Logger`.
- `apps/api/src/prisma/prisma.module.ts` is `@Global()` and exports `PrismaService`, mirroring the global `AppConfigModule` (ADR-0006) so it is injectable everywhere without re-import. `index.ts` is a barrel matching the `config/` convention.
- `app.module.ts` imports `PrismaModule` (after `AppConfigModule`, before `HealthModule`).
- `schema.prisma` gained a temporary `HealthCheck` placeholder model. Prisma refuses to generate a client with zero models, and the foundation must be generatable before any domain model exists (acceptance criterion "Prisma client can be generated"). The placeholder is commented for removal in TASK-033 (first real model — users). Decision confirmed by Team Lead per CLAUDE.md §2/§13.
- `DATABASE_URL` is already documented in `.env.example` (`postgresql://avino:avino@localhost:5432/avino?schema=public`) — no change needed there.
- Verified: `pnpm prisma generate` → "Prisma Client generated"; `pnpm build` (`nest build`) passes; `npx eslint` on the new files exits clean.

Commit messages:
- feat(db): add Prisma foundation

Related ADR:
- docs/adr/ADR-0003-postgis-prisma.md

## 2026-06-03

### TASK-033 — Add users and roles schema

Status: DONE
Branch: feat/db-users-roles
PR: #29

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603130000_add_users_and_roles/migration.sql
- apps/api/prisma/seed.ts
- apps/api/package.json
- docs/adr/ADR-0009-users-roles-schema.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the core identity schema (DB_SCHEMA §4) as the first table migration:
  `users`, `user_profiles` (1:1, `user_id` UNIQUE, ON DELETE CASCADE), `roles`
  (seeded dictionary, `code` UNIQUE) and `user_roles` (M:N, `@@unique([userId,
  roleId])`, indexes on `userId`/`roleId`). Removed the temporary `HealthCheck`
  placeholder model (TASK-030).
- `phone`/`email` are intentionally NOT `@unique` in Prisma: uniqueness is scoped
  to non-DELETED accounts via PARTIAL UNIQUE indexes (`uniq_users_phone_active`,
  `uniq_users_email_active`) appended as raw SQL — the same pattern as the future
  PostGIS GIST index (ADR-0003/ADR-0009, Variant A). This lets a soft-deleted
  account free its contact for re-registration while preserving the value on the
  deleted row.
- Two CHECK constraints added as raw SQL (Prisma cannot express them):
  `users_contact_present_check` (phone OR email present) and
  `users_deleted_at_consistency_check` (`deleted_at` set iff status = DELETED).
- All timestamps use `@db.Timestamptz(6)` to honour DB_SCHEMA §2 (timestamptz in
  UTC), departing from Prisma's default `timestamp(3)`.
- The migration does NOT re-create the pgcrypto/postgis/pg_trgm extensions
  (owned by the baseline migration TASK-031) but, as the first table migration,
  it creates all declared enum types (incl. not-yet-used ListingStatus,
  PromotionType, Currency) so schema and migration history stay in sync.
- `prisma/seed.ts` (idempotent `upsert` by `code`) seeds the 8 roles from
  DB_SCHEMA §3 (USER, OWNER, AGENT, AGENCY, LANDLORD, PROPERTY_MANAGER,
  MODERATOR, ADMIN); GUEST is intentionally not seeded (ADR-0008). Role codes are
  sourced from `@avino/shared` `UserRole` to avoid drift. Seed wired via
  `prisma.seed` in `apps/api/package.json`.
- Verified against the project's `postgis/postgis:16-3.4` container: `prisma
  validate` passes; `prisma migrate deploy` applies both migrations cleanly;
  drift check shows no table/enum/constraint drift (only the known
  postgresqlExtensions-preview false-positive re-emitting CREATE EXTENSION);
  `prisma db seed` seeds 8 roles; `nest build` passes; `prettier --check` clean.
  Constraint smoke test confirmed: missing-contact INSERT rejected, duplicate
  ACTIVE phone rejected, soft-delete then re-register with the same phone
  succeeds, and DELETED-without-`deleted_at` rejected.

Commit messages:
- feat(db): add users and roles schema
- feat(db): seed default roles

Related ADR:
- docs/adr/ADR-0009-users-roles-schema.md

### TASK-031 — Add PostgreSQL extensions migration

Status: DONE
Branch: feat/db-extensions
PR: #27

Files changed:
- apps/api/prisma/migrations/20260603120000_enable_extensions/migration.sql
- apps/api/prisma/migrations/migration_lock.toml
- apps/api/prisma/schema.prisma
- docs/adr/ADR-0003-postgis-prisma.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the baseline raw SQL migration that enables the three PostgreSQL extensions the schema depends on: `pgcrypto` (gen_random_uuid() for every `id uuid` PK — DB_SCHEMA §2), `postgis` (geography(Point,4326) + GIST geo search — ADR-0003) and `pg_trgm` (GIN trigram ILIKE text search — ARCHITECTURE §12). Each uses `CREATE EXTENSION IF NOT EXISTS`, so the migration is idempotent and safe to re-run.
- This is the first migration directory in the project; it ships with `migration_lock.toml` (`provider = "postgresql"`). It must run before any table migration so the uuid/geo/trgm primitives exist when domain tables land (TASK-032+).
- Declared all three extensions in `schema.prisma` `datasource db.extensions = [pgcrypto, postgis, pg_trgm]` (postgresqlExtensions preview feature) so the declarative schema matches the migration and Prisma reports no drift. Previously only `postgis` was declared.
- Applied with `prisma migrate deploy` rather than `prisma migrate dev`, because the schema still carries the temporary `HealthCheck` placeholder (TASK-030) which must not leak into the first table migration (removed in TASK-033).
- Verified against the project's `postgis/postgis:16-3.4` container: migration applied cleanly (`_prisma_migrations` shows 1 finished migration); `SELECT extname FROM pg_extension` returns pgcrypto, postgis, pg_trgm; smoke test confirms `gen_random_uuid()`, `postgis_version()` and the `%` trigram operator all work; `prisma validate` passes and `prisma generate` succeeds.

Commit messages:
- feat(db): add PostgreSQL extensions

Related ADR:
- docs/adr/ADR-0003-postgis-prisma.md

### TASK-032 — Add core enums to Prisma

Status: DONE
Branch: feat/db-core-enums
PR: #28

Files changed:
- apps/api/prisma/schema.prisma
- packages/shared/src/enums.ts
- packages/shared/src/constants.ts
- docs/adr/ADR-0008-core-domain-enums.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the four core Postgres enums to `apps/api/prisma/schema.prisma` as Prisma `enum` blocks: `ListingStatus` (NEW | ACTIVE | DRAFT | REJECTED | DELETED | ARCHIVED | SOLD | RENTED), `PromotionType` (NORMAL | TOP | VIP), `Currency` (UZS | USD) and `Language` (UZ | RU | EN). Values mirror DB_SCHEMA §3 exactly and are part of the v1 contract (adding a value is non-breaking; rename/remove requires v2 — ADR-0002).
- `Role` is intentionally NOT a Postgres enum: roles are a seeded `roles` dictionary with a many-to-many `user_roles` join (DB_SCHEMA §4), so they extend without a migration. Documented in the schema header and ADR-0008. `GUEST` is the implicit unauthenticated state (not stored, not a role code — ADR-011).
- Fixed lower/upper-case conflicts in `packages/shared/src/enums.ts` so shared enums match the API.md JSON contract: `Language` values `'uz'|'ru'|'en'` → `'UZ'|'RU'|'EN'` (lowercase `uz|ru|en` remains only the `Accept-Language`/`?lang` convention, mapped to the enum); `UserRole` values lowercased → UPPERCASE (`"roles": ["USER"]`). Renamed enum `CURRENCY` → `Currency` for PascalCase consistency and updated all `constants.ts` references.
- Verified: `prisma validate` passes (schema valid against the project schema); `tsc --noEmit` on `packages/shared` passes; `prettier --check` clean on all changed TS/Prisma files. No external consumers of the renamed/recased symbols exist outside `constants.ts`. Postgres enum types are declared now and will be created by migration when the first model references them (listings — TASK-035).

Commit messages:
- feat(db): add core enums
- feat(shared): align shared enums with database

Related ADR:
- docs/adr/ADR-0008-core-domain-enums.md

### TASK-034 — Add auth schema

Status: DONE
Branch: feat/db-auth-schema
PR: #30

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603140000_add_auth_tokens/migration.sql
- docs/adr/ADR-0010-auth-token-schema.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the auth token storage for OTP-based login (DB_SCHEMA §4): models `OtpCode` (`otp_codes`) and `RefreshToken` (`refresh_tokens`) in `apps/api/prisma/schema.prisma`, plus two new Postgres enums `OtpChannel` (SMS | EMAIL) and `OtpPurpose` (LOGIN). `users` has no password column — auth is OTP → access/refresh session (ARCHITECTURE §6, ADR-0009).
- Secrets are stored HASHED, never plaintext: `otp_codes.code_hash` and `refresh_tokens.token_hash` are `VARCHAR(255)` and there is no `code`/`token` column at all, so a DB dump cannot be replayed to log in. `attempts SMALLINT` supports lockout after N failed verifications; rate limiting (per destination, per IP) lives in the service layer.
- Refresh tokens rotate on use and are grouped by `family_id`; reuse of an already-rotated token is meant to revoke the whole family (reuse detection), with the mechanism in the service layer and the storage + `family_id` index provided here. `otp_codes.user_id` is nullable (a code can be issued pre-signup, since OTP login doubles as registration); `refresh_tokens.user_id` is NOT NULL. Both FKs are `ON DELETE CASCADE`.
- Lookup indexes per DB_SCHEMA §4: `otp_codes` on `(destination, purpose)` and `(expires_at)`; `refresh_tokens` on `(user_id)`, `(token_hash)` and `(family_id)`. All timestamps use `@db.Timestamptz(6)` (UTC), consistent with ADR-0009.
- Migration `20260603140000_add_auth_tokens` creates the two enum types (first migration to reference them), both tables, indexes and FKs; it does not re-create the core enums (owned by the users/roles migration). Verified against the project's `postgis/postgis` container: `prisma validate` and `prisma format` clean, `prisma generate` succeeds, `prisma migrate deploy` applied the migration, and `\d otp_codes` / `\d refresh_tokens` confirm all columns (code_hash/token_hash present, no plaintext column), the five lookup indexes, the cascade FKs, and the `OtpChannel`/`OtpPurpose` enum values.

Commit messages:
- feat(db): add auth token schema

Related ADR:
- docs/adr/ADR-0010-auth-token-schema.md

### TASK-035 — Add listings schema with PostGIS

Status: DONE
Branch: feat/db-listings-postgis
PR: #31

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603150000_add_listings/migration.sql
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0008-core-domain-enums.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the `Listing` model (`listings`) — the listing core schema (DB_SCHEMA §6). Non-translatable structured fields live here; translatable text (TASK-036), promotions ledger (TASK-037) and engagement (TASK-038) follow in later M3 tasks. Two new Postgres enums `TransactionType` (SALE | RENT) and `PropertyType` (APARTMENT | HOUSE | NEW_BUILDING | LAND | COMMERCIAL) are introduced here — `listings` is the first model to reference them; the core enums (TASK-032) are not re-created.
- Geo (ADR-0003, DB_SCHEMA §14): `latitude`/`longitude` are editable `Decimal(9,6)` source columns; `location` is `Unsupported("geography(Point, 4326)")` — derived, not written through Prisma. A `BEFORE INSERT/UPDATE OF latitude, longitude` trigger (`listings_sync_location_trg` → `listings_sync_location()`) keeps `location` in sync in the same write so it cannot drift; NULL coords yield NULL location. The `GIST` index `idx_listings_location` is created via raw SQL (Prisma migrate does not emit GIST on `Unsupported` columns). This realizes the trigger option ADR-0003 left open.
- Promotion read-cache fields (`promotion_type` default NORMAL, `promotion_started_at`, `promotion_expires_at`) are a denormalized cache for sort/filter; the source of truth is `listing_promotions` (TASK-037, ADR-0004). `status` defaults to NEW (moderation entry state). `owner_id` → `users` is `ON DELETE RESTRICT` (accounts are soft-deleted — ADR-013 — so a listing always keeps a valid creator). Indexes match §6, including the composite default-search index `(status, promotion_type, created_at DESC, id DESC)`. CHECK constraints `price >= 0` and `area IS NULL OR area >= 0` (DB_SCHEMA §15).
- `agency_id` / `city_id` / `district_id` are FK columns per §6, but the `agencies`/`cities`/`districts` tables do not exist yet. They are created as indexed UUID columns WITHOUT a FK constraint or Prisma relation; the constraints and relation fields will be added when those target tables land in their own tasks. Documented in the model header and ADR-0003.
- Decision flagged for Team Lead: `PropertyType` here follows DB_SCHEMA §3 (5 values incl. `NEW_BUILDING`), but `packages/shared/src/enums.ts` currently has 4 values (no `NEW_BUILDING`) and names the deal enum `DealType` rather than `TransactionType`. The Prisma/DB layer follows the authoritative §3 contract; reconciling the shared TS enums (add `NEW_BUILDING`, align `DealType` → `TransactionType` naming) is left to a separate task to avoid mixing a frontend-contract change into this DB PR (CLAUDE.md §2/§5).
- Verified against the project's `postgis/postgis:16-3.4` container: `prisma validate`, `prisma format` and `prisma generate` clean; `prettier --check` clean on the schema; `prisma migrate deploy` applied `20260603150000_add_listings`; `prisma migrate status` → "up to date". DB introspection confirms all 26 columns with correct types, all 11 btree indexes + the GIST index + the FK + both CHECK constraints + the sync trigger. Smoke test: inserting a listing with lat/lng auto-populated `location` (SRID 4326, exact coords), `ST_DWithin` radius search returned the row, and a negative `price` insert was rejected by the CHECK constraint.

Commit messages:
- feat(db): add listings schema
- feat(db): add PostGIS listing location index

Related ADR:
- docs/adr/ADR-0003-postgis-prisma.md
- docs/adr/ADR-0008-core-domain-enums.md

### TASK-036 — Add listing translations and media schema

Status: DONE
Branch: feat/db-listing-translations-media
PR: #32

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603160000_add_listing_translations/migration.sql
- apps/api/prisma/migrations/20260603160500_add_listing_media/migration.sql
- docs/adr/ADR-0008-core-domain-enums.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the `ListingTranslation` model (`listing_translations`) and `ListingMedia` model (`listing_media`) — the translatable text and media split off the `listings` core table (TASK-035, DB_SCHEMA §6). All translatable text (`title`/`description`/`address_note`/`features_text`) now lives in `listing_translations`, one row per language; the author row is `source=USER`, `is_auto_translated=false` on the listing's `original_language`, while machine rows (`GOOGLE`/`YANDEX`) are generated after the listing becomes ACTIVE and inherit its visibility (ADR-005). `UNIQUE(listing_id, language)` enforces one translation per language.
- Introduced two new Postgres enums under the ADR-0008 rules — `TranslationSource` (USER | GOOGLE | YANDEX) and `MediaType` (IMAGE) — created by this migration as the first models to reference them. `MediaType` intentionally carries only `IMAGE` in MVP; `VIDEO` is Phase 2 and adding it later is a non-breaking enum addition (DB_SCHEMA §3).
- `listing_media` stores S3 URLs + processed-file metadata only (no files on the app FS); `(listing_id, sort_order)` index drives gallery ordering. `width`/`height`/`size_bytes` are the image metadata; `mime_type VARCHAR(100)` records the validated content-type (allowed MVP types image/jpeg, image/png, image/webp — DB_SCHEMA §6). EXIF/GPS is stripped on processing and listing coordinates come only from the map, never from photo EXIF (ADR-008).
- Both tables FK → `listings(id)` `ON DELETE CASCADE`: listings are soft-deleted via `status` (ADR-013), so a row is physically removed only in admin/cleanup flows, and when it is its translations and media go with it.
- Decision flagged for Team Lead: DB_SCHEMA §6 names the allowed MVP MIME types but did not enumerate a `mime_type` column on `listing_media`. It was added here to satisfy the TASK-036 "MIME metadata fields exist" acceptance criterion and to give the upload pipeline a place to persist the checked content-type. The optional `pg_trgm` GIN index on translation `title`/`description` (DB_SCHEMA §6, ARCHITECTURE §12) is deferred to the text-search task — it is explicitly optional and not needed by the schema itself.
- Verified against the project's `postgis:16-3.4` container: `prisma validate` and `prisma format` clean, `prisma generate` clean, `prettier --check` clean on schema + migration; `prisma migrate reset` applied all six migrations in order (incl. `20260603160000_add_listing_translations` and `20260603160500_add_listing_media`) and `prisma migrate status` → "up to date". DB introspection confirms both tables with exact column types, the unique index `(listing_id, language)`, the `(listing_id, sort_order)` index and both CASCADE FKs. Smoke test: inserted an author (USER/RU) + auto (GOOGLE/EN) translation and a media row; a duplicate `(listing_id, RU)` was rejected by the unique constraint; deleting the parent listing cascaded both children to zero rows.

Commit messages:
- feat(db): add listing translations schema
- feat(db): add listing media schema

Related ADR:
- docs/adr/ADR-0008-core-domain-enums.md

### TASK-037 — Add promotions schema

Status: DONE
Branch: feat/db-promotions
PR: #33

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603170000_add_promotions/migration.sql
- docs/adr/ADR-0004-vip-top-promotion-model.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the `ListingPromotion` model (`listing_promotions`) — the promotion **ledger / source of truth** (DB_SCHEMA §8, ADR-0004) — and the `PromotionLog` model (`promotion_logs`) for admin-action audit. The denormalized `listings.promotion_*` columns (TASK-035) remain a READ CACHE of the active row; the ledger is authoritative. `listing_promotions.type` stores only the paid tier (TOP | VIP); `NORMAL` means "no promo" and is never written to the ledger.
- Introduced three new Postgres enums under the ADR-0008 rules — `PromotionStatus` (PENDING_PAYMENT | ACTIVE | EXPIRED | CANCELLED | REFUNDED), `PaymentStatus` (NOT_REQUIRED | PENDING | PAID | FAILED | REFUNDED) and `PromotionAdminAction` (ACTIVATE_VIP | ACTIVATE_TOP | CANCEL_PROMOTION | EXTEND_PROMOTION). The existing `PromotionType`/`Currency` enums (TASK-032) are reused, not re-created.
- Three integrity rules Prisma cannot express are added as raw SQL (DB_SCHEMA §8/§15): `PARTIAL UNIQUE (listing_id) WHERE status='ACTIVE'` → at most one active promotion per listing (ADR-0004); `PARTIAL UNIQUE (payment_reference) WHERE payment_reference IS NOT NULL` → idempotency key for future payment callbacks; and CHECK constraints `period_days IN (7,14,30)` plus `expires_at > starts_at` (window ordering).
- MVP is payment-free: `payment_status` defaults to `NOT_REQUIRED` and `payment_provider` is a stub, so admins activate VIP/TOP manually; the payment fields exist now for forward-compatibility (Phase 1.5, ADR-0004). FK behaviour per §8: `listing_promotions.listing_id` CASCADE / `user_id` SET NULL; `promotion_logs.listing_id` CASCADE / `listing_promotion_id` SET NULL / `admin_id` SET NULL — audit rows survive deletion of the promotion row or the admin.
- Verified against the project's `postgis:16-3.4` container: `prisma validate` and `prisma format` clean, `prisma generate` clean, repo-wide `prettier --check .` clean; `prisma migrate deploy` applied `20260603170000_add_promotions` and `migrate status` → up to date. DB introspection confirms both tables, both partial-unique indexes, both CHECK constraints and all five FKs with the correct ON DELETE actions. Smoke test: a first ACTIVE promo inserts, a second ACTIVE on the same listing is rejected by the partial unique index, an EXPIRED row alongside an ACTIVE one is allowed, `period_days=10` is rejected by the CHECK, deleting an ACTIVE promo nulls `promotion_logs.listing_promotion_id` while keeping the listing reference, and deleting the listing cascades both promotions and logs to zero.

Commit messages:
- feat(db): add listing promotions schema

Related ADR:
- docs/adr/ADR-0004-vip-top-promotion-model.md

### TASK-038 — Add engagement schema

Status: DONE
Branch: feat/db-engagement-schema
PR: pending

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260603180000_add_favorites_saved_searches/migration.sql
- apps/api/prisma/migrations/20260603180500_add_chat_notifications/migration.sql
- apps/api/prisma/migrations/20260603181000_add_audit_logs/migration.sql
- docs/adr/ADR-0008-core-domain-enums.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the engagement / messaging layer of the MVP schema (DB_SCHEMA §9–§12): `Favorite` (`favorites`), `SavedSearch` (`saved_searches`), `ChatThread` (`chat_threads`), `ChatMessage` (`chat_messages`), `Notification` (`notifications`), `NotificationDevice` (`notification_devices`) and `AuditLog` (`audit_logs`). Split into three migrations matching the three suggested commits: favorites+saved_searches, chat+notifications, audit_logs.
- Chat binds a listing to its two participants via `initiator_id` / `owner_id` — deliberately NOT buyer/seller, because a listing can be SALE or RENT (ADR-0003, DB_SCHEMA §10). `UNIQUE(listing_id, initiator_id, owner_id)` = one thread per pair+listing; `chat_messages.sender_id` is `ON DELETE SET NULL` so a message survives in the thread history when the sender's account is removed (MVP uses API polling; WebSocket can be added later with no schema change).
- Introduced four new Postgres enums under the ADR-0008 rules — `NotificationType` (7 values), `NotificationChannel` (EMAIL | PUSH | IN_APP), `NotificationStatus` (PENDING | SENT | FAILED | READ) and `DevicePlatform` (ANDROID | IOS | WEB) — created in the chat+notifications migration as the first models to reference them. `notifications` are produced as BullMQ jobs (never sent synchronously); `notification_devices` is a push-token registry stub for the future Flutter app with `UNIQUE(push_token)`. `saved_searches.filters_json` is versioned jsonb (`{ schemaVersion, filters }`, ADR-0009). `audit_logs.action` is a free-form `VARCHAR(80)` (not an enum) so new auditable actions need no migration (ADR-0004); `actor_id` is `ON DELETE SET NULL` (null = system).
- Unique constraints match DB_SCHEMA §15: `favorites (user_id, listing_id)`, `chat_threads (listing_id, initiator_id, owner_id)`, `notification_devices (push_token)`. No partial/CHECK constraints are required for this task, so all migrations are pure Prisma-expressible DDL (no raw SQL).
- Verified against the project's `postgis:16-3.4` container: `prisma validate` clean, `prisma format` clean, `prisma generate` clean; `prisma migrate reset` replayed all 10 migrations in order and `migrate diff` (DB built from migrations vs schema) reports no difference other than the known raw-SQL PostGIS GIST index on `listings.location` (ADR-0003, not modelled by Prisma — pre-existing, unrelated). Smoke test on the live DB confirmed: duplicate `favorites (user, listing)` rejected; duplicate `chat_threads (listing, initiator, owner)` rejected; duplicate `notification_devices.push_token` rejected; deleting a non-participant message sender nulled `chat_messages.sender_id` while keeping the message; deleting an actor nulled `audit_logs.actor_id`; deleting a user cascaded their favorites/saved_searches/notifications to zero; deleting a listing cascaded its chat_threads and chat_messages to zero; a versioned `filters_json` inserted and round-tripped as jsonb.

Commit messages:
- feat(db): add favorites and saved searches schema
- feat(db): add chat and notifications schema
- feat(db): add audit logs schema

Related ADR:
- docs/adr/ADR-0008-core-domain-enums.md

---

## 2026-06-04

### TASK-081 — Add promotion-aware sorting

Status: DONE
Branch: feat/search-promotion-sorting
PR: #52

Files changed:
- apps/api/src/search/search.service.ts
- apps/api/src/search/search.service.spec.ts
- docs/adr/ADR-0027-search-promotion-sorting.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- `GET /api/v1/search` now ranks promoted listings first: `effective_tier DESC, created_at DESC, id DESC` (ADR-0004 §4). VIP appears before TOP, TOP before NORMAL; `created_at desc` and `id desc` are the final, deterministic tie-breakers, so the order is stable.
- The effective tier is **time-guarded in SQL** (`CASE WHEN promotion_type = 'VIP'/'TOP' AND promotion_expires_at > now() ... ELSE 0`): an expired promotion is ranked as NORMAL immediately, independent of any expire-job (ADR-0004 §2). This matches the existing time-guarded `effective_tier` already shipped in the card.
- Ranking, keyset and `total` moved to parameterized raw SQL (`Prisma.sql`/`$queryRaw`) because Prisma `orderBy` can't express a time-guarded CASE. The page is then hydrated via `prisma.listing.findMany({ where: { id: { in } } })` with order restored — keeping filters in one SQL builder and the relation-load + §9 card mapping unchanged.

Important notes:
- The opaque keyset cursor is extended with the tier rank: base64url-JSON `{ rank, createdAt, id }` (predicted by ADR-0026). A malformed or structurally-invalid cursor (missing `rank`) returns `400 VALIDATION_ERROR`, not a silent reset. Response shape (API.md §9) is unchanged — only ordering and the opaque cursor format changed.
- Filters are built as `Prisma.sql` fragments (injection-safe): enum columns compared via `::text`, ids via `::uuid`, price via `::numeric` within one currency. `status = 'ACTIVE'` is always applied first.
- Two unit tests added (7 search tests total); full apps/api suite green (20 suites, 161 tests). `tsc --noEmit` and ESLint clean.

Commit messages:
- feat(search): add promotion priority sorting

Related ADR:
- docs/adr/ADR-0027-search-promotion-sorting.md

### TASK-080 — Add listing search filters

Status: DONE
Branch: feat/search-listing-filters
PR: #50

Files changed:
- apps/api/src/search/search.controller.ts
- apps/api/src/search/search.service.ts
- apps/api/src/search/search.service.spec.ts
- apps/api/src/search/search.module.ts
- apps/api/src/search/dto/search-listings.dto.ts
- apps/api/src/search/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0026-public-search-keyset-filters.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the public `GET /api/v1/search` endpoint (API.md §9), opening milestone M8. New `SearchModule` (public, no guards; imports `TranslationsModule`) registered in `app.module.ts`. The endpoint always restricts to `status = ACTIVE` (DELETED and other non-public statuses are excluded from all public read-paths, DB_SCHEMA §15).
- Basic filters (TASK-080 scope): `transaction_type`, `property_type`, price range `price_min`/`price_max` applied within one `currency` (no FX), `city_id`, `district_id`. Unknown params are ignored (forward-compatible).
- Keyset (cursor) pagination on `(created_at DESC, id DESC)` — the main mode for public search (API.md §4, ADR-0007). Opaque base64url `next_cursor`; `take = limit + 1` detects the next page; a malformed cursor returns `400 VALIDATION_ERROR` rather than silently resetting. Envelope `meta = { limit, total, next_cursor }`; `total` is a parallel count over the filters.
- Search card matches API.md §9 in full, including the time-guarded `effective_tier` (VIP/TOP only while `promotion_expires_at > now()`, else NORMAL). Card language is negotiated via `?lang`/`Accept-Language` with original-language fallback, delegated to `TranslationsService`.

Important notes:
- Acceptance criteria satisfied: `GET /api/v1/search` exists (per authoritative API.md §9; the task-card wording `/search/listings` was superseded), filters by transaction_type / property_type / price range / city / district, only ACTIVE listings returned, pagination works (keyset).
- Deliberately out of scope: promotion-priority sorting as the primary sort key (TASK-081 — a pure ORDER BY change since `effective_tier` already ships), PostGIS geo filters (TASK-082), free-text `q`, area/rooms/feature_ids and the `sort` param (later).
- 5 new unit tests; full apps/api suite green (20 suites, 159 tests). `tsc --noEmit` and ESLint clean.

Commit messages:
- feat(search): add basic listing filters

Related ADR:
- docs/adr/ADR-0026-public-search-keyset-filters.md

### TASK-071 — Add translation queue and provider abstraction

Status: DONE
Branch: feat/translation-queue
PR: #49

Files changed:
- apps/api/src/queues/queues.module.ts
- apps/api/src/queues/translation.queue.ts
- apps/api/src/queues/translation.queue.spec.ts
- apps/api/src/queues/queue.constants.ts
- apps/api/src/queues/bullmq-connection.ts
- apps/api/src/queues/index.ts
- apps/api/src/translations/providers/translation-provider.interface.ts
- apps/api/src/translations/providers/yandex.provider.ts
- apps/api/src/translations/providers/google.provider.ts
- apps/api/src/translations/providers/translation-provider.factory.ts
- apps/api/src/translations/providers/translation-provider.factory.spec.ts
- apps/api/src/translations/providers/translation-provider.spec.ts
- apps/api/src/translations/providers/index.ts
- apps/api/src/translations/listing-auto-translator.service.ts
- apps/api/src/translations/listing-auto-translator.service.spec.ts
- apps/api/src/translations/translation.worker.ts
- apps/api/src/translations/translations.module.ts
- apps/api/src/moderation/moderation.service.ts
- apps/api/src/moderation/moderation.service.spec.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/app.module.ts
- .env.example
- docs/adr/ADR-0025-listing-translation-queue.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added the BullMQ `translation_queue` for listing auto-translation (M7). Producer `TranslationQueue` (global `QueuesModule`) enqueues a `translate_listing` job with retry options (`attempts` from `TRANSLATE_QUEUE_ATTEMPTS`, default 3, + exponential backoff) and a dedup `jobId = translate:<listingId>`. Uses raw `bullmq` wired manually (no `@nestjs/bullmq` dependency), with the Redis connection built as plain options from `REDIS_URL` (`buildBullConnection`) to sidestep the ioredis version skew between the app and BullMQ's bundle.
- Added a provider abstraction: `TranslationProvider` interface with `YandexTranslationProvider`/`GoogleTranslationProvider`, selected by `TRANSLATE_PROVIDER` via `createTranslationProvider` (DI token `TRANSLATION_PROVIDER`, default Yandex). Real HTTP through global `fetch`; without `TRANSLATE_API_KEY` the provider degrades gracefully (returns source text), mirroring `SmsService`/`EmailService`.
- Worker `TranslationWorker` (concurrency from `TRANSLATE_QUEUE_CONCURRENCY`) is a thin BullMQ consumer delegating to the unit-tested `ListingAutoTranslator.run(listingId)`: loads the author row on `original_language`, translates `title`/`description`/`address_note`/`features_text` into the other languages, and upserts `ListingTranslation` rows (`source=<provider>`, `is_auto_translated=true`). Idempotent via upsert on `(listing_id, language)`; null fields skip the provider; stale jobs (missing/not-ACTIVE/no author row) are skipped softly.
- Trigger: `ModerationService.changeStatus` enqueues on APPROVE→ACTIVE after the transaction commits. A failed enqueue is logged but not propagated (the listing is already ACTIVE). The listing-create path is untouched, so no direct translation call blocks listing create.

Important notes:
- Acceptance criteria satisfied: `translation_queue` exists; provider abstraction exists; Google/Yandex selected by env; failed jobs retry (BullMQ `attempts` + backoff); no direct translation call blocks listing create (auto-translation runs in the background after moderation approval).
- Re-generation of machine translations on author-text edits and manual per-translation PUT/PATCH remain out of scope.
- 18 new unit tests (provider factory + providers, `ListingAutoTranslator`, `TranslationQueue`, moderation enqueue); full apps/api suite green (19 suites, 154 tests). `tsc --noEmit`, `nest build`, ESLint and Prettier all clean.

Commit messages:
- feat(translations): add provider abstraction
- feat(translations): add translation queue and auto-translate worker
- feat(moderation): enqueue auto-translation on approve
- docs(adr): record translation queue decision (ADR-0025)

Related ADR:
- docs/adr/ADR-0025-listing-translation-queue.md

### TASK-070 — Add listing translation service

Status: DONE
Branch: feat/listing-translation-service
PR: #48

Files changed:
- apps/api/src/translations/translations.service.ts
- apps/api/src/translations/translations.service.spec.ts
- apps/api/src/translations/translations.controller.ts
- apps/api/src/translations/translations.module.ts
- apps/api/src/translations/index.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/listings.service.spec.ts
- apps/api/src/listings/listings.module.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0024-listing-translation-service.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Added a dedicated `TranslationsModule`/`TranslationsService` (M7) as the single source of listing-translation logic, on top of the existing `ListingTranslation` model. It encapsulates three operations: `buildOriginalTranslationInput` (author row on `original_language`, source=USER, `is_auto_translated=false`), `resolveLanguage` (response language pick: `?lang` → `Accept-Language` → fallback to `original_language` → first available, ADR-005/012), and `listByListing` (all translations for a listing).
- Implemented `GET /api/v1/listings/:id/translations` (API.md §7): Bearer + an ownership gate (listing owner **or** MODERATOR/ADMIN). Missing/DELETED listing → 404 (excluded from all read-paths, no existence leak); authenticated stranger → 403. The response is a management view — it includes `source` and `is_auto_translated` so the owner/moderation can tell author text from machine translation: `{ listing_id, original_language, translations: [{ language, source, is_auto_translated, title, description, address_note, features_text }] }`, sorted by `language`.
- Refactored `ListingsService` to delegate author-row construction and language resolution to `TranslationsService`, removing the duplicated private `resolveLanguage`/`normalizeLanguage`/`parseAcceptLanguage` helpers. The `GET /api/v1/listings/:id` contract is unchanged; language/fallback behaviour stays verified through the delegate in the existing `ListingsService` tests.

Important notes:
- Acceptance criteria satisfied: original-language row is created (on listing create), translations are retrievable by language (resolveLanguage + the translations endpoint), listing response supports language selection (`?lang`/`Accept-Language`), and the missing-translation fallback is defined (→ `original_language` → first available).
- Auto-translation to the remaining languages (`translation_queue`, Google/Yandex provider, re-generation after ACTIVE) is intentionally out of scope — that is TASK-071; this task is the synchronous storage/retrieval layer only. Until TASK-071 lands, only the author row on `original_language` exists.
- 14 new unit tests (TranslationsService: buildOriginalTranslationInput, resolveLanguage matrix, listByListing gates/mapping); full apps/api suite green (15 suites, 135 tests). `nest build` clean; ESLint clean.

Commit messages:
- feat(translations): add listing translation service
- refactor(listings): delegate translation logic to TranslationsService
- docs(adr): record listing translation service decision (ADR-0024)

Related ADR:
- docs/adr/ADR-0024-listing-translation-service.md

### TASK-061 — Add listing media endpoints

Status: DONE
Branch: feat/listing-media-endpoints
PR: #47

Files changed:
- apps/api/src/listing-media/listing-media.controller.ts
- apps/api/src/listing-media/listing-media.service.ts
- apps/api/src/listing-media/listing-media.service.spec.ts
- apps/api/src/listing-media/listing-media.module.ts
- apps/api/src/listing-media/dto/reorder-media.dto.ts
- apps/api/src/listing-media/index.ts
- apps/api/src/uploads/uploads.service.ts
- apps/api/src/uploads/uploads.service.spec.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0023-listing-media-endpoints.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Implemented the listing media gallery endpoints (M6) on top of `UploadsService` (TASK-060) and the existing `ListingMedia` model: `GET /api/v1/listings/:id/media` (list), `POST /api/v1/listings/:id/media` (proxy `multipart/form-data` upload, field `file`), `DELETE /api/v1/listings/:id/media/:mediaId`, `PATCH /api/v1/listings/:id/media/reorder`.
- Route naming follows `API.md` §8 (`reorder`), not the `sort` wording in the task card — `API.md` is the authoritative contract on divergence (CLAUDE.md §2; confirmed by Team Lead). MVP scope is upload/list/delete/reorder; presigned PUT + `confirm` (direct-to-S3) are deferred.
- Authorization is per-operation: modification (upload/delete/reorder) requires Bearer + an ownership gate (listing owner **or** ADMIN — MODERATOR moderates status, not content); list uses `OptionalJwtAuthGuard` and mirrors the listing-detail visibility (ACTIVE public; non-public statuses → owner/MODERATOR/ADMIN; DELETED/missing → 404 without leaking existence).
- Upload validation reuses the existing error catalog (ADR-0007): MIME allow-list `image/jpeg|png|webp` → 415; size > 10 MiB → 413; > 20 media per listing → 422; missing file → 400. New media is appended at the end (`sort_order = count`); reorder requires a full permutation of the listing's media ids and rewrites `sort_order` in one transaction.
- `listing_media` stores `url`, not the S3 key (DB_SCHEMA §6), so deletion derives the key via a new `UploadsService.extractKey(url)` (inverse of `getObjectUrl`; handles public CDN base-URL and path-style bucket). Delete is best-effort: the DB row (source of truth) is removed first, then the S3 object; an S3 error is logged, not fatal — the orphan-reap job is the backstop.

Important notes:
- EXIF/GPS stripping and `thumbnail_url`/`width`/`height` generation are NOT done on the API layer — they belong to the `media_processing_queue` worker (`process_uploaded_image`, ARCHITECTURE §14). Until it lands, `thumbnail_url` is null and EXIF is not stripped; this is documented as `TODO(M6)` in the service (acceptance: "EXIF stripping is implemented or clearly TODO documented").
- Proxy upload buffers the file in memory (`FileInterceptor`); presigned PUT will remove that later. Size/count limits are module constants (not env) for MVP.
- 28 new unit tests (ListingMediaService gates/validation/upload/delete/reorder + `extractKey`); full apps/api suite green (14 suites, 123 tests). `tsc -p tsconfig.build.json --noEmit` clean; ESLint clean.

Commit messages:
- feat(media): add listing media endpoints
- feat(media): validate image uploads
- test(media): cover media service and extractKey
- docs(adr): record listing media endpoints decision (ADR-0023)

Related ADR:
- docs/adr/ADR-0023-listing-media-endpoints.md

### TASK-060 — Add S3 upload service

Status: DONE
Branch: feat/s3-upload-service
PR: https://github.com/FounderDAO/avino/pull/46

Files changed:
- apps/api/src/uploads/uploads.service.ts
- apps/api/src/uploads/uploads.service.spec.ts
- apps/api/src/uploads/uploads.module.ts
- apps/api/src/uploads/index.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/app.module.ts
- apps/api/package.json
- apps/api/.eslintrc.cjs
- .env.example
- docs/adr/ADR-0022-s3-upload-service.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Открыт milestone M6 (media): добавлен сервисный слой загрузки файлов в
  S3-compatible storage (`UploadsModule`/`UploadsService`) на AWS SDK v3
  (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`). SDK совместим с
  нативным AWS S3, MinIO и DigitalOcean Spaces — провайдер выбирается env-конфигом
  без правок кода (ARCHITECTURE §14, CLAUDE.md §3/§13). Сервис экспортируется для
  ListingMediaModule (TASK-061).
- Контракт узкий и client-agnostic: `upload({ buffer, contentType, key?, prefix?,
  extension? }) → { key, url }`, `getObjectUrl(key)`, `delete(key)` (для reap
  orphaned media), `extensionFromFilename()`. Валидация MIME/размера — на слое
  вызова (TASK-061), сервис её не дублирует.
- Public vs signed URL по конфигу (acceptance): задан `S3_PUBLIC_BASE_URL` (CDN/
  публичный bucket) → объекты с `public-read` ACL, прямой публичный URL; пуст →
  приватный bucket, presigned GET URL (`S3_SIGNED_URL_TTL`, дефолт 3600 c).
- Никакого локального хранилища (acceptance): при отсутствии кредов/бакета сервис
  бросает понятную ошибку (`S3 storage is not configured: …`), а не пишет на FS;
  клиент инициализируется лениво, чтобы приложение поднималось без S3-кредов
  (опциональная интеграция, TASK-022).
- Новые env-переменные (опциональны): `S3_FORCE_PATH_STYLE` (дефолт `true`;
  валидируется как строка — class-transformer привёл бы `"false"` к `true`),
  `S3_PUBLIC_BASE_URL`, `S3_SIGNED_URL_TTL`; `S3_REGION` получил дефолт
  `us-east-1`. Обновлены `configuration.ts`, `env.validation.ts`, `.env.example`.
- Вне scope (см. ADR-0022): HTTP media-эндпоинты (TASK-061), EXIF-стриппинг и
  thumbnail (media_processing_queue), presigned PUT (direct-to-S3), запись
  `listing_media` в БД (TASK-061).
- Проверено: `nest build` чистый; `tsc --noEmit` без ошибок; 102/102 unit-теста
  зелёные (7 новых для UploadsService: presigned vs public URL, public-read ACL,
  генерация ключа, delete, fail-fast при отсутствии кредов/бакета, extension).
- Попутно починен `npm run lint`: у API не было конфига ESLint (общая проблема
  репозитория, не регрессия задачи). Добавлен `apps/api/.eslintrc.cjs`
  (NestJS-стандарт: `@typescript-eslint` parser + recommended) и объявлены
  dev-зависимости eslint/parser/plugin в `package.json`. Lint проходит чисто по
  всему `src`.

Commit messages:
- feat(uploads): add S3 upload service
- chore(api): add ESLint config and fix lint

Related ADR:
- docs/adr/ADR-0022-s3-upload-service.md

### TASK-053 — Add listing moderation workflow

Status: DONE
Branch: feat/listing-moderation
PR: #45

Files changed:
- apps/api/prisma/schema.prisma
- apps/api/prisma/migrations/20260604120000_add_moderation_logs/migration.sql
- apps/api/src/moderation/moderation.service.ts
- apps/api/src/moderation/moderation.service.spec.ts
- apps/api/src/moderation/moderation.module.ts
- apps/api/src/moderation/dto/list-admin-listings.dto.ts
- apps/api/src/moderation/dto/moderate-listing.dto.ts
- apps/api/src/moderation/index.ts
- apps/api/src/admin/admin-listings.controller.ts
- apps/api/src/admin/admin.module.ts
- apps/api/src/admin/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0021-listing-moderation-workflow.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Implemented the listing moderation workflow (API.md §16, CLAUDE.md §9): admin
  queue `GET /api/v1/admin/listings`, moderation action
  `PATCH /api/v1/admin/listings/:id/status`, and history
  `GET /api/v1/admin/listings/:id/moderation-logs`. All routes are MODERATOR /
  ADMIN only (`JwtAuthGuard + RolesGuard` on the controller class).
- Materialized the planned `moderation_logs` table + `ModerationAction` enum
  (DB_SCHEMA §7) via migration `20260604120000_add_moderation_logs`:
  `listing_id` ON DELETE CASCADE, `moderator_id` ON DELETE SET NULL nullable
  (null = system), `old_status`/`new_status`/`reason`. Materialization of an
  already-accepted contract, not a new architectural decision.
- Action → status mapping in the service: `APPROVE → ACTIVE`,
  `SEND_TO_DRAFT → DRAFT`, `REJECT → REJECTED`, `DELETE → DELETED`. Missing or
  already-`DELETED` listing → `404`; source outside `{NEW, ACTIVE, DRAFT,
  REJECTED}` or a no-op same-status transition → `422
  INVALID_STATUS_TRANSITION`. `published_at` is set only on first publish
  (`APPROVE → ACTIVE`) and not reset on re-approval.
- Each status change is one interactive `$transaction`: update status +
  `moderation_logs` (domain log) + `audit_logs(LISTING_STATUS_CHANGE)` (ADR-0004)
  + an owner notification row (`LISTING_MODERATION_STATUS_CHANGED`, channel
  EMAIL, status PENDING). PENDING = enqueued for the BullMQ worker (transport not
  wired yet, see EmailService) — this is the "notification job queued".
- Admin list supports `status` / `property_type` / `transaction_type` / `q`
  (case-insensitive title search) filters with page-based pagination
  (`PaginatedResponse`, ADR-0020); unlike owner/public paths it shows ALL
  statuses including DELETED (moderators need full visibility). New `ModerationModule`
  (logic) + `AdminModule` (HTTP) — the admin module is the home for future admin
  routes (complaints, audit-logs, admin/users).
- Deliberately out of scope: `translate_listing` enqueue on APPROVE (ADR-005,
  with the BullMQ worker), real notification delivery, complaints, admin
  audit-logs/users routes. Verified: 95/95 jest tests pass (11 new), `tsc`
  strict build clean, `prisma generate` clean.

Commit messages:
- feat(moderation): add moderation logs schema and migration
- feat(moderation): add listing moderation endpoints
- test(moderation): cover moderation transitions, logging and notifications
- docs(adr): record listing moderation workflow decision (ADR-0021)

Related ADR:
- docs/adr/ADR-0021-listing-moderation-workflow.md

---

### TASK-052 — Add owner listings endpoint

Status: DONE
Branch: feat/my-listings
PR: pending

Files changed:
- apps/api/src/listings/dto/list-my-listings.dto.ts
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/listings.service.spec.ts
- apps/api/src/listings/index.ts
- docs/adr/ADR-0020-owner-listings-endpoint-pagination.md

Summary:
- Added `GET /api/v1/listings/mine` — paginated list of the current user's own
  listings (Bearer auth, only own `owner_id`). Route declared before `:id` so the
  static path is not captured by the param route.
- Route follows `docs/API.md` §7 (`/listings/mine`), not the task-card wording
  `/me/listings` — API.md is authoritative on route divergence.
- Returns any status except `DELETED`: soft-deleted listings stay excluded from all
  read-path (API.md §7), so an explicit `status=DELETED` filter is coerced to
  `{ not: DELETED }` and never leaks deleted rows.
- First collection endpoint — fixes the page-based envelope contract: `page`
  (default 1) + `limit` (default 20, max 100, capped) + required `meta.total`
  (API.md §4); `PaginatedResponse<T> = { data, meta:{ page, limit, total } }`.
  Keyset stays reserved for public search/listings (ADR-007).
- Compact `ListingListItem` (lighter than the detail card): core scalars,
  promotion fields, `title` on `original_language` (fallback to first translation),
  `thumbnail_url` cover (first media by `sort_order`). Decimal/dates as strings.
- Sort `created_at DESC, id DESC` (deterministic tail). `findMany` + `count` run in
  parallel. Deliberately out of scope: keyset pagination, per-list language
  negotiation, `DELETE`/`/translations`/moderation (TASK-053+).

Commit messages:
- feat(listings): add owner listings endpoint
- test(listings): cover owner listings pagination and filtering
- docs(adr): record owner listings endpoint decision (ADR-0020)

Related ADR:
- docs/adr/ADR-0020-owner-listings-endpoint-pagination.md

---

### TASK-051 — Add public listing detail

Status: DONE
Branch: feat/listing-detail
PR: pending

Files changed:
- apps/api/src/common/guards/optional-jwt-auth.guard.ts
- apps/api/src/common/guards/optional-jwt-auth.guard.spec.ts
- apps/api/src/common/guards/jwt-auth.guard.ts
- apps/api/src/common/guards/index.ts
- apps/api/src/roles/roles.module.ts
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/listings.service.spec.ts
- docs/adr/ADR-0019-public-listing-detail-endpoint.md

Summary:
- Added public `GET /api/v1/listings/:id` — full listing card with the resolved
  translation (flattened) and ordered media.
- Visibility: `ACTIVE` is public; non-public statuses are visible only to the owner
  and MODERATOR/ADMIN; `DELETED` is `404` for everyone. Hidden listings return
  `404` (not `403`) so their existence is not leaked.
- New `OptionalJwtAuthGuard` (soft Bearer auth): a request without a token passes as
  guest; a request with a token is validated strictly (bad token → `401`). Controller
  guards moved from class to method level so create/update keep `JwtAuthGuard`.
- Translation chosen by `?lang` / `Accept-Language` with fallback to
  `original_language` (ADR-012). Decimal/dates serialized as strings.
- Deliberately out of scope: structured `features[]` (no amenities model yet),
  AGENCY/agency-admin visibility (no membership model), `/translations`, `/mine`,
  `DELETE` (TASK-052+).

Commit messages:
- feat(auth): add optional JWT auth guard for public endpoints
- feat(listings): add public listing detail endpoint
- test(listings): cover listing detail visibility and translation fallback
- docs(adr): record public listing detail decision (ADR-0019)

Related ADR:
- docs/adr/ADR-0019-public-listing-detail-endpoint.md

---

### TASK-050 — Add ListingsModule create/update

Status: DONE
Branch: feat/listings-crud
PR: #40

Files changed:
- apps/api/src/listings/listings.module.ts
- apps/api/src/listings/listings.controller.ts
- apps/api/src/listings/listings.service.ts
- apps/api/src/listings/dto/create-listing.dto.ts
- apps/api/src/listings/dto/update-listing.dto.ts
- apps/api/src/listings/listings.service.spec.ts
- apps/api/src/listings/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0018-listing-create-update-endpoints.md

Summary:
- Opened milestone M5 with the first listings feature module: `POST /api/v1/listings`
  (create, status `NEW`) and `PATCH /api/v1/listings/:id` (update own listing).
- Create persists the author translation on `original_language` in one nested write
  (`source=USER`, `is_auto_translated=false`); update gates by owner — другой `ownerId`
  → `403 FORBIDDEN`, отсутствующий/`DELETED` → `404 NOT_FOUND`.
- DTO validation (snake_case contract, Decimal-as-string, SmallInt ranges,
  lat/long, `forbidNonWhitelisted`). `price` returned via `Decimal.toFixed(2)`.
- Deliberately out of scope (follow-up M5 tasks): PostGIS `location` sync,
  `feature_ids`, machine-translation regeneration, moderation status transitions,
  and `GET`/`DELETE` endpoints (TASK-051/052/053).

Commit messages:
- feat(listings): add listing create endpoint
- feat(listings): add listing update endpoint
- test(listings): cover create and update service
- docs(adr): record listing create/update decision (ADR-0018)

Related ADR:
- docs/adr/ADR-0018-listing-create-update-endpoints.md

---

### TASK-040 — Add UsersModule

Status: DONE
Branch: feat/users-module
PR: pending

Files changed:
- apps/api/src/users/users.module.ts
- apps/api/src/users/users.controller.ts
- apps/api/src/users/users.service.ts
- apps/api/src/users/users.service.spec.ts
- apps/api/src/users/dto/update-user.dto.ts
- apps/api/src/profiles/profiles.service.ts
- apps/api/src/profiles/profiles.service.spec.ts
- apps/api/src/profiles/dto/update-profile.dto.ts
- apps/api/src/profiles/index.ts
- apps/api/src/app.module.ts
- docs/adr/ADR-0017-users-profile-endpoints.md

Summary:
- Implemented self-service account endpoints (API.md §5), the first protected feature module on top of the auth/RBAC layer (TASK-041–044): `GET /api/v1/users/me`, `PATCH /api/v1/users/me`, `PATCH /api/v1/users/me/profile`. All under `@UseGuards(JwtAuthGuard)`; user is always scoped to its own record via `@CurrentUser('id')` (no `:id` in paths).
- `getMe` reads fresh roles + profile from DB and returns the same snake_case contract as the verify `user` block, with nested `profile` (or `null`).
- `PATCH /users/me` supports `email` and `default_language`; an email change resets `is_email_verified=false` and enforces contact uniqueness among non-DELETED accounts (`409 CONTACT_TAKEN`, ADR-013).
- `PATCH /users/me/profile` upserts the profile, so it is created on first update ("created if missing").
- Phone change and `DELETE /users/me` were intentionally left out of scope (no contact verify-flow yet; one PR = one task) — documented in ADR-0017.
- Verified: `pnpm test` green (60 tests, 12 new); `pnpm build` (nest/tsc) passes; eslint clean on new files.

Commit messages:
- feat(users): add user profile endpoints
- test(users): cover users and profiles services
- docs(adr): record users & profile endpoints decision (ADR-0017)

Related ADR:
- docs/adr/ADR-0017-users-profile-endpoints.md

### TASK-044 — Add RBAC guards

Status: DONE
Branch: feat/rbac-guards
PR: #38

Files changed:
- apps/api/src/common/guards/jwt-auth.guard.ts
- apps/api/src/common/guards/roles.guard.ts
- apps/api/src/common/guards/index.ts
- apps/api/src/common/guards/jwt-auth.guard.spec.ts
- apps/api/src/common/guards/roles.guard.spec.ts
- apps/api/src/common/decorators/roles.decorator.ts
- apps/api/src/common/decorators/current-user.decorator.ts
- apps/api/src/common/decorators/index.ts
- apps/api/src/common/decorators/decorators.spec.ts
- apps/api/src/roles/roles.module.ts
- apps/api/src/roles/index.ts
- apps/api/src/auth/auth.module.ts
- apps/api/src/auth/auth.controller.ts
- docs/adr/ADR-0016-rbac-guards.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Реализован слой авторизации (RBAC) поверх auth-flow (TASK-041–043). `JwtAuthGuard` извлекает `Authorization: Bearer <token>` (схема case-insensitive), проверяет подпись `JWT_ACCESS_SECRET` (per-call секрет, как при выпуске — ADR-0010) и кладёт `{ id, roles }` в `request.user`. Маппинг ошибок на стабильные коды (API.md §17): нет/не-Bearer → `401 UNAUTHORIZED`, `TokenExpiredError` → `401 TOKEN_EXPIRED`, иначе → `401 TOKEN_INVALID`, всё в едином error-envelope (ADR-0007).
- `RolesGuard` читает требуемые роли из `@Roles(...)` через `Reflector.getAllAndOverride` (хендлер переопределяет класс). Без метаданных → нужна только аутентификация; OR-семантика (достаточно одной из ролей), иначе `403 FORBIDDEN`; нет `request.user` → `401 UNAUTHORIZED`. Запускается после `JwtAuthGuard` в `@UseGuards(JwtAuthGuard, RolesGuard)`.
- `@Roles(...roles: UserRole[])` — декларативные метаданные (`SetMetadata`/`ROLES_KEY`); `@CurrentUser(field?)` — param-декоратор, отдаёт весь `AuthenticatedUser` или поле (фабрика `currentUserFactory` вынесена для юнит-тестов). Тип `AuthenticatedUser` принадлежит `JwtAuthGuard` (producer `request.user`) — единый контракт. Коды ролей из общего `UserRole` (@avino/shared); `GUEST` не используется (неявное состояние неаутентифицированного запроса, ADR-0008).
- `RolesModule` (`apps/api/src/roles/`) бандлит `JwtModule.register({})` (без глобального секрета) и оба guard'а, экспортирует их + `JwtModule` — feature-модули включают RBAC одним импортом, не регистрируя `JwtModule` у себя (`ConfigService` глобален, ADR-0006). Авторизация stateless: роли берутся из подписанного access-токена, без БД-запросов на запрос; новых зависимостей не добавлено (`@nestjs/jwt` уже в стеке).
- `logout` помечен `@UseGuards(JwtAuthGuard)` (API.md §3: Auth Bearer) — закрыт явный TODO в контроллере; вызвать может только аутентифицированный пользователь, session family по-прежнему адресует refresh-токен в теле.
- Дизайн-решение зафиксировано в ADR-0016. Trade-off: роли в access-токене «застывают» на его TTL (≤15 мин) — отзыв роли вступает в силу после следующей ротации, приемлемо для MVP при коротком access-TTL.
- Проверено: `nest build` чистый; 48/48 unit-тестов зелёные (новые spec: `jwt-auth.guard` — успешная привязка user, дефолт ролей `[]`, case-insensitive scheme, маппинг UNAUTHORIZED/TOKEN_EXPIRED/TOKEN_INVALID; `roles.guard` — пропуск без `@Roles`, OR-семантика, 403, 401-без-user; `decorators` — метаданные `@Roles`, admin-only чтение, фабрика `@CurrentUser`). Acceptance criteria TASK-044 выполнены: auth guard, roles guard, `@CurrentUser`, `@Roles`, защита admin-only эндпоинта.

Commit messages:
- feat(auth): add RBAC guards and decorators

Related ADR:
- docs/adr/ADR-0016-rbac-guards.md

### TASK-043 — Add refresh and logout flow

Status: DONE
Branch: feat/auth-refresh-logout
PR: #37

Files changed:
- apps/api/src/auth/token.service.ts
- apps/api/src/auth/auth.service.ts
- apps/api/src/auth/auth.controller.ts
- apps/api/src/auth/dto/refresh-token.dto.ts
- apps/api/src/auth/token.service.spec.ts
- docs/adr/ADR-0015-refresh-rotation-and-logout.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Implemented the third and fourth steps of the OTP auth-flow (`request → verify → refresh → logout`, API.md §3): `POST /api/v1/auth/refresh` (rotation) and `POST /api/v1/auth/logout` (204). Both take `{ refresh_token }` in the body via the shared `RefreshTokenDto` (`@IsJWT`).
- `refresh` (`TokenService.rotateSession`): verify refresh-JWT signature (`JWT_REFRESH_SECRET`) — `TokenExpiredError` → `TOKEN_EXPIRED`, else `TOKEN_INVALID`; locate the `refresh_tokens` row by `jti` and assert `token_hash`/`user_id`/`family_id` match (desync → `TOKEN_INVALID`); rotate inside one transaction (current row `revoked_at`, new row in the SAME family with a fresh `jti`). The new access token carries roles re-read fresh from the DB; a non-ACTIVE user → family revoked + `TOKEN_INVALID` (a blocked account cannot renew its session).
- **Reuse detection** (DB_SCHEMA §4): presenting an already-rotated (revoked) token revokes the WHOLE session family via `revokeFamily` (`updateMany where family_id, revoked_at=null`) and returns `TOKEN_REUSED`. Stealing one refresh token therefore cannot grant long-lived access.
- `logout` (`TokenService.revokeSession`): idempotent, signature-free — the row is found by the deterministic `token_hash`; found → revoke the whole family + write `audit_logs` (`action='LOGOUT'`); not found → no-op. Always `204 No Content` (does not leak session existence). Body-addressed until the Bearer guard lands (TASK-044).
- Error codes `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_REUSED` are all 401 (API.md §3).

Important notes:
- No schema or migration changes: the `refresh_tokens` model (`revoked_at`, `family_id`) and `JWT_*` env were introduced in TASK-042; reuse detection is pure service logic over the existing `(token_hash)`/`(family_id)` indexes.
- 31 unit tests pass (`pnpm jest src/auth`; 9 new in `token.service.spec.ts`: rotation, reuse→family revoke, expired/invalid signature, missing/mismatched row, non-active user, idempotent logout). `nest build` green; Prettier-formatted. apps/api ESLint config still absent (pre-existing scaffold gap from TASK-010).
- Concurrent double-refresh of one token can briefly leave two active rows in a family (read-before-revoke window); acceptable for MVP (ADR-0015).

Commit messages:
- feat(auth): add refresh token rotation and logout
- docs(adr): record refresh rotation and logout decision (TASK-043)

Related ADR:
- docs/adr/ADR-0015-refresh-rotation-and-logout.md

### TASK-042 — Add AuthModule OTP verify and tokens

Status: DONE
Branch: feat/auth-verify-otp
PR: #36

Files changed:
- apps/api/src/auth/auth.controller.ts
- apps/api/src/auth/auth.service.ts
- apps/api/src/auth/auth.service.spec.ts
- apps/api/src/auth/token.service.ts
- apps/api/src/auth/token.util.ts
- apps/api/src/auth/token.util.spec.ts
- apps/api/src/auth/dto/verify-otp.dto.ts
- apps/api/src/auth/auth.module.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/package.json
- pnpm-lock.yaml
- .env.example
- docs/adr/ADR-0014-otp-verify-and-session-tokens.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Implemented the second step of the OTP auth-flow: `POST /api/v1/auth/otp/verify` (public). Route follows the `API.md` §3 contract (`auth/otp/verify`), not the `verify-otp` wording in the task card — `API.md` is authoritative (CLAUDE.md §2). Accepts `{ channel, destination, code }`, returns `{ access_token, refresh_token, token_type: "Bearer", expires_in, user }`.
- Verify checks run in order: latest unconsumed code for the destination (else `OTP_INVALID`); expired → consumed + `OTP_EXPIRED`; `attempts >= OTP_MAX_ATTEMPTS` → `OTP_ATTEMPTS_EXCEEDED` (429); wrong code → increment `attempts` and `OTP_INVALID` (or `OTP_ATTEMPTS_EXCEEDED` when the attempt hits the limit); success → the code is consumed (single-use).
- Signup-as-login: when no non-DELETED account owns the contact, a `users` row + base `USER` role are created in one transaction and the used channel is marked verified; an existing `BLOCKED` account → `USER_BLOCKED` (403); otherwise the verified flag and `last_login_at` are updated.
- Tokens via `@nestjs/jwt` (HS256): access and refresh are signed with DIFFERENT secrets (`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`, both mandatory, no defaults). access carries `sub`+`roles`; refresh carries `sub`+`fid`+`jti` (jti = `refresh_tokens` row id, the hook TASK-043 uses for rotation/reuse-detection). Only a deterministic `HMAC-SHA256(token, JWT_REFRESH_SECRET)` hash is stored — the token value is never persisted.
- Successful logins are written to `audit_logs` (`action='LOGIN'`, `entity_type='user'`, `metadata.channel`); ip/user-agent are saved on the refresh row and the audit row.
- Added the `jwt` config namespace + `JWT_*` env vars (ENV.md §7, validated fail-fast) to `.env.example` and env validation. `TokenService` is exported for TASK-043.

Important notes:
- refresh rotation / logout (reuse-detection by `family_id`) is deliberately out of scope — TASK-043.
- 22 unit tests pass (`token.util` determinism/pepper; full `AuthService.verifyOtp` decision matrix incl. signup, blocked, lockout). `nest build` is green. apps/api ESLint config is still absent (pre-existing scaffold gap from TASK-010); Prettier-formatted.

Commit messages:
- feat(auth): add OTP verification and issue access/refresh tokens
- docs(adr): record OTP verify and session token decision (TASK-042)

Related ADR:
- docs/adr/ADR-0014-otp-verify-and-session-tokens.md

### TASK-041 — Add AuthModule OTP request

Status: DONE
Branch: feat/auth-request-otp
PR: #35

Files changed:
- apps/api/src/auth/auth.controller.ts
- apps/api/src/auth/auth.module.ts
- apps/api/src/auth/otp.service.ts
- apps/api/src/auth/otp-rate-limit.service.ts
- apps/api/src/auth/otp-hash.util.ts
- apps/api/src/auth/contact.util.ts
- apps/api/src/auth/dto/request-otp.dto.ts
- apps/api/src/auth/otp.util.spec.ts
- apps/api/src/sms/sms.service.ts
- apps/api/src/sms/sms.module.ts
- apps/api/src/sms/index.ts
- apps/api/src/email/email.service.ts
- apps/api/src/email/email.module.ts
- apps/api/src/email/index.ts
- apps/api/src/redis/redis.service.ts
- apps/api/src/redis/redis.module.ts
- apps/api/src/redis/index.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/app.module.ts
- apps/api/tsconfig.json
- apps/api/jest.config.js
- .env.example
- .env
- docs/adr/ADR-0012-otp-request-and-rate-limiting.md
- docs/TASKS.md
- docs/DONE.md

Summary:
- Implemented the first step of the OTP auth-flow (`request → verify → refresh → logout`): `POST /api/v1/auth/otp/request` (public/GUEST). Route follows the `API.md` §3 contract (`auth/otp/request`), not the `request-otp` wording in the task card — `API.md` is authoritative (CLAUDE.md §2). Accepts `{ channel: SMS|EMAIL, destination }`, returns `{ request_id, channel, expires_in, resend_after }`; the code itself is never returned.
- OTP codes are stored as a slow `scrypt` hash (`node:crypto`) with a unique per-code salt (`code_hash` = `salt:key`), never plaintext, with constant-time verification — protects the low-entropy 6-digit code (~10^6 combos) against brute-force on a DB leak. Prior unconsumed codes for a destination are invalidated on a new request (only the latest is valid). `user_id` is bound to a non-DELETED account when one exists, else null (pre-signup login, DB_SCHEMA §4).
- Delivery via `SmsService` (Eskiz.uz REST over global `fetch`, in-memory Bearer token with 401-refresh) and `EmailService` (SMTP transport deferred to `email_queue`); when a provider is not configured, the code is logged in dev only (never in production — ARCHITECTURE §23). Both abstractions keep `sendOtp` signatures stable for the future real transport.
- Rate limiting on a new global `RedisModule` (per the "destination + IP" requirement, DB_SCHEMA §15 / API.md §3): per-destination cooldown (`OTP_RESEND_COOLDOWN`) plus a per-IP fixed window (`RATE_LIMIT_WINDOW` / `RATE_LIMIT_MAX`); either breach → `429 RATE_LIMITED` in the unified error-envelope (ADR-0007). State lives in Redis so it survives an API restart.
- Added `otp` / `rateLimit` config namespaces (ENV.md §8) with safe defaults and env validation: `OTP_TTL`, `OTP_MAX_ATTEMPTS`, `OTP_RESEND_COOLDOWN`, `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX`, `ESKIZ_FROM`.
- Verified end-to-end against the project's Postgres + Redis containers: `nest build` clean; 9/9 unit tests green (scrypt hash roundtrip / wrong-code / unique-salt / malformed-hash, plus phone/email normalization). Live smoke: valid SMS and EMAIL requests → 200; invalid phone / bad enum / extra field → 400 `VALIDATION_ERROR` with per-field details; immediate resend → 429 `RATE_LIMITED`; dev delivery logged the codes; `otp_codes` rows stored 97-char scrypt hashes (no plaintext), `attempts=0`, not expired, email normalized to lowercase.

Commit messages:
- feat(auth): add OTP hashing and rate limit
- feat(auth): add OTP request endpoint

Related ADR:
- docs/adr/ADR-0012-otp-request-and-rate-limiting.md
