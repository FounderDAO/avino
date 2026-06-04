# ADR-0025 — Listing auto-translation queue and provider abstraction

## Status

Accepted

## Date

2026-06-04

## Context

TASK-070 (ADR-0024) дал синхронный слой переводов: при создании объявления
пишется только авторская строка на `original_language` (source=USER). Остальные
языки (UZ/RU/EN) должны появляться автоматически **после** того, как объявление
проходит moderation queue и становится `ACTIVE` (CLAUDE.md §9, ADR-005). Это и
есть scope TASK-071.

Ограничения и факты:

- Перевод — внешний сетевой вызов (Google/Yandex), его нельзя выполнять в
  обработчике запроса (acceptance: «no direct translation call blocks listing
  create request»). Нужна фоновая очередь.
- BullMQ + Redis уже выбраны как инфраструктура очередей (ARCHITECTURE §23);
  `bullmq` и `ioredis` уже в зависимостях. Пакет `@nestjs/bullmq` не установлен.
- `RedisService` (ADR / TASK-041) уже задаёт паттерн «тонкая ручная обёртка над
  ioredis с lifecycle-хуками NestJS», а `SmsService`/`EmailService` — паттерн
  «реальный HTTP-провайдер с мягкой деградацией без кредов».
- `ModerationService.changeStatus` (TASK-053) уже помечен как место, откуда
  APPROVE→ACTIVE «должен инициировать авто-перевод» — естественный триггер.
- Модель `ListingTranslation` уникальна по `(listing_id, language)`; enum
  `TranslationSource` = USER | GOOGLE | YANDEX.

## Decision

1. **Очередь `translation_queue` на BullMQ, без `@nestjs/bullmq`.** Используем
   «сырой» `bullmq`, обёрнутый в провайдеры NestJS вручную (как `RedisService`),
   чтобы не вводить новую зависимость и не плодить магию. Подключение строится из
   `REDIS_URL` как **объект опций** (`buildBullConnection`), а не инстанс ioredis —
   это обходит несовпадение версий ioredis между приложением (5.11) и бандлом
   BullMQ (5.10).

2. **Продюсер — `TranslationQueue` (глобальный `QueuesModule`).**
   `enqueueListingTranslation(listingId)` ставит джобу `translate_listing` с
   опциями ретрая: `attempts` (env `TRANSLATE_QUEUE_ATTEMPTS`, по умолчанию 3) +
   экспоненциальный backoff (acceptance: «failed jobs can retry»). `jobId =
   translate:<listingId>` дедуплицирует параллельные постановки по одному
   листингу. `QueuesModule` — `@Global` (как `RedisModule`), так что
   `ModerationService` инжектит продюсер без повторного импорта.

3. **Абстракция провайдера.** Интерфейс `TranslationProvider`
   (`translate(text, from, to)` + `source`) с реализациями
   `YandexTranslationProvider` и `GoogleTranslationProvider`. Конкретный провайдер
   выбирается по `TRANSLATE_PROVIDER` фабрикой `createTranslationProvider`
   (DI-токен `TRANSLATION_PROVIDER`); по умолчанию — Yandex (MVP, CLAUDE.md §13).
   HTTP — через глобальный `fetch` (Node ≥ 20, без новой зависимости). Без
   `TRANSLATE_API_KEY` провайдер **мягко деградирует**: возвращает исходный текст и
   логирует предупреждение (как `SmsService`/`EmailService` в dev) — flow проходит
   без внешней зависимости, пустой ключ не плодит ретраи.

4. **Воркер = транспорт + чистая логика.** `TranslationWorker` (BullMQ `Worker`,
   concurrency из `TRANSLATE_QUEUE_CONCURRENCY`) — тонкий консьюмер, делегирующий
   всё `ListingAutoTranslator.run(listingId)`. Разделение сделано ради
   юнит-тестируемости: вся логика покрыта тестами без Redis. `run`:
   - грузит листинг и **авторскую строку именно на `original_language`** (а не
     первую попавшуюся — важно для ретраев/ре-публикации, когда auto-строки уже
     есть);
   - мягко пропускает, если листинг исчез, больше не `ACTIVE` или нет авторской
     строки (устаревшая джоба не падает);
   - переводит `title`/`description`/`address_note`/`features_text` на остальные
     языки и пишет их через `upsert` по `(listing_id, language)` с
     `source = <провайдер>` (GOOGLE/YANDEX) и `is_auto_translated = true`.
     Idempotent: повторный запуск безопасен. Для `null`-полей провайдер не
     вызывается.

5. **Триггер — `ModerationService.changeStatus` после коммита.** На APPROVE→ACTIVE
   (после успешной транзакции смены статуса) ставится джоба перевода. Постановка —
   единичный insert в Redis, не блокирующий перевод; её сбой **логируется, но не
   пробрасывается** (листинг уже `ACTIVE`, джобу можно ре-инициировать) — ответ
   модерации не должен падать из-за Redis. Путь создания листинга не трогается,
   поэтому «no direct translation call blocks create» выполняется по построению.

## Consequences

Positive:

- Перевод полностью асинхронный: ни create, ни moderation-ответ не ждут внешний
  API. Ретраи и backoff — из коробки BullMQ.
- Абстракция провайдера: смена Google↔Yandex — это env, а не код; логика воркера
  от транспорта перевода не зависит.
- `ListingAutoTranslator` (вся бизнес-логика) покрыт юнит-тестами без Redis;
  транспорт (`TranslationQueue`/`TranslationWorker`) тонкий.
- Идемпотентность через `upsert` + `jobId`-дедуп делает ретраи и ре-публикацию
  безопасными.

Negative / trade-offs:

- Воркер поднимается в одном процессе с API (для MVP). Выделение в отдельный
  процесс/деплой — будущая задача; код к этому готов (воркер изолирован).
- Без `TRANSLATE_API_KEY` «переводы» — копия оригинала (мягкая деградация). Это
  осознанный dev-режим, а не бизнес-перевод; в проде ключ обязателен.
- Качество машинного перевода не оценивается; ручная правка/ре-генерация при
  изменении авторского текста — вне scope (отдельная задача).
- `bullmq` принимает опции подключения объектом (`buildBullConnection`), а не
  общий `RedisService` — два независимых соединения Redis (продюсер/воркер), как
  и рекомендует BullMQ.

## Related files

- apps/api/src/queues/queues.module.ts
- apps/api/src/queues/translation.queue.ts
- apps/api/src/queues/translation.queue.spec.ts
- apps/api/src/queues/queue.constants.ts
- apps/api/src/queues/bullmq-connection.ts
- apps/api/src/queues/index.ts
- apps/api/src/translations/providers/translation-provider.interface.ts
- apps/api/src/translations/providers/yandex.provider.ts
- apps/api/src/translations/providers/google.provider.ts
- apps/api/src/translations/providers/translation-provider.factory.ts
- apps/api/src/translations/providers/translation-provider.factory.spec.ts
- apps/api/src/translations/providers/translation-provider.spec.ts
- apps/api/src/translations/providers/index.ts
- apps/api/src/translations/listing-auto-translator.service.ts
- apps/api/src/translations/listing-auto-translator.service.spec.ts
- apps/api/src/translations/translation.worker.ts
- apps/api/src/translations/translations.module.ts
- apps/api/src/moderation/moderation.service.ts
- apps/api/src/moderation/moderation.service.spec.ts
- apps/api/src/config/configuration.ts
- apps/api/src/config/env.validation.ts
- apps/api/src/app.module.ts
- .env.example

## Related task

- TASK-071 (depends on TASK-070, TASK-011)
