# Legal Consent — Backend (PR №1, apps/api) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бэкенд для согласия пользователя с Правилами и Политикой — модель `legal_consents`, admin-управляемые флаги (`required` + `version`), эндпоинт записи согласия и поле `legal_consent` в `GET /auth/me`.

**Architecture:** Зеркалим существующий паттерн фиче-флагов (`app_settings` + `*FlagService` + `PublicSettingsController` + admin-тоггл в `AdminModule`). Согласие — отдельная append-only таблица; «текущая принятая версия» = последняя строка пользователя. Версия документов и сам факт «требовать согласие» хранятся в `app_settings`, читаются публично через `GET /settings/public`.

**Tech Stack:** NestJS, Prisma, PostgreSQL, class-validator, Jest.

**Branch:** `feat/api-legal-consent`. Дерево `apps/api` волатильно — исполнять в git worktree (см. [[avino-subagents-shared-workdir-git-hazard]]); git/коммиты ведёт контроллер, суб-агенты пишут только код.

## Global Constraints

- Язык prose в коде/комментариях — как в окружении (русские комментарии, англ. идентификаторы). Ответы — на русском.
- API versioning обязателен: все роуты через `@Controller({ path, version: '1' })`; unversioned запрещены (CLAUDE.md §14).
- Контракт API — snake_case в телах/ответах, enum-значения UPPERCASE.
- Никаких дефолтов для секретов; флаги — env-дефолт + override строкой в `app_settings`.
- Admin-DTO регистрируются в `AdminModule` (НЕ в `SettingsModule`) — чтобы не утекли в публичный OpenAPI.
- Public-поля документируются классом-DTO (`PublicSettingsView`) → swagger CLI-плагин; после изменения публичной поверхности — регенерация OpenAPI.
- Каждый коммит — Conventional Commits (`feat(...)`/`test(...)`/`chore(...)`).
- TDD: сначала падающий тест, потом минимальная реализация.

## File Structure

**Создаём:**
- `apps/api/prisma/migrations/20260629000000_add_legal_consents/migration.sql` — raw SQL миграция.
- `apps/api/src/settings/legal-consent-flag.constants.ts` — ключи + чистые резолверы.
- `apps/api/src/settings/legal-consent-flag.constants.spec.ts`
- `apps/api/src/settings/legal-consent-flag.service.ts` — чтение/запись флагов.
- `apps/api/src/settings/legal-consent-flag.service.spec.ts`
- `apps/api/src/settings/admin-legal-consent-flag.controller.ts` — admin GET/PATCH.
- `apps/api/src/settings/admin-legal-consent-flag.controller.spec.ts`
- `apps/api/src/settings/dto/update-legal-consent-flag.dto.ts`
- `apps/api/src/users/dto/accept-legal-consent.dto.ts`
- `apps/api/src/users/legal-consent.service.ts` — запись согласия.
- `apps/api/src/users/legal-consent.service.spec.ts`
- `docs/adr/ADR-0115-legal-consent-modal.md`

**Меняем:**
- `apps/api/prisma/schema.prisma` — модель `LegalConsent` + relation на `User`.
- `apps/api/src/config/configuration.ts` — `legalConsentConfig`.
- `apps/api/src/settings/dto/public-settings-view.dto.ts` — +2 поля.
- `apps/api/src/settings/public-settings.controller.ts` — +инъекция сервиса, +2 поля.
- `apps/api/src/settings/public-settings.controller.spec.ts` — 3-й dep.
- `apps/api/src/settings/settings.module.ts` — провайдер/экспорт сервиса.
- `apps/api/src/settings/index.ts` — реэкспорты.
- `apps/api/src/admin/admin.module.ts` — регистрация admin-контроллера.
- `apps/api/src/common/dto/error-response.dto.ts` — код `CONSENT_INCOMPLETE`.
- `apps/api/src/auth/dto/me-response.dto.ts` — поле `legal_consent`.
- `apps/api/src/auth/auth.service.ts` — `getMe` include + маппинг.
- `apps/api/src/auth/auth.service.spec.ts`, `apps/api/src/auth/auth.controller.spec.ts` — обновить контракт.
- `apps/api/src/users/users.controller.ts` — роут `POST me/legal-consent`.
- `apps/api/src/users/users.module.ts` — импорт `SettingsModule` + провайдер.
- `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` — регенерация.
- `docs/DONE.md` — запись о задаче.

---

### Task 1: Prisma-модель `LegalConsent` + миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (User relations + новый model)
- Create: `apps/api/prisma/migrations/20260629000000_add_legal_consents/migration.sql`

**Interfaces:**
- Produces: Prisma-модель `LegalConsent { id, userId, version: Int, acceptedAt: DateTime }`; relation `User.legalConsents: LegalConsent[]`. Делегат `prisma.legalConsent.create({ data: { userId, version } })`.

- [ ] **Step 1: Добавить relation на User**

В `apps/api/prisma/schema.prisma`, в модели `User`, перед `@@map("users")` (после строки `broadcastsReceived ...`):

```prisma
  // Согласия с юр-документами (Правила+Политика); append-only аудит-след (design 2026-06-29).
  legalConsents        LegalConsent[]
```

- [ ] **Step 2: Добавить модель LegalConsent**

В конец `apps/api/prisma/schema.prisma` (после модели `AppSetting`):

```prisma
/// legal_consents — append-only лог согласий пользователя с Правилами и Политикой
/// (design 2026-06-29). «Текущая принятая версия» = последняя строка пользователя;
/// версия документов задаётся admin-настройкой app_settings.legal_consent_version.
model LegalConsent {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  version    Int
  acceptedAt DateTime @default(now()) @map("accepted_at") @db.Timestamptz(6)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("legal_consents")
}
```

- [ ] **Step 3: Написать SQL-миграцию**

Создать `apps/api/prisma/migrations/20260629000000_add_legal_consents/migration.sql`:

```sql
-- Generated to match schema.prisma (no local shadow DB). Apply on staging/CI with
-- `prisma migrate deploy`; if applied out-of-band, verify then
-- `prisma migrate resolve --applied 20260629000000_add_legal_consents`.

-- CreateTable
CREATE TABLE "legal_consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "legal_consents_user_id_idx" ON "legal_consents"("user_id");

-- AddForeignKey
ALTER TABLE "legal_consents" ADD CONSTRAINT "legal_consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 4: Валидировать схему и сгенерировать клиент**

Run: `pnpm --filter @avino/api exec prisma validate && pnpm --filter @avino/api exec prisma generate`
Expected: `The schema ... is valid` и `Generated Prisma Client`. После генерации `prisma.legalConsent` доступен (типобезопасно).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260629000000_add_legal_consents/migration.sql
git commit -m "feat(legal-consent): add legal_consents model and migration"
```

---

### Task 2: Флаг-константы + env-конфиг

**Files:**
- Create: `apps/api/src/settings/legal-consent-flag.constants.ts`
- Test: `apps/api/src/settings/legal-consent-flag.constants.spec.ts`
- Modify: `apps/api/src/config/configuration.ts`

**Interfaces:**
- Produces: `LEGAL_CONSENT_REQUIRED_KEY`, `LEGAL_CONSENT_VERSION_KEY`; `resolveLegalConsentRequired(stored: string|null|undefined, envDefault: boolean): boolean`; `resolveLegalConsentVersion(stored: string|null|undefined, envDefault: number): number`. Конфиг-namespace `legalConsent` с `{ required: boolean, version: number }`.

- [ ] **Step 1: Написать падающий тест на резолверы**

Создать `apps/api/src/settings/legal-consent-flag.constants.spec.ts`:

```ts
import {
  resolveLegalConsentRequired,
  resolveLegalConsentVersion,
} from './legal-consent-flag.constants';

describe('resolveLegalConsentRequired', () => {
  it("stored 'true'/'false' wins over env default", () => {
    expect(resolveLegalConsentRequired('true', false)).toBe(true);
    expect(resolveLegalConsentRequired('false', true)).toBe(false);
  });
  it('falls back to env default when unset/garbage', () => {
    expect(resolveLegalConsentRequired(null, true)).toBe(true);
    expect(resolveLegalConsentRequired(undefined, false)).toBe(false);
    expect(resolveLegalConsentRequired('yes', false)).toBe(false);
  });
});

describe('resolveLegalConsentVersion', () => {
  it('parses a stored positive integer', () => {
    expect(resolveLegalConsentVersion('3', 1)).toBe(3);
  });
  it('falls back to env default for null/garbage/<1', () => {
    expect(resolveLegalConsentVersion(null, 1)).toBe(1);
    expect(resolveLegalConsentVersion('abc', 2)).toBe(2);
    expect(resolveLegalConsentVersion('0', 1)).toBe(1);
    expect(resolveLegalConsentVersion('-5', 4)).toBe(4);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

Run: `pnpm --filter @avino/api test -- legal-consent-flag.constants`
Expected: FAIL — `Cannot find module './legal-consent-flag.constants'`.

- [ ] **Step 3: Реализовать константы и резолверы**

Создать `apps/api/src/settings/legal-consent-flag.constants.ts`:

```ts
/** Ключи runtime-настроек согласия с юр-документами в app_settings. */
export const LEGAL_CONSENT_REQUIRED_KEY = 'legal_consent_required';
export const LEGAL_CONSENT_VERSION_KEY = 'legal_consent_version';

/**
 * Резолюция флага «требовать согласие»: app_settings ('true'/'false') главнее,
 * иначе env-дефолт (`legalConsent.required`, default false). Чистая функция —
 * шарится между сервисом и тестами. Зеркалит resolvePromotionsEnabled.
 */
export function resolveLegalConsentRequired(
  stored: string | null | undefined,
  envDefault: boolean,
): boolean {
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return envDefault;
}

/**
 * Резолюция текущей версии документов: app_settings (целое >= 1) главнее, иначе
 * env-дефолт (`legalConsent.version`, default 1). Нечисловые/нелегальные строки
 * → env-дефолт.
 */
export function resolveLegalConsentVersion(
  stored: string | null | undefined,
  envDefault: number,
): number {
  if (stored != null) {
    const n = Number.parseInt(stored, 10);
    if (Number.isInteger(n) && n >= 1) return n;
  }
  return envDefault;
}
```

- [ ] **Step 4: Добавить env-конфиг**

В `apps/api/src/config/configuration.ts`, после `mapHoverRecenterConfig` (≈стр. 113):

```ts
export const legalConsentConfig = registerAs('legalConsent', () => ({
  // Требовать согласие с Правилами/Политикой при первом входе. По умолчанию
  // ВЫКЛЮЧЕНО (fail-safe, как promotions/mapHoverRecenter). Явный
  // LEGAL_CONSENT_REQUIRED=true → true. Перебивается runtime-строкой
  // legal_consent_required в app_settings (admin-тоггл).
  required:
    process.env.LEGAL_CONSENT_REQUIRED != null
      ? process.env.LEGAL_CONSENT_REQUIRED === 'true'
      : false,
  // Текущая версия юр-документов. При изменении текстов админ поднимает версию
  // (app_settings legal_consent_version) → пользователи соглашаются заново.
  version: parseInt(process.env.LEGAL_CONSENT_VERSION ?? '1', 10),
}));
```

И добавить `legalConsentConfig` в массив `configurations` (рядом с `mapHoverRecenterConfig`).

- [ ] **Step 5: Запустить тест — убедиться что проходит**

Run: `pnpm --filter @avino/api test -- legal-consent-flag.constants`
Expected: PASS (все кейсы).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/settings/legal-consent-flag.constants.ts apps/api/src/settings/legal-consent-flag.constants.spec.ts apps/api/src/config/configuration.ts
git commit -m "feat(legal-consent): add flag constants, resolvers and env config"
```

---

### Task 3: `LegalConsentFlagService`

**Files:**
- Create: `apps/api/src/settings/legal-consent-flag.service.ts`
- Test: `apps/api/src/settings/legal-consent-flag.service.spec.ts`

**Interfaces:**
- Consumes: константы/резолверы из Task 2; `PrismaService`, `ConfigService`.
- Produces: `LegalConsentFlagService` с методами `isRequired(): Promise<boolean>`, `currentVersion(): Promise<number>`, `setRequired(adminId: string, required: boolean): Promise<boolean>`, `setVersion(adminId: string, version: number): Promise<number>`.

- [ ] **Step 1: Написать падающий тест сервиса**

Создать `apps/api/src/settings/legal-consent-flag.service.spec.ts`:

```ts
import { LegalConsentFlagService } from './legal-consent-flag.service';

describe('LegalConsentFlagService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn() };
  let service: LegalConsentFlagService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((k: string) =>
      k === 'legalConsent.required' ? false : k === 'legalConsent.version' ? 1 : undefined,
    );
    service = new LegalConsentFlagService(prisma as never, config as never);
  });

  it('isRequired() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await service.isRequired()).toBe(true);
  });

  it('isRequired() falls back to env default when DB throws', async () => {
    prisma.appSetting.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.isRequired()).toBe(false);
  });

  it('currentVersion() returns stored integer over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: '4' });
    expect(await service.currentVersion()).toBe(4);
  });

  it('currentVersion() falls back to env default (1) when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.currentVersion()).toBe(1);
  });

  it('setRequired() upserts string value + writes audit', async () => {
    expect(await service.setRequired('admin1', true)).toBe(true);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'legal_consent_required' },
        update: { value: 'true' },
        create: { key: 'legal_consent_required', value: 'true' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'LEGAL_CONSENT_REQUIRED_UPDATE',
          metadata: { required: true },
        }),
      }),
    );
  });

  it('setVersion() upserts string value + writes audit', async () => {
    expect(await service.setVersion('admin1', 2)).toBe(2);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'legal_consent_version' },
        update: { value: '2' },
        create: { key: 'legal_consent_version', value: '2' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'LEGAL_CONSENT_VERSION_UPDATE',
          metadata: { version: 2 },
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться что падает**

Run: `pnpm --filter @avino/api test -- legal-consent-flag.service`
Expected: FAIL — `Cannot find module './legal-consent-flag.service'`.

- [ ] **Step 3: Реализовать сервис**

Создать `apps/api/src/settings/legal-consent-flag.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  LEGAL_CONSENT_REQUIRED_KEY,
  LEGAL_CONSENT_VERSION_KEY,
  resolveLegalConsentRequired,
  resolveLegalConsentVersion,
} from './legal-consent-flag.constants';

/**
 * Runtime-настройки согласия с юр-документами. Хранит две строки в app_settings:
 * legal_consent_required (булева) и legal_consent_version (целое). Читается
 * публичным PublicSettingsController и admin-тогглом без пересборки. Резолюция
 * (DB-строка > env-дефолт) — чистые функции. Зеркалит PromotionsFlagService.
 */
@Injectable()
export class LegalConsentFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Требуется ли согласие. DB-ошибка → безопасный env-дефолт. */
  async isRequired(): Promise<boolean> {
    const envDefault = this.config.get<boolean>('legalConsent.required') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: LEGAL_CONSENT_REQUIRED_KEY },
      });
      return resolveLegalConsentRequired(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Текущая требуемая версия документов. DB-ошибка → env-дефолт. */
  async currentVersion(): Promise<number> {
    const envDefault = this.config.get<number>('legalConsent.version') ?? 1;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: LEGAL_CONSENT_VERSION_KEY },
      });
      return resolveLegalConsentVersion(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Включить/выключить требование (ADMIN). Пишет app_settings + audit-log. */
  async setRequired(adminId: string, required: boolean): Promise<boolean> {
    const value = String(required);
    await this.prisma.appSetting.upsert({
      where: { key: LEGAL_CONSENT_REQUIRED_KEY },
      update: { value },
      create: { key: LEGAL_CONSENT_REQUIRED_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'LEGAL_CONSENT_REQUIRED_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { required },
      },
    });
    return required;
  }

  /** Установить текущую версию документов (ADMIN). Пишет app_settings + audit. */
  async setVersion(adminId: string, version: number): Promise<number> {
    const value = String(version);
    await this.prisma.appSetting.upsert({
      where: { key: LEGAL_CONSENT_VERSION_KEY },
      update: { value },
      create: { key: LEGAL_CONSENT_VERSION_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'LEGAL_CONSENT_VERSION_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { version },
      },
    });
    return version;
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться что проходит**

Run: `pnpm --filter @avino/api test -- legal-consent-flag.service`
Expected: PASS (все кейсы).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/settings/legal-consent-flag.service.ts apps/api/src/settings/legal-consent-flag.service.spec.ts
git commit -m "feat(legal-consent): add LegalConsentFlagService"
```

---

### Task 4: Публичные настройки — отдать флаги

**Files:**
- Modify: `apps/api/src/settings/dto/public-settings-view.dto.ts`
- Modify: `apps/api/src/settings/public-settings.controller.ts`
- Modify: `apps/api/src/settings/public-settings.controller.spec.ts`
- Modify: `apps/api/src/settings/settings.module.ts`
- Modify: `apps/api/src/settings/index.ts`

**Interfaces:**
- Consumes: `LegalConsentFlagService` (Task 3).
- Produces: `GET /api/v1/settings/public` → `PublicSettingsView { promotionsEnabled, mapHoverRecenter, legalConsentRequired, legalConsentVersion }`. Реэкспорты `LegalConsentFlagService`, `LEGAL_CONSENT_*_KEY`, резолверы из `../settings`.

- [ ] **Step 1: Обновить spec контроллера (падающий)**

Заменить весь `apps/api/src/settings/public-settings.controller.spec.ts`:

```ts
import { PublicSettingsController } from './public-settings.controller';

describe('PublicSettingsController', () => {
  function build(promoVal: boolean, mapVal: boolean, reqVal: boolean, verVal: number) {
    const promo: any = { isEnabled: jest.fn().mockResolvedValue(promoVal) };
    const mapHover: any = { isEnabled: jest.fn().mockResolvedValue(mapVal) };
    const legal: any = {
      isRequired: jest.fn().mockResolvedValue(reqVal),
      currentVersion: jest.fn().mockResolvedValue(verVal),
    };
    return new PublicSettingsController(promo, mapHover, legal);
  }

  it('returns all flags with their defaults', async () => {
    expect(await build(false, false, false, 1).get()).toEqual({
      promotionsEnabled: false,
      mapHoverRecenter: false,
      legalConsentRequired: false,
      legalConsentVersion: 1,
    });
  });

  it('reflects each flag independently', async () => {
    expect(await build(true, false, true, 3).get()).toEqual({
      promotionsEnabled: true,
      mapHoverRecenter: false,
      legalConsentRequired: true,
      legalConsentVersion: 3,
    });
  });
});
```

- [ ] **Step 2: Запустить — убедиться что падает**

Run: `pnpm --filter @avino/api test -- public-settings.controller`
Expected: FAIL — конструктор ожидает 2 аргумента / `legalConsentRequired` отсутствует.

- [ ] **Step 3: Расширить DTO**

В `apps/api/src/settings/dto/public-settings-view.dto.ts` — добавить два поля в класс `PublicSettingsView`:

```ts
export class PublicSettingsView {
  promotionsEnabled!: boolean;
  mapHoverRecenter!: boolean;
  legalConsentRequired!: boolean;
  legalConsentVersion!: number;
}
```

- [ ] **Step 4: Расширить контроллер**

В `apps/api/src/settings/public-settings.controller.ts`:

Добавить импорт:
```ts
import { LegalConsentFlagService } from './legal-consent-flag.service';
```

Конструктор и метод `get`:
```ts
  constructor(
    private readonly flags: PromotionsFlagService,
    private readonly mapHover: MapHoverRecenterFlagService,
    private readonly legalConsent: LegalConsentFlagService,
  ) {}

  @Get()
  async get(): Promise<PublicSettingsView> {
    return {
      promotionsEnabled: await this.flags.isEnabled(),
      mapHoverRecenter: await this.mapHover.isEnabled(),
      legalConsentRequired: await this.legalConsent.isRequired(),
      legalConsentVersion: await this.legalConsent.currentVersion(),
    };
  }
```

- [ ] **Step 5: Зарегистрировать сервис в модуле**

В `apps/api/src/settings/settings.module.ts` — добавить импорт и в `providers`/`exports`:

```ts
import { LegalConsentFlagService } from './legal-consent-flag.service';
```
```ts
  providers: [PromotionsFlagService, MapHoverRecenterFlagService, LegalConsentFlagService],
  exports: [PromotionsFlagService, MapHoverRecenterFlagService, LegalConsentFlagService],
```

- [ ] **Step 6: Реэкспорт из index**

В конец `apps/api/src/settings/index.ts`:

```ts
export { LegalConsentFlagService } from './legal-consent-flag.service';
export {
  LEGAL_CONSENT_REQUIRED_KEY,
  LEGAL_CONSENT_VERSION_KEY,
  resolveLegalConsentRequired,
  resolveLegalConsentVersion,
} from './legal-consent-flag.constants';
```

- [ ] **Step 7: Запустить — убедиться что проходит**

Run: `pnpm --filter @avino/api test -- public-settings.controller`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/settings/dto/public-settings-view.dto.ts apps/api/src/settings/public-settings.controller.ts apps/api/src/settings/public-settings.controller.spec.ts apps/api/src/settings/settings.module.ts apps/api/src/settings/index.ts
git commit -m "feat(legal-consent): expose flags via GET /settings/public"
```

---

### Task 5: Admin-тоггл (контроллер + DTO)

**Files:**
- Create: `apps/api/src/settings/dto/update-legal-consent-flag.dto.ts`
- Create: `apps/api/src/settings/admin-legal-consent-flag.controller.ts`
- Test: `apps/api/src/settings/admin-legal-consent-flag.controller.spec.ts`
- Modify: `apps/api/src/settings/index.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

**Interfaces:**
- Consumes: `LegalConsentFlagService` (Task 3).
- Produces: `GET/PATCH /api/v1/admin/legal-consent-flag` → `{ legalConsentRequired: boolean, legalConsentVersion: number }`. Тело PATCH `UpdateLegalConsentFlagDto { required?: boolean; version?: number }`. Реэкспорт `AdminLegalConsentFlagController`.

- [ ] **Step 1: Написать падающий тест контроллера**

Создать `apps/api/src/settings/admin-legal-consent-flag.controller.spec.ts`:

```ts
import { AdminLegalConsentFlagController } from './admin-legal-consent-flag.controller';

describe('AdminLegalConsentFlagController', () => {
  function build() {
    const flags: any = {
      isRequired: jest.fn().mockResolvedValue(false),
      currentVersion: jest.fn().mockResolvedValue(1),
      setRequired: jest.fn().mockResolvedValue(true),
      setVersion: jest.fn().mockResolvedValue(2),
    };
    return { flags, controller: new AdminLegalConsentFlagController(flags) };
  }

  it('GET returns current required + version', async () => {
    const { controller } = build();
    expect(await controller.get()).toEqual({
      legalConsentRequired: false,
      legalConsentVersion: 1,
    });
  });

  it('PATCH sets required when provided', async () => {
    const { flags, controller } = build();
    await controller.update('admin-1', { required: true });
    expect(flags.setRequired).toHaveBeenCalledWith('admin-1', true);
    expect(flags.setVersion).not.toHaveBeenCalled();
  });

  it('PATCH sets version when provided', async () => {
    const { flags, controller } = build();
    await controller.update('admin-1', { version: 2 });
    expect(flags.setVersion).toHaveBeenCalledWith('admin-1', 2);
    expect(flags.setRequired).not.toHaveBeenCalled();
  });

  it('PATCH returns the re-read state', async () => {
    const { flags, controller } = build();
    flags.isRequired.mockResolvedValue(true);
    flags.currentVersion.mockResolvedValue(2);
    expect(await controller.update('admin-1', { required: true, version: 2 })).toEqual({
      legalConsentRequired: true,
      legalConsentVersion: 2,
    });
  });
});
```

- [ ] **Step 2: Запустить — убедиться что падает**

Run: `pnpm --filter @avino/api test -- admin-legal-consent-flag.controller`
Expected: FAIL — `Cannot find module './admin-legal-consent-flag.controller'`.

- [ ] **Step 3: Создать DTO**

Создать `apps/api/src/settings/dto/update-legal-consent-flag.dto.ts`:

```ts
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/** Тело `PATCH /api/v1/admin/legal-consent-flag`. Любое подмножество полей. */
export class UpdateLegalConsentFlagDto {
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
```

- [ ] **Step 4: Создать контроллер**

Создать `apps/api/src/settings/admin-legal-consent-flag.controller.ts`:

```ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { LegalConsentFlagService } from './legal-consent-flag.service';
import { UpdateLegalConsentFlagDto } from './dto/update-legal-consent-flag.dto';

interface LegalConsentFlagView {
  legalConsentRequired: boolean;
  legalConsentVersion: number;
}

/**
 * Runtime-управление согласием с юр-документами (ADMIN). GET — текущее состояние;
 * PATCH — включить/выключить требование и/или поднять версию документов без
 * пересборки (пишет app_settings). Клиент читает значения через GET /settings/public.
 * Зеркалит AdminPromotionsFlagController; регистрируется в AdminModule.
 */
@Controller({ path: 'admin/legal-consent-flag', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLegalConsentFlagController {
  constructor(private readonly flags: LegalConsentFlagService) {}

  @Get()
  async get(): Promise<LegalConsentFlagView> {
    return {
      legalConsentRequired: await this.flags.isRequired(),
      legalConsentVersion: await this.flags.currentVersion(),
    };
  }

  @Patch()
  async update(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateLegalConsentFlagDto,
  ): Promise<LegalConsentFlagView> {
    if (dto.required !== undefined) {
      await this.flags.setRequired(adminId, dto.required);
    }
    if (dto.version !== undefined) {
      await this.flags.setVersion(adminId, dto.version);
    }
    return {
      legalConsentRequired: await this.flags.isRequired(),
      legalConsentVersion: await this.flags.currentVersion(),
    };
  }
}
```

- [ ] **Step 5: Реэкспорт + регистрация в AdminModule**

В `apps/api/src/settings/index.ts` добавить:
```ts
export { AdminLegalConsentFlagController } from './admin-legal-consent-flag.controller';
```

В `apps/api/src/admin/admin.module.ts` — в импорт из `'../settings'` добавить `AdminLegalConsentFlagController`:
```ts
import { SettingsModule, AdminPromotionsFlagController, AdminMapHoverRecenterFlagController, AdminLegalConsentFlagController } from '../settings';
```
И в массив `controllers` добавить `AdminLegalConsentFlagController` (рядом с `AdminMapHoverRecenterFlagController`).

- [ ] **Step 6: Запустить — убедиться что проходит**

Run: `pnpm --filter @avino/api test -- admin-legal-consent-flag.controller`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/settings/dto/update-legal-consent-flag.dto.ts apps/api/src/settings/admin-legal-consent-flag.controller.ts apps/api/src/settings/admin-legal-consent-flag.controller.spec.ts apps/api/src/settings/index.ts apps/api/src/admin/admin.module.ts
git commit -m "feat(legal-consent): add admin legal-consent-flag controller"
```

---

### Task 6: Поле `legal_consent` в `GET /auth/me`

**Files:**
- Modify: `apps/api/src/auth/dto/me-response.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts:306-338`
- Modify: `apps/api/src/auth/auth.service.spec.ts`
- Modify: `apps/api/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: relation `User.legalConsents` (Task 1).
- Produces: `MeResponse.legal_consent: { accepted_version: number | null; accepted_at: string | null }`.

- [ ] **Step 1: Обновить тесты getMe (падающие)**

В `apps/api/src/auth/auth.service.spec.ts`:

В объекте `dbUser` (≈стр. 371) добавить поле после `profile: {...}`:
```ts
    legalConsents: [] as { version: number; acceptedAt: Date }[],
```

В тесте `'returns the full contract for a user with a profile'` — в ожидаемый `toEqual({...})` добавить после блока `profile: {...}`:
```ts
      legal_consent: { accepted_version: null, accepted_at: null },
```
И обновить ожидаемый `include` в `expect(prisma.user.findFirst).toHaveBeenCalledWith`:
```ts
      include: {
        profile: true,
        roles: { include: { role: true } },
        legalConsents: { orderBy: { version: 'desc' }, take: 1 },
      },
```

Добавить новый тест в `describe('AuthService.getMe', ...)`:
```ts
  it('maps the latest legal consent into legal_consent', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ...dbUser,
      legalConsents: [{ version: 2, acceptedAt: new Date('2026-06-29T10:00:00.000Z') }],
    });

    const result = await service.getMe('u1');

    expect(result.legal_consent).toEqual({
      accepted_version: 2,
      accepted_at: '2026-06-29T10:00:00.000Z',
    });
  });
```

В `apps/api/src/auth/auth.controller.spec.ts` — в объект `me: MeResponse` (≈стр. 12) добавить после `profile: {...}`:
```ts
      legal_consent: { accepted_version: null, accepted_at: null },
```

- [ ] **Step 2: Запустить — убедиться что падает**

Run: `pnpm --filter @avino/api test -- auth.service auth.controller`
Expected: FAIL — `legal_consent` отсутствует в результате / тип `MeResponse` не имеет поля.

- [ ] **Step 3: Расширить DTO**

В `apps/api/src/auth/dto/me-response.dto.ts` — добавить интерфейс и поле:

```ts
/**
 * Состояние согласия пользователя с юр-документами в ответе `GET /auth/me`.
 * `accepted_version` — версия последнего согласия (null, если ни разу). Клиент
 * сравнивает её с `legalConsentVersion` из GET /settings/public, чтобы решить,
 * показывать ли блокирующую модалку (design 2026-06-29).
 */
export interface MeLegalConsent {
  accepted_version: number | null;
  accepted_at: string | null;
}
```

И в `interface MeResponse` добавить поле после `profile: MeProfile;`:
```ts
  legal_consent: MeLegalConsent;
```

- [ ] **Step 4: Расширить `getMe`**

В `apps/api/src/auth/auth.service.ts`, метод `getMe`:

В `findFirst` заменить `include`:
```ts
      include: {
        profile: true,
        roles: { include: { role: true } },
        legalConsents: { orderBy: { version: 'desc' }, take: 1 },
      },
```

Перед `return {`:
```ts
    const latestConsent = user.legalConsents[0];
```

В возвращаемый объект добавить поле после блока `profile: {...}`:
```ts
      legal_consent: {
        accepted_version: latestConsent?.version ?? null,
        accepted_at: latestConsent?.acceptedAt.toISOString() ?? null,
      },
```

- [ ] **Step 5: Запустить — убедиться что проходит**

Run: `pnpm --filter @avino/api test -- auth.service auth.controller`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/dto/me-response.dto.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/auth.controller.spec.ts
git commit -m "feat(legal-consent): expose legal_consent in GET /auth/me"
```

---

### Task 7: Эндпоинт `POST /users/me/legal-consent`

**Files:**
- Modify: `apps/api/src/common/dto/error-response.dto.ts`
- Create: `apps/api/src/users/dto/accept-legal-consent.dto.ts`
- Create: `apps/api/src/users/legal-consent.service.ts`
- Test: `apps/api/src/users/legal-consent.service.spec.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.module.ts`

**Interfaces:**
- Consumes: `LegalConsentFlagService.currentVersion()` (Task 3, через `SettingsModule`); `prisma.legalConsent.create` (Task 1).
- Produces: `LegalConsentService.record(userId, dto): Promise<LegalConsentState>` где `LegalConsentState = { accepted_version: number | null; accepted_at: string | null }`. Роут `POST /api/v1/users/me/legal-consent`.

- [ ] **Step 1: Написать падающий тест сервиса**

Создать `apps/api/src/users/legal-consent.service.spec.ts`:

```ts
import { UnprocessableEntityException } from '@nestjs/common';
import { LegalConsentService } from './legal-consent.service';
import { ApiErrorCode } from '../common/dto/error-response.dto';

describe('LegalConsentService', () => {
  const prisma = {
    legalConsent: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const flags = { currentVersion: jest.fn() };
  let service: LegalConsentService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new LegalConsentService(prisma as never, flags as never);
  });

  it('records consent at the current version + writes audit', async () => {
    flags.currentVersion.mockResolvedValue(2);
    prisma.legalConsent.create.mockResolvedValue({
      id: 'c1',
      version: 2,
      acceptedAt: new Date('2026-06-29T10:00:00.000Z'),
    });

    const result = await service.record('u1', {
      terms_accepted: true,
      privacy_accepted: true,
    });

    expect(prisma.legalConsent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', version: 2 },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'u1',
          action: 'LEGAL_CONSENT_ACCEPTED',
          entityId: 'c1',
          metadata: { version: 2 },
        }),
      }),
    );
    expect(result).toEqual({
      accepted_version: 2,
      accepted_at: '2026-06-29T10:00:00.000Z',
    });
  });

  it('throws 422 CONSENT_INCOMPLETE when a checkbox is false', async () => {
    const promise = service.record('u1', {
      terms_accepted: true,
      privacy_accepted: false,
    });
    await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
    try {
      await promise;
    } catch (e) {
      const res = (e as UnprocessableEntityException).getResponse() as { code: string };
      expect(res.code).toBe(ApiErrorCode.CONSENT_INCOMPLETE);
    }
    expect(prisma.legalConsent.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — убедиться что падает**

Run: `pnpm --filter @avino/api test -- legal-consent.service`
Expected: FAIL — `Cannot find module './legal-consent.service'`.

- [ ] **Step 3: Добавить код ошибки**

В `apps/api/src/common/dto/error-response.dto.ts`, в `enum ApiErrorCode`, после `TOUR_REQUEST_DUPLICATE`:
```ts
  CONSENT_INCOMPLETE = 'CONSENT_INCOMPLETE',
```

- [ ] **Step 4: Создать DTO**

Создать `apps/api/src/users/dto/accept-legal-consent.dto.ts`:

```ts
import { IsBoolean } from 'class-validator';

/** Тело `POST /api/v1/users/me/legal-consent`. Обе галочки обязательны (true). */
export class AcceptLegalConsentDto {
  @IsBoolean()
  terms_accepted!: boolean;

  @IsBoolean()
  privacy_accepted!: boolean;
}
```

- [ ] **Step 5: Создать сервис**

Создать `apps/api/src/users/legal-consent.service.ts`:

```ts
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { LegalConsentFlagService } from '../settings';
import { AcceptLegalConsentDto } from './dto/accept-legal-consent.dto';

/** Состояние согласия — та же форма, что `MeResponse.legal_consent`. */
export interface LegalConsentState {
  accepted_version: number | null;
  accepted_at: string | null;
}

/**
 * Запись согласия пользователя с Правилами и Политикой (design 2026-06-29).
 * Обе галочки обязательны → иначе 422 CONSENT_INCOMPLETE. Версия берётся из
 * LegalConsentFlagService.currentVersion(); каждое согласие — новая строка
 * legal_consents (append-only аудит) + запись в audit_log.
 */
@Injectable()
export class LegalConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: LegalConsentFlagService,
  ) {}

  async record(
    userId: string,
    dto: AcceptLegalConsentDto,
  ): Promise<LegalConsentState> {
    if (!dto.terms_accepted || !dto.privacy_accepted) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.CONSENT_INCOMPLETE,
        message: 'Both terms and privacy must be accepted',
      });
    }
    const version = await this.flags.currentVersion();
    const row = await this.prisma.legalConsent.create({
      data: { userId, version },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'LEGAL_CONSENT_ACCEPTED',
        entityType: 'legal_consent',
        entityId: row.id,
        metadata: { version },
      },
    });
    return {
      accepted_version: row.version,
      accepted_at: row.acceptedAt.toISOString(),
    };
  }
}
```

- [ ] **Step 6: Запустить тест сервиса — проходит**

Run: `pnpm --filter @avino/api test -- legal-consent.service`
Expected: PASS.

- [ ] **Step 7: Подключить роут и модуль**

В `apps/api/src/users/users.controller.ts`:

Импорты — добавить `Post` к `@nestjs/common` и:
```ts
import { AcceptLegalConsentDto } from './dto/accept-legal-consent.dto';
import { LegalConsentService, LegalConsentState } from './legal-consent.service';
```

В конструктор добавить параметр:
```ts
    private readonly legalConsentService: LegalConsentService,
```

Добавить метод после `updateProfile`:
```ts
  /** `POST /api/v1/users/me/legal-consent` — согласие с Правилами и Политикой. */
  @Post('me/legal-consent')
  acceptLegalConsent(
    @CurrentUser('id') userId: string,
    @Body() dto: AcceptLegalConsentDto,
  ): Promise<LegalConsentState> {
    return this.legalConsentService.record(userId, dto);
  }
```

В `apps/api/src/users/users.module.ts`:
```ts
import { SettingsModule } from '../settings';
import { LegalConsentService } from './legal-consent.service';
```
```ts
  imports: [RolesModule, SettingsModule],
  controllers: [UsersController],
  providers: [UsersService, ProfilesService, LegalConsentService],
```

- [ ] **Step 8: Прогнать тесты модуля users — проходят**

Run: `pnpm --filter @avino/api test -- users legal-consent.service`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/common/dto/error-response.dto.ts apps/api/src/users/dto/accept-legal-consent.dto.ts apps/api/src/users/legal-consent.service.ts apps/api/src/users/legal-consent.service.spec.ts apps/api/src/users/users.controller.ts apps/api/src/users/users.module.ts
git commit -m "feat(legal-consent): add POST /users/me/legal-consent endpoint"
```

---

### Task 8: OpenAPI-регенерация + полная верификация

**Files:**
- Modify (generated): `apps/api/openapi.public.json`, `apps/api/openapi.internal.json`

**Interfaces:**
- Consumes: всё выше.

- [ ] **Step 1: Регенерировать OpenAPI**

Run: `pnpm --filter @avino/api openapi:export`
Expected: команда завершается успешно; в `openapi.public.json` у схемы `PublicSettingsView` появляются `legalConsentRequired` и `legalConsentVersion`. Admin-DTO (`UpdateLegalConsentFlagDto`) в публичном документе НЕ появляется (контроллер в `AdminModule`), но присутствует в `openapi.internal.json`.

- [ ] **Step 2: Проверить дифф публичного контракта**

Run: `git diff --stat apps/api/openapi.public.json apps/api/openapi.internal.json`
Expected: оба файла изменены; в публичном — только новые поля на `PublicSettingsView`.

- [ ] **Step 3: Полный прогон тестов**

Run: `pnpm --filter @avino/api test`
Expected: PASS (включая ранее существовавшие).

- [ ] **Step 4: Сборка**

Run: `pnpm --filter @avino/api build`
Expected: успешная сборка (TS-типы `prisma.legalConsent` и DTO согласованы).

- [ ] **Step 5: Commit**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json
git commit -m "chore(openapi): regenerate for legal-consent public settings"
```

---

### Task 9: ADR + DONE (трекинг)

**Files:**
- Create: `docs/adr/ADR-0115-legal-consent-modal.md`
- Modify: `docs/DONE.md`
- (commit спеку/план в этой же PR)

- [ ] **Step 1: Написать ADR**

Создать `docs/adr/ADR-0115-legal-consent-modal.md`:

```markdown
# ADR-0115 — Legal consent (Правила + Политика) — per-user, versioned, admin-gated

## Status
Accepted

## Date
2026-06-29

## Context
Требуется при первом входе пользователя получить согласие с Правилами
(/legal/terms) и Политикой (/legal/privacy), хранить факт согласия и сделать
само требование управляемым из админ-панели.

## Decision
- Согласие хранится на сервере, привязано к аккаунту (только для вошедших).
- Append-only таблица `legal_consents` (аудит-след); «текущая принятая версия»
  = последняя строка пользователя.
- Версионирование: `app_settings.legal_consent_version` (admin-поле, дефолт 1);
  при изменении документов админ поднимает версию → повторное согласие.
- Требование включается флагом `app_settings.legal_consent_required` (дефолт OFF,
  fail-safe; env-override `LEGAL_CONSENT_REQUIRED`).
- Публичная поверхность: `GET /settings/public` отдаёт `legalConsentRequired` и
  `legalConsentVersion`; `GET /auth/me` — `legal_consent { accepted_version,
  accepted_at }`. Запись — `POST /users/me/legal-consent` (обе галочки → иначе
  422 CONSENT_INCOMPLETE).
- Admin-управление — `AdminLegalConsentFlagController` в AdminModule (DTO не
  утекают в публичный OpenAPI).

## Consequences
Positive:
- Юридически чистый аудит-след; повторное согласие при обновлении документов.
- Единый паттерн с существующими фиче-флагами; нулевой риск для гостей.

Negative / trade-offs:
- Версия (admin-поле) может разъехаться с задеплоенным текстом — дисциплина ручная.
- Гостевой просмотр без согласия допускается (согласие — после входа).

## Related files
- apps/api/prisma/schema.prisma (model LegalConsent)
- apps/api/src/settings/legal-consent-flag.*
- apps/api/src/settings/admin-legal-consent-flag.controller.ts
- apps/api/src/users/legal-consent.service.ts
- apps/api/src/auth/auth.service.ts (getMe)

## Related task
- Design: docs/superpowers/specs/2026-06-29-legal-consent-modal-design.md
```

- [ ] **Step 2: Добавить запись в DONE.md**

В `docs/DONE.md` добавить запись по формату проекта (раздел даты `## 2026-06-29`), статус `DONE`, branch `feat/api-legal-consent`, PR `pending`, перечень files changed и summary, ссылка на ADR-0115. (Финализируется при мёрже PR.)

- [ ] **Step 3: Commit (ADR + DONE + спека + план)**

```bash
git add docs/adr/ADR-0115-legal-consent-modal.md docs/DONE.md docs/superpowers/specs/2026-06-29-legal-consent-modal-design.md docs/superpowers/plans/2026-06-29-legal-consent-api.md
git commit -m "docs(legal-consent): ADR-0115 + DONE entry + design/plan"
```

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/api-legal-consent
```
PR title: `feat(legal-consent): backend — model, flags, consent endpoint, /auth/me`
PR description: что сделано (модель + флаги + эндпоинт + /auth/me), почему (согласие с юр-документами, admin-gated), как проверить (`pnpm --filter @avino/api test`, OpenAPI diff). Мёржит пользователь (main protected — никогда `--admin`).

---

## Self-Review

**Spec coverage:**
- §2 модель `legal_consents` → Task 1 ✅
- §3 флаги (`required`/`version`, public settings, admin controller в AdminModule) → Tasks 2–5 ✅
- §4 `POST /users/me/legal-consent` (422 CONSENT_INCOMPLETE), `/auth/me` поле → Tasks 6–7 ✅
- §7 разбивка PR (это PR №1) → header/Task 9 ✅
- §8 ADR/DONE/openapi → Tasks 8–9 ✅
- PR №2 (web) и PR №3 (client) — отдельные планы (вне этого документа).

**Placeholder scan:** все шаги содержат конкретный код/команды; «по формату проекта» в DONE — единственное описательное место (формат жёстко задан в docs/CLAUDE.md, не дублируем).

**Type consistency:** `LegalConsentState` = `{ accepted_version, accepted_at }` совпадает с `MeLegalConsent` (Task 6) и формой ответа эндпоинта (Task 7). `currentVersion()/isRequired()/setRequired()/setVersion()` — единые сигнатуры в Tasks 3/4/5/7. Поля `legalConsentRequired/legalConsentVersion` едины в DTO/контроллере/тестах.
