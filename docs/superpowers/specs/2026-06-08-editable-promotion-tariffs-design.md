# Дизайн: Редактируемые тарифы промо (VIP/TOP) + настройка интервала проверки

**Дата:** 2026-06-08
**Статус:** Согласован, готов к плану реализации
**Проект:** avino (apps/api — NestJS/Prisma, apps/web — Next.js admin)

## 1. Контекст и проблема

Тарифы продвижения VIP/TOP за 7/14/30 дней сейчас **захардкожены** в коде
(`apps/api/src/promotions/promotions.catalog.ts`) — 6 фиксированных комбинаций
(`TOP|VIP` × `7|14|30` дней). Админ **не может** менять цены из панели: правка
требует деплоя. Также интервал фоновой проверки истечения промо задаётся только
env-переменной `PROMOTION_EXPIRY_CRON`, недоступной из админки.

Что **уже существует и НЕ переделывается**:
- `listing_promotions` — история покупок промо (тип, `period_days`,
  `starts_at`/`expires_at`, цена-снимок, статус). Это и есть «какое объявление
  купило какое продвижение на какой срок».
- `promotion_logs` — аудит админских действий (cancel/extend).
- `PromotionExpiryService` + `PromotionWorker` + BullMQ `promotion_queue`
  scheduler — sweep истечения по cron. Логика истечения корректна и остаётся.
- Admin-эндпоинты активации/отмены/продления; web `PromotionsPanel`,
  `PromotionLogsTab`.

## 2. Цель

1. Перенести каталог тарифов из кода в БД-таблицу, редактируемую админом
   (цена + вкл/выкл), при сохранении инварианта «фикс-6 комбинаций».
2. Дать админу выбор интервала проверки истечения (пресеты **6ч / 12ч**) из
   панели, без деплоя.
3. Логировать изменения цен и интервала в существующую `audit_logs`.

Вне объёма (YAGNI): произвольные тиры/периоды, мульти-валюта, онлайн-оплата,
свободный ввод cron, переделка истории и sweep-логики.

## 3. Изменения в БД (Prisma + миграция)

### 3.1 Таблица `promotion_plans`

Заменяет статический `PROMOTION_PLANS`.

```prisma
model PromotionPlan {
  id         String        @id @default(uuid()) @db.Uuid
  type       PromotionType                                  // только TOP | VIP
  periodDays Int           @map("period_days") @db.SmallInt // 7 | 14 | 30
  price      Decimal       @db.Decimal(14, 2)
  currency   Currency      @default(UZS)
  isActive   Boolean       @default(true) @map("is_active")
  createdAt  DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt  DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@unique([type, periodDays])
  @@map("promotion_plans")
}
```

- Raw-SQL в миграции: CHECK `type IN ('TOP','VIP')` и
  `period_days IN (7,14,30)` — сохраняет фикс-6 на уровне БД.
- **Сид**: ровно 6 строк с текущими ценами из `promotions.catalog.ts`
  (TOP 50k/90k/150k, VIP 120k/210k/350k UZS) → миграция не меняет цены.

### 3.2 Таблица `app_settings` (key/value)

Минимальная переиспользуемая таблица настроек. Сейчас один ключ.

```prisma
model AppSetting {
  key       String   @id @db.VarChar(80)
  value     String   @db.VarChar(255)
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@map("app_settings")
}
```

- Ключ `promotion_expiry_cron`, значение — cron-строка.
- Сид по умолчанию = `0 */12 * * *` (каждые 12ч — соответствует пресету «12ч»).
  UI оперирует только пресетами 6ч/12ч (см. §5); cron-значения, не равные
  пресетам, в UI показываются как ближайший пресет, фактический cron не теряется
  до явного сохранения.

## 4. Backend (NestJS, apps/api)

### 4.1 `PromotionPlansService` (новый, в модуле promotions)

- `listPlans({ activeOnly })` — читает из БД.
- `findPlan(type, periodDays)` — async DB-запрос (только активный план для
  публичной активации). Заменяет статическую функцию из каталога.
- Используется в:
  - публичном `GET /promotions/plans` (`PromotionsService.getPlans` →
    отдаёт только `isActive`);
  - `admin-promotions.service.ts` активация (строка ~99) и продление (~314).
- **Снимок цены сохраняется**: цена пишется в `listing_promotions.price` при
  активации. Изменение цены тарифа НЕ влияет на активные промо. Отключение
  плана (`isActive=false`) блокирует только новые активации этой комбинации;
  активные промо и их истечение не затрагиваются.

`promotions.catalog.ts` остаётся только как источник значений сида (или
переносится в seed-скрипт), из рантайм-путей удаляется.

### 4.2 Admin-эндпоинты (роль ADMIN, RolesGuard — как у остальных admin-роутов)

- `GET   /api/v1/admin/promotion-plans` — список 6 планов (с `isActive`).
- `PATCH /api/v1/admin/promotion-plans/:id` — body `{ price?, isActive? }`.
  Валидация: `price` > 0, `Decimal`-строка. Пишет `audit_logs`
  (`action="PROMOTION_PLAN_UPDATE"`, `entityType="promotion_plan"`,
  `entityId=plan.id`, `metadata={ old_price, new_price, old_is_active,
  new_is_active }`).
- `GET   /api/v1/admin/promotion-settings` — `{ expiryIntervalHours: 6|12 }`
  (маппинг cron→часы для UI).
- `PATCH /api/v1/admin/promotion-settings` — body `{ expiryIntervalHours: 6|12 }`.
  Маппит пресет в cron (`0 */6 * * *` / `0 */12 * * *`), сохраняет в
  `app_settings`, вызывает пере-регистрацию scheduler, пишет `audit_logs`
  (`action="PROMOTION_SETTINGS_UPDATE"`, metadata old/new).

### 4.3 Динамическая пере-регистрация cron

- `PromotionQueue` получает метод `rescheduleExpiry(cron)` — вызывает
  `upsertJobScheduler` с тем же стабильным id и новым `pattern` (идемпотентно
  замещает прежнее расписание).
- На старте `PromotionQueue` читает cron из `app_settings` (ключ
  `promotion_expiry_cron`); если строки нет — фолбэк на env
  `PROMOTION_EXPIRY_CRON`, затем на дефолт в коде.

## 5. Frontend (apps/web, Next.js admin, TailAdmin + RTK Query)

- Новая страница `app/(admin)/admin/promotions/page.tsx`:
  - **Таблица тарифов** — 6 строк (TOP/VIP × 7/14/30): колонки тир, период,
    цена (inline-редактирование), валюта, переключатель «активен», сохранить.
  - **Блок настроек** — селект интервала проверки: пресеты **6ч / 12ч**.
- RTK Query endpoints в `store/api/adminPromotionsApi.ts`:
  `getPromotionPlans`, `updatePromotionPlan`, `getPromotionSettings`,
  `updatePromotionSettings` (инвалидация тегов после мутаций).
- i18n RU/UZ/EN в `lib/i18n/messages/promotions.ts`.
- История покупок и логи уже есть (`PromotionsPanel`, `PromotionLogsTab`) —
  переиспользуем/линкуем со страницы, не дублируем.

## 6. Тестирование

- **Unit (api):**
  - `PromotionPlansService.findPlan` читает из БД; неактивный план → не найден.
  - `PATCH promotion-plans` пишет audit с old/new ценой; валидация price>0.
  - снимок цены: после смены цены плана активная промо хранит прежнюю цену.
  - `rescheduleExpiry` вызывает `upsertJobScheduler` с новым cron.
  - маппинг пресета 6ч/12ч ↔ cron.
- **E2E (api):** все 4 admin-эндпоинта; 403 без роли ADMIN; публичный
  `GET /promotions/plans` отдаёт только активные.
- **Frontend:** smoke на странице (таблица рендерит 6 строк, мутация цены,
  переключение интервала).

## 7. Миграция и откат

- Prisma-миграция: создать `promotion_plans` + `app_settings`, CHECK-констрейнты,
  засидить 6 планов и дефолтный интервал.
- Идемпотентный сид (`ON CONFLICT DO NOTHING` по `(type, period_days)` / `key`).
- Откат: drop двух таблиц; рантайм возвращается к фолбэку env/каталог (если код
  откатывается вместе с миграцией).

## 8. Затрагиваемые файлы (ориентир)

- `apps/api/prisma/schema.prisma` (+ новая миграция, seed)
- `apps/api/src/promotions/`: новый `promotion-plans.service.ts`,
  правки `promotions.service.ts`, `admin-promotions.service.ts`,
  удаление рантайм-зависимости от `promotions.catalog.ts`
- `apps/api/src/admin/`: новый контроллер(ы) promotion-plans / promotion-settings
  (или расширение существующего admin-модуля), DTO
- `apps/api/src/queues/promotion.queue.ts` (+ `rescheduleExpiry`, чтение из БД)
- `apps/web/src/app/(admin)/admin/promotions/page.tsx` (новая),
  `store/api/adminPromotionsApi.ts`, `lib/i18n/messages/promotions.ts`
- Доки: `docs/API.md` (§15 промо), `docs/DB_SCHEMA.md`, ADR при необходимости

## 9. Финализация (правило проекта)

ADR + пометка в `docs/DONE.md` готовятся в той же feature-PR перед push
(отдельный follow-up PR не создаём).
