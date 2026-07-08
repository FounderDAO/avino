# Spec: компактные карточки Zillow + флаг центрирования карты при наведении

**Дата:** 2026-06-26
**Статус:** approved (дизайн утверждён)
**Затрагивает:** `apps/api`, `apps/client`, `apps/web`

## Контекст и цель

Клиенту нравится дизайн Zillow. Две задачи на странице поиска (`/search`, layout
уже Zillow-подобный: карта слева 50% / карточки справа 50%):

1. **Отключить «езду» карты при наведении на карточку.** Сейчас наведение
   подсвечивает пин **и** центрирует карту к нему (`map.panTo`). Нужно убрать
   только центрирование (подсветку оставить), с возможностью вернуть поведение в
   будущем через админ-панель (флаг: `true` → центрирование работает, `false` →
   нет). По умолчанию **OFF**.
2. **Сделать карточки компактными как у Zillow** (строгий минимализм).

## Решения (утверждены)

- Hover→карта: гейтим **только** `panTo` за флагом; подсветка пина — всегда.
  Флаг по умолчанию `false`.
- Управление флагом: тоггл в админке (`apps/web`) + флаг в API (`app_settings`,
  key-value) + клиент читает `GET /settings/public`. Меняется без редеплоя.
  Зеркалит существующий паттерн `promotions_enabled`.
- Карточка: строгий минимализм Zillow — одна цена, спеки одной строкой (+тип
  жилья в неё), локация. Убрать: лейбл сделки `ПРОДАЖА`, отдельный заголовок
  `title`, нижнюю строку «тип · агентство» с `border-top`.

---

## A. Флаг `map_hover_recenter` (центрирование карты при наведении)

Полностью зеркалит существующий флаг `promotions_enabled`
(`apps/api/src/settings/`).

### A.1 apps/api

Новые файлы в `apps/api/src/settings/` (зеркало промо-флага):

- `map-hover-recenter-flag.constants.ts`
  - `MAP_HOVER_RECENTER_KEY = 'map_hover_recenter'`
  - `resolveMapHoverRecenter(stored, envDefault)` — `'true'→true`, `'false'→false`,
    иначе `envDefault`.
- `map-hover-recenter-flag.service.ts` — `MapHoverRecenterFlagService`:
  - `isEnabled()`: env-дефолт из config `mapHoverRecenter.enabled` (по умолчанию
    `false`) + чтение `app_settings[MAP_HOVER_RECENTER_KEY]`.
  - `setEnabled(adminId, enabled)`: `upsert` в `app_settings` + `auditLog` с
    `action: 'MAP_HOVER_RECENTER_FLAG_UPDATE'`, `entityType: 'app_setting'`.
- `admin-map-hover-recenter-flag.controller.ts` — `AdminMapHoverRecenterFlagController`:
  - `@Controller({ path: 'admin/map-hover-recenter-flag', version: '1' })`
  - Guards: `JwtAuthGuard, RolesGuard` + `@Roles(UserRole.ADMIN)`.
  - `GET` → `{ mapHoverRecenter: boolean }`; `PATCH` (body `{ enabled: boolean }`)
    → `{ mapHoverRecenter: boolean }`.
- `dto/update-map-hover-recenter-flag.dto.ts` — `{ enabled: boolean }` (зеркало
  `UpdatePromotionsFlagDto`).
- Тесты `*.spec.ts` для constants/service/controller (зеркало промо-тестов).

Правки:

- `public-settings.controller.ts`: расширить `PublicSettingsView` полем
  `mapHoverRecenter: boolean`; в `get()` вернуть
  `{ promotionsEnabled, mapHoverRecenter }`. Инжектить
  `MapHoverRecenterFlagService`.
- `settings.module.ts`: зарегистрировать новый сервис и admin-контроллер.
- Config: добавить `mapHoverRecenter.enabled` (env `MAP_HOVER_RECENTER_ENABLED`,
  дефолт `false`) рядом с `promotion.enabled`.

⚠️ Изменение ответа `GET /settings/public` меняет публичный OpenAPI →
**регенерировать `openapi.public.json`** (`pnpm openapi:export` + dummy env) и
закоммитить в тот же PR (иначе CI drift-check красный).

Миграция БД **не нужна** — `app_settings` уже существует (key-value).

### A.2 apps/client

- `src/store/api/publicSettingsApi.ts`: расширить интерфейс
  `PublicSettings` полем `mapHoverRecenter: boolean`.
- Новый хук `src/lib/useMapHoverRecenter.ts` (зеркало `usePromotionsEnabled.ts`):
  возвращает `boolean`, при loading/error → `false` (fail-safe = карта спокойна).
- `src/features/search/SearchResults.tsx`: вызвать `useMapHoverRecenter()` и
  передать в `<MapView recenterOnHover={...} />` (рядом с `activeId/onHover`,
  ~стр. 179–181).
- `src/features/map/MapView.tsx`: добавить проп `recenterOnHover?: boolean`
  (default `false`). В эффекте на `activeId` (~стр. 270–285) **подсветку пина
  оставить без изменений**, блок `map.panTo([a.lat, a.lng], { flying: true })`
  вызывать **только если** `recenterOnHover === true`. Добавить
  `recenterOnHover` в массив зависимостей эффекта.

### A.3 apps/web

- `src/store/api/adminMapHoverRecenterFlagApi.ts` (зеркало
  `adminPromotionsFlagApi.ts`): `useGetMapHoverRecenterFlagQuery`,
  `useUpdateMapHoverRecenterFlagMutation` (GET/PATCH `/admin/map-hover-recenter-flag`).
- `src/components/admin/MapHoverRecenterToggle.tsx` (зеркало
  `PromotionsAvailabilityToggle.tsx`):
  - Заголовок: «Центрирование карты при наведении на карточку».
  - Описание: «По умолчанию выключено — карта стоит на месте при наведении
    (как Zillow). Включить → карта центрируется к объекту. Без пересборки.»
  - Кнопка Включено/Выключено через мутацию.
- `src/app/admin/settings/page.tsx`: добавить `<MapHoverRecenterToggle />` рядом
  с `<PromotionsAvailabilityToggle />`.

---

## B. Компактная карточка (`apps/client/src/features/search/PropertyCard.tsx`)

Файл переписывается, контракт пропсов (`PropertyCardProps`) и обёртка-`<Link>` на
`/listing/[id]` сохраняются.

**Убрать:**
- Лейбл сделки `txLabel(...)` (текущие стр. 58–60).
- Отдельную строку заголовка `listing.title` (стр. 85–87) — адрес становится
  заголовком (по-зилловски).
- Нижнюю строку «тип · агентство» c `border-t` (стр. 97–104).

**Оставить и уплотнить:**
- Фото: соотношение `aspect-[16/11]` → `aspect-[3/2]`. Badges `PromoBadge/NewBadge`
  (сверху-слева) и `FavButton` (сверху-справа) — без изменений.
- Цена: `fmt.price(listing)` (уважает глобальный тоггл валют [сум|$]),
  `text-[23px] font-extrabold` → ~`text-[19px] font-bold`.
- Спеки: `specs(listing, tUnits)` одной строкой, `text-[14.5px]` → `~text-[13px]`;
  в конец строки добавить тип жилья `propertyTypeLabel(listing.type, tEnums)`
  (как «House for sale» у Zillow) — инфа о типе не теряется.
- Локация: `district · address` с иконкой `MapPin`, `text-[13.5px]` →
  `~text-[12.5px]`.
- Паддинг тела: `px-4 pb-4 pt-3.5` → `px-3 py-2.5`. Межстрочные отступы ужать
  (`mt-2`→`mt-1/1.5`).
- Hover-лифт карточки смягчить: `-translate-y-[3px]` → лёгкая тень без подскока
  (масштаб фото `group-hover:scale-105` можно оставить).

**Сетка** (`SearchResults.tsx`, текущая стр. 284):
`grid-cols-1 gap-5 px-5 pb-5 sm:grid-cols-2` → `... gap-4 px-4 pb-4 sm:grid-cols-2`
(2 колонки сохраняем, отступы ужимаем).

`PropertyCardSkeleton.tsx` привести к новой высоте карточки.

---

## C. Объём, порядок, ограничения

3 PR по app-папкам (как принято в проекте — бандл разбивается по владению
файлами):

1. **PR #1 `apps/api`** — флаг: constants/service/admin-controller/dto/config +
   поле в `public-settings` + тесты + regen `openapi.public.json`.
2. **PR #2 `apps/client`** — компактная карточка + скелетон + сетка + гейтинг
   `panTo` + `useMapHoverRecenter` + поле в `PublicSettings`. Работает и без PR#1
   (дефолт `false`).
3. **PR #3 `apps/web`** — admin-тоггл.

Порядок мёржа: #1 → затем #2 и #3.

**Ограничения:**
- `main` защищён: открываю PR, мёржит пользователь (никогда `--admin`).
- GitHub-операции — токеном из `~/.gh_token` (значение не печатать).
- Git-мутации по одной команде (цепочки через `&&` отклоняются правами).
- Каждая app-папка — отдельная ветка/PR; субагенты не трогают git.

## Критерии готовности (verify)

- API: `GET /settings/public` возвращает `mapHoverRecenter`;
  `PATCH /admin/map-hover-recenter-flag` (ADMIN) меняет значение + пишет
  `auditLog`; openapi drift-check зелёный. Юнит-тесты constants/service зелёные.
- client: с флагом `false` (дефолт) наведение на карточку **не двигает** карту,
  пин подсвечивается; карточка компактная (нет лейбла/заголовка/агентства),
  layout визуально ближе к Zillow. `lint`+`build` зелёные.
- web: в `admin/settings` есть тумблер «Центрирование карты…», переключение
  применяется к порталу без пересборки.
- Live-verify на стенде/локально: флаг ON → карта снова центрируется при
  наведении; OFF → стоит.
