# Дизайн: админ-рассылка уведомлений (массовая + точечная)

- **Дата:** 2026-06-22
- **Статус:** утверждён (брейнсторминг), готов к плану реализации
- **Зависит от:** слой доставки уведомлений (PR #221 — `Notification` + `NotificationDelivery` + диспетчер + email/push/in-app)
- **Приложения:** `apps/api` (backend, NestJS), `apps/web` (админка, Next.js)

## 1. Проблема

В админке нет страницы для **ручной** отправки уведомлений. Вчерашняя работа (PR #221)
построила слой **доставки** (фан-аут уведомления в каналы email/push/in-app, диспетчер
BullMQ, локализация, kill-switch'и), но уведомления создаются только **доменными
продюсерами** (новый чат, модерация, тур и т.д.). Админ не может написать сообщение руками
и разослать его — ни массово, ни одному пользователю, ни по расписанию. Истории отправленных
рассылок как отдельной сущности тоже нет (есть лог доставок `GET /admin/notification-logs`,
но это уровень отдельных уведомлений, не «рассылок»).

## 2. Цель

Страница в админке, где ADMIN может:

1. Написать сообщение (массовое **или** одному пользователю).
2. Выбрать каналы доставки: **IN_APP / EMAIL / PUSH / SMS**.
3. Отправить **сейчас** или **запланировать** на дату/время.
4. Видеть **историю** рассылок с агрегатом статусов доставки.

## 3. Ключевые решения (итог брейнсторминга)

| Развилка | Решение |
|---|---|
| **Каналы v1** | IN_APP + EMAIL + PUSH (свободный текст) + SMS (фикс. шаблон-«пинок») |
| **Аудитория** | Базовые сегменты: статус (дефолт ACTIVE) + роль (опц.); авто-фильтр по достижимости канала |
| **Язык/контент** | **Строго один язык на рассылку** (title/body + селектор языка). Без авто-перевода. Чтобы охватить все языки — несколько рассылок |
| **Время** | «Сейчас» **и** запланированная отправка |
| **SMS** | Eskiz доставляет только предодобренные шаблоны → SMS-канал шлёт фикс. локализованный шаблон-«пинок» («У вас новое сообщение от Avino, откройте приложение»), а полный текст — в IN_APP/EMAIL |
| **Telegram** | **Вне scope.** У пользователей нет привязки `telegram_id`; Telegram сейчас — только админ-алерты в один чат. Потребовал бы отдельной фичи «привяжи Telegram к аккаунту» |
| **Черновики (DRAFT)** | Вне scope v1 (YAGNI). Режимы только «сейчас» / «запланировать» |
| **Архитектура** | Подход A: тонкий слой `Broadcast` поверх существующего пайплайна доставки #221 (не плодим второй путь доставки) |

## 4. Архитектура (Подход A)

Тонкий слой оркестрации поверх диспетчера #221. Новый код — только материализатор аудитории
+ одна новая ветка доставки (SMS) + UI. Вся доставка, ретраи и kill-switch'и переиспользуются.

### 4.1. Модель данных

Новая таблица `Broadcast` (одна строка = одна рассылка = запись истории):

```prisma
model Broadcast {
  id             String                @id @default(uuid()) @db.Uuid
  createdById    String                @map("created_by") @db.Uuid        // ADMIN-автор
  audienceType   BroadcastAudience                                        // SINGLE | SEGMENT
  targetUserId   String?               @map("target_user_id") @db.Uuid    // для SINGLE
  language       Language                                                 // RU | UZ | EN
  filterStatus   UserStatus?           @map("filter_status")              // дефолт ACTIVE
  filterRole     UserRole?             @map("filter_role")                // опц.
  channels       NotificationChannel[]                                    // выбранные каналы
  title          String                @db.VarChar(255)
  body           String
  status         BroadcastStatus       @default(SCHEDULED)
  scheduledAt    DateTime?             @map("scheduled_at") @db.Timestamptz(6)  // = now() для «сейчас»
  recipientCount Int                   @default(0) @map("recipient_count")      // снимок размера аудитории
  sentAt         DateTime?             @map("sent_at") @db.Timestamptz(6)
  createdAt      DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)

  createdBy  User  @relation("BroadcastCreatedBy", fields: [createdById], references: [id])
  targetUser User? @relation("BroadcastTargetUser", fields: [targetUserId], references: [id])

  @@index([status, scheduledAt])
  @@index([createdById, createdAt])
  @@map("broadcasts")
}

enum BroadcastAudience { SINGLE  SEGMENT }
enum BroadcastStatus   { SCHEDULED  SENDING  SENT  FAILED  CANCELED }
```

Точечные правки существующих enum'ов и моделей:

- `NotificationChannel` += **`SMS`** — SMS становится полноценным каналом доставки.
- `NotificationType` += **`ADMIN_BROADCAST`** — новый тип «админ написал руками».
- `Notification` += **`broadcastId String?`** (FK на `Broadcast`, ON DELETE SET NULL, индекс) —
  чтобы детальная статистика рассылки считалась join'ом по доставкам.

### 4.2. Поток отправки

```
Админ жмёт «Отправить»
        │
        ▼
  POST /admin/broadcasts ──► строка Broadcast (SCHEDULED, scheduled_at)
        │                      режим «сейчас» → немедленный job в очередь
        ▼
  BroadcastWorker (BullMQ: периодический тик ~раз в минуту + немедленный job)
   • берёт SCHEDULED где scheduled_at <= now → переводит в SENDING
   • резолвит аудиторию (where: status, language, role?)
   • батчами createMany:
       Notification(type=ADMIN_BROADCAST, broadcastId, title, body — вшиты)
       + NotificationDelivery по выбранным каналам, но только куда юзер достижим:
           EMAIL → есть email; SMS → есть phone; PUSH → есть активный device-токен; IN_APP → всегда
   • recipientCount = размер аудитории; статус → SENT (идемпотентно)
        │
        ▼
  Существующий диспетчер #221, deliver-стадия (логику НЕ меняем)
   • дренит PENDING-доставки: те же ретраи (attempts<3), те же kill-switch'и
   • EMAIL → renderEmail (с HTML-escape из #221) → EmailService
   • PUSH  → renderPush → FcmService (деактивация битых токенов)
   • IN_APP → mark sent (колокольчик уже виден по факту строки Notification)
   • SMS   → НОВАЯ ветка: SmsService.isEnabled()? → фикс. локализованный
             шаблон-«пинок» (НЕ body!) → SmsService.send(phone, text)
```

**Ключевое:** fan-out для `ADMIN_BROADCAST` делает **сам воркер** (создаёт доставки напрямую
по выбранным каналам). Поэтому в routing-таблице `notificationRouting[ADMIN_BROADCAST] = []` —
штатный fan-out диспетчера этот тип не трогает и не создаёт дублей. Канал-агностичная
**deliver-стадия** переиспользуется как есть, плюс одна новая ветка `SMS`.

### 4.3. Резолв аудитории и превью

- `BroadcastAudienceService.resolve(broadcast)` строит Prisma-`where`:
  - `status` = `filterStatus ?? ACTIVE` (исключает BLOCKED/DELETED, `deletedAt = null`);
  - `defaultLanguage = language` (для `SEGMENT`);
  - опц. `role` (membership в `roles`);
  - для `SINGLE` — просто `id = targetUserId`.
- **Достижимость по каналу** применяется при материализации доставок: email/phone — проверка
  колонки; push — наличие хотя бы одного активного `notificationDevice`. Мёртвые доставки не
  создаём. IN_APP создаётся всегда (если канал выбран).
- `recipientCount` — снимок на момент отправки (для списка истории). Детальная разбивка по
  статусам/каналам считается **лениво** на странице деталей: `deliveries ← notifications(broadcastId)`.

### 4.4. SMS-канал (ветка доставки)

- Новая ветка в `processDelivery()` диспетчера для `channel = SMS`.
- Уважает kill-switch: `SmsService.isEnabled()` (уже есть, `app_settings[SMS_ENABLED_KEY]`); если
  выключен — доставка остаётся PENDING (доедет при включении), как и для email/push в #221.
- Получатель без `phone` → доставку для него не создаём на этапе материализации.
- Отправляет **фикс. локализованный шаблон-«пинок»** (не `body`), ключ в каталоге шаблонов
  уведомлений (`notification-templates.ts`), parity ru/uz/en. Через `SmsService.send(phone, text)`.

## 5. Backend API

Все маршруты — версия v1, `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`.
**MODERATOR исключён** — массовые коммуникации только ADMIN.

| Метод | Маршрут | Назначение |
|---|---|---|
| `POST` | `/admin/broadcasts/preview` | Оценка аудитории БЕЗ создания: `{ total, perChannel: { inApp, email, push, sms } }` |
| `POST` | `/admin/broadcasts` | Создать рассылку. Body: `audienceType, targetUserId?, language, filterStatus?, filterRole?, channels[], title, body, mode: 'now'\|'scheduled', scheduledAt?` |
| `GET`  | `/admin/broadcasts` | История (пагинация + фильтр по статусу) |
| `GET`  | `/admin/broadcasts/:id` | Деталь + живая разбивка доставок по каналам/статусам |
| `POST` | `/admin/broadcasts/:id/cancel` | Отменить `SCHEDULED` (до материализации) |

Создание рассылки логируется в admin audit log (кто / что / когда / размер аудитории).

## 6. Web-UI (`apps/web`)

Новая группа навигации **«Уведомления»** в `Sidebar.tsx` (не в «Системе»), экраны:

- **`/admin/broadcasts`** — таблица истории: дата · язык · каналы (иконки) · аудитория
  (сегмент/один + размер) · статус (бейдж) · счётчики (отправлено / ошибок / прочитано) · автор.
  Кнопка «Новая рассылка».
- **`/admin/broadcasts/new`** — форма:
  - **Тип:** массовая (сегмент) / одному пользователю (поиск по `/admin/users`).
  - **Язык:** RU / UZ / EN.
  - **Сегмент:** статус (дефолт ACTIVE) · роль (опц.) — скрыт для режима «одному».
  - **Каналы:** чекбоксы IN_APP / EMAIL / PUSH / SMS. У SMS — подсказка «отправится фикс.
    шаблон, не текст ниже» + превью шаблона.
  - **Контент:** title + body для выбранного языка.
  - **Время:** «Отправить сейчас» / «Запланировать» (datetime).
  - **Превью аудитории (живое):** «Получат: ~N чел.» + разбивка по каналам (дёргает `/preview`).
    Предупреждение, если выбранный канал глобально выключен kill-switch'ем.
  - **Отправка → модалка подтверждения** с размером аудитории (защита от случайной массовой рассылки).
- **`/admin/broadcasts/[id]`** — деталь: контент, параметры, статус, прогресс для `SENDING`,
  разбивка доставок.

RTK Query slice `adminBroadcastsApi.ts`: `useListBroadcastsQuery`, `useGetBroadcastQuery`,
`useCreateBroadcastMutation`, `usePreviewAudienceMutation`, `useCancelBroadcastMutation`.

История доставок (`/admin/notification-logs`, бэкенд уже есть) — опционально вкладкой «Лог
доставок» позже; в scope v1 не входит.

## 7. Безопасность и guardrails

- **ADMIN-only** + запись в admin audit log.
- **Превью аудитории** + **обязательная модалка подтверждения** с числом перед массовой отправкой.
- **Идемпотентная материализация:** повторный тик воркера не шлёт дважды — гард по переходу
  статуса (`SENDING` материализуется один раз) + проверка существующих `Notification.broadcastId`.
- **Kill-switch'и каналов** (#221) уважаются: канал глобально выключен → доставки ждут; в UI
  предупреждение.
- **HTML-escape `body`** в email — переиспользуем escaping из #221 (админ пишет свободный текст
  → защита от XSS-в-письме).
- **Throughput:** большие рассылки дренятся существующим диспетчером постепенно; материализация
  — батчами `createMany`; размер батча — в конфиг. Известное ограничение v1 (не блокер).

## 8. Тесты

- **Unit:**
  - `BroadcastAudienceService` — построение `where` по сегменту / single / достижимости канала.
  - `BroadcastWorker` — идемпотентность, батчи, переходы статусов, `scheduledAt` due.
  - SMS-ветка диспетчера — enabled/disabled, нет телефона, рендер шаблона.
  - routing — `ADMIN_BROADCAST` не дублируется штатным fan-out'ом.
- **Integration (controller):** create (now / scheduled / single), preview-count, list,
  detail-агрегация, cancel, guard (MODERATOR → 403).
- **i18n:** SMS-шаблон + новые ключи parity ru/uz/en.
- **Web (если есть Vitest-харнесс):** валидация формы, превью, модалка подтверждения.

## 9. Выкат

- **Prisma-миграция:** таблица `broadcasts` + enum-добавления (`NotificationChannel += SMS`,
  `NotificationType += ADMIN_BROADCAST`, `BroadcastAudience`, `BroadcastStatus`) +
  `Notification.broadcastId`. Миграция не применяется локально (нет `DATABASE_URL`) → staging/CI.
- **Регенерация `openapi.internal.json`** (новые admin-роуты) — иначе CI drift-check падает.
- **ADR** про слой рассылок + решение «SMS как канал».
- **Разбивка на PR** (по `CLAUDE.md`): **PR-1 backend (`apps/api`)** + **PR-2 web (`apps/web`)**.
- **Прод-TODO:** рабочие SMTP / Firebase / Eskiz-креды (как и для #221); одобренный Eskiz-шаблон
  для SMS-«пинка».

## 10. Явно вне scope v1

- Telegram-канал для пользователей (нет привязки `telegram_id`).
- SMS со свободным текстом / реестр нескольких SMS-шаблонов (только один фикс. «пинок»).
- Черновики (DRAFT) и редактирование рассылок.
- Продвинутая сегментация (верификация, дата регистрации, гео, «есть объявления»).
- Авто-перевод контента (один язык на рассылку).
- A/B, аналитика открытий/кликов.
