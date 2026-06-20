# Дизайн: «Request a tour» — запрос на просмотр объявления

**Дата:** 2026-06-21
**Статус:** Design approved, готов к плану реализации
**Приложения:** `apps/api` (модель + API), `apps/client` (портал: форма, кнопка, кабинет)
**Scope-out:** «Apply now» (анкета-заявка на аренду), админ-вид в `apps/web`

---

## 1. Цель

Дать покупателю/арендатору возможность **запросить просмотр (тур)** объекта перед
покупкой или арендой, а продавцу — управлять этими запросами:

- Продавец **включает/выключает** приём туров по объявлению (boolean), задавая это
  **при создании ИЛИ редактировании** объявления.
- Если туры включены, продавец задаёт **доступные временные окна** (например
  `07:00–10:00`, `18:00–20:00`), когда можно прийти осмотреть.
- Покупатель на детальной странице жмёт **«Request a tour»**, выбирает **дату +
  окно + опц. сообщение** и отправляет заявку.
- Продавец **подтверждает / отклоняет** заявку в своём кабинете; обе стороны
  получают уведомления.

Если продавец туры выключил — кнопки нет, заявки не принимаются.

«Apply now» со скрина — **отдельная фича** (анкета-заявка на аренду) и в этот заход
не делается (YAGNI).

---

## 2. Ключевое архитектурное решение: хранение окон

Временные окна продавца хранятся как **JSONB-поле `tour_windows` на `listings`**, а не
в отдельной таблице.

**Обоснование:** окна — это маленький конфиг-список (≤6), который правится только
вместе с объявлением и никогда не запрашивается независимо. Прецедент в проекте уже
есть — `SavedSearch.filters_json`. Заявка хранит **снимок** выбранного слота
(денормализованные `window_start`/`window_end` + `requested_date`), поэтому изменение
окон продавцом не ломает уже созданные заявки. Отдельная таблица
(`ListingTourWindow`) дала бы реляционную чистоту, но потребовала бы CRUD-синка при
каждом edit и join на чтении — избыточно для MVP.

**Время — локальное Asia/Tashkent.** Рынок одночасовой; TZ-конверсий в MVP нет, окна
и даты трактуются как местное время.

---

## 3. Модель данных

### 3.1 Правки `Listing`

```prisma
model Listing {
  // ... существующие поля ...
  toursEnabled  Boolean  @default(false) @map("tours_enabled")
  tourWindows   Json     @default("[]")  @map("tour_windows")
}
```

- `tour_windows` — массив объектов `{ "start": "HH:MM", "end": "HH:MM" }`.
- **Дефолт `tours_enabled=false`** → opt-in. Существующие объявления при миграции
  получают `false`; поведение текущих данных не меняется.
- Поля задаются через `CreateListingDto` и `UpdateListingDto` (создание И правка).

**Валидация окон (DTO-уровень):**
- формат `HH:MM`, регэксп `^([01]\d|2[0-3]):[0-5]\d$`;
- `start < end` (лексикографическое сравнение корректно для zero-padded `HH:MM`);
- максимум **6** окон на объявление;
- включить туры (`tours_enabled=true`) можно только при **≥1 окне** — иначе `422`.

### 3.2 Новая модель `TourRequest`

```prisma
enum TourRequestStatus {
  PENDING
  CONFIRMED
  DECLINED
  CANCELLED
}

model TourRequest {
  id            String            @id @default(uuid()) @db.Uuid
  listingId     String            @map("listing_id") @db.Uuid
  requesterId   String            @map("requester_id") @db.Uuid
  status        TourRequestStatus @default(PENDING)
  requestedDate DateTime          @map("requested_date") @db.Date
  windowStart    String           @map("window_start")    // "07:00" — снимок окна
  windowEnd      String           @map("window_end")      // "10:00"
  requesterName  String           @map("requester_name")  // снимок имени из формы
  requesterPhone String           @map("requester_phone") // снимок телефона (обязателен)
  message        String?          // опц. комментарий, ≤500
  createdAt     DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  listing   Listing @relation(fields: [listingId], references: [id], onDelete: Cascade)
  requester User    @relation(fields: [requesterId], references: [id], onDelete: Cascade)

  @@index([listingId])
  @@index([requesterId])
  @@index([status])
  @@map("tour_requests")
}
```

`window_start`/`window_end` — **снимок** выбранного окна на момент заявки (а не FK на
конфиг объявления), поэтому правка окон продавцом не затрагивает историю.
`requester_name`/`requester_phone` — тоже **снимок** контактов из формы (имя
предзаполнено из профиля и редактируемо, телефон обязателен), чтобы у владельца был
точный контакт для обратной связи. Email берётся из аутентифицированного аккаунта
(read-only) и отдельным столбцом не дублируется.

---

## 4. API

Новый модуль `tour-requests` (логику не кладём в уже большой `listings.service.ts`,
~32 KB). Все роуты версионированы (`v1`), Bearer-auth (`JwtAuthGuard`) — как в чате:
гость, нажав кнопку, проходит через LoginModal.

| Метод | Роут | Кто | Назначение |
|---|---|---|---|
| `POST` | `/api/v1/tour-requests` | покупатель | создать заявку (статус `PENDING`) |
| `GET` | `/api/v1/tour-requests/outgoing` | покупатель | свои отправленные заявки (keyset) |
| `GET` | `/api/v1/tour-requests/incoming` | владелец | входящие по всем своим объявлениям (keyset) |
| `PATCH` | `/api/v1/tour-requests/:id/status` | обе стороны | `{ action: CONFIRM \| DECLINE \| CANCEL }` |

### 4.1 `POST /tour-requests`

Body:
```json
{
  "listing_id": "uuid",
  "requested_date": "2026-06-25",
  "window_start": "07:00",
  "window_end": "10:00",
  "requester_name": "Tap Links",
  "requester_phone": "+998 90 123-45-67",
  "message": "опционально, ≤500"
}
```

**Валидация:**
- объявление существует и не `DELETED`; иначе `404`;
- `status = ACTIVE` И `tours_enabled = true`; иначе `409` (одна `LISTING_NOT_AVAILABLE`);
- `{window_start, window_end}` ∈ `tour_windows` объявления; иначе `422`;
- `requested_date` не в прошлом (сегодня допустимо) и в пределах горизонта
  **30 дней** вперёд; иначе `422`. Проверки времени суток внутри окна нет (YAGNI);
- requester ≠ владелец объявления; иначе `403`;
- нет уже существующей `PENDING`-заявки этого же покупателя на тот же
  `listing + date + window`; иначе `409`;
- `requester_name` непустой (≤120); `requester_phone` непустой, формат телефона; иначе
  `422`. Email в body НЕ принимается — берётся из аутентифицированного аккаунта.

**Эффект:** создаётся `TourRequest(PENDING)` + уведомление владельцу (`NEW_LEAD`)
транзакционно (как `queueChatMessage`).

### 4.2 `PATCH /tour-requests/:id/status`

| action | Кто может | Из статуса | В статус |
|---|---|---|---|
| `CONFIRM` | только владелец объявления | `PENDING` | `CONFIRMED` |
| `DECLINE` | только владелец объявления | `PENDING` | `DECLINED` |
| `CANCEL` | только покупатель (requester) | `PENDING`, `CONFIRMED` | `CANCELLED` |

`DECLINED` и `CANCELLED` — терминальные. Недопустимый переход → `422`
(`INVALID_STATUS_TRANSITION` — как owner-status `setStatus`, единая конвенция репо); не своя
заявка / не та роль → `403`. При смене статуса — уведомление второй стороне
(`TOUR_REQUEST_STATUS_CHANGED`).

### 4.3 Чтение объявления

В `ListingDetailResponse` добавляются `tours_enabled` и `tour_windows`, чтобы клиент
знал, показывать ли кнопку и какие окна предлагать. Списочные ответы поиска не
трогаем.

---

## 5. Уведомления

Переиспользуем чистый паттерн продюсеров `notifications.service.ts`
(`queueChatMessage`/`queueSavedSearchNewListing` — транзакционный `notification.create`).

- **Новая заявка → владельцу:** оживляем «мёртвый» `NotificationType.NEW_LEAD`
  (значение enum есть, но продюсера в коде нет).
  `data_json: { tourRequestId, listingId, requestedDate, windowStart, windowEnd }`.
- **Смена статуса → второй стороне:** новый
  `NotificationType.TOUR_REQUEST_STATUS_CHANGED`
  (подтвердил/отклонил/отменил); `data_json` включает `status`.

Каналы — существующие: `IN_APP` + `EMAIL` (как у прочих типов). Клиент рендерит текст
по типу через `notificationContent(type, data_json, t)` (тексты на бэке `NULL` by
design) + i18n-ключи `notifications.types.*` в **ru/uz/en** (parity).

> ⚠️ **Гоча CI:** добавление enum-значений и новых полей DTO просачивается в
> `openapi.public.json` / `openapi.internal.json`. После правок обязательно
> регенерировать (`pnpm openapi:export`, preview-mode, 4 dummy env), иначе
> drift-check в CI упадёт.

---

## 6. Клиент (`apps/client`)

### 6.1 Форма создания/редактирования объявления
Секция «Туры»:
- тоггл `tours_enabled`;
- редактор окон: список строк `ЧЧ:ММ – ЧЧ:ММ` с кнопками добавить/удалить (≤6);
- включение тоггла без окон блокируется (валидация перед submit + 422 с бэка).

### 6.2 Детальная страница
- Кнопка **«Request a tour»** (как на скрине) — видна только если
  `tours_enabled && status === ACTIVE`.
- Гость → LoginModal (паттерн уже есть). Авторизованный → модалка в стиле референса
  (Zillow-like) с полями:
  - **Имя и фамилия** * — предзаполнено из профиля, редактируемое;
  - **Email** — read-only, из аккаунта (только отображается);
  - **Телефон** * — обязателен; предзаполняется из `profile.contactPhone`, если есть;
  - **Дата** * — календарь (не в прошлом, горизонт 30 дней);
  - **Окно времени** * — выбор одного из предложенных продавцом `tour_windows`
    (чипы/радио), а не свободный ввод;
  - **Сообщение** — опц. (≤500), дефолт «Хочу записаться на тур»;
  - строка-согласие «Отправляя заявку, вы соглашаетесь с Условиями»;
  - кнопка **«Отправить заявку»** → `POST /tour-requests`, тост об успехе/ошибке.

### 6.3 Кабинет «Мои туры»
- **Outgoing** (как покупатель): список своих заявок со статусами, действие «Отменить»
  (для `PENDING`/`CONFIRMED`).
- **Incoming** (как владелец): входящие заявки с кнопками «Подтвердить»/«Отклонить»
  (для `PENDING`).
- Переиспользуем паттерны списков/пагинации из чата и ленты уведомлений.

Все новые UI-строки — i18n-ключи в ru/uz/en (parity).

---

## 7. Edge cases / ошибки

| Ситуация | Код |
|---|---|
| Объявление не найдено / `DELETED` (при создании заявки) | `404` |
| Туры выключены / объявление не ACTIVE | `409` |
| Окно не из предложенных | `422` |
| Дата в прошлом или > 30 дней | `422` |
| Владелец запрашивает тур на своём объявлении | `403` |
| Дубль `PENDING` на тот же слот | `409` |
| Включение туров без окон | `422` |
| Недопустимый переход статуса | `422` |
| Действие не своей ролью (чужая заявка) | `403` |

---

## 8. Тестирование

- **API:** `tour-requests.service.spec.ts` + контроллер — плотность как у существующих
  `*.service.spec.ts`; покрыть всю валидацию и переходы статусов из §4/§7; продюсеры
  уведомлений (`NEW_LEAD`, `TOUR_REQUEST_STATUS_CHANGED`).
- **Клиент:** Vitest/RTL — модалка заявки (валидация даты/окна), редактор окон в форме,
  гейтинг кнопки на детальной.
- Регенерация openapi + green drift-check в CI.

---

## 9. Вне scope (YAGNI)

- «Apply now» — анкета-заявка на аренду (отдельная модель `RentalApplication`, своя
  форма, статусы) — отдельной фичей позже.
- Админ-вид туров в `apps/web` (фоллоу-ап при необходимости).
- Расписание per-weekday, capacity/лимит мест на слот.
- Авто-`EXPIRE` прошедших заявок (cron) — позже.
- TZ-конверсии (рынок одночасовой).
