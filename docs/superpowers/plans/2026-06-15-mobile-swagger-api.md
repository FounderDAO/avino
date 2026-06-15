# Mobile Swagger/OpenAPI — Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the NestJS API to a mobile app team via two gated OpenAPI documents (public + internal) — a live Swagger UI and an exported `openapi.json` artifact for client codegen — without touching any controller or business logic.

**Architecture:** A new `apps/api/src/common/openapi/` module builds two OpenAPI documents from the existing controllers/DTOs using `@nestjs/swagger`. The **public** document is restricted by module `include` **and** pruned to an explicit path allowlist (so admin/roles can never leak). The **internal** document covers everything and is mounted behind HTTP Basic-auth. A standalone script regenerates committed `openapi.*.json` files; CI fails on drift.

**Tech Stack:** NestJS 10 (Express adapter), `@nestjs/swagger` ^7, `express-basic-auth`, `class-validator` DTOs, Jest (unit), pnpm workspace.

**Source spec:** `docs/superpowers/specs/2026-06-15-mobile-swagger-api-design.md`

**Phase boundary (explicit):** Phase 1 = wiring, document split, bearer scheme, error-envelope schema, export + drift-check, gating. **No controller edits.** Per-route `@ApiBearerAuth()` and fully-typed response DTOs are **Phase 2** (separate plan). Until Phase 2, response bodies in the spec are loosely typed and endpoints are not individually marked as secured (the global bearer scheme still powers the Swagger "Authorize" button).

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apps/api/package.json` | add `@nestjs/swagger`, `express-basic-auth`; add `openapi:export` script | Modify |
| `apps/api/nest-cli.json` | enable `@nestjs/swagger` CLI plugin (compile-time DTO introspection) | Modify |
| `apps/api/src/common/openapi/swagger.gating.ts` | pure functions: enabled-by-env + mount/basic-auth decision | Create |
| `apps/api/src/common/openapi/swagger.gating.spec.ts` | unit tests for gating | Create |
| `apps/api/src/common/openapi/error-response.swagger.ts` | `@ApiProperty`-annotated DTOs mirroring the error envelope | Create |
| `apps/api/src/common/openapi/swagger.documents.ts` | base config, module include list, path allowlist + prune, document factories | Create |
| `apps/api/src/common/openapi/swagger.documents.spec.ts` | unit tests for prune + allowlist | Create |
| `apps/api/src/common/openapi/setup-swagger.ts` | mounts UIs + JSON, gated, internal behind basic-auth | Create |
| `apps/api/src/common/openapi/index.ts` | barrel | Create |
| `apps/api/src/config/configuration.ts` | add `swagger` config namespace | Modify |
| `apps/api/src/config/env.validation.ts` | declare `SWAGGER_*` env vars (optional) | Modify |
| `apps/api/src/main.ts` | call `setupSwagger(app)` | Modify |
| `apps/api/src/scripts/export-openapi.ts` | standalone generator (preview mode) → writes JSON | Create |
| `apps/api/openapi.public.json` | committed public spec artifact | Create (generated) |
| `apps/api/openapi.internal.json` | committed internal spec artifact | Create (generated) |
| `apps/api/src/common/openapi/openapi.contract.spec.ts` | asserts committed artifacts honor the contract | Create |
| `.prettierignore` | exclude generated JSON from prettier | Create/Modify |
| `.github/workflows/ci.yml` | export + drift-check steps | Modify |
| `docs/ENV.md` | document `SWAGGER_*` vars | Modify |

**Testing note:** The genuinely test-first units are the gating logic (Task 2) and the path-prune (Task 5) — both pure. Task 8's contract test is artifact-verification over generated JSON (asserts, not red-green). Document mounting (Task 6) and the export script (Task 7) are verified by the artifact + drift-check, plus an optional manual smoke.

---

### Task 1: Install dependencies and enable the Swagger CLI plugin

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/nest-cli.json`

- [ ] **Step 1: Add the dependencies**

Run (from repo root):

```bash
pnpm --filter @avino/api add @nestjs/swagger@^7.4.0 express-basic-auth@^1.2.1
```

Expected: `package.json` `dependencies` now include `@nestjs/swagger` and `express-basic-auth`; lockfile updated.

- [ ] **Step 2: Add the export script to `apps/api/package.json`**

In the `"scripts"` block, add the `openapi:export` entry (keep existing scripts):

```json
    "start": "node dist/main.js",
    "openapi:export": "nest build && node dist/scripts/export-openapi.js",
    "lint": "eslint \"src/**/*.ts\"",
```

- [ ] **Step 3: Enable the `@nestjs/swagger` CLI plugin**

Replace the full contents of `apps/api/nest-cli.json` with:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "plugins": ["@nestjs/swagger"]
  }
}
```

- [ ] **Step 4: Verify the build still passes**

Run:

```bash
pnpm --filter @avino/api exec prisma generate
pnpm --filter @avino/api build
```

Expected: build succeeds (the plugin is a no-op until we add Swagger decorators/usage).

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/nest-cli.json pnpm-lock.yaml
git commit -m "build(api): add @nestjs/swagger + express-basic-auth, enable swagger CLI plugin"
```

---

### Task 2: Pure gating logic (env flag + basic-auth decision)

**Files:**
- Create: `apps/api/src/common/openapi/swagger.gating.ts`
- Test: `apps/api/src/common/openapi/swagger.gating.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/openapi/swagger.gating.spec.ts`:

```ts
import { resolveSwaggerEnabled, resolveSwaggerGating } from './swagger.gating';

describe('resolveSwaggerEnabled', () => {
  it('honors an explicit "true" flag even in production', () => {
    expect(resolveSwaggerEnabled('true', 'production')).toBe(true);
  });

  it('honors an explicit "false" flag even in development', () => {
    expect(resolveSwaggerEnabled('false', 'development')).toBe(false);
  });

  it('defaults to enabled outside production when the flag is unset', () => {
    expect(resolveSwaggerEnabled(undefined, 'development')).toBe(true);
  });

  it('defaults to disabled in production when the flag is unset', () => {
    expect(resolveSwaggerEnabled(undefined, 'production')).toBe(false);
  });
});

describe('resolveSwaggerGating', () => {
  it('mounts nothing when disabled', () => {
    expect(resolveSwaggerGating({ enabled: false })).toEqual({
      mountPublic: false,
      mountInternal: false,
    });
  });

  it('mounts public but not internal when credentials are missing', () => {
    expect(resolveSwaggerGating({ enabled: true })).toEqual({
      mountPublic: true,
      mountInternal: false,
    });
  });

  it('mounts both and exposes basic-auth credentials when present', () => {
    expect(
      resolveSwaggerGating({
        enabled: true,
        basicAuthUser: 'u',
        basicAuthPass: 'p',
      }),
    ).toEqual({
      mountPublic: true,
      mountInternal: true,
      basicAuth: { user: 'u', pass: 'p' },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @avino/api exec jest swagger.gating
```

Expected: FAIL — `Cannot find module './swagger.gating'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/common/openapi/swagger.gating.ts`:

```ts
/**
 * Чистые функции гейтинга Swagger-документации (без зависимостей от Nest/ENV).
 * Вынесены отдельно, чтобы покрыть unit-тестами без подъёма приложения.
 */

/** Сырые настройки Swagger из конфигурации. */
export interface SwaggerSettings {
  enabled: boolean;
  basicAuthUser?: string;
  basicAuthPass?: string;
}

/** Решение о монтировании документации. */
export interface SwaggerGating {
  mountPublic: boolean;
  mountInternal: boolean;
  basicAuth?: { user: string; pass: string };
}

/**
 * Включён ли Swagger. Явный флаг `SWAGGER_ENABLED` имеет приоритет; если он не
 * задан — включаем везде, кроме production (по аналогии с telegramConfig).
 */
export function resolveSwaggerEnabled(
  rawFlag?: string,
  nodeEnv?: string,
): boolean {
  if (rawFlag != null) {
    return rawFlag === 'true';
  }
  return nodeEnv !== 'production';
}

/**
 * Что монтировать. Internal-документ поднимается только при наличии обеих
 * basic-auth credentials (fail-closed: без логина/пароля internal не светим).
 */
export function resolveSwaggerGating(settings: SwaggerSettings): SwaggerGating {
  if (!settings.enabled) {
    return { mountPublic: false, mountInternal: false };
  }
  const user = settings.basicAuthUser;
  const pass = settings.basicAuthPass;
  if (user && pass) {
    return { mountPublic: true, mountInternal: true, basicAuth: { user, pass } };
  }
  return { mountPublic: true, mountInternal: false };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @avino/api exec jest swagger.gating
```

Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/openapi/swagger.gating.ts apps/api/src/common/openapi/swagger.gating.spec.ts
git commit -m "feat(api): swagger gating helpers (env flag + basic-auth decision)"
```

---

### Task 3: Swagger config namespace + env declaration

**Files:**
- Modify: `apps/api/src/config/configuration.ts`
- Modify: `apps/api/src/config/env.validation.ts`

- [ ] **Step 1: Add the `swagger` namespace to `configuration.ts`**

Add the import at the top of `apps/api/src/config/configuration.ts` (after the existing `parseCorsOrigins` import):

```ts
import { resolveSwaggerEnabled } from '../common/openapi/swagger.gating';
```

Add this `registerAs` block alongside the other namespaces (e.g., right after `googleConfig`):

```ts
export const swaggerConfig = registerAs('swagger', () => ({
  enabled: resolveSwaggerEnabled(process.env.SWAGGER_ENABLED, process.env.NODE_ENV),
  basicAuthUser: process.env.SWAGGER_USER,
  basicAuthPass: process.env.SWAGGER_PASS,
}));
```

Then add `swaggerConfig` to the exported `configurations` array (append as the last element):

```ts
export const configurations = [
  appConfig,
  corsConfig,
  databaseConfig,
  redisConfig,
  s3Config,
  mapsConfig,
  smsConfig,
  translateConfig,
  promotionConfig,
  savedSearchConfig,
  mailConfig,
  otpConfig,
  rateLimitConfig,
  jwtConfig,
  googleConfig,
  telegramConfig,
  swaggerConfig,
];
```

- [ ] **Step 2: Declare the env vars in `env.validation.ts`**

In `apps/api/src/config/env.validation.ts`, add these three optional properties to the `EnvironmentVariables` class (place near the other optional integration vars; they follow the same `@IsString() @IsOptional()` pattern):

```ts
  @IsString()
  @IsOptional()
  SWAGGER_ENABLED?: string;

  @IsString()
  @IsOptional()
  SWAGGER_USER?: string;

  @IsString()
  @IsOptional()
  SWAGGER_PASS?: string;
```

- [ ] **Step 3: Verify the build + existing tests still pass**

Run:

```bash
pnpm --filter @avino/api build
pnpm --filter @avino/api test
```

Expected: build succeeds; existing unit tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/config/env.validation.ts
git commit -m "feat(api): swagger config namespace + SWAGGER_* env vars"
```

---

### Task 4: Error-envelope Swagger DTOs

**Files:**
- Create: `apps/api/src/common/openapi/error-response.swagger.ts`

These classes mirror the existing error envelope (`{ error: { code, message, details?, request_id } }` — see `src/common/dto/error-response.dto.ts`, which is interface-only and cannot produce Swagger schemas). They are documentation-only and injected via `extraModels` in Task 5 (no controller edits). Verified by the contract test in Task 8.

- [ ] **Step 1: Create the DTOs**

Create `apps/api/src/common/openapi/error-response.swagger.ts`:

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger-представление единого error-envelope (docs/API.md §4).
 * Зеркалит интерфейсы из common/dto/error-response.dto.ts (те — без декораторов,
 * поэтому в схему OpenAPI не попадают). Только для документации.
 */
export class ErrorDetailDto {
  @ApiProperty({ example: 'email', description: 'Путь к полю (с точками для вложенных DTO)' })
  field!: string;

  @ApiProperty({ example: 'must be an email', description: 'Причина ошибки валидации' })
  issue!: string;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'VALIDATION_ERROR', description: 'Стабильный код ошибки (docs/API.md §17)' })
  code!: string;

  @ApiProperty({ example: 'Validation failed', description: 'Человекочитаемое сообщение (язык по Accept-Language)' })
  message!: string;

  @ApiPropertyOptional({ type: [ErrorDetailDto], description: 'Пер-полевые ошибки валидации' })
  details?: ErrorDetailDto[];

  @ApiProperty({ example: '0f9c1d3e-...', description: 'Корреляция с серверными логами' })
  request_id!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}
```

- [ ] **Step 2: Verify it compiles**

Run:

```bash
pnpm --filter @avino/api exec tsc --noEmit -p tsconfig.json
```

Expected: no type errors. (If the project has no `tsconfig.json` with `noEmit`, use `pnpm --filter @avino/api build` instead — it must succeed.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/openapi/error-response.swagger.ts
git commit -m "feat(api): swagger DTOs for the error envelope"
```

---

### Task 5: Document factories + path allowlist prune

**Files:**
- Create: `apps/api/src/common/openapi/swagger.documents.ts`
- Test: `apps/api/src/common/openapi/swagger.documents.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/common/openapi/swagger.documents.spec.ts`:

```ts
import { OpenAPIObject } from '@nestjs/swagger';
import { PUBLIC_PATH_PREFIXES, prunePublicPaths } from './swagger.documents';

function fakeDoc(paths: string[]): OpenAPIObject {
  return {
    openapi: '3.0.0',
    info: { title: 't', version: '1' },
    paths: Object.fromEntries(paths.map((p) => [p, {}])),
  } as unknown as OpenAPIObject;
}

describe('prunePublicPaths', () => {
  it('keeps only paths matching an allowed prefix', () => {
    const doc = fakeDoc([
      '/api/v1/listings',
      '/api/v1/admin/users',
      '/api/v1/roles',
      '/api/v1/search',
    ]);
    const pruned = prunePublicPaths(doc, ['/api/v1/listings', '/api/v1/search']);
    expect(Object.keys(pruned.paths).sort()).toEqual([
      '/api/v1/listings',
      '/api/v1/search',
    ]);
  });

  it('does not mutate the original document', () => {
    const doc = fakeDoc(['/api/v1/listings', '/api/v1/admin/users']);
    prunePublicPaths(doc, ['/api/v1/listings']);
    expect(Object.keys(doc.paths)).toContain('/api/v1/admin/users');
  });
});

describe('PUBLIC_PATH_PREFIXES', () => {
  it('never allows admin or roles routes', () => {
    expect(PUBLIC_PATH_PREFIXES.some((p) => p.includes('/admin'))).toBe(false);
    expect(PUBLIC_PATH_PREFIXES.includes('/api/v1/roles')).toBe(false);
  });

  it('uses the versioned /api/v1 base for every prefix', () => {
    for (const prefix of PUBLIC_PATH_PREFIXES) {
      expect(prefix.startsWith('/api/v1/')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @avino/api exec jest swagger.documents
```

Expected: FAIL — `Cannot find module './swagger.documents'`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/common/openapi/swagger.documents.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AuthModule } from '../../auth/auth.module';
import { ChatModule } from '../../chat';
import { ComplaintsModule } from '../../complaints';
import { FavoritesModule } from '../../favorites';
import { GeoModule } from '../../geo';
import { HealthModule } from '../../health/health.module';
import { ListingMediaModule } from '../../listing-media';
import { ListingsModule } from '../../listings/listings.module';
import { NotificationsModule } from '../../notifications';
import { PromotionsModule } from '../../promotions';
import { SavedSearchesModule } from '../../saved-searches';
import { SearchModule } from '../../search';
import { TranslationsModule } from '../../translations';
import { UsersModule } from '../../users/users.module';
import {
  ErrorBodyDto,
  ErrorDetailDto,
  ErrorResponseDto,
} from './error-response.swagger';

/** Имя bearer-схемы безопасности в OpenAPI (используется в "Authorize"). */
export const BEARER_SCHEME_NAME = 'bearer';

/** Модули, контроллеры которых попадают в ПУБЛИЧНЫЙ документ (без admin/*). */
export const PUBLIC_MODULES = [
  AuthModule,
  UsersModule,
  TranslationsModule,
  ListingsModule,
  ListingMediaModule,
  SearchModule,
  GeoModule,
  FavoritesModule,
  SavedSearchesModule,
  PromotionsModule,
  NotificationsModule,
  ChatModule,
  ComplaintsModule,
  HealthModule,
];

/**
 * Явный allowlist путей публичного документа. Belt-and-suspenders поверх
 * module-include: даже если Swagger подтянет контроллер импортированного модуля
 * (напр. RolesController через RolesModule), путь будет отброшен.
 * Все админ-роуты живут под /api/v1/admin/*, roles — под /api/v1/roles.
 */
export const PUBLIC_PATH_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/users',
  '/api/v1/translations',
  '/api/v1/listings', // покрывает и /listings/{id}/media
  '/api/v1/search',
  '/api/v1/geo',
  '/api/v1/favorites',
  '/api/v1/saved-searches',
  '/api/v1/promotions',
  '/api/v1/notifications',
  '/api/v1/chat',
  '/api/v1/complaints',
  '/api/v1/health',
];

/** Базовая конфигурация документа (заголовок, версия, bearer-схема). */
export function buildBaseConfig() {
  return new DocumentBuilder()
    .setTitle('Avino API')
    .setDescription(
      'API портала недвижимости Avino. Аутентификация: ' +
        'POST /auth/otp/request → /auth/otp/verify → { accessToken, refreshToken }; ' +
        'обновление — /auth/refresh; вход через Google — /auth/google. ' +
        'Bearer-токен передаётся в заголовке Authorization.',
    )
    .setVersion('1')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      BEARER_SCHEME_NAME,
    )
    .build();
}

/** Возвращает копию документа только с путями, разрешёнными allowlist'ом. */
export function prunePublicPaths(
  doc: OpenAPIObject,
  allowedPrefixes: string[],
): OpenAPIObject {
  const paths = doc.paths ?? {};
  const filtered: OpenAPIObject['paths'] = {};
  for (const [route, item] of Object.entries(paths)) {
    if (allowedPrefixes.some((prefix) => route.startsWith(prefix))) {
      filtered[route] = item;
    }
  }
  return { ...doc, paths: filtered };
}

const EXTRA_MODELS = [ErrorResponseDto, ErrorBodyDto, ErrorDetailDto];

/** Публичный документ: include публичных модулей + жёсткий prune по allowlist. */
export function createPublicDocument(app: INestApplication): OpenAPIObject {
  const doc = SwaggerModule.createDocument(app, buildBaseConfig(), {
    include: PUBLIC_MODULES,
    extraModels: EXTRA_MODELS,
  });
  return prunePublicPaths(doc, PUBLIC_PATH_PREFIXES);
}

/** Internal-документ: все контроллеры, включая admin/*. */
export function createInternalDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildBaseConfig(), {
    extraModels: EXTRA_MODELS,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @avino/api exec jest swagger.documents
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/openapi/swagger.documents.ts apps/api/src/common/openapi/swagger.documents.spec.ts
git commit -m "feat(api): public/internal OpenAPI document factories + path allowlist prune"
```

---

### Task 6: `setupSwagger` + wire into `main.ts`

**Files:**
- Create: `apps/api/src/common/openapi/setup-swagger.ts`
- Create: `apps/api/src/common/openapi/index.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Create `setup-swagger.ts`**

Create `apps/api/src/common/openapi/setup-swagger.ts`:

```ts
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import { createInternalDocument, createPublicDocument } from './swagger.documents';
import { resolveSwaggerGating, SwaggerSettings } from './swagger.gating';

/**
 * Монтирует Swagger UI и JSON по решению гейтинга:
 *  - /api/docs            публичный UI (за SWAGGER_ENABLED)
 *  - /api/docs-json       публичный raw OpenAPI
 *  - /api/docs/internal   полный UI (всегда за HTTP Basic-auth)
 *  - /api/docs/internal-json  internal raw OpenAPI
 *
 * Вызывать ПОСЛЕ setGlobalPrefix + enableVersioning, чтобы пути отрендерились
 * как /api/v1/...
 */
export function setupSwagger(app: INestApplication): void {
  const logger = new Logger('Swagger');
  const config = app.get(ConfigService);
  const settings: SwaggerSettings = {
    enabled: config.get<boolean>('swagger.enabled') ?? false,
    basicAuthUser: config.get<string>('swagger.basicAuthUser'),
    basicAuthPass: config.get<string>('swagger.basicAuthPass'),
  };
  const gating = resolveSwaggerGating(settings);

  if (!gating.mountPublic) {
    logger.log('Swagger disabled (SWAGGER_ENABLED=false) — docs not mounted');
    return;
  }

  SwaggerModule.setup('api/docs', app, createPublicDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
  logger.log('Public API docs mounted at /api/docs (json: /api/docs-json)');

  if (gating.mountInternal && gating.basicAuth) {
    // Basic-auth ставим ДО setup, чтобы middleware перехватывал и UI, и JSON.
    // /api/docs/internal-json не покрывается префиксом /api/docs/internal,
    // поэтому перечисляем оба пути явно.
    app.use(
      ['/api/docs/internal', '/api/docs/internal-json'],
      basicAuth({
        users: { [gating.basicAuth.user]: gating.basicAuth.pass },
        challenge: true,
      }),
    );
    SwaggerModule.setup('api/docs/internal', app, createInternalDocument(app), {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('Internal API docs mounted at /api/docs/internal (basic-auth)');
  } else {
    logger.warn(
      'Internal docs NOT mounted: set SWAGGER_USER and SWAGGER_PASS to enable',
    );
  }
}
```

> If TypeScript rejects `import basicAuth from 'express-basic-auth'`, switch that line to `import * as basicAuth from 'express-basic-auth';` (depends on `esModuleInterop`).

- [ ] **Step 2: Create the barrel `index.ts`**

Create `apps/api/src/common/openapi/index.ts`:

```ts
export * from './swagger.gating';
export * from './error-response.swagger';
export * from './swagger.documents';
export * from './setup-swagger';
```

- [ ] **Step 3: Wire into `main.ts`**

In `apps/api/src/main.ts`, add the import (with the other local imports):

```ts
import { setupSwagger } from './common/openapi';
```

Then add the call immediately after the `app.enableCors(...)` line and before the `const port = ...` line:

```ts
  app.enableCors(buildCorsOptions(config.get<string[]>('cors.origins') ?? []));
  // Swagger/OpenAPI: смонтировать после префикса/версионирования (TASK mobile-swagger).
  setupSwagger(app);
  const port = config.get<number>('app.port') ?? 4000;
```

- [ ] **Step 4: Verify the build passes**

Run:

```bash
pnpm --filter @avino/api build
```

Expected: build succeeds.

- [ ] **Step 5: (Optional) Manual smoke**

Only if a local stack is available (needs DB/Redis + env). With `SWAGGER_ENABLED=true`, `SWAGGER_USER=admin`, `SWAGGER_PASS=secret`:

```bash
# in one shell: pnpm --filter @avino/api start
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/docs-json          # 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/docs/internal-json  # 401
curl -s -o /dev/null -w "%{http_code}\n" -u admin:secret http://localhost:4000/api/docs/internal-json  # 200
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/openapi/setup-swagger.ts apps/api/src/common/openapi/index.ts apps/api/src/main.ts
git commit -m "feat(api): mount public/internal Swagger UI gated by env flag + basic-auth"
```

---

### Task 7: Export script + committed `openapi.*.json`

**Files:**
- Create: `apps/api/src/scripts/export-openapi.ts`
- Create: `apps/api/openapi.public.json` (generated)
- Create: `apps/api/openapi.internal.json` (generated)
- Create/Modify: `.prettierignore`

- [ ] **Step 1: Create the export script**

Create `apps/api/src/scripts/export-openapi.ts`:

```ts
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { createInternalDocument, createPublicDocument } from '../common/openapi';

/**
 * Standalone-генератор OpenAPI. Использует preview-режим NestFactory:
 * граф модулей строится БЕЗ инстанцирования провайдеров и lifecycle-хуков,
 * поэтому не открывает соединений с PostgreSQL/Redis. Требует лишь, чтобы
 * обязательные env-переменные были ЗАДАНЫ (живая БД не нужна).
 *
 * Пишет apps/api/openapi.public.json и openapi.internal.json. Запуск:
 *   pnpm --filter @avino/api openapi:export
 */
async function exportOpenapi(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });
  // Те же префикс/версионирование, что и в main.ts — иначе пути разойдутся.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const publicDoc = createPublicDocument(app);
  const internalDoc = createInternalDocument(app);

  // __dirname в сборке = apps/api/dist/scripts → два уровня вверх = apps/api.
  const apiRoot = join(__dirname, '..', '..');
  writeFileSync(
    join(apiRoot, 'openapi.public.json'),
    JSON.stringify(publicDoc, null, 2) + '\n',
  );
  writeFileSync(
    join(apiRoot, 'openapi.internal.json'),
    JSON.stringify(internalDoc, null, 2) + '\n',
  );

  await app.close();
  // eslint-disable-next-line no-console
  console.log('OpenAPI specs written: openapi.public.json, openapi.internal.json');
}

exportOpenapi().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Exclude generated JSON from prettier**

If `.prettierignore` exists at repo root, append these lines; otherwise create it with:

```
apps/api/openapi.public.json
apps/api/openapi.internal.json
```

- [ ] **Step 3: Generate the specs**

Run (env vars only need to be *set*, not point at a live DB):

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/avino REDIS_URL=redis://localhost:6379 \
  pnpm --filter @avino/api openapi:export
```

Expected: prints `OpenAPI specs written: ...`; two JSON files appear in `apps/api/`.

> If the script errors that a required env var is missing (env validation), set that var to any non-empty dummy value and re-run. If `createDocument` fails under preview mode, fall back to removing `preview: true` and instead set dummy `DATABASE_URL`/`REDIS_URL` that resolve but never connect during document generation.

- [ ] **Step 4: Sanity-check the generated public spec excludes admin**

Run:

```bash
grep -c '/api/v1/admin' apps/api/openapi.public.json   # expected: 0
grep -c '/api/v1/admin' apps/api/openapi.internal.json # expected: > 0
grep -c '"/api/v1/auth/otp/request"' apps/api/openapi.public.json # expected: 1
```

Expected: public has 0 admin paths; internal has admin paths; the auth path is present in public. If the auth path renders without the `/api/v1` prefix, adjust `PUBLIC_PATH_PREFIXES` (Task 5) to match the actual emitted base, re-export, and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/export-openapi.ts apps/api/openapi.public.json apps/api/openapi.internal.json .prettierignore
git commit -m "feat(api): openapi export script + committed public/internal specs"
```

---

### Task 8: Contract test + CI drift-check + ENV docs

**Files:**
- Create: `apps/api/src/common/openapi/openapi.contract.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ENV.md`

- [ ] **Step 1: Write the contract test (reads committed artifacts)**

Create `apps/api/src/common/openapi/openapi.contract.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// __dirname = apps/api/src/common/openapi → три уровня вверх = apps/api.
const apiRoot = join(__dirname, '..', '..', '..');
const publicDoc = JSON.parse(
  readFileSync(join(apiRoot, 'openapi.public.json'), 'utf8'),
);
const internalDoc = JSON.parse(
  readFileSync(join(apiRoot, 'openapi.internal.json'), 'utf8'),
);

describe('OpenAPI public contract', () => {
  it('is a valid OpenAPI 3 document with at least one path', () => {
    expect(publicDoc.openapi).toMatch(/^3\./);
    expect(Object.keys(publicDoc.paths).length).toBeGreaterThan(0);
  });

  it('exposes only versioned /api/v1 paths', () => {
    for (const route of Object.keys(publicDoc.paths)) {
      expect(route.startsWith('/api/v1/')).toBe(true);
    }
  });

  it('never exposes admin or roles routes', () => {
    const routes = Object.keys(publicDoc.paths);
    expect(routes.some((r) => r.startsWith('/api/v1/admin'))).toBe(false);
    expect(routes.some((r) => r.startsWith('/api/v1/roles'))).toBe(false);
  });

  it('declares the bearer security scheme', () => {
    expect(publicDoc.components.securitySchemes.bearer).toBeDefined();
  });

  it('includes the error-envelope schema', () => {
    expect(publicDoc.components.schemas.ErrorResponseDto).toBeDefined();
  });
});

describe('OpenAPI internal contract', () => {
  it('exposes admin routes', () => {
    const routes = Object.keys(internalDoc.paths);
    expect(routes.some((r) => r.startsWith('/api/v1/admin'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the contract test**

Run:

```bash
pnpm --filter @avino/api exec jest openapi.contract
```

Expected: PASS (6 tests). (This is artifact verification — the committed JSON from Task 7 must satisfy the contract. If a path-prefix assertion fails, reconcile `PUBLIC_PATH_PREFIXES` with the real emitted base and re-export.)

- [ ] **Step 3: Add export + drift-check to CI**

In `.github/workflows/ci.yml`, inside the `api` job, add these two steps after the existing `Build` step (before `Test (jest)`):

```yaml
      - name: Export OpenAPI spec
        run: pnpm --filter @avino/api exec node dist/scripts/export-openapi.js
        env:
          DATABASE_URL: postgresql://user:pass@localhost:5432/avino
          REDIS_URL: redis://localhost:6379
          NODE_ENV: test

      - name: Check OpenAPI spec is up to date
        run: git diff --exit-code -- apps/api/openapi.public.json apps/api/openapi.internal.json
```

> The `Build` step already produced `apps/api/dist`, so the compiled `dist/scripts/export-openapi.js` exists. The drift-check fails the PR if the committed specs are stale relative to the code.

- [ ] **Step 4: Document the env vars**

In `docs/ENV.md`, add a subsection (follow the file's existing heading style/numbering) with this content:

```markdown
### Swagger / OpenAPI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SWAGGER_ENABLED` | no | `true` outside production, else `false` | Master flag. `true`/`false`. When `false`, no docs are mounted. |
| `SWAGGER_USER` | for internal docs | — | HTTP Basic-auth username for `/api/docs/internal*`. No default (secret). |
| `SWAGGER_PASS` | for internal docs | — | HTTP Basic-auth password for `/api/docs/internal*`. No default (secret). |

- Public docs: `GET /api/docs` (UI), `GET /api/docs-json` (raw OpenAPI).
- Internal docs (all controllers incl. `admin/*`): `GET /api/docs/internal`,
  `GET /api/docs/internal-json` — always behind Basic-auth; mounted only when
  both `SWAGGER_USER` and `SWAGGER_PASS` are set.
- The mobile team consumes `apps/api/openapi.public.json` for client codegen.
```

- [ ] **Step 5: Run the full api test suite + build**

Run:

```bash
pnpm --filter @avino/api build
pnpm --filter @avino/api test
```

Expected: build succeeds; all unit tests PASS (gating + documents + contract).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/openapi/openapi.contract.spec.ts .github/workflows/ci.yml docs/ENV.md
git commit -m "test(api): OpenAPI contract test + CI drift-check + ENV docs"
```

---

## Done criteria (Phase 1)

- `pnpm --filter @avino/api test` green (gating, documents, contract specs).
- `pnpm --filter @avino/api openapi:export` regenerates committed specs with no diff.
- Public spec contains only `/api/v1/<public>` paths; internal spec contains `admin/*`.
- Live UI gated: `/api/docs` by flag, `/api/docs/internal` behind Basic-auth.
- `docs/ENV.md` documents `SWAGGER_*`; CI fails on spec drift.
- Zero controller/business-logic changes.

## Out of scope → Phase 2 (separate plan)

- Per-route `@ApiBearerAuth()` accuracy and response DTO classes (`@ApiOkResponse`).
- Keyset-pagination response schema on `/search`.
- Optional external spec linter (`@redocly/cli`) in CI — basic validity is asserted by the contract test for now.

## Finalize (in this feature PR, before push)

- ADR documenting the two-document gated Swagger approach.
- DONE.md entry.
- Open PR `feat/api-swagger-openapi` → `main` (main is protected; user merges).
