# Дизайн: фиче-флаг «Продвижение объявлений» (admin-управляемый Boolean)

- **Дата:** 2026-06-21
- **Статус:** утверждён (готов к плану реализации)
- **ADR:** будет ADR-0100 (следующий свободный после ADR-0099)
- **Затрагивает:** `apps/api`, `apps/web`, `apps/client`

## 1. Контекст и проблема

Проект на раннем этапе, и платное продвижение объявлений (TOP/VIP) пока не запускаем.
На клиенте (`apps/client`) в кабинете «Мои объявления» у каждой карточки есть кнопка
**«Продвинуть»** — сейчас это **чистая заглушка**: нет `onClick`, нет клиентского API,
рендерится при `l.promo === 'NORMAL'`. Бэкенд-инфраструктура промо существует
(`ListingPromotion`, `PromotionPlan`, админ-активация вручную, публичный
`GET /promotions/plans`), но клиентского флоу «продвинуть своё объявление» нет.

Нужно убрать кнопку из интерфейса клиента до момента запуска и дать админу
переключатель, чтобы «когда придёт время» включить показ — без передеплоя кода.

## 2. Цель и границы

**Делаем:**
- admin-управляемый Boolean `promotions_enabled` (дефолт **OFF**).
- Публичный read-эндпоинт, через который клиент узнаёт значение флага.
- Гейт кнопки «Продвинуть» в `apps/client`: показываем только когда флаг ON.
- Тумблер в `apps/web` → `/admin/settings`.

**НЕ делаем (вне scope, отдельная будущая фича):**
- Клиентский флоу продвижения (модалка выбора тарифа, эндпоинт «продвинуть своё»,
  оплата). Когда флаг ON, кнопка показывается, но **остаётся заглушкой**.
- Не трогаем существующий promo-cron истечения (`admin-promotion-settings`) и
  админ-активацию промо.

**Форвард-нота:** когда позже появится клиентский эндпоинт продвижения, он ОБЯЗАН
проверять тот же `promotions_enabled` (defence-in-depth, как делает SMS-флоу через
`isEnabled()` → 503). Single source of truth (`AppSetting.promotions_enabled`) уже
будет на месте.

## 3. Принятые архитектурные решения

### 3.1. Как клиент узнаёт флаг → новый публичный read-эндпоинт (вариант A)

Публичного «feature-flags» эндпоинта в API нет (SMS-флаг читается только серверно,
реактивно через 503). Создаём маленький переиспользуемый публичный эндпоинт:

```
GET /api/v1/settings/public  →  { "promotionsEnabled": boolean }
```

Без авторизации, дефолт `false`. Это будущая точка расширения для других публичных
флагов (добавление поля, не нового эндпоинта).

Отклонённые альтернативы:
- **(B)** подмешать флаг в `GET /promotions/plans` — семантически грязно (это про
  цены) и привязывает флаг к планам.
- **(C)** запечь через env при сборке клиента — тогда тумблер в админке не даёт
  мгновенного эффекта (нужен ребилд), что противоречит самой цели.

### 3.2. Куда писать флаг в админке → отдельный мини-тумблер (вариант A)

Зеркалим проверенный паттерн `admin-sms-settings`: отдельные
сервис/контроллер/DTO/слайс/тумблер. Полная изоляция, нулевой риск задеть
существующий promo-cron.

Отклонённая альтернатива:
- **(B)** расширить `admin-promotion-settings` (он про cron истечения) полем
  `enabled` — связывает флаг доступности с операционным cron-конфигом и его
  reschedule-логикой. Лишний риск и смешение ответственностей.

## 4. Дизайн по слоям

### 4.1. Бэкенд — `apps/api`

Паттерн 1:1 с `admin-sms-settings` (`src/admin/admin-sms-settings.service.ts`,
`...controller.ts`, `src/sms/sms.constants.ts`, `dto/update-sms-settings.dto.ts`).

**Хранилище.** Используем существующую key/value-таблицу `AppSetting`
(`prisma/schema.prisma`). Новая миграция НЕ нужна — это новый ключ, не новая колонка.

- Константа: `PROMOTIONS_ENABLED_KEY = 'promotions_enabled'`.
- Резолвер: `resolvePromotionsEnabled(stored: string|null|undefined, envDefault: boolean): boolean`
  (`'true'`→true, `'false'`→false, иначе envDefault).
- Env-дефолт: `PROMOTIONS_ENABLED` (config), дефолт **`false`**.
- Расположение константы/резолвера: новый файл `src/promotions/promotions-flag.constants.ts`
  (рядом с доменом промо), либо общий settings-модуль — финализируется в плане.

**Admin write.**
- `AdminPromotionsFlagService.get(): { promotionsEnabled }` — читает `AppSetting`,
  фолбэк на env-дефолт.
- `AdminPromotionsFlagService.update(adminId, dto): { promotionsEnabled }` — `upsert`
  ключа (значение как строка `'true'`/`'false'`) + `auditLog` с
  `action: 'PROMOTIONS_FLAG_UPDATE'`, `metadata: { enabled }`.
- `AdminPromotionsFlagController`:
  - `GET  /admin/promotions-flag` → `{ promotionsEnabled }`
  - `PATCH /admin/promotions-flag` body `{ enabled: boolean }` → `{ promotionsEnabled }`
  - Гард: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`.
- DTO `UpdatePromotionsFlagDto { @IsBoolean() enabled!: boolean }`.
- Регистрация контроллера/сервиса в `AdminModule`.

**Public read.**
- `PublicSettingsController` `GET /settings/public` → `{ promotionsEnabled }` (без auth,
  дефолт false). Читает тот же `AppSetting`-ключ через общий сервис-метод.
- Включить контроллер в **public** OpenAPI-документ (allowlist в
  `src/.../swagger.documents.ts`), т.к. публичные/мобильные клиенты тоже могут
  читать флаг.

**OpenAPI.** Регенерировать `pnpm openapi:export`
(`nest build && node dist/scripts/export-openapi.js`, нужны 4 dummy-env), закоммитить
обновлённые `openapi.public.json` (и `internal`, если затронут) — иначе CI drift-check
упадёт.

**Тесты (Vitest/Jest как в репо):**
- `resolvePromotionsEnabled`: true / false / дефолт.
- Admin `get`/`update`: upsert пишет строку, возвращает булеан, создаёт audit-log.
- Public `GET /settings/public`: при отсутствии ключа отдаёт `{ promotionsEnabled: false }`.

### 4.2. Веб-админка — `apps/web`

Зеркало `SmsSendingToggle` + `adminSmsSettingsApi`.

- RTK-слайс `adminPromotionsFlagApi` (`useGetPromotionsFlagQuery`,
  `useUpdatePromotionsFlagMutation`), тег кеша `Admin`, инвалидация на PATCH.
- Компонент `PromotionsAvailabilityToggle` (Вкл/Выкл, `disabled` во время
  загрузки/сохранения) — копия `SmsSendingToggle.tsx`.
- Подключить панель в `apps/web/src/app/admin/settings/page.tsx` с заголовком
  **«Продвижение объявлений»** (рядом с SMS/Telegram/Exchange).

### 4.3. Клиент — `apps/client`

- RTK-слайс `publicSettingsApi` → `useGetPublicSettingsQuery()` (`GET /settings/public`).
- Хук `usePromotionsEnabled(): boolean` — обёртка над запросом; во время загрузки и при
  ошибке возвращает **`false`** (кнопка по умолчанию скрыта, без «мигания»).
- В `src/features/account/MyListings.tsx` (стр. ~138–148) условие рендера кнопки:
  было `l.promo === 'NORMAL'` → станет `promotionsEnabled && l.promo === 'NORMAL'`.
  Это единственное место кнопки во всём `apps/client`.
- i18n-ключ `account.myListings.promote` не трогаем (label остаётся).

## 5. Поток данных

```
Админ → /admin/settings → PATCH /admin/promotions-flag { enabled }
      → AppSetting.upsert(promotions_enabled) + AuditLog
Клиент → GET /settings/public → { promotionsEnabled }
      → usePromotionsEnabled() → MyListings гейтит кнопку «Продвинуть»
```

## 6. Обработка ошибок и крайние случаи

- Public-эндпоинт при ошибке БД → дефолт `false` (как `otp.isEnabled()` ловит и
  возвращает дефолт). Кнопка скрыта — безопасный исход.
- Клиент: query в состоянии loading/error → хук отдаёт `false` → кнопка скрыта.
- Дефолт OFF означает, что сразу после деплоя кнопка исчезает у всех (целевое
  поведение для текущего этапа).

## 7. Тестовая стратегия (сводно)

- **api:** unit на резолвер + admin get/update + public default-false (см. 4.1).
- **web:** smoke на рендер тумблера (по образцу SMS-тумблера, если есть).
- **client:** тест, что кнопка скрыта при `promotionsEnabled=false` и видна при `true`
  (через мок `usePromotionsEnabled`/MSW).

## 8. Доставка (PR-структура)

По границам app-папок (память: «один таск — одна app-папка»), main защищён → мёржит
владелец:
- **PR #1 `apps/api`:** флаг storage + admin-эндпоинт + public-эндпоинт + OpenAPI regen
  + тесты + **ADR-0100** + подготовка `DONE.md` (финализируем в этом PR).
- **PR #2 `apps/web`:** тумблер в `/admin/settings`.
- **PR #3 `apps/client`:** `publicSettingsApi` + `usePromotionsEnabled` + гейт кнопки.

PR независимы по коду; для живой проводки сначала мёржится/деплоится api.

## 9. Деплой-заметки

- Чтобы изменение увидеть на стенде — **ребилд `avino-client`** (baked Docker-образ;
  HMR в проде нет).
- Прод-env: при желании выставить `PROMOTIONS_ENABLED` (но дефолт false и так
  корректен; источник правды — тумблер в админке через `AppSetting`).
