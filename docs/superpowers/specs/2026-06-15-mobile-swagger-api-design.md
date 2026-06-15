# Дизайн: Swagger/OpenAPI для подключения мобильного приложения

- **Дата:** 2026-06-15
- **Статус:** утверждён (дизайн), ожидает плана реализации
- **Область:** `apps/api` (NestJS 10)
- **Цель:** отдать мобильной команде документированный, типизируемый контракт API
  — живой Swagger UI для исследования + экспортируемый `openapi.json` под codegen
  типобезопасного клиента.

## Контекст

API — это **NestJS 10** на Express-адаптере (не голый Express). Уже есть всё, на что
OpenAPI ложится без переделок:

- глобальный префикс `api` + URI-версионирование → пути `/api/v1/...` (`main.ts`);
- глобальный `ValidationPipe` поверх `class-validator`-DTO;
- единый error-envelope через `AllExceptionsFilter` (см. `docs/API.md` §4);
- JWT-аутентификация: OTP (`/auth/otp/request` → `/auth/otp/verify`), Google-login,
  `refresh`, `logout`; защита через `JwtAuthGuard`.

Контроллеры делятся на:

- **публичные/клиентские:** `auth`, `listings`, `search`, `geo`, `favorites`,
  `saved-searches`, `chat`, `complaints`, `notifications`, `promotions`,
  `listing-media`, `translations`, `users`, `health`;
- **админские (internal):** `admin/*` (9 контроллеров), `admin-complaints`, `roles`.

Следствие: «отдать Swagger» — задача на **проводку**, а не на написание документации.

## Утверждённые решения

1. **Охват — два документа:** публичный (для мобайла, без `admin/*`) и полный internal.
2. **Формат выдачи — оба:** живой Swagger UI **и** экспорт `openapi.json` для codegen.
3. **Экспозиция — гейтинг:** публичный UI за env-флагом; internal-UI всегда за
   HTTP Basic-auth; `openapi.json` — build-артефакт. Никаких дефолтов для секретов.

## Выбор подхода (генератор)

Используем **`@nestjs/swagger` + CLI-плагин**. Плагин интроспектит `class-validator`-DTO
и TS-типы — спека генерируется из кода и не дрейфует. Отклонены: ручной OpenAPI YAML
и генерация из `docs/API.md` (двойное сопровождение, дрейф); spec-first со стабами
(код уже написан).

## Архитектура

Новый модуль `apps/api/src/common/openapi/` с хелпером `setupSwagger(app, config)`,
вызываемым из `main.ts` **после** `setGlobalPrefix` / `enableVersioning`, чтобы пути
отрендерились как `/api/v1/...`.

Точки монтирования:

| Путь | Назначение | Защита |
|------|------------|--------|
| `GET /api/docs` | публичный Swagger UI | env-флаг `SWAGGER_ENABLED` |
| `GET /api/docs-json` | публичный raw OpenAPI | env-флаг |
| `GET /api/docs/internal` | полный internal UI | env-флаг **+** Basic-auth |
| `GET /api/docs/internal-json` | internal raw OpenAPI | env-флаг **+** Basic-auth |

Если `SWAGGER_ENABLED=false` — модуль не монтируется вовсе (нулевой attack surface
на проде по умолчанию).

## Два документа через `include`

Один базовый `DocumentBuilder` (title/description/version/`addBearerAuth()`), два
`SwaggerModule.createDocument`:

- **Public:** `include: [AuthModule, ListingsModule, SearchModule, GeoModule,
  FavoritesModule, SavedSearchesModule, ChatModule, ComplaintsModule,
  NotificationsModule, PromotionsModule, ListingMediaModule, TranslationsModule,
  UsersModule, HealthModule]` — `admin/*` исключён.
- **Internal:** без `include` (все модули, в т.ч. `admin/*`, `roles`,
  `admin-complaints`).

## Аутентификация и error-envelope в спеке

- `.addBearerAuth()` в `DocumentBuilder`; эндпоинты под `@UseGuards(JwtAuthGuard)`
  помечаются `@ApiBearerAuth()`.
- Документируется поток аутентификации: `otp/request` → `otp/verify` →
  `{accessToken, refreshToken}` → `refresh` / `logout`; Google-login — отдельная
  операция.
- Единый error-envelope (`AllExceptionsFilter`, `docs/API.md` §4) выносится в
  переиспользуемую схему `ErrorResponse`; вешается `@ApiResponse` на типовые коды
  400/401/403/404/422/429/500.

## Response-схемы — фазирование (главная трудозатратная часть)

Контроллеры сейчас возвращают **TS-интерфейсы** сервисов (`RefreshResult`,
`VerifyOtpResult`, …). Request-DTO попадают в спеку «бесплатно» (классы с
`class-validator`), а **ответы** без аннотаций дают пустые схемы. Поэтому:

- **Фаза 1 — рабочая спека (один PR):** проводка `setupSwagger`, два документа,
  `addBearerAuth` + `@ApiBearerAuth`, схема `ErrorResponse` + коды ошибок, все
  request-DTO и query-параметры, экспорт `openapi.json`, гейтинг + ENV, тесты.
  Ответы — generic-обёртка / `additionalProperties`. Мобайл уже получает все пути,
  параметры, тела, коды и авторизацию; codegen работает (типы ответов «слабые»).
- **Фаза 2 — полная типизация (отдельный поток):** response-DTO классы +
  `@ApiOkResponse({ type })` для горячих клиентских эндпоинтов (`listings`, `search`,
  `auth`, `chat`), затем остальное. Документируется keyset-пагинация (`meta`/cursor)
  на `search`.

## Экспорт `openapi.json` + drift-check

- Скрипт `openapi:export` (bootstrap без `app.listen()`: строит оба документа и пишет
  `apps/api/openapi.public.json` + `apps/api/openapi.internal.json`).
- CI-шаг регенерит спеку и **падает** при расхождении с закоммиченным файлом — спека
  гарантированно не дрейфует от кода.
- `openapi.public.json` — артефакт, который забирает мобайл-команда под codegen
  (orval / openapi-generator / swagger-typescript-api). Внутренний выбор кодогенератора
  — на стороне мобайл-команды.

## Безопасность / гейтинг

- Мастер-флаг `SWAGGER_ENABLED` (по умолчанию `true` на staging/dev; на prod — через
  ENV по решению).
- `/api/docs/internal*` **всегда** под `express-basic-auth`; креды из
  `SWAGGER_USER` / `SWAGGER_PASS` (ENV, без дефолтов).
- Новые переменные добавляются в `docs/ENV.md`.

## Тестирование

- e2e (jest int):
  - `GET /api/docs-json` → 200 и валидный OpenAPI; `paths` содержат `/api/v1/...`;
  - admin-пути **отсутствуют** в публичном документе и **присутствуют** в internal;
  - `GET /api/docs/internal` без креды → 401;
  - при `SWAGGER_ENABLED=false` пути доков → 404.
- CI: валидация спеки (`@redocly/cli lint` либо `swagger-cli validate`).

## Вне области (YAGNI)

- Не пишем SDK/клиент за мобайл-команду.
- Не тащим Redoc/доп. порталы документации.
- Не трогаем сами роуты и бизнес-логику.
- Без webhooks / async-API.

## Влияние

- Новые файлы: `apps/api/src/common/openapi/*`, скрипт экспорта, два `openapi.*.json`.
- Правки: `apps/api/src/main.ts` (вызов `setupSwagger`), `nest-cli.json` (CLI-плагин),
  `apps/api/package.json` (зависимости + скрипт), `docs/ENV.md`, CI-конфиг.
- Новые зависимости: `@nestjs/swagger`, `express-basic-auth`; dev — линтер спеки.
- Бизнес-логика и существующие контракты роутов не меняются.
