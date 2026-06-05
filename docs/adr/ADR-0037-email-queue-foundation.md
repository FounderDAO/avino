# ADR-0037 — Email delivery queue foundation: BullMQ email_queue, nodemailer SMTP transport, async OTP

## Status

Accepted

## Date

2026-06-05

## Context

TASK-101 (milestone M10) добавляет фундамент асинхронной доставки email
(acceptance: `email_queue` exists, SMTP config exists, email job can be queued,
email delivery result is logged).

Контекст уже заложен предыдущими задачами:

- `EmailService` (TASK-041) существует как узкая абстракция (`sendOtp`), но
  доставка была заглушкой: письмо «conceptually queued» — реально не уходило.
  В комментарии прямо помечено, что реальная SMTP-доставка через `email_queue` —
  «отдельная задача». TASK-101 и есть эта задача.
- SMTP-конфигурация (`SMTP_HOST/PORT/USER/PASSWORD/FROM`) уже заведена в
  `configuration.ts` (`mailConfig`), `env.validation.ts` и `.env.example`
  (ENV.md §13). То есть «SMTP config exists» выполнено ранее — нужно его
  использовать.
- BullMQ-инфраструктура отлажена на переводе (TASK-071, ADR-0025) и истечении
  промо (TASK-123, ADR-0035): продюсеры живут в глобальном `QueuesModule`,
  консьюмеры (воркеры) — в доменных модулях; выделенные Redis-подключения
  (`buildBullConnection`, `maxRetriesPerRequest: null`); ретрай через
  `attempts` + exponential backoff.
- ARCHITECTURE §23 фиксирует имена: очередь `email_queue`, джоба `send_email`.

Открытые вопросы этой задачи:

1. **SMTP-клиент.** В отличие от Eskiz SMS (HTTP через глобальный `fetch`,
   ADR-0025) SMTP — это TCP/STARTTLS-протокол, для которого нет встроенного
   Node-клиента. Нужна библиотека или ручная реализация протокола.
2. **Где логируется результат доставки.** Что значит «delivery result is logged».
3. **Остаётся ли OTP синхронным.** `OtpService` сейчас вызывает
   `email.sendOtp(...)` и ждёт; переход на очередь делает доставку асинхронной.

## Decision

1. **nodemailer как SMTP-транспорт.** Добавлена зависимость `nodemailer`
   (+ `@types/nodemailer`) в `apps/api`. Ручная реализация SMTP/STARTTLS
   небезопасна и избыточна, а `fetch`-подход (как у Eskiz) к SMTP неприменим —
   это не HTTP. nodemailer — канонический, provider-agnostic SMTP-клиент, что
   согласуется с требованием CLAUDE.md §3 «provider-agnostic SMTP». Это **не**
   смена внешнего сервиса из запретного списка CLAUDE.md §13 (Eskiz/Yandex/
   PostGIS) — выбор транспортной библиотеки в рамках уже утверждённого SMTP.

2. **Разделение продюсер / транспорт / консьюмер** (как у перевода):
   - `EmailQueue` (продюсер, глобальный `QueuesModule`) — `enqueueSendEmail(data)`
     кладёт джобу `send_email` с `attempts` (`EMAIL_QUEUE_ATTEMPTS`, дефолт 3) и
     exponential backoff. `jobId` **не** задаётся: два письма на один адрес
     (например повторный OTP) — разные задачи и не должны дедуплицироваться
     (в отличие от перевода, где `jobId = translate:<listingId>` идемпотентен).
   - `EmailSender` (транспорт, `EmailModule`) — выполняет реальный
     `transporter.sendMail(...)`; transporter создаётся лениво и кэшируется.
   - `EmailWorker` (консьюмер, `EmailModule`) — тонкий BullMQ-воркер
     `email_queue`, делегирует `EmailSender.deliver` и **логирует результат**
     (см. п.3). Concurrency — `EMAIL_QUEUE_CONCURRENCY` (дефолт 2). Поднимается в
     API-процессе (MVP, как `TranslationWorker`).

3. **Логирование результата доставки = структурный итог + лог воркера.**
   `EmailSender.deliver` возвращает `EmailDeliveryResult { status, to, subject,
   messageId? }`, который воркер пишет в лог (`Email job <id> → <to>: <status>`).
   Три ветки по конфигурации (повторяют поведение `SmsService`):
   - SMTP настроен → реальная отправка, `status = SENT` + `messageId`;
   - SMTP не настроен, dev → письмо логируется, `status = SKIPPED_DEV` (чтобы
     пройти flow request → verify локально без внешнего провайдера);
   - SMTP не настроен, production → `status = SKIPPED_NOT_CONFIGURED` (НЕ
     отправлено).
   Реальный сбой транспорта (`sendMail` бросает) **пробрасывается** → BullMQ
   ретраит по `attempts`/backoff. «Не настроено» исключением не считается —
   ретраить бессмысленно, возвращается результат.

4. **OTP становится асинхронным, контракт `sendOtp` неизменен.** `EmailService`
   превращён в фасад: `sendOtp` / `sendEmail` теперь только ставят джобу в
   `EmailQueue`. Сигнатура `sendOtp(email, code)` не изменилась, поэтому
   `OtpService`/`AuthModule` не затронуты. Задержка очереди для OTP приемлема и
   соответствует архитектуре (email_queue — заданный дизайн доставки).

## Consequences

Positive:
- Acceptance выполнены: `email_queue` + `send_email` существуют, письмо реально
  ставится в очередь, результат доставки логируется, реальная SMTP-доставка
  работает (не заглушка).
- Переиспользован отлаженный BullMQ-паттерн (выделенное подключение, ретрай,
  воркер в доменном модуле) — никакого нового инфраструктурного кода.
- Узкий контракт `EmailService` сохранён: переход на очередь прозрачен для
  вызывающих; будущие уведомления (saved-search alerts TASK-102, chat TASK-111)
  ставят письма через тот же фасад.
- Dev-режим работает без SMTP (письмо в лог) — локальный OTP-flow не сломан.

Negative / trade-offs:
- Новая зависимость `nodemailer` (+ types) и рост `pnpm-lock.yaml`. Оправдано:
  для SMTP нет `fetch`-эквивалента.
- OTP-доставка теперь асинхронна — между запросом кода и реальной отправкой
  появляется лаг очереди (для MVP несущественно; минимизируется concurrency).
- Воркер поднят в API-процессе (как перевод/промо); вынос в отдельный процесс —
  будущая операционная задача, вне скоупа.
- В production без `SMTP_HOST` письма молча не уходят (`SKIPPED_NOT_CONFIGURED`,
  только лог) — намеренно, чтобы отсутствие конфигурации не валило очередь
  бесконечными ретраями. SMTP_* помечены Req=yes в ENV.md §13.
- Доставка контентных писем (subject/body уведомлений) пока ограничена OTP;
  рендер тел уведомлений из `notifications` — задача TASK-102 и далее.

## Related files

- apps/api/src/queues/queue.constants.ts (EMAIL_QUEUE_NAME, SEND_EMAIL_JOB, SendEmailJobData)
- apps/api/src/queues/email.queue.ts (+ spec)
- apps/api/src/queues/queues.module.ts, index.ts
- apps/api/src/email/email-sender.service.ts (+ spec)
- apps/api/src/email/email.worker.ts
- apps/api/src/email/email.service.ts (+ spec), email.module.ts, index.ts
- apps/api/src/config/configuration.ts, env.validation.ts (mail.queue* / EMAIL_QUEUE_*)
- apps/api/package.json (nodemailer, @types/nodemailer)
- .env.example, docs/ENV.md §13, docs/ARCHITECTURE.md §23

## Related task

- TASK-101
