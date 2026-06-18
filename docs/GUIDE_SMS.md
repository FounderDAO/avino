# GUIDE_SMS — Отправка SMS (Eskiz.uz)

> **Зачем этот файл.** SMS-доставка (OTP-логин) в Avino работает через
> **Eskiz.uz** — провайдера для Узбекистана. Интеграция в коде уже написана и
> протестирована; этот документ — пошаговый runbook, чтобы перевести её в
> production по чек-листу: что завести в кабинете Eskiz, **что обязательно пройти
> модерацию**, какие env-переменные заполнить и как сделать приёмку.
>
> Контракт доставки намеренно узкий (`SmsService.sendOtp`), поэтому подключение
> реального провайдера — это **конфигурация + модерация шаблона**, без правок
> вызывающего кода.
>
> См. также: [ENV.md §11](./ENV.md) · [ADR-0012](./adr/ADR-0012-otp-request-and-rate-limiting.md) ·
> [ADR-0089](./adr/ADR-0089-eskiz-sms-provider.md) · `.env.example` ·
> код: `apps/api/src/sms/sms.service.ts`, `apps/api/src/auth/otp.service.ts`,
> `apps/api/src/config/configuration.ts`.

---

## 1. Как устроено в Avino (контекст)

- Вход по OTP (SMS/Email) — `ARCHITECTURE.md` §6, эндпоинт
  `POST /api/v1/auth/otp/request` (API.md §3). Канал `SMS` доставляет код через
  `SmsService.sendOtp(phone, code)`.
- Слой доставки — `apps/api/src/sms/sms.service.ts`. Контракт узкий: вызывающий
  код (`OtpService`) не знает деталей Eskiz. HTTP — через глобальный `fetch`
  (Node ≥ 20), отдельной HTTP-зависимости нет.
- Текст OTP-сообщения (зашит в коде):
  `Avino: kirish uchun kod <code>. Hech kimga aytmang.` — **именно этот текст
  (с подстановкой кода) должен быть одобрен модерацией Eskiz** (см. §4.2).
- **Поведение по конфигурации:**

  | Условие | Поведение |
  |---|---|
  | `ESKIZ_EMAIL` + `ESKIZ_PASSWORD` **заданы** | реальная отправка через Eskiz REST API |
  | креды **не заданы**, `NODE_ENV ≠ production` | код **логируется** (`[DEV SMS → …]`), чтобы пройти flow локально |
  | креды **не заданы**, `NODE_ENV = production` | `warn` «provider is not configured», SMS не уходит |

- **Master-тоггл (admin, runtime).** Отправку SMS можно выключить/включить без
  редеплоя: `PATCH /api/v1/admin/sms-settings {enabled}` (ADMIN) пишет
  `app_settings['sms_enabled']`, которое главнее env-дефолта `ESKIZ_ENABLED`
  (по умолчанию `true`). При выключенном канале запрос OTP·SMS отвечает
  `503 AUTH_PROVIDER_UNAVAILABLE` — клиент предложит другой канал (ADR-0090).
- **Токен Eskiz** (Bearer, живёт ~30 дней) кэшируется в памяти процесса,
  переполучается при `401` (релогин + один ретрай отправки) **и** проактивно по
  TTL-запасу (~25 дней), чтобы не ловить 401 на боевой отправке.
- **Логи доставки** (после hardening): на успехе —
  `Eskiz SMS accepted: id=<id> status=<status> to=998****4567` (номер маскируется,
  текст не логируется); на отказе — `Eskiz send failed: <code> — <reason>`, где
  `reason` приходит от Eskiz (чаще всего это и есть сообщение о непройденной
  модерации шаблона, см. §4.2).

## 2. Почему Eskiz (зафиксировано)

Eskiz.uz — провайдер SMS для MVP (CLAUDE.md §13: менять без подтверждения Team
Lead нельзя). Покрывает узбекских операторов, поддерживает alphanumeric-sender и
модерируемые шаблоны (нужно для OTP). Контракт абстрагирован — при необходимости
смена провайдера затронет только `SmsService`.

## 3. Контракт переменных окружения (что читает код)

Источник истины — [ENV.md §11](./ENV.md); ниже — то, что реально читает
`configuration.ts` (namespace `sms.*`):

| Переменная       | Обяз.? | Секрет | Дефолт                        | Назначение |
|------------------|--------|--------|-------------------------------|------------|
| `ESKIZ_EMAIL`    | да*    | да     | —                             | Логин аккаунта Eskiz (e-mail) |
| `ESKIZ_PASSWORD` | да*    | да     | —                             | Пароль аккаунта Eskiz |
| `ESKIZ_BASE_URL` | нет    | нет    | `https://notify.eskiz.uz/api` | База API (менять незачем) |
| `ESKIZ_FROM`     | нет    | нет    | `4546`                        | Sender ID. `4546` — **тестовый**; в production — одобренный nickname/short-code |

\* «обязательны» = без них реальная отправка не работает (в dev — мягкая
деградация в лог). Секреты кладём в `apps/api/.env` (локально) или
`deploy/prod.env` / platform secrets (prod); **никогда не коммитим** (ENV.md §2).

## 4. Production setup (пошагово)

### 4.1 Аккаунт и баланс

1. Зарегистрировать/получить аккаунт на <https://eskiz.uz> (юр. лицо клиента).
2. Пополнить баланс (SMS платные; OTP-трафик стоит денег за каждое сообщение).
3. Запомнить **e-mail/пароль** аккаунта — это `ESKIZ_EMAIL` / `ESKIZ_PASSWORD`.

### 4.2 Sender ID и модерация текста (КЛЮЧЕВОЙ шаг)

> ⚠️ Это место, где production-отправка ломается чаще всего. Eskiz **не даёт
> слать произвольный текст** с боевого sender'а — и текст, и отправитель проходят
> модерацию.

1. **Sender ID (nickname).** Тестовый `4546` шлёт только тест-сообщения. Для
   боевой отправки нужно завести и одобрить свой sender (например, `Avino` или
   выданный короткий номер) — заявка в кабинете/через менеджера Eskiz. Одобренное
   значение → `ESKIZ_FROM`.
2. **Шаблон сообщения.** Подать на модерацию **точный текст OTP** с плейсхолдером:
   `Avino: kirish uchun kod {code}. Hech kimga aytmang.`
   (формат плейсхолдера уточнить у Eskiz — обычно `%w` / `{code}`). Текст в коде
   (`sms.service.ts → sendOtp`) должен совпадать с одобренным **дословно**.
3. Дождаться статуса «одобрено». До одобрения отправка боевого текста вернёт
   ошибку — в наших логах это `Eskiz send failed: <code> — <reason>` (reason от
   Eskiz прямо назовёт причину: текст не соответствует шаблону / sender не одобрен).

### 4.3 Заполнить env

Локально — `apps/api/.env`; на сервере — `deploy/prod.env` (или секреты
платформы):

```bash
# ── Eskiz.uz (SMS) ──
ESKIZ_EMAIL=<eskiz-account-email>
ESKIZ_PASSWORD=<eskiz-account-password>
ESKIZ_BASE_URL=https://notify.eskiz.uz/api
ESKIZ_FROM=<approved-sender>   # после одобрения; до этого тестовый 4546
```

### 4.4 Передеплоить API

Перезапустить `apps/api`, чтобы конфиг перечитался. Проверить на старте, что
SMS-секции в логе нет предупреждения «provider is not configured».

## 5. Приёмка (smoke-тест после деплоя)

1. Запросить OTP по SMS:

   ```bash
   curl -sS -X POST "$API/api/v1/auth/otp/request" \
     -H 'Content-Type: application/json' \
     -d '{"channel":"SMS","destination":"+99890XXXXXXX"}'
   # ожидаемо: 200 + { request_id, channel:"SMS", expires_in, resend_after }
   ```

2. В логах API ожидаемо:
   `Eskiz SMS accepted: id=<id> status=waiting to=998****XXXX`.
3. На реальный номер приходит SMS с кодом. Завершить flow `verify`:

   ```bash
   curl -sS -X POST "$API/api/v1/auth/otp/verify" \
     -H 'Content-Type: application/json' \
     -d '{"channel":"SMS","destination":"+99890XXXXXXX","code":"<из-SMS>"}'
   ```

   Ожидаемо: выдача токенов (ADR-0014).
4. ✅ SMS пришла + verify дал токены → интеграция боевая.

> Если SMS **не пришла**, а лог показал `accepted` — это уже на стороне Eskiz
> (модерация/баланс/оператор): см. §6–§7. Если в логе `Eskiz send failed` —
> reason назовёт причину прямо.

## 6. Eskiz-специфика и подводные камни

- **Номер без `+`.** Eskiz ждёт `mobile_phone` в формате `998901234567`. Код сам
  срезает ведущий `+` (`phone.replace(/^\+/, '')`) — на вход в `SmsService`
  даём E.164 (`+998…`).
- **Токен ~30 дней, кэш в памяти.** Несколько инстансов API логинятся каждый
  сам — для MVP приемлемо (ADR-0012). На `401` код сбрасывает токен, релогинится
  и повторяет отправку **один раз**; второй `401` → `Eskiz SMS delivery failed`.
- **Тестовый режим `4546`.** Пока sender/шаблон не одобрены, реально доходят
  только тест-сообщения Eskiz. «Тишина» при `accepted`-логе — почти всегда это.
- **Модерация — не одноразовая.** Любое изменение текста OTP в коде требует
  **повторной** модерации в Eskiz, иначе боевая отправка начнёт падать.
- **Баланс.** Закончились деньги → отправка падает. Проверить баланс можно
  напрямую (вне приложения):

  ```bash
  TOKEN=$(curl -sS -X POST "$ESKIZ_BASE_URL/auth/login" \
    -d "email=$ESKIZ_EMAIL&password=$ESKIZ_PASSWORD" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])')
  curl -sS "$ESKIZ_BASE_URL/user/get-limit" -H "Authorization: Bearer $TOKEN"
  ```

  (Программная проверка баланса/`callback_url` статуса доставки/batch-send в коде
  **намеренно не реализованы** — см. ADR-0089, follow-ups.)

## 7. Troubleshooting

| Симптом (лог / поведение) | Вероятная причина | Что делать |
|---|---|---|
| `provider is not configured` | нет `ESKIZ_EMAIL`/`ESKIZ_PASSWORD` | заполнить env, передеплоить (§4.3) |
| `[DEV SMS → …]` вместо отправки | dev-режим без кредов | это норма для локали; для боевой — задать креды |
| `Eskiz auth failed: 401/4xx` | неверные e-mail/пароль | проверить креды Eskiz |
| `Eskiz send failed: … — <reason про шаблон>` | текст не прошёл модерацию | подать/исправить шаблон (§4.2), привести код к одобренному тексту |
| `Eskiz send failed: … — <reason про sender>` | sender не одобрен | одобрить `ESKIZ_FROM`, до этого — `4546` |
| лог `accepted`, но SMS нет | тест-режим / баланс / оператор | проверить одобрение (§4.2), баланс (§6), номер |
| `Eskiz SMS delivery failed` | дважды `401` подряд | проблема с токеном/аккаунтом на стороне Eskiz |
