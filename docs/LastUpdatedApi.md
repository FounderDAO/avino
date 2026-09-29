# LastUpdatedApi — изменения API за 3–24 июля 2026

Документ для мобильного разработчика (Flutter / iOS / Android). Здесь только то,
что **изменилось после предыдущих дайджестов** и важно для интеграции. Все
изменения уже смержены в `main` и задеплоены.

Источники правды:
- полный справочник маршрутов — `docs/API.md`, `apps/api/openapi.public.json`
  (Swagger `/api/docs`);
- предыдущие дайджесты: `LAST_CHANGED_API.md` (29.06–02.07: `/view`, туры,
  legal consent, дробные `bathrooms`) и
  `docs/GUIDE_MOBILE_INTEGRATION_2026-07-06.md` (партия 06.07: `rooms[]`,
  polygon `points`, аватар, `currency`, кластеры) — здесь не повторяются;
- realtime WebSocket — отдельный гайд `docs/GUIDE_MOBILE_REALTIME_WS.md`.

## Общее (напоминание, контракт не менялся)
- Base URL: `/api/v1`, тела — **snake_case**
  (исключение: `GET /settings/public` — camelCase).
- Деньги/площади — строка-Decimal (`"1285.85"`), не число.
- Неизвестные поля/параметры → **400** (whitelist-валидация).
- Массивы в query — повторяющимся параметром: `?amenities=POOL&amenities=PARKING`.

---

## TL;DR

1. **Удобства стали справочником** — enum `Amenity` больше нет. Новый публичный
   `GET /amenities`; коды и лейблы берите оттуда, **не хардкодьте**.
2. **Смена логин-контакта (телефон/email) — только через OTP**:
   `POST /users/me/contact-change/{request,verify}`.
   ⚠️ BREAKING: `PATCH /users/me` **больше не принимает `email`** — только
   `default_language`.
3. **Публичный «Телефон для связи» (`contact_phone`) — только через OTP**:
   `POST /users/me/contact-phone/{request,verify}`.
   ⚠️ BREAKING: `contact_phone` **удалён из `PATCH /users/me/profile`**.
4. **OTP-лимиты обновлены**: `resend_after` прогрессивный (60с → 120с, потолок
   2 мин), кап запросов за 15-мин окно: SMS=6, EMAIL=10 → **429 RATE_LIMITED**.
   Таймер повтора стройте **только** из `resend_after` ответа.
5. **Правка объявления = повторная модерация**: изменение контента (включая
   фото) у ACTIVE/REJECTED объявления возвращает его в статус `NEW`.
6. ⚠️ BREAKING: **`NEW_BUILDING` удалён из `PropertyType`**; «новостройка» —
   фильтр `?new_construction=true`. **`year_built` обязателен** в
   `POST /listings` для APARTMENT/HOUSE.
7. **Лимит объявлений + «Стать агентом»**: `GET /listings/quota`,
   `POST/GET /users/me/agent-application`, публичный каталог `GET /agents(/:id)`,
   фильтр `GET /search?agent_id=`.
8. **Публичный номер объявления**: поле `reference` (int, от 100000) +
   `GET /listings/by-ref/:reference`.
9. **Аккаунт**: `DELETE /users/me` (самоудаление), сессии
   `GET /auth/sessions` + `DELETE /auth/sessions/:fid`, тихий лимит 5 сессий.
10. **Юр-документы с сервера**: `GET /legal/terms|privacy` (версионируются,
    возможен повторный бамп `legalConsentVersion` → снова модалка согласия).

---

## 1. Удобства (amenities): enum → справочник

Было: фиксированный enum `Amenity` (`AIR_CONDITIONING … POOL`).
Стало (ADR-0111): таблица-справочник, админ добавляет/скрывает удобства без
релиза. Существующие коды сохранены, но **могут появляться новые** — упавший
на неизвестном коде парсер = баг интеграции.

### GET /api/v1/amenities  (public, новый)

Только активные, отсортированы, без пагинации:

```json
[ { "id": "am1", "code": "PARKING", "label_ru": "Парковка",
    "label_uz": "Avtoturargoh", "label_en": "Parking",
    "is_active": true, "sort_order": 0 } ]
```

Что менять в мобилке:
- форму создания/редактирования объявления и фильтры строить из этого списка
  (кэшировать можно, но обновлять при старте);
- локализованные названия — `label_ru|uz|en` из справочника, не из локальных
  ресурсов приложения;
- в `POST/PATCH /listings` и `GET /search?amenities=` передавать `code`
  (строка), контракт поля прежний — `amenities: string[]`;
- в ответах объявлений amenities-коды рендерить через словарь; неизвестный
  код просто пропускать.

## 2. Смена логин-контакта (телефон / email) — OTP-flow

Раньше email менялся через `PATCH /users/me` сразу и без подтверждения, а
логин-телефон не менялся вовсе. Теперь смена применяется **только после ввода
кода, отправленного на НОВЫЙ контакт** (ADR-0150).

### POST /api/v1/users/me/contact-change/request  (Bearer)

```json
{ "channel": "SMS", "destination": "+998901234567" }
```
`channel`: `SMS` (телефон, E.164) | `EMAIL` (email). 201:

```json
{ "request_id": "otp_8f3a", "channel": "SMS", "expires_in": 300, "resend_after": 60 }
```

Errors: `400 VALIDATION_ERROR` (в т.ч. новый контакт = текущему),
`409 CONTACT_TAKEN` (занят другим аккаунтом), `429 RATE_LIMITED`,
`503 AUTH_PROVIDER_UNAVAILABLE` (SMS-канал выключен админом).

### POST /api/v1/users/me/contact-change/verify  (Bearer)

```json
{ "channel": "SMS", "destination": "+998901234567", "code": "123456" }
```

201 → **обновлённый объект `/auth/me`** (телефон/email уже новые,
`is_phone_verified`/`is_email_verified` = true). Errors: `400 OTP_INVALID`,
`400 OTP_EXPIRED`, `429 OTP_ATTEMPTS_EXCEEDED`, `409 CONTACT_TAKEN`
(повторная проверка уникальности при verify).

⚠️ BREAKING: `PATCH /users/me` теперь принимает **только
`default_language`**. Если приложение шлёт туда `email` — получит
`400 VALIDATION_ERROR` (whitelist). Reviewer OTP-bypass (тест-номер для
сторов) на смену контакта **не действует**.

Токены/сессии при смене контакта не отзываются — разлогинивать юзера не нужно.

## 3. Публичный «Телефон для связи» (contact_phone) — OTP-flow

`contact_phone` профиля (показывается в объявлениях) теперь тоже меняется
только с подтверждением владения номером (ADR-0151). SMS-only. Уникальность
**не** проверяется — общий номер агентства допустим.

### POST /api/v1/users/me/contact-phone/request  (Bearer)

```json
{ "destination": "+998901112233" }
```

Два варианта ответа 201:
- номер совпадает с **верифицированным логин-телефоном** → применяется сразу,
  без SMS: `{ "applied": true }` — шаг с кодом пропустить;
- иначе: `{ "applied": false, "request_id": "otp_…", "channel": "SMS",
  "expires_in": 300, "resend_after": 60 }`.

Errors: `400 VALIDATION_ERROR` (номер = текущему подтверждённому),
`429 RATE_LIMITED`, `503 AUTH_PROVIDER_UNAVAILABLE`.

### POST /api/v1/users/me/contact-phone/verify  (Bearer)

```json
{ "destination": "+998901112233", "code": "123456" }
```
201 → обновлённый `/auth/me`.

Сопутствующие изменения контрактов:
- ⚠️ BREAKING: `contact_phone` **удалён из `PATCH /users/me/profile`**
  (остальные поля профиля — как раньше);
- в `profile` ответов `/auth/me`, `/users/me` добавлено
  **`contact_phone_verified: boolean`** — показывайте бейдж/статус по нему;
- на объявлениях (`contact.phone` в деталке) и в профиле агента наружу уходит
  **только подтверждённый** `contact_phone`, иначе фолбэк на верифицированный
  логин-телефон аккаунта. Старые непроверенные номера считаются
  неподтверждёнными (показывается логин-телефон), UI должен предложить
  подтвердить номер заново.

## 4. OTP-лимиты: прогрессивный resend + кап за окно

Касается **всех** OTP-запросов (логин `auth/otp/request`, contact-change,
contact-phone) — лимиты общие per `channel+destination` (обновлено 23.07):

- `resend_after` в ответе прогрессивный: 1-й запрос — 60с, 2-й и далее — 120с
  (потолок 2 минуты). **Не хардкодьте 60с** — таймер строго из ответа.
- Кап запросов в 15-минутном окне на один контакт: **SMS = 6, EMAIL = 10**.
  Сверх → `429 RATE_LIMITED`. Показывайте «слишком много запросов, попробуйте
  позже» и не ретраите автоматически.
- Verify-лимиты и брутфорс-блокировка не менялись
  (`429 OTP_ATTEMPTS_EXCEEDED`).

## 5. Правка объявления возвращает его в модерацию (OWNER_EDIT)

Изменение **контента** объявления владельцем (текст, цена, параметры, а также
**добавление/удаление фото**) у объявления в статусе `ACTIVE` или `REJECTED`
переводит его в `NEW` — объявление уходит на повторную модерацию и пропадает
из публичной выдачи до одобрения.

- Гейт по реальному diff: PATCH без фактических изменений (или только окна
  туров) статус не трогает.
- Мобилке: после успешного `PATCH /listings/:id` или операций с медиа
  перечитайте объявление / обновите список «Мои объявления» — статус мог
  смениться на `NEW`. Предупредите пользователя перед сохранением правок
  активного объявления («объявление уйдёт на проверку»).

## 6. Новостройка: `new_construction` вместо типа NEW_BUILDING

⚠️ BREAKING (ADR-0139):
- `NEW_BUILDING` **удалён из enum `PropertyType`** (валидные:
  `APARTMENT | HOUSE | LAND | COMMERCIAL`); старые объявления мигрированы в
  `APARTMENT`. `?type=NEW_BUILDING` в поиск слать нельзя → 400.
- Новый фильтр `?new_construction=true` во всех поисковых эндпоинтах
  (`/search`, `/bounds`, `/radius`, `/near-me`, `/polygon`, `/clusters`):
  `year_built` за последние 3 календарных года или в будущем (недострой);
  порог считает сервер.
- **`year_built` стал обязательным** в `POST /listings` для
  APARTMENT/HOUSE (будущие годы валидны — «сдача в 2028»); для
  LAND/COMMERCIAL опционален. Добавьте обязательное поле в визард, иначе 400.

## 7. Лимит объявлений и флоу «Стать агентом»

Лимит активных объявлений обычного пользователя — `active_listing_limit`
(значение публично в `GET /settings/public → activeListingLimit`, default 2;
роль AGENT/AGENCY публикует без лимита).

### GET /api/v1/listings/quota  (Bearer, новый)

Проактивная проверка ПЕРЕД открытием формы создания:

```json
{ "used": 2, "limit": 2, "blocked": true }
```
`blocked=true` → вместо визарда показать экран «Стать агентом». Занятый
слот = объявление в `ACTIVE` или `NEW`. Реактивный `422
ACTIVE_LISTING_LIMIT_REACHED` на `POST /listings` сохранён (в `details`
приходят `{ limit, used }`) — обрабатывайте оба пути.

### Заявка агента

- `POST /users/me/agent-application` (Bearer):
  `{ "agency_name": "Ideal Estate" | null, "about": "..." }` (`about`
  обязателен, ≤2000; `agency_name` опционален, `null` = частный маклер).
  201 → `{ id, status: "PENDING", agency_name, about, reject_reason: null,
  created_at, resolved_at: null }`.
  Errors: `409 AGENT_APPLICATION_PENDING`, `409 ALREADY_AGENT`.
- `GET /users/me/agent-application` (Bearer) — последняя заявка (тот же
  контракт), `404 NOT_FOUND` если заявок не было. После REJECTED можно
  подать заново (в `reject_reason` — причина отказа модератора).
- Решение приходит уведомлением `AGENT_APPLICATION_RESOLVED` (IN_APP,
  `data_json: { application_id, status, reject_reason }`) — добавьте рендер
  этого типа. После approve роль `AGENT` появится в `roles` из `/auth/me`.

### Публичный каталог агентов

- `GET /agents?page=&limit=` — `{ data: [ { id, name, avatar_url,
  agency_name, about, active_listings_count } ], meta }` (сортировка по числу
  активных объявлений). **Без контактов** — намеренно.
- `GET /agents/:id` — то же + `phone`, `email` (контакты только в профиле;
  `phone` по тем же правилам, что `contact.phone` деталки, см. §3).
- Объявления агента: **отдельного роута нет** — обычный
  `GET /search?agent_id=<users.id>` (работает во всех гео-эндпоинтах).

## 8. Публичный номер объявления (`reference`)

- Во всех ответах объявлений есть `reference` (int, автоинкремент от 100000,
  ADR-0137) — короткий номер «для диктовки по телефону». Показывайте на
  деталке («Объявление № 100042»).
- `GET /listings/by-ref/:reference` — та же деталка, что `GET /listings/:id`,
  но по номеру. UUID `id` остаётся каноническим ключом — все связи и роуты
  продолжают работать по нему.

## 9. Локализованный адрес (ADR-0147)

`address` в деталке и карточках поиска теперь отдаётся по языку ответа
(`Accept-Language`/`?lang`): при EN-запросе — английский вариант адреса, если
он есть (генерируется геокодером), иначе фолбэк на нормализованный оригинал.
Контракт поля не менялся (строка) — просто не удивляйтесь, что адрес меняется
вместе с языком. В `GET /listings/mine` карточки теперь тоже содержат
`address`.

## 10. Аккаунт: самоудаление и сессии

### DELETE /api/v1/users/me  (Bearer)

Soft-delete аккаунта: объявления снимаются с публикации, все refresh-токены
отзываются. → `204`. Подтверждение («напишите УДАЛИТЬ») — на стороне UI, тело
не требуется. После удаления повторная регистрация с тем же номером создаёт
**новый пустой** аккаунт — старые данные невозвратны, предупредите
пользователя. ⚠️ Access-токен технически живёт до TTL (~15 мин) — локально
чистите токены и стейт сразу.

### Сессии (ADR-0143)

- `GET /auth/sessions` (Bearer) — активные сессии:
  `[ { id, created_at, last_rotated_at, user_agent, ip, is_current } ]`.
- `DELETE /auth/sessions/:fid` → 204 (чужой/несуществующий → 404).
- Лимит **5 активных сессий** на пользователя: логин сверх лимита тихо
  выселяет самую давнюю — то устройство получит `401` на следующем
  `/auth/refresh`. Обрабатывайте `401 TOKEN_INVALID/TOKEN_REUSED` на refresh
  как штатный разлогин (на экран входа без крэша).

FYI: `/auth/refresh` дополнительно поддерживает httpOnly-cookie для
браузеров (ADR-0153). **Мобильного контракта это не меняет**: шлите
`refresh_token` в теле, токены в ответе остаются.

## 11. Юр-документы с сервера

- `GET /legal/terms` и `GET /legal/privacy` (public, локаль по
  `Accept-Language`): `{ kind, version, title, body_md, published_at }`.
  `body_md` — простое markdown-подмножество (заголовки `##`, списки, абзацы,
  без инлайн-разметки). `404` — пока нет опубликованной версии → показывайте
  вшитый в приложение фолбэк.
- Админ может опубликовать новую версию с флагом «требует повторного
  согласия» → `legalConsentVersion` в `GET /settings/public` бампается, и уже
  согласившимся пользователям надо снова показать блок-модалку (логика из
  дайджеста 29.06–02.07 §4 — сравнение с `legal_consent.accepted_version`
  из `/auth/me`).

## 12. Мелочи

- `POST /listings/:id/call` (public, без тела, → 204) — счётчик «показать
  телефон / позвонить»: зовите при тапе по кнопке звонка на деталке
  (аналог `/view`); в ответах объявлений есть `calls_count`.
- Realtime-доставка чата/уведомлений/туров: socket.io namespace `/rt`,
  тонкие сигналы `invalidate {type, id?}` → рефетч REST. Полный контракт и
  Flutter-пример: `docs/GUIDE_MOBILE_REALTIME_WS.md` (WS — foreground-канал,
  фон остаётся за FCM).

---

## Чек-лист интеграции (мобилка)

- [ ] Удобства: форма и фильтры из `GET /amenities`, лейблы из справочника,
      неизвестные коды не роняют парсер.
- [ ] Экран «Аккаунт»: смена телефона/email через
      `contact-change/request+verify`; убрать `email` из `PATCH /users/me`.
- [ ] Экран «Профиль»: `contact_phone` через `contact-phone/request+verify`
      (учесть `applied:true`); убрать `contact_phone` из
      `PATCH /users/me/profile`; бейдж по `contact_phone_verified`.
- [ ] OTP-таймеры повторной отправки — только из `resend_after`; обработка
      `429 RATE_LIMITED` на request.
- [ ] Предупреждение «уйдёт на модерацию» при правке ACTIVE-объявления +
      рефетч статуса после PATCH/медиа-операций.
- [ ] Убрать `NEW_BUILDING`; фильтр `new_construction`; обязательный
      `year_built` в визарде для квартир/домов.
- [ ] `GET /listings/quota` перед визардом + экран «Стать агентом»
      (заявка, статусы, уведомление `AGENT_APPLICATION_RESOLVED`).
- [ ] Каталог агентов (`/agents`, `/agents/:id`, `search?agent_id=`).
- [ ] `reference` на деталке; диплинк/поиск по номеру через `by-ref`.
- [ ] Удаление аккаунта в настройках (`DELETE /users/me`) + «Мои устройства»
      (`/auth/sessions`), штатный разлогин на 401 при refresh.
- [ ] Тексты Правил/Политики с `GET /legal/:kind` с фолбэком на вшитые.
- [ ] `POST /listings/:id/call` при тапе «Позвонить».
