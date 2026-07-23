# Spec: эксклюзивность слота тура (дата + окно занимается первой заявкой)

**Дата:** 2026-07-02
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api`, `apps/client` (разные PR — одна app-папка = один PR)

## Контекст и цель

Сейчас на один слот (листинг + дата + окно, напр. 03.07.2026 11:00–13:00) заявку
могут подать несколько разных пользователей: блокируется только повторная
PENDING-заявка **того же** requester-а
(`apps/api/src/tour-requests/tour-requests.service.ts`). Владелец может
подтвердить обе — двойное бронирование.

Требование: слот занимается **первой** заявкой (PENDING). Пока она активна
(PENDING или CONFIRMED), другие пользователи не могут подать заявку на этот же
слот. DECLINE (владелец) или CANCEL (заявитель) освобождают слот.

## Решения (утверждены)

1. **Блокировка с момента PENDING**, не с CONFIRMED. Освобождение — DECLINED /
   CANCELLED.
2. **Гарантия от гонок — частичный уникальный индекс в Postgres** (вариант A из
   брейншторма; варианты B «транзакция + FOR UPDATE» и C «только проверка перед
   вставкой» отклонены: B сериализует все заявки листинга и хрупок, C оставляет
   гонку).
3. **Занятые слоты видны в UI до отправки**: занятые окна дизейблятся с пометкой
   «занято». Для этого — новый Bearer-endpoint занятых слотов (без личных данных
   заявителей).

## A. apps/api

### A.1 Миграция (SQL руками, как guard-миграция bathrooms)

1. **Guard-очистка** существующих конфликтов: среди активных
   (`status IN ('PENDING','CONFIRMED')`) заявок на один слот
   `(listing_id, requested_date, window_start, window_end)` оставить одну —
   приоритет CONFIRMED (владелец уже выбрал), при равенстве — самая ранняя
   `created_at`; остальные → `DECLINED`.
2. **Частичный уникальный индекс:**

```sql
CREATE UNIQUE INDEX tour_requests_active_slot_key
  ON tour_requests (listing_id, requested_date, window_start, window_end)
  WHERE status IN ('PENDING', 'CONFIRMED');
```

Prisma не описывает partial index в `schema.prisma` — индекс живёт только в
миграции (комментарий в схеме у модели `TourRequest` со ссылкой на миграцию).
DECLINE/CANCEL автоматически выводят строку из индекса — код очистки не нужен.

### A.2 Новый код ошибки

`apps/api/src/common/dto/error-response.dto.ts`:
`TOUR_SLOT_TAKEN = 'TOUR_SLOT_TAKEN'` (409). Добавление enum-значения —
non-breaking.

### A.3 `TourRequestsService.create`

Текущая проверка дубля (тот же requester + слот + PENDING) заменяется на
проверку «активная заявка на слот от кого угодно»:

- ищем `findFirst` по слоту со `status IN (PENDING, CONFIRMED)`
  (select `requesterId`);
- нашли и `requesterId === текущий` → существующий `409 TOUR_REQUEST_DUPLICATE`;
- нашли и чужая → `409 TOUR_SLOT_TAKEN`;
- не нашли → `create`; гонка (двое прошли проверку одновременно) ловится по
  Prisma `P2002` на unique-индексе → `409 TOUR_SLOT_TAKEN`.

`setStatus` не меняется: CONFIRM не создаёт строк (слот уже занят той же
записью), DECLINE/CANCEL освобождают слот через условие индекса.

### A.4 Новый endpoint занятых слотов

`GET /api/v1/tour-requests/taken?listing_id=<uuid>` — в существующем
`TourRequestsController` (Bearer-only, как весь контроллер; подача заявки всё
равно требует логина).

- Валидация: `listing_id` — UUID; листинг существует и не DELETED, иначе 404.
- Ответ: активные слоты листинга от «сегодня» до горизонта
  `TOUR_HORIZON_DAYS = 30`:

```json
{ "data": [ { "requested_date": "2026-07-03", "window_start": "11:00", "window_end": "13:00" } ] }
```

- **Без** имён/телефонов/идентификаторов заявителей и без `status`
  (PENDING и CONFIRMED снаружи неразличимы — оба «занято»).

⚠️ Новый endpoint + новый код ошибки меняют публичный OpenAPI →
регенерировать `openapi.public.json` (`pnpm openapi:export`) в том же PR.

### A.5 Тесты (`tour-requests.service.spec.ts` + spec контроллера по паттернам)

- чужая PENDING на слот → `TOUR_SLOT_TAKEN`;
- чужая CONFIRMED на слот → `TOUR_SLOT_TAKEN`;
- DECLINED / CANCELLED на слот не блокируют создание;
- своя активная → `TOUR_REQUEST_DUPLICATE` (как раньше);
- P2002 при create → `TOUR_SLOT_TAKEN`;
- `taken`: отдаёт только слоты в горизонте, только активные статусы, без
  личных полей; 404 на несуществующий/DELETED листинг.

## B. apps/client (отдельный PR)

### B.1 `src/store/api/tourRequestsApi.ts`

- Новый query `getTakenSlots(listingId)` → `GET tour-requests/taken`;
  tag `TourTakenSlots` c invalidation из mutation создания заявки.

### B.2 `src/features/detail/TourRequestModal.tsx`

- При открытии модалки — fetch занятых слотов (skip, пока закрыта). Модалка
  открывается только авторизованным (`ContactCard` шлёт гостя в логин), поэтому
  Bearer-endpoint не создаёт проблем гостям.
- После выбора даты: окна, занятые на эту дату, дизейблятся с пометкой
  «занято» (утверждённый мок: `( ) 11:00–13:00  ⛔ занято`).
- Если выбранное окно стало занятым (или все заняты) — авто-сдвиг выбора на
  первое свободное / блокировка submit.
- Ошибка `TOUR_SLOT_TAKEN` при submit (успели раньше): показать понятный текст
  и рефетчнуть занятые слоты.
- Новые i18n-ключи в `apps/client/messages/{ru,uz,en}.json`:
  `tourRequest.slotTaken` («занято»), `tourRequest.slotTakenError`
  (текст ошибки при 409).

## Вне скоупа

- Календарь занятости для владельца.
- Изменения в `apps/web` (админка) и мобильном приложении (мобильной команде
  достаточно нового endpoint и кода ошибки из openapi).
- Ограничение «сколько активных заявок может держать один пользователь»
  (злоупотребление скупкой слотов решается владельцем через DECLINE).
