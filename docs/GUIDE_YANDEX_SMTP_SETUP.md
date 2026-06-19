# GUIDE — SMTP / Email через Yandex 360 (prod-готовность)

> Как устроена email-подсистема Avino и как настроить **реальную** отправку
> через **Yandex 360 для бизнеса** на домене `avino.uz` с доставкой в инбокс
> (SPF/DKIM/DMARC), плюс процедура live-verify.
>
> Связано: ADR-0037 (email queue), ADR-0038 (saved-search alerts),
> `docs/ENV.md` §13, `docs/ARCHITECTURE.md` §23. Аналог: `docs/GUIDE_S3.md`.

---

## 1. Как это работает в коде (фактически)

Отправка асинхронная, через очередь — не прямой вызов SMTP из эндпоинта:

```
триггер (OTP / saved-search digest)
  → EmailService.sendEmail()
    → EmailQueue.enqueueSendEmail()      ← job в Redis (BullMQ "email_queue")
      → EmailWorker (тот же процесс api, OnModuleInit)
        → EmailSender.deliver()
          → nodemailer createTransport(...).sendMail(...)
```

Ключевые файлы:

| Что | Файл |
|---|---|
| Транспорт (nodemailer) | `apps/api/src/email/email-sender.service.ts` |
| Воркер очереди | `apps/api/src/email/email.worker.ts` |
| Producer очереди | `apps/api/src/queues/email.queue.ts` |
| Высокоуровневый API (sendOtp/sendEmail) | `apps/api/src/email/email.service.ts` |
| Конфиг (`mail.*`) | `apps/api/src/config/configuration.ts` |
| Валидация env | `apps/api/src/config/env.validation.ts` |

- Библиотека: **nodemailer** (`apps/api/package.json`).
- Воркер стартует через `OnModuleInit` **в том же процессе API** — отдельного
  worker-контейнера в `docker-compose.yml` нет. Concurrency=2, retry=3 c
  экспоненциальным backoff (5s → 25s → 125s).
- Конфиг читается в **runtime** через `ConfigService` → для смены SMTP-настроек
  достаточно перезапуска контейнера `api`, **пересборка не нужна** (в отличие от
  клиентских `NEXT_PUBLIC_*`, которые «пекутся» в билд).

### Три ветки поведения (`email-sender.service.ts`)

```ts
if (!host) {
  if (env !== 'production') { logger.warn(`[DEV EMAIL → ${to}] ...`); return SKIPPED_DEV }
  logger.warn(`SMTP is not configured; ... NOT sent`);  return SKIPPED_NOT_CONFIGURED
}
// host есть → transport.sendMail(...) → SENT (или throw → BullMQ retry)
```

| Ситуация | Поведение |
|---|---|
| **Dev без `SMTP_HOST`** | Письмо НЕ уходит. Текст пишется в лог `[DEV EMAIL → …]`. Job ОК, ретраев нет. |
| **Prod с `SMTP_*`** | Реальная отправка через nodemailer. Ошибка → 3 ретрая. |
| **Prod без `SMTP_HOST`** | **Тихий пропуск** — одна warning-строка, ретраев нет. Пользователь письмо не получит, ошибки нигде не видно. |

### Что реально шлёт письма сейчас

- ✅ **OTP-код для входа** — `auth/otp.service.ts` → `sendOtp()`, прямой enqueue. Покрыто unit-тестами.
- ✅ **Дайджест по сохранённому поиску** — `saved-searches/saved-search-alert.service.ts`, одно письмо на поиск за прогон, best-effort (ошибка enqueue логируется, watermark всё равно двигается).
- ⚠️ **Модерация / промо** — создают запись `notification` в БД с `channel=EMAIL`, но **воркера, который превратит их в письмо, в коде ещё НЕТ** (см. §6 «Незакрытое»). Эти письма сейчас НЕ доставляются.
- ℹ️ Чат — `channel=IN_APP`, не email.

> ⚠️ **Главное:** код полностью написан и покрыт unit-тестами, но nodemailer в
> тестах **замокан** — реальный SMTP-хендшейк ни разу не выполнялся вживую.
> Этот гайд закрывает именно live-verify (как было с Eskiz SMS).

---

## 2. Что нужно от владельца (Yandex 360, уровень «как прод»)

### Шаг 1 — Yandex 360 для бизнеса

1. Завести организацию в Yandex 360 для бизнеса (бесплатного тарифа хватит для теста).
2. **Добавить домен `avino.uz`** и подтвердить владение — Yandex выдаст проверочную TXT-запись (или HTML-файл/meta), положить её в DNS.
3. **Создать ящик `no-reply@avino.uz`** — именно этот адрес (в коде `SMTP_FROM` по дефолту `no-reply@avino.uz`).
   ⚠️ У Yandex **From обязан совпадать с авторизованным ящиком** (`SMTP_USER`), иначе письмо отклонят. Если ящик другой — выставить тот же адрес и в `SMTP_USER`, и в `SMTP_FROM`.

### Шаг 2 — DNS на `avino.uz` (это и есть «как прод»)

Точные значения Yandex покажет в админке после добавления домена. Канонично:

| Тип | Хост | Значение | Прио |
|---|---|---|---|
| MX | `@` | `mx.yandex.net` | 10 |
| TXT (SPF) | `@` | `v=spf1 redirect=_spf.yandex.net` | — |
| TXT (DKIM) | `mail._domainkey` | *(ключ из админки Yandex)* | — |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:postmaster@avino.uz` | — |

- **DKIM**: если домен делегирован на DNS Yandex — подпись настраивается автоматически; если DNS у вас/хостера — берёте публичный ключ из раздела «DKIM-подпись» в админке и добавляете TXT вручную (селектор `mail`).
- **DMARC** начинаем с `p=none` (мониторинг), ужесточаем позже (`quarantine` → `reject`).
- Пропагация DNS — до 72ч, обычно минуты–часы.

### Шаг 3 — пароль приложения (для SMTP)

1. В настройках ящика включить **доступ по IMAP/SMTP** + «Пароли приложений и OAuth-токены».
2. В Yandex ID создать **пароль приложения** для «Почта» (основной пароль аккаунта для SMTP не подойдёт).

### Шаг 4 — креды для теста

Передавать через `! <команда>` в терминале сессии (или вписать в `.env`/compose контейнера `api` самостоятельно) — **значения никогда не печатать в чат/логи**:

```
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465                  # SSL; для STARTTLS — 587
SMTP_USER=no-reply@avino.uz    # полный адрес
SMTP_PASSWORD=<пароль приложения>
SMTP_FROM=no-reply@avino.uz    # = SMTP_USER
```
\+ **ящик-получатель** для проверки доставки.

---

## 3. Процедура live-verify (на стороне агента/разработчика)

1. Прописать `SMTP_*` в окружение контейнера `api` (compose env / `.env`), **перезапустить `api`** (пересборка не нужна — runtime config).
2. Дёрнуть `POST /api/v1/auth/otp/request` на тестовый email.
3. В логе воркера убедиться:
   ```
   Email job <id> → <to>: SENT (messageId=...)
   ```
   (`SKIPPED_DEV` / `SKIPPED_NOT_CONFIGURED` = SMTP не подхватился — проверить env и рестарт.)
4. **Проверить прод-доставляемость**: отправить на [mail-tester.com](https://www.mail-tester.com) (он выдаёт временный адрес) → получить оценку и подтверждение `SPF=pass / DKIM=pass / DMARC=pass`.
5. Проверить, что письмо во «Входящих» получателя, а не в «Спам». В заголовках письма («показать оригинал») — `dkim=pass`, `spf=pass`, `dmarc=pass`.

### Возможные ошибки

| Симптом | Причина / фикс |
|---|---|
| Лог `SKIPPED_NOT_CONFIGURED` в prod | `SMTP_HOST` не прокинут в контейнер или не было рестарта |
| `535 Authentication failed` | Не пароль приложения (используется основной), или не включён доступ по SMTP в ящике |
| `Sender address rejected` / From переписан | `SMTP_FROM` ≠ `SMTP_USER` — у Yandex From обязан совпадать с авторизованным ящиком |
| Письмо в спаме | DNS ещё не пропагировался, или нет DKIM/SPF; проверить через mail-tester |
| Коннект висит/таймаут | Неверный порт/`secure` (465↔587), фаервол VPS блокирует исходящий 465/587 |

---

## 4. Прод-деплой (после успешного live-verify)

- Вписать `SMTP_HOST/PORT/USER/PASSWORD/FROM` в production env (deploy secrets), не в репозиторий.
- ⚠️ В `apps/api/src/config/env.validation.ts` `SMTP_*` помечены `@IsOptional()` —
  приложение **стартует без них** и тихо уходит в `SKIPPED_NOT_CONFIGURED`. После
  настройки прод-SMTP стоит добавить boot-проверку/алерт, чтобы мисконфиг не был
  «тихим». (`docs/ENV.md` §13 помечает их `Req? yes` — это намерение, не хард-валидация.)
- Нет `.env.example` с SMTP-секцией (ENV.md на него ссылается) — при оформлении добавить.

---

## 5. Незакрытое / TODO (по состоянию на 2026-06-19)

1. **Модерационные и промо-письма не доставляются** — `moderation.service.ts` /
   `notifications.service.ts` создают `notification` с `channel=EMAIL`, но воркера,
   который читает PENDING-уведомления и кладёт их в `email_queue`, ещё нет
   (комментарий в коде: «BullMQ-воркер подберёт и отправит EMAIL позже»).
2. **Нет HTML-шаблонов / i18n** — тексты захардкожены по-русски, поле `html` в
   `SendEmailJobData` не используется.
3. **Нет верификации email-адреса пользователя** (confirm-link) — опечатка → тихий пропуск отправки.
4. **Нет boot-health-check SMTP** — недоступный хост/неверные креды вскрываются
   только при первом job, и то лишь в логах воркера (не в HTTP-ответе).
5. **Saved-search digest: ошибка enqueue глотается** — при недоступном Redis
   watermark всё равно двигается, письмо теряется без ретрая.

---

## 6. Источники (Yandex 360)

- [Почтовые клиенты (SMTP)](https://yandex.ru/support/yandex-360/business/mail/ru/mail-clients/others)
- [Шифрование / порты SSL-TLS](https://yandex.ru/support/yandex-360/customers/mail/ru/mail-clients/ssl)
- [MX-запись](https://yandex.com/support/business/dns/mx.html)
- [DKIM-подпись](https://yandex.com/support/business/dns/dkim.html)
- [Настройка DNS-записей](https://yandex.com/support/business/dns-editor.html)
