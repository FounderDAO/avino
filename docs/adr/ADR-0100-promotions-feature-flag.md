# ADR-0100 — Admin-управляемый флаг доступности продвижения (promotions feature-flag)

## Status
Accepted

## Date
2026-06-21

## Context
В кабинете клиента (`apps/client`, «Мои объявления») у каждой карточки есть
кнопка «Продвинуть» — сейчас это заглушка (нет onClick/клиентского API; продвигать
вручную умеют только админы). Проект на раннем этапе: платное продвижение ещё не
запускаем, поэтому кнопку нужно скрыть до момента запуска — без передеплоя кода,
по решению админа.

Паттерн runtime-тогглов в репозитории уже есть: ключ/значение в `app_settings`
(`AppSetting`) + сервис с резолюцией «DB-строка > env-дефолт» (SMS — ADR-0090,
Telegram). Публичного «feature-flags» эндпоинта, который мог бы прочитать клиент,
не было — SMS-флаг читается только серверно.

## Decision
1. **Флаг в `app_settings`, ключ `promotions_enabled`** (строка `'true'`/`'false'`),
   env-дефолт `promotion.enabled` (env `PROMOTION_ENABLED`) = **false**. Без новой
   миграции. Резолвер `resolvePromotionsEnabled` — чистая функция, зеркало
   `resolveSmsEnabled`.
2. **Общий `PromotionsFlagService`** (`isEnabled()`/`setEnabled()` + audit-log
   `PROMOTIONS_FLAG_UPDATE`) живёт в новом доменном **`SettingsModule`** и
   экспортируется. `SettingsModule` также держит **публичный**
   `PublicSettingsController` (`GET /api/v1/settings/public` → `{ promotionsEnabled }`,
   без авторизации).
3. **Admin-контроллер** (`GET/PATCH /api/v1/admin/promotions-flag`, `@Roles(ADMIN)`)
   зарегистрирован в **`AdminModule`** (как `AdminSmsSettingsController`), который
   импортирует `SettingsModule` ради общего сервиса. Это сознательно: если бы admin-
   контроллер сидел в `SettingsModule`, а `SettingsModule` входит в `PUBLIC_MODULES`
   OpenAPI, то его DTO (`UpdatePromotionsFlagDto`) утёк бы в `components.schemas`
   публичного документа (Swagger не прунит orphan-схемы — `prunePublicPaths` чистит
   только `paths`). Раздельная регистрация держит весь admin-контракт только в
   internal-документе. (Соседний `ExchangeRateModule` совмещает public+admin в одном
   модуле и имеет ровно эту утечку схемы — здесь мы её избегаем.)
4. **Публичный эндпоинт добавлен в публичный OpenAPI-документ** (`PUBLIC_MODULES`
   + prefix `/api/v1/settings`); admin-роут и его DTO остаются только в
   internal-документе. После изменения регенерируется `openapi.public.json`
   (CI drift-check).
5. **Клиент** читает флаг через RTK Query (`GET /settings/public`) и хук
   `usePromotionsEnabled()` (дефолт/загрузка/ошибка → `false`), гейтит кнопку
   «Продвинуть» в `MyListings`.
6. **Веб-админка** получает тумблер «Продвижение объявлений» в `/admin/settings`
   (зеркало SMS-тумблера).

## Consequences
- Дефолт OFF: после деплоя кнопка «Продвинуть» скрыта у всех; админ включает её
  одним тумблером без пересборки.
- Кнопка остаётся заглушкой и когда флаг ON — клиентский флоу продвижения (выбор
  тарифа/оплата/эндпоинт) вне scope, будущая фича. Когда он появится, серверный
  promote-эндпоинт обязан проверять тот же `promotions_enabled` (defence-in-depth,
  как SMS) — `PromotionsFlagService` для этого экспортируется.
- Новый публичный эндпоинт требует регенерации `openapi.public.json` (CI
  drift-check).
- Публичный ответ `GET /settings/public` сейчас `type: object` без свойств в
  OpenAPI (как у соседнего `GET /exchange-rate`) — `PublicSettingsView` это
  TS-интерфейс, не класс с `@ApiProperty`. Сознательно: консистентно с соседним
  публичным эндпоинтом; типизация-DTO — отдельная общая задача, если понадобится.

## Alternatives considered
- Подмешать флаг в `GET /promotions/plans` — семантически грязно (это про цены).
- Запекать через env при сборке клиента — тогда admin-тоггл не даёт мгновенного
  эффекта (нужен ребилд), что противоречит цели.
- Расширить `admin-promotion-settings` (cron истечения) полем `enabled` —
  смешение ответственностей с операционным cron-конфигом.
- Совместить public+admin контроллеры в одном `SettingsModule` (как
  `ExchangeRateModule`) — отвергнуто из-за утечки admin-DTO в публичный OpenAPI
  (см. Decision §3).
