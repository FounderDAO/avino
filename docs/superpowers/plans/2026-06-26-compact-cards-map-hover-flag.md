# Компактные карточки Zillow + флаг центрирования карты — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать «езду» карты при наведении на карточку (по умолчанию), оставив возврат поведения через admin-флаг, и сделать карточки выдачи компактными в стиле Zillow.

**Architecture:** Новый runtime-флаг `map_hover_recenter` (key-value в `app_settings`) полностью зеркалит существующий `promotions_enabled`: API-сервис + admin-контроллер + поле в `GET /settings/public`; клиент читает флаг хуком и гейтит вызов `map.panTo` в `MapView`; админка (`apps/web`) получает тумблер. Параллельно `PropertyCard` переписывается в компактный Zillow-минимализм. Работа разбита на 3 PR по app-папкам.

**Tech Stack:** NestJS + Prisma (api), Next.js 15 + RTK Query + Tailwind + Vitest/RTL (client), Next.js + RTK Query (web admin), Yandex Maps JS API 2.1.

## Global Constraints

- Prose/комментарии — на русском; код, commit-сообщения, i18n-ключи, route-пути — по обычным правилам. (memory: user-language-russian)
- API отдаёт **camelCase** напрямую (нет глобального snake_case-трансформера). (memory: avino-promotions-feature-flag)
- Флаг по умолчанию **`false`** во всех слоях (env-дефолт, хук при loading/error).
- Изменение ответа `GET /settings/public` меняет публичный OpenAPI → **обязательно регенерировать `apps/api/openapi.public.json`** в том же PR, иначе CI drift-check красный. (memory: avino-api-docs-two-layers)
- `admin-*`-контроллер регистрируется в **AdminModule**, а не в SettingsModule (чтобы DTO не утекали в `openapi.public`). (см. `settings.module.ts` док-коммент)
- `main` защищён: открываю PR, мёржит пользователь, **никогда `--admin`**. (memory: avino-main-branch-protection)
- GitHub-операции — токеном из `~/.gh_token`, значение не печатать. (CLAUDE.md)
- Git-мутации — **по одной команде** (цепочки `git ... && git ...` с reset/push-f отклоняются правами). Каждая app-папка — своя ветка/PR; субагенты git не трогают, git владеет контроллер. (memory: avino-git-mutation-single-commands, avino-subagents-shared-workdir-git-hazard)
- Conventional Commits. Каждое commit-сообщение завершается трейлером `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (далее в примерах не дублируется).

---

# PR #1 — `apps/api`: флаг `map_hover_recenter`

Ветка: `feat/map-hover-recenter-flag-api`. Зеркалит `promotions_enabled`. Миграция БД **не нужна** (`app_settings` уже существует).

### Task 1: Константы + env-конфиг флага

**Files:**
- Create: `apps/api/src/settings/map-hover-recenter-flag.constants.ts`
- Test: `apps/api/src/settings/map-hover-recenter-flag.constants.spec.ts`
- Modify: `apps/api/src/config/configuration.ts` (добавить `mapHoverRecenterConfig` + регистрация в массиве `configurations`, ~стр. 86 и ~стр. 338)

**Interfaces:**
- Produces: `MAP_HOVER_RECENTER_KEY = 'map_hover_recenter'`; `resolveMapHoverRecenter(stored: string | null | undefined, envDefault: boolean): boolean`; config-ключ `mapHoverRecenter.enabled` (boolean, env `MAP_HOVER_RECENTER_ENABLED`, default false).

- [ ] **Step 1: Написать падающий тест констант**

`apps/api/src/settings/map-hover-recenter-flag.constants.spec.ts`:
```ts
import { resolveMapHoverRecenter } from './map-hover-recenter-flag.constants';

describe('resolveMapHoverRecenter', () => {
  it('returns true when stored "true"', () => {
    expect(resolveMapHoverRecenter('true', false)).toBe(true);
  });
  it('returns false when stored "false"', () => {
    expect(resolveMapHoverRecenter('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolveMapHoverRecenter(null, true)).toBe(true);
    expect(resolveMapHoverRecenter(undefined, false)).toBe(false);
    expect(resolveMapHoverRecenter('garbage', true)).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd apps/api && pnpm jest src/settings/map-hover-recenter-flag.constants.spec.ts`
Expected: FAIL — `Cannot find module './map-hover-recenter-flag.constants'`.

- [ ] **Step 3: Создать файл констант**

`apps/api/src/settings/map-hover-recenter-flag.constants.ts`:
```ts
/** Ключ runtime-настройки в app_settings для тоггла центрирования карты при наведении. */
export const MAP_HOVER_RECENTER_KEY = 'map_hover_recenter';

/**
 * Резолюция флага центрирования карты: значение из app_settings (если
 * 'true'/'false') главнее; иначе — env-дефолт (`mapHoverRecenter.enabled` из
 * configuration.ts, default false). Чистая функция — шарится между
 * MapHoverRecenterFlagService и тестами. Зеркалит {@link resolvePromotionsEnabled}.
 */
export function resolveMapHoverRecenter(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}
```

- [ ] **Step 4: Зарегистрировать env-конфиг**

В `apps/api/src/config/configuration.ts` после блока `promotionConfig` (после ~стр. 96 закрывающей `}));`) добавить:
```ts
export const mapHoverRecenterConfig = registerAs('mapHoverRecenter', () => ({
  // Центрирование карты к пину при наведении на карточку в /search (поведение
  // «карта едет»). По умолчанию ВЫКЛЮЧЕНО — карта стоит на месте (Zillow-режим).
  // MAP_HOVER_RECENTER_ENABLED=true → true. Перебивается runtime-строкой
  // map_hover_recenter в app_settings (admin-тоггл).
  enabled:
    process.env.MAP_HOVER_RECENTER_ENABLED != null
      ? process.env.MAP_HOVER_RECENTER_ENABLED === 'true'
      : false,
}));
```
И добавить `mapHoverRecenterConfig,` в массив `configurations` (рядом с `promotionConfig,`, ~стр. 338).

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `cd apps/api && pnpm jest src/settings/map-hover-recenter-flag.constants.spec.ts`
Expected: PASS (3 теста).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/settings/map-hover-recenter-flag.constants.ts apps/api/src/settings/map-hover-recenter-flag.constants.spec.ts apps/api/src/config/configuration.ts
git commit -m "feat(api): map_hover_recenter flag constants + env config"
```

---

### Task 2: `MapHoverRecenterFlagService`

**Files:**
- Create: `apps/api/src/settings/map-hover-recenter-flag.service.ts`
- Test: `apps/api/src/settings/map-hover-recenter-flag.service.spec.ts`

**Interfaces:**
- Consumes: `MAP_HOVER_RECENTER_KEY`, `resolveMapHoverRecenter` (Task 1); `PrismaService`, `ConfigService`.
- Produces: `MapHoverRecenterFlagService` с `isEnabled(): Promise<boolean>` и `setEnabled(adminId: string, enabled: boolean): Promise<boolean>`. Audit action: `'MAP_HOVER_RECENTER_FLAG_UPDATE'`.

- [ ] **Step 1: Написать падающий тест сервиса**

`apps/api/src/settings/map-hover-recenter-flag.service.spec.ts`:
```ts
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';

describe('MapHoverRecenterFlagService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue(false) }; // env default false
  let service: MapHoverRecenterFlagService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockReturnValue(false);
    service = new MapHoverRecenterFlagService(prisma as never, config as never);
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
        where: { key: 'map_hover_recenter' },
        update: { value: 'true' },
        create: { key: 'map_hover_recenter', value: 'true' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'MAP_HOVER_RECENTER_FLAG_UPDATE',
          metadata: { enabled: true },
        }),
      }),
    );
  });

  it('setEnabled(false) upserts "false" + audit enabled:false', async () => {
    const result = await service.setEnabled('admin1', false);
    expect(result).toBe(false);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'map_hover_recenter' },
        update: { value: 'false' },
        create: { key: 'map_hover_recenter', value: 'false' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'MAP_HOVER_RECENTER_FLAG_UPDATE',
          metadata: { enabled: false },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd apps/api && pnpm jest src/settings/map-hover-recenter-flag.service.spec.ts`
Expected: FAIL — модуль сервиса не найден.

- [ ] **Step 3: Создать сервис**

`apps/api/src/settings/map-hover-recenter-flag.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  MAP_HOVER_RECENTER_KEY,
  resolveMapHoverRecenter,
} from './map-hover-recenter-flag.constants';

/**
 * Runtime-флаг центрирования карты при наведении на карточку (/search). Хранит
 * булеву строку в app_settings (ключ map_hover_recenter); читается публичным
 * PublicSettingsController и admin-тогглом без пересборки. Резолюция (DB-строка
 * > env-дефолт `mapHoverRecenter.enabled`, default false). Зеркалит
 * PromotionsFlagService.
 */
@Injectable()
export class MapHoverRecenterFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Текущее значение флага. DB-ошибка → безопасный env-дефолт (false). */
  async isEnabled(): Promise<boolean> {
    const envDefault =
      this.config.get<boolean>('mapHoverRecenter.enabled') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: MAP_HOVER_RECENTER_KEY },
      });
      return resolveMapHoverRecenter(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Включить/выключить центрирование (ADMIN). Пишет app_settings + audit-log. */
  async setEnabled(adminId: string, enabled: boolean): Promise<boolean> {
    const value = String(enabled);
    await this.prisma.appSetting.upsert({
      where: { key: MAP_HOVER_RECENTER_KEY },
      update: { value },
      create: { key: MAP_HOVER_RECENTER_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'MAP_HOVER_RECENTER_FLAG_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { enabled },
      },
    });
    return enabled;
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd apps/api && pnpm jest src/settings/map-hover-recenter-flag.service.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settings/map-hover-recenter-flag.service.ts apps/api/src/settings/map-hover-recenter-flag.service.spec.ts
git commit -m "feat(api): MapHoverRecenterFlagService (app_settings + audit)"
```

---

### Task 3: DTO + admin-контроллер + регистрация в модулях

**Files:**
- Create: `apps/api/src/settings/dto/update-map-hover-recenter-flag.dto.ts`
- Create: `apps/api/src/settings/admin-map-hover-recenter-flag.controller.ts`
- Test: `apps/api/src/settings/admin-map-hover-recenter-flag.controller.spec.ts`
- Modify: `apps/api/src/settings/index.ts` (экспорты)
- Modify: `apps/api/src/settings/settings.module.ts` (provider + export сервиса)
- Modify: `apps/api/src/admin/admin.module.ts` (импорт + регистрация контроллера, ~стр. 7 и ~стр. 65)

**Interfaces:**
- Consumes: `MapHoverRecenterFlagService` (Task 2).
- Produces: `AdminMapHoverRecenterFlagController` — `GET /api/v1/admin/map-hover-recenter-flag` → `{ mapHoverRecenter: boolean }`; `PATCH` (body `{ enabled: boolean }`) → `{ mapHoverRecenter: boolean }`. `UpdateMapHoverRecenterFlagDto { enabled: boolean }`.

- [ ] **Step 1: Написать падающий тест контроллера**

`apps/api/src/settings/admin-map-hover-recenter-flag.controller.spec.ts`:
```ts
import { AdminMapHoverRecenterFlagController } from './admin-map-hover-recenter-flag.controller';

describe('AdminMapHoverRecenterFlagController', () => {
  it('GET returns the current flag', async () => {
    const flags: any = {
      isEnabled: jest.fn().mockResolvedValue(false),
      setEnabled: jest.fn(),
    };
    const controller = new AdminMapHoverRecenterFlagController(flags);
    expect(await controller.get()).toEqual({ mapHoverRecenter: false });
  });

  it('PATCH delegates to setEnabled with admin id and returns the new value', async () => {
    const flags: any = {
      isEnabled: jest.fn(),
      setEnabled: jest.fn().mockResolvedValue(true),
    };
    const controller = new AdminMapHoverRecenterFlagController(flags);
    const res = await controller.update('admin-1', { enabled: true });
    expect(flags.setEnabled).toHaveBeenCalledWith('admin-1', true);
    expect(res).toEqual({ mapHoverRecenter: true });
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd apps/api && pnpm jest src/settings/admin-map-hover-recenter-flag.controller.spec.ts`
Expected: FAIL — модуль контроллера не найден.

- [ ] **Step 3: Создать DTO**

`apps/api/src/settings/dto/update-map-hover-recenter-flag.dto.ts`:
```ts
import { IsBoolean } from 'class-validator';

/** Тело `PATCH /api/v1/admin/map-hover-recenter-flag`. */
export class UpdateMapHoverRecenterFlagDto {
  @IsBoolean()
  enabled!: boolean;
}
```

- [ ] **Step 4: Создать контроллер**

`apps/api/src/settings/admin-map-hover-recenter-flag.controller.ts`:
```ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';
import { UpdateMapHoverRecenterFlagDto } from './dto/update-map-hover-recenter-flag.dto';

/**
 * Runtime-тоггл центрирования карты при наведении на карточку (ADMIN). GET —
 * текущее состояние; PATCH — вкл/выкл без пересборки (пишет app_settings).
 * Зеркалит AdminPromotionsFlagController. Клиент читает значение через
 * GET /settings/public.
 */
@Controller({ path: 'admin/map-hover-recenter-flag', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMapHoverRecenterFlagController {
  constructor(private readonly flags: MapHoverRecenterFlagService) {}

  @Get()
  async get(): Promise<{ mapHoverRecenter: boolean }> {
    return { mapHoverRecenter: await this.flags.isEnabled() };
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateMapHoverRecenterFlagDto,
  ): Promise<{ mapHoverRecenter: boolean }> {
    return {
      mapHoverRecenter: await this.flags.setEnabled(adminId, dto.enabled),
    };
  }
}
```

- [ ] **Step 5: Добавить экспорты в `index.ts`**

Дополнить `apps/api/src/settings/index.ts` (в конец):
```ts
export { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';
export {
  MAP_HOVER_RECENTER_KEY,
  resolveMapHoverRecenter,
} from './map-hover-recenter-flag.constants';
export { AdminMapHoverRecenterFlagController } from './admin-map-hover-recenter-flag.controller';
```

- [ ] **Step 6: Зарегистрировать сервис в `settings.module.ts`**

В `apps/api/src/settings/settings.module.ts`: импорт + provider + export.
```ts
import { Module } from '@nestjs/common';
import { PublicSettingsController } from './public-settings.controller';
import { PromotionsFlagService } from './promotions-flag.service';
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';
```
И в декораторе:
```ts
  providers: [PromotionsFlagService, MapHoverRecenterFlagService],
  exports: [PromotionsFlagService, MapHoverRecenterFlagService],
```

- [ ] **Step 7: Зарегистрировать контроллер в `admin.module.ts`**

В `apps/api/src/admin/admin.module.ts`:
- В импорте из `'../settings'` (стр. 7) добавить `AdminMapHoverRecenterFlagController`:
  ```ts
  import { SettingsModule, AdminPromotionsFlagController, AdminMapHoverRecenterFlagController } from '../settings';
  ```
- В массив `controllers` (рядом со стр. 65 `AdminPromotionsFlagController,`) добавить:
  ```ts
    AdminMapHoverRecenterFlagController,
  ```

- [ ] **Step 8: Запустить тест контроллера + сборку**

Run: `cd apps/api && pnpm jest src/settings/admin-map-hover-recenter-flag.controller.spec.ts`
Expected: PASS (2 теста).
Run: `cd apps/api && pnpm exec tsc -p tsconfig.json --noEmit`
Expected: без ошибок типов.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/settings/dto/update-map-hover-recenter-flag.dto.ts apps/api/src/settings/admin-map-hover-recenter-flag.controller.ts apps/api/src/settings/admin-map-hover-recenter-flag.controller.spec.ts apps/api/src/settings/index.ts apps/api/src/settings/settings.module.ts apps/api/src/admin/admin.module.ts
git commit -m "feat(api): admin endpoint for map_hover_recenter flag"
```

---

### Task 4: Поле `mapHoverRecenter` в `GET /settings/public`

**Files:**
- Modify: `apps/api/src/settings/public-settings.controller.ts`
- Test: `apps/api/src/settings/public-settings.controller.spec.ts`

**Interfaces:**
- Consumes: `PromotionsFlagService`, `MapHoverRecenterFlagService`.
- Produces: `PublicSettingsView { promotionsEnabled: boolean; mapHoverRecenter: boolean }`.

- [ ] **Step 1: Обновить тест под новое поле (станет падать)**

Заменить содержимое `apps/api/src/settings/public-settings.controller.spec.ts`:
```ts
import { PublicSettingsController } from './public-settings.controller';

describe('PublicSettingsController', () => {
  it('returns both flags as false', async () => {
    const promo: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const mapHover: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const controller = new PublicSettingsController(promo, mapHover);
    expect(await controller.get()).toEqual({
      promotionsEnabled: false,
      mapHoverRecenter: false,
    });
  });

  it('reflects each flag independently', async () => {
    const promo: any = { isEnabled: jest.fn().mockResolvedValue(true) };
    const mapHover: any = { isEnabled: jest.fn().mockResolvedValue(false) };
    const controller = new PublicSettingsController(promo, mapHover);
    expect(await controller.get()).toEqual({
      promotionsEnabled: true,
      mapHoverRecenter: false,
    });
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd apps/api && pnpm jest src/settings/public-settings.controller.spec.ts`
Expected: FAIL (конструктор принимает один аргумент / поля нет).

- [ ] **Step 3: Расширить контроллер**

Заменить `apps/api/src/settings/public-settings.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { PromotionsFlagService } from './promotions-flag.service';
import { MapHoverRecenterFlagService } from './map-hover-recenter-flag.service';

/** Публичные настройки/фиче-флаги для портала и мобильных клиентов. */
export interface PublicSettingsView {
  promotionsEnabled: boolean;
  mapHoverRecenter: boolean;
}

/**
 * `GET /api/v1/settings/public` — публичные флаги без авторизации. Точка
 * расширения для будущих клиентских флагов (добавляется поле, не эндпоинт).
 */
@Controller({ path: 'settings/public', version: '1' })
export class PublicSettingsController {
  constructor(
    private readonly flags: PromotionsFlagService,
    private readonly mapHover: MapHoverRecenterFlagService,
  ) {}

  @Get()
  async get(): Promise<PublicSettingsView> {
    return {
      promotionsEnabled: await this.flags.isEnabled(),
      mapHoverRecenter: await this.mapHover.isEnabled(),
    };
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd apps/api && pnpm jest src/settings/public-settings.controller.spec.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Прогнать весь settings-модуль**

Run: `cd apps/api && pnpm jest src/settings`
Expected: PASS все спеки settings (constants/service/controllers).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/settings/public-settings.controller.ts apps/api/src/settings/public-settings.controller.spec.ts
git commit -m "feat(api): expose mapHoverRecenter in GET /settings/public"
```

---

### Task 5: Регенерация публичного OpenAPI

**Files:**
- Modify (generated): `apps/api/openapi.public.json` (и `openapi.internal.json` если изменится)

- [ ] **Step 1: Сгенерировать спеки**

Run: `cd apps/api && pnpm openapi:export`
(скрипт = `nest build && node dist/scripts/export-openapi.js`; если падает на валидации env — задать те же dummy-переменные, что использует CI drift-check job, см. `.github/workflows/` шаг с `openapi`. По завершении в консоли: `OpenAPI specs written: openapi.public.json, openapi.internal.json`.)

- [ ] **Step 2: Проверить, что новое поле попало в публичный спек**

Run: `grep -n "mapHoverRecenter" apps/api/openapi.public.json`
Expected: совпадение в схеме ответа `GET /settings/public` (`mapHoverRecenter` рядом с `promotionsEnabled`).

- [ ] **Step 3: Проверить drift-check (если есть отдельный скрипт)**

Run: `cd apps/api && pnpm openapi:check 2>/dev/null || echo "no openapi:check script — drift проверится в CI"`
Expected: zero diff / зелёный.

- [ ] **Step 4: Commit**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json
git commit -m "chore(api): regen OpenAPI for mapHoverRecenter public flag"
```

- [ ] **Step 5: Открыть PR #1**

```bash
gh pr create --base main --head feat/map-hover-recenter-flag-api --title "feat(api): map_hover_recenter runtime flag" --body "Новый admin-флаг центрирования карты при наведении на карточку (default OFF), зеркалит promotions_enabled. Поле mapHoverRecenter в GET /settings/public + regen openapi. См. docs/superpowers/specs/2026-06-26-compact-cards-map-hover-flag-design.md"
```
(не мёржить — мёржит пользователь.)

---

# PR #2 — `apps/client`: компактная карточка + гейтинг `panTo`

Ветка: `feat/compact-cards-map-hover-client`. Работает и без PR #1 (хук возвращает `false` при отсутствии поля/ошибке).

### Task 6: Чтение флага на клиенте (api-поле + хук)

**Files:**
- Modify: `apps/client/src/store/api/publicSettingsApi.ts`
- Create: `apps/client/src/lib/useMapHoverRecenter.ts`

**Interfaces:**
- Produces: `PublicSettings { promotionsEnabled: boolean; mapHoverRecenter: boolean }`; `useMapHoverRecenter(): boolean` (default `false` при loading/error/отсутствии поля).

- [ ] **Step 1: Добавить поле в `PublicSettings`**

В `apps/client/src/store/api/publicSettingsApi.ts` расширить интерфейс:
```ts
export interface PublicSettings {
  promotionsEnabled: boolean;
  mapHoverRecenter: boolean;
}
```
(остальной файл без изменений — `transformResponse` не нужен, ответ уже camelCase.)

- [ ] **Step 2: Создать хук**

`apps/client/src/lib/useMapHoverRecenter.ts`:
```ts
/**
 * useMapHoverRecenter — флаг «центрировать карту при наведении на карточку» из
 * публичных настроек (GET /settings/public). Пока грузится / при ошибке / если
 * поле отсутствует — возвращает false (fail-safe: карта стоит на месте,
 * Zillow-режим). Зеркалит usePromotionsEnabled.
 *
 * Использование:
 *   const recenter = useMapHoverRecenter();
 *   <MapView recenterOnHover={recenter} ... />
 */
import { useGetPublicSettingsQuery } from '@/store/api/publicSettingsApi';

export function useMapHoverRecenter(): boolean {
  const { data, isLoading, isError } = useGetPublicSettingsQuery();
  if (isLoading || isError || !data) return false;
  return data.mapHoverRecenter ?? false;
}
```

- [ ] **Step 3: Проверка типов**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/store/api/publicSettingsApi.ts apps/client/src/lib/useMapHoverRecenter.ts
git commit -m "feat(client): read mapHoverRecenter flag (api field + hook)"
```

---

### Task 7: Гейтинг `panTo` в `MapView`

**Files:**
- Modify: `apps/client/src/features/map/MapView.tsx` (props-интерфейс ~стр. 30–60; эффект `activeId` ~стр. 270–285)

**Interfaces:**
- Consumes: ничего нового.
- Produces: проп `recenterOnHover?: boolean` (default `false`) у `MapViewProps`. Подсветка пина — без изменений; `map.panTo` вызывается только если `recenterOnHover === true`.

- [ ] **Step 1: Добавить проп в `MapViewProps`**

В `apps/client/src/features/map/MapView.tsx` в интерфейс `MapViewProps` (рядом с `activeId`, ~стр. 33) добавить:
```ts
  /** Центрировать карту к активному пину при наведении/выборе. Default false
   *  (карта стоит на месте — Zillow-режим). Управляется admin-флагом. */
  recenterOnHover?: boolean;
```

- [ ] **Step 2: Принять проп с дефолтом в сигнатуре компонента**

Найти деструктуризацию пропсов компонента `MapView` (там же, где `activeId`, `onSelect`, `autoFit` и т.д.) и добавить `recenterOnHover = false,` в список. Если компонент берёт `props` целиком — обращаться как `props.recenterOnHover ?? false`. (Сохранить существующий стиль файла.)

- [ ] **Step 3: Загейтить `panTo` в эффекте**

Заменить блок в эффекте подсветки (текущие стр. 280–283):
```ts
    if (activeId) {
      const a = listings.find((l) => l.id === activeId);
      if (a?.lat != null && a?.lng != null) map.panTo([a.lat, a.lng], { flying: true });
    }
```
на:
```ts
    if (recenterOnHover && activeId) {
      const a = listings.find((l) => l.id === activeId);
      if (a?.lat != null && a?.lng != null) map.panTo([a.lat, a.lng], { flying: true });
    }
```
И добавить `recenterOnHover` в массив зависимостей эффекта (строка `}, [activeId, ymaps]);` → `}, [activeId, ymaps, recenterOnHover]);`).
Также обновить док-коммент модуля (стр. 14): «наведение → onHover; активный пин подсвечивается, центрирование карты — опционально (admin-флаг recenterOnHover)».

- [ ] **Step 4: Проверка типов + сборка**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: без ошибок (новый проп опционален — существующие вызовы `MapView` на /map не ломаются).

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/map/MapView.tsx
git commit -m "feat(client): gate map panTo on recenterOnHover prop (default off)"
```

---

### Task 8: Прокинуть флаг в `SearchResults` + уплотнить сетку

**Files:**
- Modify: `apps/client/src/features/search/SearchResults.tsx` (импорт хука; `<MapView>` ~стр. 177–187; обе сетки `gap-5 px-5` ~стр. 257 и ~стр. 284)

**Interfaces:**
- Consumes: `useMapHoverRecenter` (Task 6); проп `recenterOnHover` (Task 7).

- [ ] **Step 1: Импортировать и вызвать хук**

В `apps/client/src/features/search/SearchResults.tsx` добавить импорт (рядом с другими `@/lib` импортами):
```ts
import { useMapHoverRecenter } from '@/lib/useMapHoverRecenter';
```
И внутри компонента (рядом с `const [activeId, setActiveId] = ...`):
```ts
  const recenterOnHover = useMapHoverRecenter();
```

- [ ] **Step 2: Передать проп в `MapView`**

В JSX `<MapView ... />` (~стр. 177) добавить строку:
```tsx
          recenterOnHover={recenterOnHover}
```
(рядом с `activeId={activeId}` / `onHover={setActiveId}`.)

- [ ] **Step 3: Уплотнить сетки карточек**

Заменить класс сетки в **двух** местах:
- скелетоны (~стр. 257): `grid grid-cols-1 gap-5 px-5 pb-6 sm:grid-cols-2` → `grid grid-cols-1 gap-4 px-4 pb-6 sm:grid-cols-2`
- выдача (~стр. 284): `grid grid-cols-1 gap-5 px-5 pb-5 sm:grid-cols-2` → `grid grid-cols-1 gap-4 px-4 pb-5 sm:grid-cols-2`

- [ ] **Step 4: Проверка типов**

Run: `cd apps/client && pnpm exec tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/search/SearchResults.tsx
git commit -m "feat(client): wire mapHoverRecenter into MapView + tighten results grid"
```

---

### Task 9: Компактная карточка Zillow (`PropertyCard`)

**Files:**
- Modify: `apps/client/src/features/search/PropertyCard.tsx`
- Modify: `apps/client/src/features/search/PropertyCardSkeleton.tsx`
- Test: `apps/client/src/features/search/PropertyCard.test.tsx`

**Interfaces:**
- Consumes: `specs`, `propertyTypeLabel` (`@/lib/format`); `usePriceFormatter`; `PhotoImg`, `PromoBadge`/`NewBadge`, `FavButton`. (Больше **не** используются `txLabel`, `isFresh`, `MapPin` для агентства/заголовка — `isFresh` остаётся для `NewBadge`.)
- Produces: компактная карточка без лейбла сделки, без отдельного заголовка, без строки «тип · агентство»; тип жилья переезжает в строку спеков.

- [ ] **Step 1: Написать падающий рендер-тест**

`apps/client/src/features/search/PropertyCard.test.tsx`:
```tsx
/**
 * Тесты PropertyCard (компактный Zillow-минимализм).
 * Мокируем зависимости с провайдерами/стором, чтобы рендерить изолированно.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PropertyCard } from './PropertyCard';
import type { Listing } from '@/lib/mock/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/lib/usePriceFormatter', () => ({
  usePriceFormatter: () => ({ price: () => '$108 223' }),
}));
vi.mock('@/components/ui/photo-img', () => ({
  PhotoImg: () => <div data-testid="photo" />,
}));
vi.mock('@/components/ui/promo-badge', () => ({
  PromoBadge: () => null,
  NewBadge: () => null,
}));
vi.mock('@/components/ui/fav-button', () => ({
  FavButton: () => <button aria-label="fav" />,
}));

const listing = {
  id: 'l1',
  title: 'Тестовый заголовок объявления',
  tx: 'SALE',
  type: 'APARTMENT',
  rooms: 4,
  area: 120,
  floor: 3,
  totalFloors: 9,
  district: 'Яшнабад',
  address: 'ул. Тестовая 1',
  createdAt: '2000-01-01T00:00:00.000Z',
  promo: 'NORMAL',
  photos: [{ thumb: '' }],
  agent: { agency: 'Тест-Агентство', pro: false },
} as unknown as Listing;

describe('PropertyCard (compact)', () => {
  it('renders price, specs row and location', () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.getByText('$108 223')).toBeInTheDocument();
    // тип жилья присутствует в строке спеков
    expect(screen.getByText(/propertyType\.APARTMENT/)).toBeInTheDocument();
    // локация
    expect(screen.getByText(/Яшнабад/)).toBeInTheDocument();
  });

  it('omits the transaction label, marketing title and agency line', () => {
    render(<PropertyCard listing={listing} />);
    expect(screen.queryByText(/^tx\.SALE/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Тестовый заголовок объявления'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Тест-Агентство')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @avino/client test -- PropertyCard.test.tsx`
Expected: FAIL (текущая карточка рендерит `tx.SALE`, заголовок и агентство).

- [ ] **Step 3: Переписать карточку компактно**

Заменить `apps/client/src/features/search/PropertyCard.tsx`:
```tsx
/**
 * PropertyCard — компактная карточка объекта (Zillow-минимализм).
 * Вся карточка — ссылка на /listing/[id]; поверх фото: PromoBadge/«Новое» и
 * FavButton. Тело: цена → строка спеков (комнаты·площадь·…·тип жилья) → локация.
 * Лейбл сделки, отдельный заголовок и строка «тип · агентство» убраны намеренно
 * (компактность, ADR/спек 2026-06-26).
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { MapPin } from 'lucide-react';
import { PhotoImg } from '@/components/ui/photo-img';
import { PromoBadge, NewBadge } from '@/components/ui/promo-badge';
import { FavButton } from '@/components/ui/fav-button';
import { specs, propertyTypeLabel, isFresh } from '@/lib/format';
import type { Listing } from '@/lib/mock/types';
import { usePriceFormatter } from '@/lib/usePriceFormatter';

export interface PropertyCardProps {
  listing: Listing;
  className?: string;
}

export function PropertyCard({ listing, className }: PropertyCardProps) {
  const tUnits = useTranslations('units');
  const tEnums = useTranslations('enums');
  const fmt = usePriceFormatter();
  const parts = specs(listing, tUnits);
  // Тип жилья — последним элементом строки спеков (как «House for sale» у Zillow).
  const specParts = [...parts, propertyTypeLabel(listing.type, tEnums)];
  const fresh = isFresh(listing.createdAt);

  return (
    <Link
      href={`/listing/${listing.id}`}
      className={
        'group flex h-full flex-col overflow-hidden rounded-card border border-border/60 bg-surface shadow-card transition-shadow duration-200 hover:shadow-card-hover ' +
        (className ?? '')
      }
    >
      {/* Фото */}
      <div className="relative aspect-[3/2] shrink-0 overflow-hidden">
        <PhotoImg
          src={listing.photos[0]?.thumb ?? ''}
          alt={listing.title}
          className="transition-transform duration-[400ms] group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
        />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <PromoBadge promo={listing.promo} />
          {fresh && listing.promo === 'NORMAL' && <NewBadge />}
        </div>
        <div className="absolute right-2.5 top-2.5">
          <FavButton listingId={listing.id} />
        </div>
      </div>

      {/* Тело */}
      <div className="flex flex-1 flex-col px-3 py-2.5">
        <div className="truncate text-[19px] font-bold tracking-[-0.01em] text-ink">
          {fmt.price(listing)}
        </div>

        {/* Характеристики + тип жилья одной строкой */}
        <div className="mt-1 flex flex-wrap items-center text-[13px] text-muted-foreground">
          {specParts.map((p, i) => (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <span className="mx-[7px] text-border">·</span>}
              {p}
            </span>
          ))}
        </div>

        {/* Локация (заголовок-адрес, по-зилловски) */}
        <div className="mt-1 flex items-center gap-1 text-[12.5px] text-muted-foreground">
          <MapPin size={13} strokeWidth={1.8} className="shrink-0" />
          <span className="truncate">
            {listing.district} · {listing.address}
          </span>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/client test -- PropertyCard.test.tsx`
Expected: PASS (2 теста).

- [ ] **Step 5: Привести скелетон к новой геометрии**

Заменить `apps/client/src/features/search/PropertyCardSkeleton.tsx`:
```tsx
/**
 * PropertyCardSkeleton — скелетон карточки объекта (loading-состояние).
 * Повторяет геометрию компактной PropertyCard (фото 3:2 + 3 строки тела).
 */
import { Skeleton } from '@/components/ui/skeleton';

export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-surface shadow-card">
      <Skeleton className="aspect-[3/2] rounded-none" />
      <div className="px-3 py-2.5">
        <Skeleton className="h-5 w-[45%]" />
        <Skeleton className="mt-2 h-3.5 w-[70%]" />
        <Skeleton className="mt-2 h-3 w-[55%]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Линт + полная сборка клиента**

Run: `cd apps/client && pnpm exec next lint --file src/features/search/PropertyCard.tsx`
Expected: без ошибок.
Run: `cd apps/client && pnpm exec next build`
Expected: успешная сборка. (⚠️ `rtk next build` может ложно показать «Errors: 1» при чистой сборке — проверять raw `pnpm exec next build`. memory: avino-rtk-next-build-false-error)

- [ ] **Step 7: Визуальная проверка (screenshot)**

Поднять клиент локально и сделать скриншот `/search` (Chrome headless `--virtual-time-budget`, API:4000 / client:3001 — memory: avino-client-screenshot-recipe). Сверить с Zillow: карточки компактные (фото 3:2, цена → спеки+тип → адрес, без лейбла/заголовка/агентства), 2 колонки, плотные отступы.
Expected: layout визуально близок к Zillow-референсу.

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/features/search/PropertyCard.tsx apps/client/src/features/search/PropertyCardSkeleton.tsx apps/client/src/features/search/PropertyCard.test.tsx
git commit -m "feat(client): compact Zillow-style property card"
```

- [ ] **Step 9: Открыть PR #2**

```bash
gh pr create --base main --head feat/compact-cards-map-hover-client --title "feat(client): compact cards + map hover recenter gating" --body "Компактные карточки выдачи (Zillow-минимализм) + наведение на карточку больше не двигает карту (гейтинг panTo за флагом mapHoverRecenter, default off). Подсветка пина сохранена. См. spec 2026-06-26-compact-cards-map-hover-flag-design.md"
```

---

# PR #3 — `apps/web`: admin-тоггл

Ветка: `feat/map-hover-recenter-toggle-web`. Зависит от эндпоинтов PR #1.

### Task 10: RTK-API + тумблер в настройках админки

**Files:**
- Create: `apps/web/src/store/api/adminMapHoverRecenterFlagApi.ts`
- Create: `apps/web/src/components/admin/MapHoverRecenterToggle.tsx`
- Modify: `apps/web/src/app/admin/settings/page.tsx` (добавить тумблер рядом с `<PromotionsAvailabilityToggle />`)

**Interfaces:**
- Consumes: `adminApi` (тег `Admin`); эндпоинты `/admin/map-hover-recenter-flag` (PR #1).
- Produces: `useGetMapHoverRecenterFlagQuery`, `useUpdateMapHoverRecenterFlagMutation`; компонент `MapHoverRecenterToggle`.

- [ ] **Step 1: Создать RTK-API**

`apps/web/src/store/api/adminMapHoverRecenterFlagApi.ts`:
```ts
import { adminApi } from './adminApi';

export interface MapHoverRecenterFlag {
  mapHoverRecenter: boolean;
}

/**
 * adminMapHoverRecenterFlagApi — runtime-тоггл центрирования карты при наведении
 * на карточку (ADMIN). GET/PATCH /admin/map-hover-recenter-flag. Инвалидирует
 * тег Admin → состояние перечитывается после переключения. Зеркалит
 * adminPromotionsFlagApi.
 */
export const adminMapHoverRecenterFlagApi = adminApi.injectEndpoints({
  endpoints: (build) => ({
    getMapHoverRecenterFlag: build.query<MapHoverRecenterFlag, void>({
      query: () => ({ url: '/admin/map-hover-recenter-flag' }),
      providesTags: ['Admin'],
    }),
    updateMapHoverRecenterFlag: build.mutation<
      MapHoverRecenterFlag,
      { enabled: boolean }
    >({
      query: (body) => ({
        url: '/admin/map-hover-recenter-flag',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['Admin'],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetMapHoverRecenterFlagQuery,
  useUpdateMapHoverRecenterFlagMutation,
} = adminMapHoverRecenterFlagApi;
```

- [ ] **Step 2: Создать тумблер**

`apps/web/src/components/admin/MapHoverRecenterToggle.tsx`:
```tsx
/**
 * Runtime-переключатель «Центрирование карты при наведении на карточку» (ADMIN).
 * Client-island: читает текущее состояние и шлёт PATCH без пересборки.
 * Выкл (default) → карта стоит на месте при наведении (Zillow-режим);
 * вкл → карта центрируется к объекту. Зеркалит PromotionsAvailabilityToggle.
 */
'use client';

import {
  useGetMapHoverRecenterFlagQuery,
  useUpdateMapHoverRecenterFlagMutation,
} from '@/store/api/adminMapHoverRecenterFlagApi';

export function MapHoverRecenterToggle() {
  const { data, isLoading } = useGetMapHoverRecenterFlagQuery();
  const [update, { isLoading: isSaving }] =
    useUpdateMapHoverRecenterFlagMutation();
  const enabled = data?.mapHoverRecenter ?? false;

  return (
    <div className="a-card" style={{ padding: 24, maxWidth: 640, marginTop: 18 }}>
      <div
        className="row gap-16"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>
            Центрирование карты при наведении на карточку
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            По умолчанию выключено — карта стоит на месте при наведении на
            карточку (как Zillow). Включить → карта центрируется к объекту.
            Подсветка пина работает всегда. Без пересборки.
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

- [ ] **Step 3: Подключить тумблер на страницу настроек**

В `apps/web/src/app/admin/settings/page.tsx`:
- Импорт (рядом с `PromotionsAvailabilityToggle`):
  ```ts
  import { MapHoverRecenterToggle } from '@/components/admin/MapHoverRecenterToggle';
  ```
- В JSX после `<PromotionsAvailabilityToggle />` (стр. 56) добавить:
  ```tsx
      <MapHoverRecenterToggle />
  ```

- [ ] **Step 4: Линт + сборка web**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: без ошибок.
Run: `cd apps/web && pnpm exec next build`
Expected: успешная сборка.

- [ ] **Step 5: Live-verify тоггла**

Локально/на стенде зайти в админку (`/admin/settings`, ADMIN — EMAIL-OTP `admin@avino.uz`, dev-код в api-логах; memory: avino-local-live-verify-recipe). Переключить тумблер → на портале `/search` навести на карточку: при «Включено» карта центрируется к пину, при «Выключено» — стоит на месте (подсветка пина в обоих случаях).
Expected: переключение применяется без пересборки.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/store/api/adminMapHoverRecenterFlagApi.ts apps/web/src/components/admin/MapHoverRecenterToggle.tsx apps/web/src/app/admin/settings/page.tsx
git commit -m "feat(web): admin toggle for map hover recenter flag"
```

- [ ] **Step 7: Открыть PR #3**

```bash
gh pr create --base main --head feat/map-hover-recenter-toggle-web --title "feat(web): admin toggle for map hover recenter" --body "Тумблер «Центрирование карты при наведении на карточку» в /admin/settings (default OFF). Зеркалит PromotionsAvailabilityToggle. Требует API из PR #1. См. spec 2026-06-26-compact-cards-map-hover-flag-design.md"
```

---

## Self-Review (выполнено при написании)

- **Покрытие спека:** A.1 → Tasks 1–5; A.2 → Tasks 6–8; A.3 → Task 10; B (карточка+скелетон+сетка) → Tasks 8–9; C (3 PR, порядок, ограничения) → структура PR #1→#2/#3. ✅ пробелов нет.
- **Плейсхолдеры:** не найдено TBD/«similar to»; весь код приведён целиком. ✅
- **Согласованность типов:** `mapHoverRecenter` (поле/JSON-ключ) единообразно в api-view, openapi, `PublicSettings`, хуке, web-API; `recenterOnHover` (проп) единообразно в `MapView`↔`SearchResults`; ключ `map_hover_recenter`, audit `MAP_HOVER_RECENTER_FLAG_UPDATE`, env `MAP_HOVER_RECENTER_ENABLED`, config `mapHoverRecenter.enabled` — совпадают между сервисом/конфигом/константами. ✅

## Порядок мёржа

PR #1 (api) → затем PR #2 (client) и PR #3 (web). PR #2 безопасен и до мёржа PR #1 (хук → `false`). Каждый PR мёржит пользователь (main защищён).
