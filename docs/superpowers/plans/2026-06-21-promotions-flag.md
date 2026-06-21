# Promotions Feature-Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-управляемый Boolean (дефолт OFF) скрывает кнопку «Продвинуть» в кабинете клиента, пока продвижение не запущено; когда админ включит — кнопка появляется.

**Architecture:** Новый ключ `promotions_enabled` в существующей key/value-таблице `AppSetting` (без миграции). Доменный `SettingsModule` (по образцу `ExchangeRateModule`) держит общий `PromotionsFlagService`, публичный read-эндпоинт `GET /settings/public` и admin-тоггл `GET/PATCH /admin/promotions-flag` (зеркало `admin-sms-settings`). Клиент читает флаг через RTK Query-хук и гейтит кнопку.

**Tech Stack:** NestJS + Prisma + Jest (`apps/api`); Next.js + RTK Query (`apps/web`, `apps/client`); Vitest + RTL (`apps/client`).

## Global Constraints

- Все HTTP-пути под `/api/v1/...` — глобальный префикс `api` + URI-версия `1` (`main.ts`). Контроллер `@Controller({ path: 'settings/public', version: '1' })` ⇒ `/api/v1/settings/public`.
- Дефолт **OFF**: env-дефолт `promotion.enabled` = `false`; runtime-значение в `AppSetting`, ключ **`promotions_enabled`**, хранится строкой `'true'`/`'false'`.
- **Без новой Prisma-миграции** — переиспользуем `AppSetting` (новый ключ, не новая колонка).
- При добавлении публичного эндпоинта **обязателен** regen `openapi.public.json` (CI drift-check упадёт иначе).
- Границы app-папок ⇒ **3 PR** (api → web → client). `main` защищён, мёржит владелец. **Субагенты git не трогают — все коммиты делает контроллер** (memory: shared-workdir git hazard).
- Conventional Commits. Каждый коммит заканчивается trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- Проза/комментарии — по-русски; идентификаторы, код, команды — English.

---

## File Structure

### PR A — `apps/api`
- Create `src/settings/promotions-flag.constants.ts` — ключ `PROMOTIONS_ENABLED_KEY` + чистый резолвер `resolvePromotionsEnabled`.
- Create `src/settings/promotions-flag.constants.spec.ts` — тесты резолвера.
- Create `src/settings/promotions-flag.service.ts` — `PromotionsFlagService` (`isEnabled`, `setEnabled`).
- Create `src/settings/promotions-flag.service.spec.ts` — тесты сервиса.
- Create `src/settings/dto/update-promotions-flag.dto.ts` — `UpdatePromotionsFlagDto`.
- Create `src/settings/public-settings.controller.ts` — `PublicSettingsController` (`GET /settings/public`).
- Create `src/settings/public-settings.controller.spec.ts`.
- Create `src/settings/admin-promotions-flag.controller.ts` — `AdminPromotionsFlagController` (`GET/PATCH /admin/promotions-flag`).
- Create `src/settings/admin-promotions-flag.controller.spec.ts`.
- Create `src/settings/settings.module.ts` — `SettingsModule`.
- Create `src/settings/index.ts` — barrel.
- Modify `src/config/configuration.ts` — поле `enabled` в `promotionConfig`.
- Modify `src/config/env.validation.ts` — `PROMOTION_ENABLED?: string`.
- Modify `src/app.module.ts` — импорт + регистрация `SettingsModule`.
- Modify `src/common/openapi/swagger.documents.ts` — `SettingsModule` в `PUBLIC_MODULES` + `/api/v1/settings` в `PUBLIC_PATH_PREFIXES`.
- Modify `openapi.public.json` — регенерируется.
- Create `docs/adr/ADR-0100-promotions-feature-flag.md`.
- Modify `docs/DONE.md` — запись о фиче.

### PR B — `apps/web`
- Create `src/store/api/adminPromotionsFlagApi.ts` — RTK-слайс (зеркало `adminSmsSettingsApi`).
- Create `src/components/admin/PromotionsAvailabilityToggle.tsx` — тумблер (зеркало `SmsSendingToggle`).
- Modify `src/app/admin/settings/page.tsx` — рендер тумблера.

### PR C — `apps/client`
- Create `src/store/api/publicSettingsApi.ts` — RTK-слайс (зеркало `exchangeRateApi`).
- Create `src/lib/usePromotionsEnabled.ts` — хук.
- Create `src/lib/usePromotionsEnabled.test.ts` — тест хука.
- Modify `src/features/account/MyListings.tsx` — гейт кнопки.
- Create `src/features/account/MyListings.promote-gate.test.tsx` — тест гейта.

---

# PR A — `apps/api`

### Task 1: Constants + pure resolver

**Files:**
- Create: `apps/api/src/settings/promotions-flag.constants.ts`
- Test: `apps/api/src/settings/promotions-flag.constants.spec.ts`

**Interfaces:**
- Produces: `PROMOTIONS_ENABLED_KEY: string` (= `'promotions_enabled'`); `resolvePromotionsEnabled(stored: string | null | undefined, envDefault: boolean): boolean`.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/api/src/settings/promotions-flag.constants.spec.ts
import { resolvePromotionsEnabled } from './promotions-flag.constants';

describe('resolvePromotionsEnabled', () => {
  it('returns true when stored "true"', () => {
    expect(resolvePromotionsEnabled('true', false)).toBe(true);
  });
  it('returns false when stored "false"', () => {
    expect(resolvePromotionsEnabled('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolvePromotionsEnabled(null, true)).toBe(true);
    expect(resolvePromotionsEnabled(undefined, false)).toBe(false);
    expect(resolvePromotionsEnabled('garbage', true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @avino/api test -- promotions-flag.constants`
Expected: FAIL — `Cannot find module './promotions-flag.constants'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/api/src/settings/promotions-flag.constants.ts
/** Ключ runtime-настройки в app_settings для тоггла доступности продвижения. */
export const PROMOTIONS_ENABLED_KEY = 'promotions_enabled';

/**
 * Резолюция флага продвижения: значение из app_settings (если 'true'/'false')
 * главнее; иначе — env-дефолт (`promotion.enabled` из configuration.ts, default
 * false). Чистая функция — шарится между PromotionsFlagService и тестами.
 * Зеркалит {@link resolveSmsEnabled}.
 */
export function resolvePromotionsEnabled(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @avino/api test -- promotions-flag.constants`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settings/promotions-flag.constants.ts apps/api/src/settings/promotions-flag.constants.spec.ts
git commit -m "feat(promotions): app_settings key + pure resolver for promotions flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Config flag + env validation + PromotionsFlagService

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (block `promotionConfig`, ~line 84)
- Modify: `apps/api/src/config/env.validation.ts` (~line 134, before `PROMOTION_EXPIRY_CRON`)
- Create: `apps/api/src/settings/promotions-flag.service.ts`
- Test: `apps/api/src/settings/promotions-flag.service.spec.ts`

**Interfaces:**
- Consumes: `PROMOTIONS_ENABLED_KEY`, `resolvePromotionsEnabled` (Task 1); `PrismaService` from `../prisma`; `ConfigService` from `@nestjs/config`; config key `promotion.enabled`.
- Produces: `class PromotionsFlagService { isEnabled(): Promise<boolean>; setEnabled(adminId: string, enabled: boolean): Promise<boolean> }`.

- [ ] **Step 1: Add `enabled` to `promotionConfig`**

In `apps/api/src/config/configuration.ts`, replace:

```typescript
export const promotionConfig = registerAs('promotion', () => ({
  expiryCron: process.env.PROMOTION_EXPIRY_CRON ?? '* * * * *',
```

with:

```typescript
export const promotionConfig = registerAs('promotion', () => ({
  // Master-флаг ДОСТУПНОСТИ продвижения для клиентов (ADR-0100). По умолчанию
  // ВЫКЛЮЧЕНО (ранний этап — кнопку «Продвинуть» прячем). Явный
  // PROMOTION_ENABLED=true → true. Перебивается runtime-строкой
  // promotions_enabled в app_settings (admin-тоггл). НЕ путать с expiry* ниже —
  // те про cron истечения промо.
  enabled:
    process.env.PROMOTION_ENABLED != null
      ? process.env.PROMOTION_ENABLED === 'true'
      : false,
  expiryCron: process.env.PROMOTION_EXPIRY_CRON ?? '* * * * *',
```

- [ ] **Step 2: Declare `PROMOTION_ENABLED` in env.validation**

In `apps/api/src/config/env.validation.ts`, replace:

```typescript
  // ── Истечение промо VIP/TOP (TASK-123, опционально — есть дефолты) ──
  @IsString()
  @IsOptional()
  PROMOTION_EXPIRY_CRON?: string;
```

with:

```typescript
  // ── Продвижение объявлений (ADR-0100): master-флаг доступности + истечение ──
  // Булева как строка (class-transformer привёл бы любую непустую к true).
  @IsString()
  @IsOptional()
  PROMOTION_ENABLED?: string;

  @IsString()
  @IsOptional()
  PROMOTION_EXPIRY_CRON?: string;
```

- [ ] **Step 3: Write the failing test**

```typescript
// apps/api/src/settings/promotions-flag.service.spec.ts
import { PromotionsFlagService } from './promotions-flag.service';

describe('PromotionsFlagService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(false) }; // env default false
  let service: PromotionsFlagService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(false);
    service = new PromotionsFlagService(prisma as never, config as never);
  });

  it('isEnabled() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await service.isEnabled()).toBe(true);
  });

  it('isEnabled() falls back to env default (false) when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.isEnabled()).toBe(false);
  });

  it('isEnabled() falls back to env default when DB throws', async () => {
    prisma.appSetting.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.isEnabled()).toBe(false);
  });

  it('setEnabled() upserts string value + writes audit', async () => {
    const result = await service.setEnabled('admin1', true);
    expect(result).toBe(true);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'promotions_enabled' },
        update: { value: 'true' },
        create: { key: 'promotions_enabled', value: 'true' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'PROMOTIONS_FLAG_UPDATE',
          metadata: { enabled: true },
        }),
      }),
    );
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @avino/api test -- promotions-flag.service`
Expected: FAIL — `Cannot find module './promotions-flag.service'`.

- [ ] **Step 5: Write minimal implementation**

```typescript
// apps/api/src/settings/promotions-flag.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  PROMOTIONS_ENABLED_KEY,
  resolvePromotionsEnabled,
} from './promotions-flag.constants';

/**
 * Runtime-флаг доступности продвижения объявлений. Хранит булеву строку в
 * app_settings (ключ promotions_enabled); читается публичным
 * PublicSettingsController и admin-тогглом без пересборки. Резолюция
 * (DB-строка > env-дефолт `promotion.enabled`, default false) — общая чистая
 * функция. Зеркалит AdminSmsSettingsService/SmsService.isEnabled.
 */
@Injectable()
export class PromotionsFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Текущее значение флага. DB-ошибка → безопасный env-дефолт (кнопка скрыта). */
  async isEnabled(): Promise<boolean> {
    const envDefault = this.config.get<boolean>('promotion.enabled') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: PROMOTIONS_ENABLED_KEY },
      });
      return resolvePromotionsEnabled(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Включить/выключить продвижение (ADMIN). Пишет app_settings + audit-log. */
  async setEnabled(adminId: string, enabled: boolean): Promise<boolean> {
    const value = String(enabled);
    await this.prisma.appSetting.upsert({
      where: { key: PROMOTIONS_ENABLED_KEY },
      update: { value },
      create: { key: PROMOTIONS_ENABLED_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PROMOTIONS_FLAG_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { enabled },
      },
    });
    return enabled;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @avino/api test -- promotions-flag.service`
Expected: PASS (4 passed).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config/configuration.ts apps/api/src/config/env.validation.ts apps/api/src/settings/promotions-flag.service.ts apps/api/src/settings/promotions-flag.service.spec.ts
git commit -m "feat(promotions): promotion.enabled config (default off) + PromotionsFlagService

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DTO + controllers + SettingsModule + app wiring

**Files:**
- Create: `apps/api/src/settings/dto/update-promotions-flag.dto.ts`
- Create: `apps/api/src/settings/public-settings.controller.ts`
- Test: `apps/api/src/settings/public-settings.controller.spec.ts`
- Create: `apps/api/src/settings/admin-promotions-flag.controller.ts`
- Test: `apps/api/src/settings/admin-promotions-flag.controller.spec.ts`
- Create: `apps/api/src/settings/settings.module.ts`
- Create: `apps/api/src/settings/index.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PromotionsFlagService` (Task 2); `UserRole` from `@avino/shared`; `CurrentUser`, `Roles` from `../common/decorators`; `JwtAuthGuard`, `RolesGuard` from `../common/guards`.
- Produces: `UpdatePromotionsFlagDto { enabled: boolean }`; `PublicSettingsController` (`GET /settings/public` → `{ promotionsEnabled }`); `AdminPromotionsFlagController` (`GET`/`PATCH /admin/promotions-flag` → `{ promotionsEnabled }`); `SettingsModule` (exports `PromotionsFlagService`).

- [ ] **Step 1: Write the DTO**

```typescript
// apps/api/src/settings/dto/update-promotions-flag.dto.ts
import { IsBoolean } from 'class-validator';

/** Тело `PATCH /api/v1/admin/promotions-flag`. */
export class UpdatePromotionsFlagDto {
  @IsBoolean()
  enabled!: boolean;
}
```

- [ ] **Step 2: Write the failing controller tests**

```typescript
// apps/api/src/settings/public-settings.controller.spec.ts
import { PublicSettingsController } from './public-settings.controller';

describe('PublicSettingsController', () => {
  it('returns promotionsEnabled=false from the flag service', async () => {
    const flags: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const controller = new PublicSettingsController(flags);
    expect(await controller.get()).toEqual({ promotionsEnabled: false });
  });

  it('reflects an enabled flag', async () => {
    const flags: any = { isEnabled: jest.fn().mockResolvedValue(true) };
    const controller = new PublicSettingsController(flags);
    expect(await controller.get()).toEqual({ promotionsEnabled: true });
  });
});
```

```typescript
// apps/api/src/settings/admin-promotions-flag.controller.spec.ts
import { AdminPromotionsFlagController } from './admin-promotions-flag.controller';

describe('AdminPromotionsFlagController', () => {
  it('GET returns the current flag', async () => {
    const flags: any = {
      isEnabled: jest.fn().mockResolvedValue(false),
      setEnabled: jest.fn(),
    };
    const controller = new AdminPromotionsFlagController(flags);
    expect(await controller.get()).toEqual({ promotionsEnabled: false });
  });

  it('PATCH delegates to setEnabled with admin id and returns the new value', async () => {
    const flags: any = {
      isEnabled: jest.fn(),
      setEnabled: jest.fn().mockResolvedValue(true),
    };
    const controller = new AdminPromotionsFlagController(flags);
    const res = await controller.update('admin-1', { enabled: true });
    expect(flags.setEnabled).toHaveBeenCalledWith('admin-1', true);
    expect(res).toEqual({ promotionsEnabled: true });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @avino/api test -- settings.controller || pnpm --filter @avino/api test -- promotions-flag.controller`
(Both controller specs match `settings/`.) Use: `pnpm --filter @avino/api test -- src/settings`
Expected: FAIL — controller modules not found.

- [ ] **Step 4: Write the public controller**

```typescript
// apps/api/src/settings/public-settings.controller.ts
import { Controller, Get } from '@nestjs/common';
import { PromotionsFlagService } from './promotions-flag.service';

/** Публичные настройки/фиче-флаги для портала и мобильных клиентов. */
export interface PublicSettingsView {
  promotionsEnabled: boolean;
}

/**
 * `GET /api/v1/settings/public` — публичные флаги без авторизации. Точка
 * расширения для будущих клиентских флагов (добавляется поле, не эндпоинт).
 */
@Controller({ path: 'settings/public', version: '1' })
export class PublicSettingsController {
  constructor(private readonly flags: PromotionsFlagService) {}

  @Get()
  async get(): Promise<PublicSettingsView> {
    return { promotionsEnabled: await this.flags.isEnabled() };
  }
}
```

- [ ] **Step 5: Write the admin controller**

```typescript
// apps/api/src/settings/admin-promotions-flag.controller.ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PromotionsFlagService } from './promotions-flag.service';
import { UpdatePromotionsFlagDto } from './dto/update-promotions-flag.dto';

/**
 * Runtime-тоггл доступности продвижения объявлений (ADMIN). GET — текущее
 * состояние; PATCH — включить/выключить без пересборки (пишет app_settings).
 * Зеркалит AdminSmsSettingsController. Клиент читает значение через
 * GET /settings/public.
 */
@Controller({ path: 'admin/promotions-flag', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminPromotionsFlagController {
  constructor(private readonly flags: PromotionsFlagService) {}

  @Get()
  async get(): Promise<{ promotionsEnabled: boolean }> {
    return { promotionsEnabled: await this.flags.isEnabled() };
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdatePromotionsFlagDto,
  ): Promise<{ promotionsEnabled: boolean }> {
    return {
      promotionsEnabled: await this.flags.setEnabled(adminId, dto.enabled),
    };
  }
}
```

- [ ] **Step 6: Write the module + barrel**

```typescript
// apps/api/src/settings/settings.module.ts
import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { AdminPromotionsFlagController } from './admin-promotions-flag.controller';
import { PublicSettingsController } from './public-settings.controller';
import { PromotionsFlagService } from './promotions-flag.service';

/**
 * SettingsModule — публичные фиче-флаги + admin-тогглы платформы.
 *
 * `PublicSettingsController` (`GET /settings/public`) — без авторизации, отдаёт
 * флаги порталу/мобильным клиентам. `AdminPromotionsFlagController`
 * (`GET/PATCH /admin/promotions-flag`) — ADMIN-управление флагом продвижения.
 * `RolesModule` импортируется ради Bearer-аутентификации/ролей
 * ({@link JwtAuthGuard}/{@link RolesGuard}) admin-контроллера — тот же приём,
 * что в ExchangeRateModule/AdminModule. `PromotionsFlagService` экспортируется
 * на случай серверного гейта будущего клиентского promote-эндпоинта.
 */
@Module({
  imports: [RolesModule],
  controllers: [PublicSettingsController, AdminPromotionsFlagController],
  providers: [PromotionsFlagService],
  exports: [PromotionsFlagService],
})
export class SettingsModule {}
```

```typescript
// apps/api/src/settings/index.ts
export { SettingsModule } from './settings.module';
export { PromotionsFlagService } from './promotions-flag.service';
export {
  PROMOTIONS_ENABLED_KEY,
  resolvePromotionsEnabled,
} from './promotions-flag.constants';
```

- [ ] **Step 7: Register `SettingsModule` in AppModule**

In `apps/api/src/app.module.ts`, replace:

```typescript
import { SearchModule } from './search';
import { TourRequestsModule } from './tour-requests';
```

with:

```typescript
import { SearchModule } from './search';
import { SettingsModule } from './settings';
import { TourRequestsModule } from './tour-requests';
```

Then in the `@Module({ imports: [...] })` array, replace:

```typescript
    SearchModule,
    GeoModule,
```

with:

```typescript
    SearchModule,
    SettingsModule,
    GeoModule,
```

- [ ] **Step 8: Run controller tests + build**

Run: `pnpm --filter @avino/api test -- src/settings`
Expected: PASS (4 suites in `src/settings` green).

Run: `pnpm --filter @avino/api build`
Expected: `nest build` succeeds (compiles `SettingsModule` into the graph, no TS errors).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/settings/ apps/api/src/app.module.ts
git commit -m "feat(promotions): public /settings/public + admin /admin/promotions-flag (SettingsModule)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Register public endpoint in OpenAPI + regenerate

**Files:**
- Modify: `apps/api/src/common/openapi/swagger.documents.ts`
- Modify: `apps/api/openapi.public.json` (generated)

**Interfaces:**
- Consumes: `SettingsModule` (Task 3).

- [ ] **Step 1: Import + add SettingsModule to PUBLIC_MODULES**

In `apps/api/src/common/openapi/swagger.documents.ts`, add the import near the other module imports (after the `SearchModule` import line):

```typescript
import { SearchModule } from '../../search';
import { SettingsModule } from '../../settings';
```

Then in `PUBLIC_MODULES`, replace:

```typescript
  ExchangeRateModule,
  HealthModule,
];
```

with:

```typescript
  ExchangeRateModule,
  HealthModule,
  SettingsModule,
];
```

- [ ] **Step 2: Add `/api/v1/settings` to PUBLIC_PATH_PREFIXES**

Replace:

```typescript
  '/api/v1/exchange-rate',
  '/api/v1/health',
];
```

with:

```typescript
  '/api/v1/exchange-rate',
  '/api/v1/health',
  '/api/v1/settings', // покрывает /api/v1/settings/public (admin/* остаётся в internal)
];
```

> Note: `createInternalDocument` includes ВСЕ контроллеры автоматически — `/admin/promotions-flag` уже попадёт в `openapi.internal.json` без изменений. Только публичный документ требует правок выше. `/admin/promotions-flag` НЕ матчит `/api/v1/settings`, поэтому в публичный док не утечёт.

- [ ] **Step 3: Regenerate the OpenAPI documents**

Run (from repo root):

```bash
cd apps/api && DATABASE_URL=postgresql://u:p@localhost:5432/avino \
  REDIS_URL=redis://localhost:6379 \
  JWT_ACCESS_SECRET=dummy-access \
  JWT_REFRESH_SECRET=dummy-refresh \
  pnpm openapi:export; cd -
```

Expected: `OpenAPI specs written: openapi.public.json, openapi.internal.json`.

- [ ] **Step 4: Verify the new path landed in the PUBLIC doc**

Run: `git --no-pager diff --stat apps/api/openapi.public.json apps/api/openapi.internal.json`
Then: `grep -c "settings/public" apps/api/openapi.public.json`
Expected: `openapi.public.json` contains `"/api/v1/settings/public"` (count ≥ 1); `openapi.public.json` does NOT contain `admin/promotions-flag` — verify: `grep -c "admin/promotions-flag" apps/api/openapi.public.json` returns `0`; `openapi.internal.json` DOES contain it (returns ≥ 1).

- [ ] **Step 5: Run the full api test suite (drift guard sanity)**

Run: `pnpm --filter @avino/api test`
Expected: all suites PASS (no regressions; total count increases by the new settings specs).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/openapi/swagger.documents.ts apps/api/openapi.public.json apps/api/openapi.internal.json
git commit -m "docs(openapi): expose GET /settings/public in public document + regen

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ADR-0100 + DONE.md

**Files:**
- Create: `docs/adr/ADR-0100-promotions-feature-flag.md`
- Modify: `docs/DONE.md`

- [ ] **Step 1: Write the ADR**

```markdown
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
2. **Доменный `SettingsModule`** (по образцу `ExchangeRateModule`) держит общий
   `PromotionsFlagService` и два контроллера:
   - публичный `GET /api/v1/settings/public` → `{ promotionsEnabled }` (без auth);
   - admin `GET/PATCH /api/v1/admin/promotions-flag` (`@Roles(ADMIN)`), пишет
     `app_settings` + audit-log `PROMOTIONS_FLAG_UPDATE`.
3. **Публичный эндпоинт добавлен в публичный OpenAPI-документ** (`PUBLIC_MODULES`
   + prefix `/api/v1/settings`); admin-роут остаётся только в internal-документе.
4. **Клиент** читает флаг через RTK Query (`GET /settings/public`) и хук
   `usePromotionsEnabled()` (дефолт/загрузка/ошибка → `false`), гейтит кнопку
   «Продвинуть» в `MyListings`.
5. **Веб-админка** получает тумблер «Продвижение объявлений» в `/admin/settings`
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

## Alternatives considered
- Подмешать флаг в `GET /promotions/plans` — семантически грязно (это про цены).
- Запекать через env при сборке клиента — тогда admin-тоггл не даёт мгновенного
  эффекта (нужен ребилд), что противоречит цели.
- Расширить `admin-promotion-settings` (cron истечения) полем `enabled` —
  смешение ответственностей с операционным cron-конфигом.
```

- [ ] **Step 2: Add a DONE.md entry**

Open `docs/DONE.md`. Under a `## 2026-06-21` date heading (create it at the top of the dated log if absent), add:

```markdown
### Продвижение — admin feature-flag (ADR-0100)

Status: DONE
Branch: feat/promotions-flag (api), feat/promotions-flag-web, feat/promotions-flag-client
PR: <api PR #>, <web PR #>, <client PR #>

Admin-управляемый Boolean `promotions_enabled` (дефолт OFF) скрывает кнопку
«Продвинуть» в кабинете клиента. Новый `SettingsModule`: публичный
`GET /settings/public` + admin `GET/PATCH /admin/promotions-flag`; web-тумблер в
/admin/settings; клиентский хук `usePromotionsEnabled` гейтит кнопку. Без миграции
(ключ в app_settings). OpenAPI public-док обновлён.
```

> PR-номера проставляются при создании PR (контроллер). Per repo rule DONE.md финализируется при мёрже — допустимо положить запись в api-PR как prep (memory: «finalize in feature PR»).

- [ ] **Step 3: Commit**

```bash
git add docs/adr/ADR-0100-promotions-feature-flag.md docs/DONE.md
git commit -m "docs(promotions): ADR-0100 + DONE.md entry for promotions feature flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push PR A and open it**

Controller-only (subagents never run git). Push the `apps/api` branch and open a PR targeting `main`. Title: `feat(api): admin-gated promotions feature flag (ADR-0100)`. Body: summarize endpoints + default OFF + OpenAPI regen. Capture the PR number for DONE.md / cross-references.

---

# PR B — `apps/web`

### Task 6: Admin toggle in /admin/settings

**Files:**
- Create: `apps/web/src/store/api/adminPromotionsFlagApi.ts`
- Create: `apps/web/src/components/admin/PromotionsAvailabilityToggle.tsx`
- Modify: `apps/web/src/app/admin/settings/page.tsx`

**Interfaces:**
- Consumes: `adminApi` from `./adminApi` (RTK base, tag `Admin`); API `GET/PATCH /admin/promotions-flag` (Task 3).
- Produces: `useGetPromotionsFlagQuery`, `useUpdatePromotionsFlagMutation`; `<PromotionsAvailabilityToggle/>`.

> No unit test: mirrors `SmsSendingToggle`, which has none in this app. Verified via typecheck/build + manual toggle. (Follows established pattern.)

- [ ] **Step 1: Write the RTK slice**

```typescript
// apps/web/src/store/api/adminPromotionsFlagApi.ts
import { adminApi } from './adminApi';

export interface PromotionsFlag {
  promotionsEnabled: boolean;
}

/**
 * adminPromotionsFlagApi — runtime-тоггл доступности продвижения (ADMIN).
 * GET/PATCH /admin/promotions-flag. Инвалидирует тег Admin, поэтому состояние
 * перечитывается после переключения. Зеркалит adminSmsSettingsApi.
 */
export const adminPromotionsFlagApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getPromotionsFlag: build.query<PromotionsFlag, void>({
      query: () => ({ url: '/admin/promotions-flag' }),
      providesTags: ['Admin'],
    }),
    updatePromotionsFlag: build.mutation<PromotionsFlag, { enabled: boolean }>({
      query: (body) => ({
        url: '/admin/promotions-flag',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const { useGetPromotionsFlagQuery, useUpdatePromotionsFlagMutation } =
  adminPromotionsFlagApi;
```

- [ ] **Step 2: Write the toggle component**

```typescript
// apps/web/src/components/admin/PromotionsAvailabilityToggle.tsx
/**
 * Runtime-переключатель доступности продвижения объявлений (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 * Выключено (дефолт) → у клиента скрыта кнопка «Продвинуть». Зеркалит
 * SmsSendingToggle.
 */
'use client';

import {
  useGetPromotionsFlagQuery,
  useUpdatePromotionsFlagMutation,
} from '@/store/api/adminPromotionsFlagApi';

export function PromotionsAvailabilityToggle() {
  const { data, isLoading } = useGetPromotionsFlagQuery();
  const [update, { isLoading: isSaving }] = useUpdatePromotionsFlagMutation();
  const enabled = data?.promotionsEnabled ?? false;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Продвижение объявлений
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            Доступность продвижения для клиентов. Выключено → кнопка «Продвинуть»
            скрыта в кабинете. Без пересборки.
          </div>
        </div>
        <button
          type="button"
          className={enabled ? 'abtn abtn-primary' : 'abtn'}
          disabled={isLoading || isSaving}
          onClick={() => void update({ enabled: !enabled })}
        >
          {isLoading ? '…' : enabled ? 'Включено' : 'Выключено'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Render it on the settings page**

In `apps/web/src/app/admin/settings/page.tsx`, replace the import block:

```typescript
import { SmsSendingToggle } from '@/components/admin/SmsSendingToggle';
import { ExchangeRatePanel } from '@/components/admin/ExchangeRatePanel';
```

with:

```typescript
import { SmsSendingToggle } from '@/components/admin/SmsSendingToggle';
import { PromotionsAvailabilityToggle } from '@/components/admin/PromotionsAvailabilityToggle';
import { ExchangeRatePanel } from '@/components/admin/ExchangeRatePanel';
```

Then replace:

```typescript
      <SmsSendingToggle />
      <ExchangeRatePanel />
```

with:

```typescript
      <SmsSendingToggle />
      <PromotionsAvailabilityToggle />
      <ExchangeRatePanel />
```

- [ ] **Step 4: Typecheck / build**

Run: `pnpm --filter @avino/web lint && pnpm --filter @avino/web build`
Expected: lint clean; `next build` succeeds (new client island compiles).

- [ ] **Step 5: Commit + open PR B**

```bash
git add apps/web/src/store/api/adminPromotionsFlagApi.ts apps/web/src/components/admin/PromotionsAvailabilityToggle.tsx apps/web/src/app/admin/settings/page.tsx
git commit -m "feat(web): admin toggle for promotions availability in /admin/settings

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Controller pushes `feat/promotions-flag-web` (off `main`) and opens PR targeting `main`. Title: `feat(web): promotions availability admin toggle`.

---

# PR C — `apps/client`

### Task 7: publicSettingsApi slice + usePromotionsEnabled hook

**Files:**
- Create: `apps/client/src/store/api/publicSettingsApi.ts`
- Create: `apps/client/src/lib/usePromotionsEnabled.ts`
- Test: `apps/client/src/lib/usePromotionsEnabled.test.ts`

**Interfaces:**
- Consumes: `baseApi` from `../store/api/baseApi`; API `GET /settings/public` (Task 3).
- Produces: `useGetPublicSettingsQuery`; `usePromotionsEnabled(): boolean`.

- [ ] **Step 1: Write the RTK slice**

```typescript
// apps/client/src/store/api/publicSettingsApi.ts
/**
 * publicSettingsApi — публичные фиче-флаги портала (CLAUDE.md §4).
 * GET /api/v1/settings/public → { promotionsEnabled }. Ответ уже camelCase —
 * transformResponse не нужен. Зеркалит exchangeRateApi.
 */
import { baseApi } from './baseApi';

export interface PublicSettings {
  promotionsEnabled: boolean;
}

export const publicSettingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPublicSettings: build.query<PublicSettings, void>({
      query: () => ({ url: '/settings/public' }),
    }),
  }),
  overrideExisting: false,
});

export const { useGetPublicSettingsQuery } = publicSettingsApi;
```

- [ ] **Step 2: Write the failing hook test**

```typescript
// apps/client/src/lib/usePromotionsEnabled.test.ts
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const getQuery = vi.fn();
vi.mock('@/store/api/publicSettingsApi', () => ({
  useGetPublicSettingsQuery: () => getQuery(),
}));

import { usePromotionsEnabled } from './usePromotionsEnabled';

describe('usePromotionsEnabled', () => {
  it('возвращает false, пока данные не загружены', () => {
    getQuery.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => usePromotionsEnabled());
    expect(result.current).toBe(false);
  });

  it('возвращает false, когда продвижение выключено', () => {
    getQuery.mockReturnValue({ data: { promotionsEnabled: false } });
    const { result } = renderHook(() => usePromotionsEnabled());
    expect(result.current).toBe(false);
  });

  it('возвращает true, когда продвижение включено', () => {
    getQuery.mockReturnValue({ data: { promotionsEnabled: true } });
    const { result } = renderHook(() => usePromotionsEnabled());
    expect(result.current).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @avino/client test -- usePromotionsEnabled`
Expected: FAIL — `Cannot find module './usePromotionsEnabled'`.

- [ ] **Step 4: Write the hook**

```typescript
// apps/client/src/lib/usePromotionsEnabled.ts
/**
 * usePromotionsEnabled — true только когда продвижение включено админом
 * (GET /settings/public). Дефолт/во время загрузки/при ошибке → false, чтобы
 * кнопка «Продвинуть» не мигала и по умолчанию была скрыта (ADR-0100).
 */
import { useGetPublicSettingsQuery } from '../store/api/publicSettingsApi';

export function usePromotionsEnabled(): boolean {
  const { data } = useGetPublicSettingsQuery();
  return data?.promotionsEnabled ?? false;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @avino/client test -- usePromotionsEnabled`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/store/api/publicSettingsApi.ts apps/client/src/lib/usePromotionsEnabled.ts apps/client/src/lib/usePromotionsEnabled.test.ts
git commit -m "feat(client): publicSettingsApi slice + usePromotionsEnabled hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Gate the «Продвинуть» button in MyListings

**Files:**
- Modify: `apps/client/src/features/account/MyListings.tsx`
- Test: `apps/client/src/features/account/MyListings.promote-gate.test.tsx`

**Interfaces:**
- Consumes: `usePromotionsEnabled` (Task 7).

- [ ] **Step 1: Write the failing gating test**

```typescript
// apps/client/src/features/account/MyListings.promote-gate.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

const oneListing = {
  id: 'L1',
  title: 'Тестовое объявление',
  price: 100,
  currency: 'USD',
  tx: 'SALE',
  status: 'ACTIVE',
  promo: 'NORMAL',
  district: 'Юнусабад',
  photos: [],
};

let promotionsEnabled = false;
vi.mock('@/lib/usePromotionsEnabled', () => ({
  usePromotionsEnabled: () => promotionsEnabled,
}));
vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/myListingsApi', () => ({
  useGetMyListingsQuery: () => ({
    data: { total: 1, items: [oneListing] },
    isLoading: false,
  }),
  useSetMyListingStatusMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({ display: 'USD', price: () => '$100', pin: () => '' }),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: any; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/components/ui/photo-img', () => ({ PhotoImg: () => null }));
vi.mock('@/components/ui/promo-badge', () => ({ PromoBadge: () => null }));
vi.mock('./ownerListingActions', () => ({ ownerActionsFor: () => [] }));
vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    k.split('.').reduce((o: any, p) => o?.[p], (ru as any)[ns]) ?? k,
}));

import { MyListings } from './MyListings';

describe('MyListings — гейт кнопки «Продвинуть»', () => {
  it('скрывает кнопку, когда продвижение выключено', () => {
    promotionsEnabled = false;
    render(<MyListings />);
    expect(screen.queryByText(ru.account.myListings.promote)).toBeNull();
  });

  it('показывает кнопку, когда продвижение включено', () => {
    promotionsEnabled = true;
    render(<MyListings />);
    expect(
      screen.getByText(ru.account.myListings.promote),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @avino/client test -- MyListings.promote-gate`
Expected: FAIL — second case fails (button currently renders regardless; mock hook not yet consumed), or first case fails because the button still shows when `promotionsEnabled=false`.

- [ ] **Step 3: Import the hook in MyListings**

In `apps/client/src/features/account/MyListings.tsx`, replace:

```typescript
import { useGetMyListingsQuery, useSetMyListingStatusMutation } from '@/store/api/myListingsApi';
import {
  ownerActionsFor,
```

with:

```typescript
import { useGetMyListingsQuery, useSetMyListingStatusMutation } from '@/store/api/myListingsApi';
import { usePromotionsEnabled } from '@/lib/usePromotionsEnabled';
import {
  ownerActionsFor,
```

- [ ] **Step 4: Thread the flag through ListingRow**

Replace the `ListingRow` signature:

```typescript
/** Строка объявления в кабинете. */
function ListingRow({ l }: { l: Listing }) {
```

with:

```typescript
/** Строка объявления в кабинете. */
function ListingRow({
  l,
  promotionsEnabled,
}: {
  l: Listing;
  promotionsEnabled: boolean;
}) {
```

- [ ] **Step 5: Gate the button**

Replace:

```typescript
        {/* Продвинуть — мягкий золотой premium-акцент (стаб вне области задачи). */}
        {l.promo === 'NORMAL' && (
```

with:

```typescript
        {/* Продвинуть — мягкий золотой premium-акцент (стаб). Виден только когда
            продвижение включено админом (ADR-0100); по умолчанию OFF → скрыт. */}
        {promotionsEnabled && l.promo === 'NORMAL' && (
```

- [ ] **Step 6: Call the hook once + pass the prop**

Replace:

```typescript
export function MyListings() {
  const t = useTranslations('account');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { data, isLoading } = useGetMyListingsQuery(undefined, {
    skip: !isAuthenticated,
  });
```

with:

```typescript
export function MyListings() {
  const t = useTranslations('account');
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const promotionsEnabled = usePromotionsEnabled();
  const { data, isLoading } = useGetMyListingsQuery(undefined, {
    skip: !isAuthenticated,
  });
```

Then replace:

```typescript
        {items.map((l) => (
          <ListingRow key={l.id} l={l} />
        ))}
```

with:

```typescript
        {items.map((l) => (
          <ListingRow key={l.id} l={l} promotionsEnabled={promotionsEnabled} />
        ))}
```

- [ ] **Step 7: Run the gating test + typecheck**

Run: `pnpm --filter @avino/client test -- MyListings.promote-gate`
Expected: PASS (2 passed — hidden when off, shown when on).

Run: `pnpm --filter @avino/client build`
Expected: `next build` succeeds.

- [ ] **Step 8: Commit + open PR C**

```bash
git add apps/client/src/features/account/MyListings.tsx apps/client/src/features/account/MyListings.promote-gate.test.tsx
git commit -m "feat(client): gate «Продвинуть» button behind promotions feature flag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Controller pushes `feat/promotions-flag-client` (off `main`) and opens PR targeting `main`. Title: `feat(client): hide «Продвинуть» until promotions enabled`.

---

## Post-merge (owner / deploy)

- Мёржить порядок: PR A (api) → затем B (web) и C (client). Web/client независимы по коду, но для живой проводки нужен задеплоенный api.
- **Ребилд `avino-client`** (и `avino-web`) — baked Docker-образы, HMR в проде нет; иначе изменение не видно на стенде.
- Дефолт OFF: сразу после деплоя кнопка «Продвинуть» скрыта у всех. Включение — тумблер «Продвижение объявлений» в `/admin/settings`.
- Прод-env по желанию `PROMOTION_ENABLED` — но источник правды runtime — admin-тоггл (`app_settings`).

---

## Self-Review

**Spec coverage:**
- Флаг `promotions_enabled` дефолт OFF + резолвер → Task 1, 2. ✅
- env-дефолт `promotion.enabled` (env `PROMOTION_ENABLED`) → Task 2 (рефайн vs spec: `PROMOTION_ENABLED` вместо `PROMOTIONS_ENABLED` — консистентность с семейством `PROMOTION_EXPIRY_*`; co-located в namespace `promotion`). ✅
- Admin write `GET/PATCH /admin/promotions-flag` + audit `PROMOTIONS_FLAG_UPDATE` → Task 2, 3. ✅
- Public read `GET /settings/public` (no auth, default false) → Task 3. ✅
- OpenAPI public-doc + regen → Task 4. ✅
- Web тумблер в /admin/settings → Task 6. ✅
- Client `publicSettingsApi` + `usePromotionsEnabled` + гейт кнопки → Task 7, 8. ✅
- ADR-0100 + DONE.md → Task 5. ✅
- 3 PR по app-границам; субагенты без git → Tasks + Global Constraints. ✅
- Forward-нота (будущий promote-эндпоинт проверяет тот же флаг; service экспортируется) → ADR + SettingsModule `exports`. ✅
- Тесты: резолвер, сервис (вкл. DB-ошибка→дефолт), оба контроллера, hook, гейт MyListings. ✅

**Refinements vs spec (intentional):**
- Admin write живёт в новом `SettingsModule` (рядом с публичным контроллером и общим сервисом), а не в `AdminModule` — следует прецеденту `ExchangeRateModule` (admin+public контроллеры в одном доменном модуле) и держит DRY один `PromotionsFlagService`. Изоляция сохранена.
- env-имя `PROMOTION_ENABLED` (см. выше).

**Placeholder scan:** Нет TBD/«handle errors»/«similar to». Единственный реальный лукап — PR-номера в DONE.md (проставляются при создании PR — это факт, известный только во время выполнения, не плейсхолдер логики).

**Type consistency:** `promotionsEnabled` (camelCase) — единое имя в API-ответе (`PublicSettingsView`, admin-контроллер), web-слайсе (`PromotionsFlag`), client-слайсе (`PublicSettings`) и хуке. AppSetting-ключ `promotions_enabled` (строка) — единый в `PROMOTIONS_ENABLED_KEY`, сервисе и тестах. Audit-action `PROMOTIONS_FLAG_UPDATE` — единый в сервисе и тесте. Config-ключ `promotion.enabled` + env `PROMOTION_ENABLED` — единые в configuration.ts, сервисе, env.validation.
