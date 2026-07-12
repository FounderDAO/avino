# Agent Registration PR2 (client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Клиентская часть флоу «Стать агентом»: заметная модалка лимита с CTA, страница заявки `/become-agent`, реальный блок «Агенты» на главной, публичная страница агента `/agents/[id]`, бейдж «Риелтор» на detail, рендер нового уведомления.

**Architecture:** Тонкие RTK-слайсы поверх готового API PR1 (#383) + SSR-хелперы `lib/api/agents.ts` для server components (главная, страница агента). Модалка — createPortal (гоча `.fade-up` ломает fixed). Бейдж — по уже существующему `contact.type` detail-ответа. Число лимита — из `GET /settings/public → activeListingLimit`.

**Tech Stack:** Next.js 15 App Router + RTK Query + next-intl (ru/uz/en) + Vitest/RTL.

**Спека:** `docs/superpowers/specs/2026-07-12-agent-registration-design.md` (раздел 3). **Контракт:** docs/API.md §21 (проверен live в PR1).

## Global Constraints

- Рабочая папка — ТОЛЬКО `apps/client` (+ этот план в docs/superpowers/plans). Ветка `feat/agent-client` от свежего main.
- Все bash через `rtk`; сборка — `pnpm --filter @avino/client exec next build` (гоча: `rtk next build` врёт «Errors: 1»).
- Субагенты НЕ трогают git и НЕ запускают вложенных фоновых агентов; контроллер коммитит; перед каждым коммитом `rtk git status` (cron может переключить ветку).
- RTK Query для всех запросов клиентской части (CLAUDE.md §4); server components — через `lib/api/*` хелперы (паттерн `lib/api/geo.ts`), никаких fetch в компонентах.
- i18n: НИКАКИХ hardcoded строк; ключи в `apps/client/messages/{ru,uz,en}.json` добавляются в той же задаче, что и UI. Один писатель JSON за раз (задачи последовательны). Гоча: mocked next-intl в тестах скрывает missing keys — проверять наличие ключей грепом.
- Wire snake_case → camelCase маппится вручную в слайсах, как в соседних (`transformResponse`).
- Тесты Vitest: `pnpm --filter @avino/client test -- <файл>`; полный прогон в финальной задаче.
- Каждая задача: TDD где есть логика; тестовые файлы рядом с компонентом (паттерн `*.test.tsx`).

## Контракт API (из PR1, для справки во всех задачах)

- `POST /users/me/agent-application` body `{ agency_name?, about }` → 201 `{ id, status, agency_name, about, reject_reason, created_at, resolved_at }`; 409 `AGENT_APPLICATION_PENDING` | `ALREADY_AGENT`; 422 `PROFILE_INCOMPLETE` нет (профиль не обязателен для заявки).
- `GET /users/me/agent-application` → 200 последняя заявка | 404.
- `GET /agents?page&limit` → `{ data: [{ id, name, avatar_url, agency_name, about, active_listings_count }], meta }` (сорт по счётчику desc).
- `GET /agents/:id` → карточка агента | 404.
- `GET /search?agent_id=<uuid>` — объявления агента (все обычные параметры работают).
- `GET /settings/public` → `{ ..., activeListingLimit: number }` (camelCase, transformResponse не нужен).
- Уведомление: `type: AGENT_APPLICATION_RESOLVED`, `data_json: { application_id, status: 'APPROVED'|'REJECTED', reject_reason }`.

---

### Task 0: Ветка + план

- [ ] `rtk git status` (чистота), `git checkout main && git pull --ff-only`, `git checkout -b feat/agent-client`.
- [ ] `git add docs/superpowers/plans/2026-07-12-agent-registration-pr2-client.md && git commit -m "docs: plan for agent registration client (PR2)"` (+Co-Authored-By футер).

---

### Task 1: API-слой — RTK-слайсы, SSR-хелперы, activeListingLimit

**Files:**
- Create: `apps/client/src/store/api/agentApplicationsApi.ts`
- Create: `apps/client/src/store/api/agentsApi.ts` (если понадобится клиентский фетч; иначе не создавать — YAGNI, см. ниже)
- Create: `apps/client/src/lib/api/agents.ts` + `apps/client/src/lib/api/agents.test.ts`
- Modify: `apps/client/src/store/api/publicSettingsApi.ts` (интерфейс `PublicSettings` + `activeListingLimit: number`)
- Modify: `apps/client/src/store/apiErrorToastMiddleware.ts` (`SUPPRESSED_ENDPOINTS` += `submitAgentApplication`, `getMyAgentApplication` — ошибки рендерятся инлайн, 404 у новичка не должен давать тост)

**Interfaces (Produces):**
- `agentApplicationsApi`: `useGetMyAgentApplicationQuery()` → `AgentApplication | null` (404 → null через `transformErrorResponse`/`queryFn` — сверь, как 404 обрабатывают соседние слайсы; если паттерна нет — вернуть ошибку и обработать в컴поненте), `useSubmitAgentApplicationMutation({ agencyName?, about })`. Тип `AgentApplication = { id, status: 'PENDING'|'APPROVED'|'REJECTED', agencyName: string|null, about: string, rejectReason: string|null, createdAt, resolvedAt }`. `providesTags/invalidatesTags: ['AgentApplication']` (тег добавить в baseApi при необходимости).
- `lib/api/agents.ts` (SSR, зеркало lib/api/geo.ts): `getAgents(limit: number): Promise<Agent[]>` (GET /agents?limit=), `getAgentById(id: string): Promise<Agent | null>` (404 → null). `Agent = { id, name: string|null, avatarUrl: string|null, agencyName: string|null, about: string|null, activeListingsCount: number }`.
- Клиентский `agentsApi` НЕ создавать, пока страница агента SSR-only (Task 5 использует lib/api) — создать только если Task 5 понадобится клиентская пагинация.

**Steps:** тесты маппинга snake→camel для lib/api/agents (RED) → реализация (GREEN) → `pnpm --filter @avino/client test -- agents` → коммит `feat(client): agents & agent-application api layer`.

---

### Task 2: Модалка лимита в визарде

**Files:**
- Create: `apps/client/src/features/listing-new/LimitReachedModal.tsx` + `LimitReachedModal.test.tsx`
- Modify: `apps/client/src/features/listing-new/ListingNew.tsx` (рендер модалки при `apiError?.code === 'ACTIVE_LISTING_LIMIT_REACHED'`)
- Modify: `apps/client/messages/{ru,uz,en}.json` (namespace `listingNew.limitModal.*`)

**Поведение:**
- При 422 `ACTIVE_LISTING_LIMIT_REACHED` из `createListing` открывается модалка (state `limitModalOpen`, эффект по смене apiError). Инлайн-текст ошибки (существующий) остаётся как fallback после закрытия.
- Контент: заголовок «Достигнут лимит объявлений»; текст: «Частные лица могут размещать до {N} активных объявлений. Зарегистрируйтесь как агент — размещайте без ограничений, ваши объявления получат отметку риелтора, а профиль попадёт в список агентов Avino.» N — `useGetPublicSettingsQuery()` → `activeListingLimit`; пока грузится/ошибка — текст без числа (отдельный ключ `bodyNoLimit`).
- Кнопки: primary «Стать агентом» → `router.push('/become-agent')`; secondary «Понятно» → закрыть.
- Рендер через `createPortal(document.body)` — гоча: `.fade-up` на странице создаёт containing block и ломает `fixed inset-0`. Зеркалить существующую портальную модалку (`components/ui/lightbox.tsx` или модалка логина в ListingNew — найти и переиспользовать обёртку, НЕ изобретать новую, если есть готовая).
- Тесты: (1) модалка открывается при коде ошибки; (2) не открывается при другом коде; (3) CTA ведёт на /become-agent (mock router); (4) N подставляется из мока publicSettings.

**Steps:** RED → GREEN → коммит `feat(client): active listing limit modal with become-agent CTA`.

---

### Task 3: Страница /become-agent

**Files:**
- Create: `apps/client/src/app/[locale]/become-agent/page.tsx` (тонкая обёртка: metadata + рендер фичи)
- Create: `apps/client/src/features/become-agent/BecomeAgent.tsx` + `BecomeAgent.test.tsx`
- Modify: `apps/client/messages/{ru,uz,en}.json` (namespace `becomeAgent.*`)

**Поведение (все состояния — по `useGetMyAgentApplicationQuery` + `selectCurrentUser`):**
1. Гость → модалка/приглашение входа (зеркало гейта в ListingNew: `selectIsAuthenticated`, эффект после монтирования).
2. Уже агент (`currentUser.roles` содержит AGENT|AGENCY) → карточка «Вы уже агент» + ссылки на /sell/new и свой профиль `/agents/{id}`.
3. Заявка PENDING → карточка «Заявка на рассмотрении» (дата подачи).
4. Заявка REJECTED → причина отказа (`rejectReason`) + форма повторной подачи (префилл прошлых значений).
5. Нет заявки → форма: «Агентство» (опционально, максимум 255) + «О себе» (textarea, обязательное, максимум 2000) + сабмит `useSubmitAgentApplicationMutation`; успех → инвалидация тега → состояние PENDING; ошибки инлайн через `getApiError` (409-коды → человекочитаемые тексты).
- Страница `force-dynamic` не нужна (клиентская фича), но гоча визарда регионов держать в уме, если появится SSR-фетч.
- Тесты: по кейсу на каждое из 5 состояний + успешный сабмит + 409.

**Steps:** RED → GREEN → коммит `feat(client): become-agent application page`.

---

### Task 4: Главная — блок «Агенты» на реальном API

**Files:**
- Modify: `apps/client/src/features/home/Agents.tsx` (пропсы `agents: Agent[]` вместо `getAgents()` из мока; карточка оборачивается в `Link href={'/agents/' + a.id}`; аватар: `avatarUrl` есть → `<img>`/PhotoImg, нет → инициал как сейчас; `agency_name` null → подпись «Частный маклер» (i18n) или скрыть строку — решение: скрыть)
- Modify: `apps/client/src/app/[locale]/page.tsx` (в `Promise.all` добавить `getAgents(6)`; `<Agents agents={agents} />`; пустой список → блок не рендерится)
- Modify: `apps/client/src/lib/mock/agents.ts` + `lib/mock/index.ts` — удалить мок, ЕСЛИ `getAgents` из мока больше нигде не используется (грепнуть; если используется в тестах — поправить тесты)
- Modify: `apps/client/messages/*.json` — при необходимости (listingsCount уже есть в `home.agents.*`)

- Тест: рендер блока с фикстурами (2 агента), ссылки ведут на /agents/:id; пустой массив → null.
- Коммит `feat(client): home agents block on real API`.

---

### Task 5: Публичная страница агента /agents/[id]

**Files:**
- Create: `apps/client/src/app/[locale]/agents/[id]/page.tsx`
- Create: `apps/client/src/features/agent/AgentProfile.tsx` + `AgentProfile.test.tsx`
- Modify: `apps/client/src/lib/api/listings.ts` — `searchListings`/подобный хелпер принимает `agentId` → query `agent_id` (сверь фактическую сигнатуру: фильтры собираются в builder этого файла)
- Modify: `apps/client/messages/*.json` (namespace `agentProfile.*`)

**Поведение:**
- Server component: `getAgentById(id)` (null → `notFound()`), объявления — `searchListings({ agentId: id }, locale)` (первая страница, SEARCH_PAGE_SIZE как на /search; пагинацию «ещё» НЕ делать — вне объёма, отметить в код-комментарии).
- Разметка: шапка профиля (аватар/инициал, имя, «Частный маклер»|агентство, «о себе», счётчик активных объявлений) + сетка `PropertyCard` (реюз из features/search; сверь пропсы — карточка ждёт card-shape из mapListing).
- `generateMetadata`: title «{имя} — агент Avino», description из about (обрезка), alternates как на соседних страницах.
- Тест: рендер профиля + грида по фикстурам; «Частный маклер» при agency null.

**Steps:** RED → GREEN → коммит `feat(client): public agent profile page`.

---

### Task 6: Бейдж «Риелтор» на detail

**Files:**
- Modify: `apps/client/src/lib/api/listings.ts` — `ListingAgent` + поле `kind: 'owner'|'agent'|'agency'` (из `detail.contact.type`; у краткой карточки — 'owner' по умолчанию)
- Modify: `apps/client/src/features/detail/ContactCard.tsx` — бейдж рядом с именем: kind==='agent' → «Риелтор», 'agency' → «Агентство» (стиль — `components/ui/badge.tsx`); owner — без бейджа
- Modify: `apps/client/src/features/detail/ContactCard.test.tsx`, `apps/client/src/lib/api/listings.test.ts`
- Modify: `apps/client/messages/*.json` (`detail.contact.badge.agent|agency`)

- Тесты: mapListing прокидывает kind; ContactCard показывает/не показывает бейдж по kind.
- Коммит `feat(client): realtor badge on listing contact card`.

---

### Task 7: Рендер уведомления AGENT_APPLICATION_RESOLVED

**Files:**
- Modify: `apps/client/src/features/account/notificationText.ts` (+ ветка типа: APPROVED → «Заявка агента одобрена…», REJECTED → «Заявка отклонена» + причина из `reject_reason`; deep link → `/become-agent`)
- Modify: `apps/client/src/features/account/notificationText.test.ts`
- Modify: `apps/client/messages/*.json` (`notifications.agentApplication.*`)

- Коммит `feat(client): render agent application resolution notification`.

---

### Task 8: Финальные ворота + live-verify + PR

- [ ] `pnpm --filter @avino/client test` — весь набор зелёный; `pnpm --filter @avino/client lint`; `pnpm --filter @avino/client exec next build` (raw!).
- [ ] Live-verify (стек поднят, api уже с PR1): пересобрать client-образ (`docker compose build client && docker compose up -d client`) ЛИБО поднять dev поверх (гоча: старый dev :3001 портит prod-`.next` — kill по PID). Сценарий в браузере (Chrome MCP, вкладка видимая — гоча hidden-tab):
  1. Логин bypass-номером; создать объявления до лимита; на 3-м — модалка с числом лимита и CTA.
  2. CTA → /become-agent → подать заявку → состояние PENDING.
  3. Approve через API админ-токеном (curl, рецепт PR1) → рефреш /become-agent → «Вы уже агент»; уведомление в ленте.
  4. 3-е объявление публикуется; активировать одно через psql → бейдж «Риелтор» на detail, агент на главной и /agents/[id].
  5. Вернуть данные БД как было (рецепт очистки из PR1: listings/application/notifications/roles/consent/profile + BLOCKED).
  6. Скриншоты ключевых экранов приложить в PR.
- [ ] Push `feat/agent-client`, `gh pr create` (title `feat(client): agent registration flow UI`, body по шаблону с checklist + скриншоты, футер Generated with Claude Code). Мёржит пользователь.

## Self-Review (выполнен)

- Покрытие спеки §3: модалка ✔ (T2), /become-agent ✔ (T3), главная ✔ (T4), /agents/[id] ✔ (T5), бейдж ✔ (T6), i18n ✔ (в каждой задаче); + рендер уведомления (T7 — вытекает из PR1, в спеке неявно).
- Отклонение от спеки: маршрут `/agents/[id]` (не `/agent/[id]`) — согласован с публичным API; «полный каталог /agents-страница» — вне объёма (спека).
- Типы: `Agent` (T1) используется в T4/T5; `AgentApplication` (T1) — в T3; `kind` (T6) — только внутри lib/api+ContactCard.
- Точки сверки при исполнении: обработка 404 в RTK-слайсах (паттерн соседей), сигнатура builder'а фильтров в lib/api/listings.ts, готовая портальная модалка (lightbox/login), пропсы PropertyCard.
