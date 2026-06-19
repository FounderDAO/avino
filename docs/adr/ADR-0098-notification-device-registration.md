# ADR-0098: Регистрация push-устройств (notification devices)

- Статус: Accepted
- Дата: 2026-06-20
- Связано: ADR-0010 (стаб таблицы `notification_devices` под Flutter/FCM/APNs)

## Контекст
Таблица `notification_devices`, enum `DevicePlatform`, код ошибки
`DEVICE_TOKEN_EXISTS` и контракт в `docs/API.md` §14 существовали с ADR-0010 как
стаб, но сами эндпоинты регистрации/отвязки устройства реализованы не были
(обнаружено при подготовке Swagger/OpenAPI — `openapi.public.json` ссылался на
несуществующие роуты, Flutter получил бы 404). Нужно дописать эндпоинты под
будущую доставку push, не подключая сам транспорт (FCM/APNs — отдельная задача).

## Решение
1. `POST /api/v1/notifications/devices { platform, push_token }` — регистрация
   push-токена. Auth: **Bearer** (`JwtAuthGuard` класс-уровня). → `201
   { id, platform, is_active }`.
2. **Идемпотентность через upsert/claim** (по решению Team Lead): запись
   делается `prisma.notificationDevice.upsert({ where: { pushToken } })`. Тот же
   токен клиент FCM/APNs переотправляет при каждом запуске и ротации, поэтому
   повторная регистрация не ошибка — строка реактивируется (`is_active=true`,
   `last_seen_at=now`) и **переназначается** текущему пользователю (claim, если
   устройство сменило аккаунт). Коллизии `UNIQUE(push_token)` не возникает —
   `409 DEVICE_TOKEN_EXISTS` для этого пути больше не возвращается (контракт в
   API.md обновлён; enum-код ошибки оставлен в `ApiErrorCode` без использования).
3. `DELETE /api/v1/notifications/devices/:id` — отвязать своё устройство,
   **hard delete** (`deleteMany({ id, userId })`): чужое/несуществующее → `404`,
   физическое удаление освобождает `push_token` для чистой повторной регистрации.
   → `204`.
4. Swagger-паритет с соседями: request — класс `RegisterDeviceDto` (попадает в
   `components/schemas`, как `CreateFavoriteDto`), response — TS-интерфейс
   `DeviceResponse` (рендерится `{type:object}`). `platform` (Prisma-enum)
   рендерится как `{type:object}` — общая особенность всех Prisma-enum DTO
   проекта; `@ApiProperty` не вводился, чтобы не плодить непоследовательный
   паттерн. `openapi.public.json` / `openapi.internal.json` перегенерированы.
5. Только backend (`apps/api`); миграции БД не требуются (таблица уже есть).

## Последствия
Positive:
- Контракт `docs/API.md` §14 и `openapi.*.json` снова соответствуют реальному
  коду — Flutter-клиент может регистрировать устройства без 404.
- Регистрация безопасна для повторных вызовов мобильного клиента (никаких 409
  на штатном перезапуске приложения).

Negative / trade-offs:
- Сам PUSH-транспорт (FCM/APNs) по-прежнему не подключён — это лишь реестр
  токенов; фактическая отправка push остаётся отдельной задачей.
- claim переназначает токен новому пользователю молча (без аудита) — приемлемо
  для MVP, т.к. токен физически принадлежит устройству.

## Related files
- apps/api/src/notifications/dto/register-device.dto.ts
- apps/api/src/notifications/notifications.controller.ts
- apps/api/src/notifications/notifications.service.ts
- apps/api/src/notifications/notifications.service.spec.ts
- apps/api/openapi.public.json, apps/api/openapi.internal.json
- docs/API.md (§14)

## Related task
- TASK-100 (notifications), §11 Notifications rules (push support for mobile)
