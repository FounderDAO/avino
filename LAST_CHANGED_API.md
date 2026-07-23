# LAST_CHANGED_API — изменения API за 29 июня – 2 июля 2026

Документ для мобильного разработчика (iOS / Android / Flutter). Здесь только то, что **изменилось за последние дни** и важно для интеграции. Все изменения уже смержены в `main`.

Источники правды:
- полный справочник маршрутов — `docs/API.md`, `apps/api/openapi.public.json` (Swagger `/api/docs`);
- ответы на баглист мобильной команды от 01.07 — `docs/ANSWERS_MOBILE_BACKEND.md` (подробнее, чем здесь);
- предыдущий дайджест (25–28.06: фильтры поиска, регионы, `price-distribution`, `thumbnails[]`, rate-limit 429) уже вошёл в `docs/API.md` — здесь не повторяется.

## Общее (контракт не менялся, напоминание)
- Base URL: `/api/v1`. Тела запросов/ответов — **snake_case**.
  ⚠️ Единственное исключение: `GET /settings/public` отдаёт **camelCase** (`legalConsentRequired`, …).
- Деньги и площади — **строка-Decimal** (`"1285.85"`), не число.
- Неизвестные поля/параметры → **400** (whitelist-валидация).
- Массивы в query — повторяющимся параметром: `?amenities=POOL&amenities=HEATING`.
- Rate-limit действует: обрабатывайте **429** с бэкоффом.

---

## TL;DR
1. **Объявления — новые поля**: `is_basement`, `living_area`, `non_living_area`, `views_count`, `likes_count`; `bathrooms` стал **дробным** (шаг 0.5); в `amenities` добавлен **`POOL`**.
2. **Новый эндпоинт** `POST /listings/{id}/view` — счётчик просмотров.
3. **Туры: слот стал эксклюзивным** — новый код **409 `TOUR_SLOT_TAKEN`** + новый эндпоинт `GET /tour-requests/taken`.
4. **Legal consent (юр. согласие)** — блокирующая модалка: флаги в `GET /settings/public`, состояние в `GET /auth/me`, приём — `POST /users/me/legal-consent`.
5. **Сортировка поиска по цене** теперь FX-нормализована (UZS и USD сравниваются честно), топ-3 промо пинятся в начале 1-й страницы.
6. **Reviewer OTP bypass реализован** (для App Store / Play review) — тест-номер входит с любым кодом.

---

## 1. Объявления: новые/изменённые поля

Отдаются в деталке (`GET /listings/:id`), карточках поиска (`GET /search*`) и «моих» (`GET /listings/mine`); принимаются в `POST /listings` и `PATCH /listings/:id`:

| поле | тип | примечание |
|---|---|---|
| `bathrooms` | `number \| null` | теперь **дробный, шаг 0.5** (1, 1.5, 2 …, max 99). Не кратное 0.5 → 400. В ответах остаётся number |
| `is_basement` | `boolean` | цокольный этаж, default `false`. Если `true` — `floor` шлите `null` |
| `living_area` | `string \| null` | жилая площадь, м², Decimal-строка `"95.00"`. В запросе и в деталке |
| `non_living_area` | `string \| null` | нежилая площадь, аналогично |
| `views_count` | `int` | только в ответах; просмотры (см. §2) |
| `likes_count` | `int` | только в ответах; сколько юзеров добавили в избранное |

**Enum `Amenity` расширен**: добавлен **`POOL`** (бассейн) к `AIR_CONDITIONING, FURNITURE, APPLIANCES, INTERNET, ELEVATOR, BALCONY, HEATING, SECURITY`.

**Новые фильтры `GET /search`** (оба опциональны): `bathrooms_min` теперь принимает дробные (`bathrooms_min=1.5`); `is_basement=true` → только цокольные (`false`/не передан → без фильтра); `amenities=POOL` работает как остальные (AND).

---

## 2. `POST /api/v1/listings/{id}/view` — счётчик просмотров (новый)

- Без авторизации, без тела. Ответ **204**.
- Несуществующее или неопубликованное (не ACTIVE) объявление → **404**.
- Зовите один раз при открытии деталки. Уникальность не считается (каждый вызов = +1) — осознанное MVP-решение.

---

## 3. Туры: эксклюзивный слот (breaking-ish!)

Слот (листинг + дата + окно) теперь занимает **одна активная заявка** (PENDING или CONFIRMED).

- `POST /tour-requests` на занятый чужой слот → **409 `TOUR_SLOT_TAKEN`**.
  Своя повторная заявка → прежний **409 `TOUR_REQUEST_DUPLICATE`**.
- `PATCH /tour-requests/:id/status` (подтверждение владельцем) тоже может вернуть **409 `TOUR_SLOT_TAKEN`** — если слот успели занять.
- **Новый эндпоинт** для формы записи (Bearer):

```
GET /api/v1/tour-requests/taken?listing_id=<uuid>
→ { "data": [ { "requested_date": "2026-07-05", "window_start": "10:00", "window_end": "12:00" } ] }
```

Возвращает занятые слоты на ближайший горизонт, **без личных данных** заявителей (PENDING и CONFIRMED снаружи неразличимы). UI-флоу: перед показом формы получить занятые слоты и задизейблить их, но **всё равно обработать 409** (гонка двух пользователей).

---

## 4. Legal consent — блокирующая модалка согласия

Новый флоу «согласие с Правилами и Политикой конфиденциальности»:

1. `GET /settings/public` → **`legalConsentRequired: boolean`**, **`legalConsentVersion: number`** (⚠️ camelCase).
2. `GET /auth/me` → новое поле **`legal_consent: { accepted_version: number|null, accepted_at: string|null }`**.
3. Если `legalConsentRequired` и `accepted_version` < `legalConsentVersion` (или null) → показать блокирующую модалку с двумя чекбоксами.
4. Принятие:

```
POST /api/v1/users/me/legal-consent   (Bearer)
{ "terms_accepted": true, "privacy_accepted": true }
→ 201 { "accepted_version": 3, "accepted_at": "..." }
```

Обе галочки обязательны: любая `false` → **422 `CONSENT_INCOMPLETE`**.

---

## 5. Поведение сортировки поиска (изменилось)

- Явная сортировка `price_asc` / `price_desc` теперь **нормализует цену к USD по курсу ЦБ** — объявления в UZS и USD сравниваются по реальной стоимости, а не по числу.
- При явной сортировке (price/area/date) промо-объявления больше не доминируют по всей выдаче: **топ-3 промо пинятся в начале только 1-й страницы**, остальное — строго по ключу сортировки, без дублей в пагинации.
- Дефолтная выдача («Рекомендуемые», без `sort`) — как раньше, с полным промо-приоритетом.

Контракт запроса/ответа не менялся — меняется только порядок элементов.

---

## 6. Reviewer OTP bypass — реализован ✅

(В прошлом дайджесте был «в планах».) Для номеров-ревьюверов из allowlist:
- запрос OTP не шлёт реальную SMS (short-circuit);
- `POST /auth/otp/verify` принимает **любой код**.

Работает только для SMS-канала и только для номеров из env-конфига стенда (`OTP_BYPASS_ENABLED`, `OTP_BYPASS_PHONES`). Какой номер включён на staging/prod — уточните у бэкенда.

---

## 7. Кратко: saved searches + push (см. подробности в `docs/ANSWERS_MOBILE_BACKEND.md`)

- Полигон в saved search уже поддержан: `filters_json.filters.points = "lat,lng;lat,lng;…"` (мин. 3 вершины, замыкать не надо).
- Пуш о новом объявлении в зоне: `SAVED_SEARCH_NEW_LISTING`. Регистрация FCM-токена: `POST /notifications/devices { "platform": "ANDROID"|"IOS", "push_token": "…" }`, при логауте — `DELETE /notifications/devices/{id}`.
- Отключение уведомлений по поиску = `PATCH /saved-searches/{id} { "is_active": false }`.

---
_Источники: git-история `apps/api` за 29.06–02.07.2026; `docs/ANSWERS_MOBILE_BACKEND.md`; `apps/api/src/tour-requests/*`, `apps/api/src/users/legal-consent.service.ts`, `apps/api/src/settings/dto/public-settings-view.dto.ts`, `apps/api/src/auth/otp-bypass.util.ts`; ADR-0117._
