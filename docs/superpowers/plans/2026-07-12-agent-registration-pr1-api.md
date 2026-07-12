# Agent Registration PR1 (API) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Бэкенд флоу «Стать агентом»: заявка + модерация админом + публичный список агентов + фильтр объявлений агента в /search.

**Architecture:** Новый модуль `agent-applications` (пользовательские роуты + admin-роуты по паттерну complaints), новый публичный модуль `agents`, новая таблица `agent_applications` (partial-unique PENDING на пользователя), уведомление о решении через существующий notifications-слой, `agent_id`-фильтр в raw-SQL `buildWhereSql` поиска.

**Tech Stack:** NestJS 10 + Prisma + PostgreSQL (PostGIS), jest unit (`*.spec.ts`) + int (`*.int-spec.ts`), OpenAPI export c CI drift-check.

**Спека:** `docs/superpowers/specs/2026-07-12-agent-registration-design.md`

## Отклонения от спеки (утверждённые упрощения, найденные при планировании)

1. **`details: { limit, used }` в 422 НЕ добавляем** — `details` контрактно типизирован как `ApiErrorDetail[]` (field/issue). Лимит уже публичен: `GET /api/v1/settings/public → activeListingLimit`. Клиент (PR2) возьмёт число оттуда.
2. **`owner_is_agent` НЕ добавляем** — detail-ответ уже содержит `contact.type: 'owner'|'agent'|'agency'` и `contact.is_pro` (`buildContact`, listings.service.ts:1099). Бейдж в PR2 — по существующему полю.
3. **`GET /agents/:id/listings` НЕ делаем** — вместо него `agent_id`-фильтр в существующем `GET /search` (переиспользует card-shape, промо-сортировку, FX, карту; пригодится мобилке). `owner_id` и так публичен в detail-ответе — приватность не ухудшается.

## Global Constraints

- Рабочая папка — ТОЛЬКО `apps/api` (+ `docs/`, `packages/shared` не трогаем).
- Все bash-команды через `rtk` (`~/.claude/RTK.md`); `rtk prisma generate` после смены схемы (гоча stale client).
- Ветка `feat/agent-applications` от свежего `main` (`git checkout main` + `git pull --ff-only` — отдельными командами). Перед КАЖДЫМ коммитом: `rtk git status` — проверить ветку и стейджить только файлы задачи.
- main защищён: НИКОГДА не пушить в main, PR мёржит пользователь.
- Conventional Commits; в конце сообщения: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Wire-контракт snake_case; URI-версия `/api/v1`; ошибки — envelope `{ error: { code, message } }`; коды стабильны.
- Unit-тесты: `pnpm --filter @avino/api test -- <file>`; int-спеки CI гоняет ПО ОДНОМУ файлу (гео-контаминация) — локально тоже по одному.
- После новых/изменённых роутов: `pnpm openapi:export` и коммит обоих json (CI drift-check).
- Docs/DONE.md/LOG.md — коммитим в этой же ветке (finalize in feature PR).

---

### Task 0: Ветка + коммит спеки

**Files:**
- Commit: `docs/superpowers/specs/2026-07-12-agent-registration-design.md` (уже создан)
- Commit: `docs/superpowers/plans/2026-07-12-agent-registration-pr1-api.md` (этот файл)

- [ ] **Step 1: Синхронизировать main и создать ветку**

```bash
rtk git status            # убедиться: рабочее дерево без чужих правок задачи
git checkout main
git pull --ff-only
git checkout -b feat/agent-applications
```

- [ ] **Step 2: Закоммитить спеку и план**

```bash
git add docs/superpowers/specs/2026-07-12-agent-registration-design.md docs/superpowers/plans/2026-07-12-agent-registration-pr1-api.md
git commit -m "docs: spec+plan for agent registration flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1: Prisma-схема + миграция

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum ~строка 199 NotificationType; модели после `model UserRole` ~строка 363; relations в `model User` ~строка 302)
- Create: `apps/api/prisma/migrations/20260712150000_add_agent_applications/migration.sql`

**Interfaces:**
- Produces: Prisma-модель `AgentApplication` (поля `id, userId, agencyName, about, status, rejectReason, moderatorId, createdAt, resolvedAt`), enum `AgentApplicationStatus` (PENDING/APPROVED/REJECTED), `NotificationType.AGENT_APPLICATION_RESOLVED`.

- [ ] **Step 1: Добавить в schema.prisma enum значения NotificationType**

В enum `NotificationType` (строка ~199) добавить последним значением:

```prisma
  AGENT_APPLICATION_RESOLVED
```

- [ ] **Step 2: Добавить enum и модель (после model UserRole)**

```prisma
/// Статус заявки «Стать агентом» (ADR-0140).
enum AgentApplicationStatus {
  PENDING
  APPROVED
  REJECTED
}

// agent_applications — заявки «Стать агентом» (ADR-0140). Одна PENDING-заявка
// на пользователя — partial unique index в SQL-миграции (Prisma не выражает).
// agency_name NULL = частный маклер. После REJECTED допустима новая заявка
// (новая строка — история сохраняется).
model AgentApplication {
  id           String                 @id @default(uuid()) @db.Uuid
  userId       String                 @map("user_id") @db.Uuid
  agencyName   String?                @map("agency_name") @db.VarChar(255)
  about        String
  status       AgentApplicationStatus @default(PENDING)
  rejectReason String?                @map("reject_reason")
  moderatorId  String?                @map("moderator_id") @db.Uuid
  createdAt    DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  resolvedAt   DateTime?              @map("resolved_at") @db.Timestamptz(6)

  user      User  @relation("AgentApplicant", fields: [userId], references: [id], onDelete: Cascade)
  moderator User? @relation("AgentApplicationModerator", fields: [moderatorId], references: [id], onDelete: SetNull)

  @@index([status, createdAt])
  @@index([userId])
  @@map("agent_applications")
}
```

- [ ] **Step 3: Добавить обратные relations в model User (рядом с legalConsents)**

```prisma
  // Заявки «Стать агентом» (ADR-0140): поданные и рассмотренные как модератор.
  agentApplications          AgentApplication[] @relation("AgentApplicant")
  agentApplicationsModerated AgentApplication[] @relation("AgentApplicationModerator")
```

- [ ] **Step 4: Написать миграцию**

`apps/api/prisma/migrations/20260712150000_add_agent_applications/migration.sql`:

```sql
-- agent_applications: заявки «Стать агентом» (ADR-0140)
CREATE TYPE "AgentApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "agent_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agency_name" VARCHAR(255),
    "about" TEXT NOT NULL,
    "status" "AgentApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "moderator_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_applications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_applications_status_created_at_idx" ON "agent_applications"("status", "created_at");
CREATE INDEX "agent_applications_user_id_idx" ON "agent_applications"("user_id");
-- Одна активная (PENDING) заявка на пользователя.
CREATE UNIQUE INDEX "agent_applications_user_pending_key" ON "agent_applications"("user_id") WHERE "status" = 'PENDING';

ALTER TABLE "agent_applications" ADD CONSTRAINT "agent_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_applications" ADD CONSTRAINT "agent_applications_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Уведомление о решении по заявке (канал IN_APP).
ALTER TYPE "NotificationType" ADD VALUE 'AGENT_APPLICATION_RESOLVED';
```

Перед коммитом сверить стиль с соседней миграцией (`rtk read apps/api/prisma/migrations/20260712000000_add_listing_reference/migration.sql`) — кавычки/типы должны совпадать с конвенцией.

- [ ] **Step 5: Перегенерировать клиент и проверить**

```bash
rtk prisma generate
pnpm --filter @avino/api exec prisma validate
```

Expected: `The schema ... is valid`, generate без ошибок. Если поднят локальный стек — дополнительно `pnpm --filter @avino/api exec prisma migrate deploy`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260712150000_add_agent_applications/migration.sql
git commit -m "feat(api): agent_applications table + AGENT_APPLICATION_RESOLVED notification type

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Коды ошибок

**Files:**
- Modify: `apps/api/src/common/dto/error-response.dto.ts:49` (enum ApiErrorCode, перед INTERNAL_ERROR)
- Modify: `docs/API.md` §17 Error catalog (добавить строки)

**Interfaces:**
- Produces: `ApiErrorCode.AGENT_APPLICATION_PENDING`, `ApiErrorCode.ALREADY_AGENT` — используются в Task 4/5.

- [ ] **Step 1: Добавить коды в enum**

```ts
  AGENT_APPLICATION_PENDING = 'AGENT_APPLICATION_PENDING',
  ALREADY_AGENT = 'ALREADY_AGENT',
```

- [ ] **Step 2: Добавить в docs/API.md §17 (каталог ошибок), стиль соседних строк**

```markdown
| `AGENT_APPLICATION_PENDING` | 409 | User already has a pending agent application |
| `ALREADY_AGENT` | 409 | User already has the AGENT/AGENCY role |
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/dto/error-response.dto.ts docs/API.md
git commit -m "feat(api): AGENT_APPLICATION_PENDING + ALREADY_AGENT error codes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Уведомление о решении по заявке

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts` (после `queueTourStatusChanged`, ~строка 265; data-интерфейс — рядом с `TourStatusChangedNotificationData`)
- Test: тест-файл сервиса уведомлений — найти существующий (`rtk find apps/api/src/notifications -name "*.spec.ts"`) и добавить кейс в его стиле; если queue-методы там не покрыты — покрытие придёт через unit-тесты Task 5 (approve/reject вызывают метод) — тогда отдельный тест не нужен, зафиксировать это в коммит-сообщении.

**Interfaces:**
- Produces: `queueAgentApplicationResolved(tx: Prisma.TransactionClient, userId: string, data: AgentApplicationResolvedNotificationData): Promise<void>`; `AgentApplicationResolvedNotificationData = { applicationId: string; status: 'APPROVED' | 'REJECTED'; rejectReason: string | null }`.

- [ ] **Step 1: Добавить data-интерфейс (рядом с Tour*NotificationData)**

```ts
/** Данные уведомления о решении по заявке «Стать агентом» (ADR-0140). */
export interface AgentApplicationResolvedNotificationData {
  applicationId: string;
  status: 'APPROVED' | 'REJECTED';
  rejectReason: string | null;
}
```

- [ ] **Step 2: Добавить queue-метод (после queueTourStatusChanged)**

```ts
  /**
   * Уведомить заявителя о решении по заявке «Стать агентом» (ADR-0140).
   * Канал IN_APP. Принимает `tx`, чтобы коммититься в одной транзакции со
   * сменой статуса заявки.
   */
  async queueAgentApplicationResolved(
    tx: Prisma.TransactionClient,
    userId: string,
    data: AgentApplicationResolvedNotificationData,
  ): Promise<void> {
    await tx.notification.create({
      data: {
        userId,
        type: NotificationType.AGENT_APPLICATION_RESOLVED,
        channel: NotificationChannel.IN_APP,
        dataJson: {
          application_id: data.applicationId,
          status: data.status,
          reject_reason: data.rejectReason,
        },
      },
    });
  }
```

- [ ] **Step 3: Прогнать тесты уведомлений (или отметить перенос покрытия в Task 5)**

```bash
pnpm --filter @avino/api test -- notifications
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/notifications/
git commit -m "feat(api): queueAgentApplicationResolved notification producer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: AgentApplicationsService — подача и «моя заявка» (TDD)

**Files:**
- Create: `apps/api/src/agent-applications/dto/create-agent-application.dto.ts`
- Create: `apps/api/src/agent-applications/dto/list-agent-applications.dto.ts`
- Create: `apps/api/src/agent-applications/dto/reject-agent-application.dto.ts`
- Create: `apps/api/src/agent-applications/dto/index.ts`
- Create: `apps/api/src/agent-applications/agent-applications.service.ts`
- Test: `apps/api/src/agent-applications/agent-applications.service.spec.ts`

**Interfaces:**
- Consumes: `ApiErrorCode.AGENT_APPLICATION_PENDING/ALREADY_AGENT` (Task 2); Prisma `AgentApplication` (Task 1).
- Produces:
  - `AgentApplicationResponse = { id: string; status: AgentApplicationStatus; agency_name: string | null; about: string; reject_reason: string | null; created_at: string; resolved_at: string | null }`
  - `AgentApplicationsService.create(userId: string, dto: CreateAgentApplicationDto): Promise<AgentApplicationResponse>`
  - `AgentApplicationsService.getMine(userId: string): Promise<AgentApplicationResponse>`

Перед написанием: открыть `apps/api/src/complaints/complaints.service.spec.ts` и скопировать его харнес мока PrismaService (jest-моки методов) — тесты ниже написаны в предположении этого харнеса; адаптировать имена при расхождении.

- [ ] **Step 1: DTOs**

`create-agent-application.dto.ts`:

```ts
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body `POST /api/v1/users/me/agent-application` (ADR-0140, API.md §21).
 * Анкета-минимум: имя/телефон/аватар берутся из профиля. `agency_name`
 * опционален (частный маклер), под колонку VARCHAR(255).
 */
export class CreateAgentApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  agency_name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  about!: string;
}
```

`list-agent-applications.dto.ts` (зеркало `ListComplaintsQueryDto`):

```ts
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AgentApplicationStatus } from '@prisma/client';

/** Query `GET /api/v1/admin/agent-applications` (ADR-0140, API.md §21). */
export class ListAgentApplicationsQueryDto {
  @IsOptional()
  @IsEnum(AgentApplicationStatus)
  status?: AgentApplicationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
```

`reject-agent-application.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body `POST /api/v1/admin/agent-applications/:id/reject` (ADR-0140). */
export class RejectAgentApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
```

`dto/index.ts`:

```ts
export * from './create-agent-application.dto';
export * from './list-agent-applications.dto';
export * from './reject-agent-application.dto';
```

- [ ] **Step 2: Написать падающие unit-тесты create/getMine**

`agent-applications.service.spec.ts` — кейсы (харнес — из complaints.service.spec.ts):

```ts
describe('create', () => {
  it('creates a PENDING application and returns snake_case response', async () => {
    prisma.userRole.count.mockResolvedValue(0);
    prisma.agentApplication.findFirst.mockResolvedValue(null);
    prisma.agentApplication.create.mockResolvedValue(ROW_PENDING);
    const res = await service.create(USER_ID, { about: 'Опытный маклер' });
    expect(res.status).toBe('PENDING');
    expect(res.agency_name).toBeNull();
    expect(prisma.agentApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_ID, about: 'Опытный маклер', agencyName: null }),
      }),
    );
  });

  it('409 ALREADY_AGENT when user already has AGENT/AGENCY role', async () => {
    prisma.userRole.count.mockResolvedValue(1);
    await expect(service.create(USER_ID, { about: 'x' })).rejects.toMatchObject({
      response: { code: 'ALREADY_AGENT' },
    });
  });

  it('409 AGENT_APPLICATION_PENDING when a pending application exists', async () => {
    prisma.userRole.count.mockResolvedValue(0);
    prisma.agentApplication.findFirst.mockResolvedValue(ROW_PENDING);
    await expect(service.create(USER_ID, { about: 'x' })).rejects.toMatchObject({
      response: { code: 'AGENT_APPLICATION_PENDING' },
    });
  });
});

describe('getMine', () => {
  it('returns the latest application', async () => {
    prisma.agentApplication.findFirst.mockResolvedValue(ROW_REJECTED);
    const res = await service.getMine(USER_ID);
    expect(res.status).toBe('REJECTED');
    expect(prisma.agentApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });

  it('404 when the user never applied', async () => {
    prisma.agentApplication.findFirst.mockResolvedValue(null);
    await expect(service.getMine(USER_ID)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

```bash
pnpm --filter @avino/api test -- agent-applications.service
```

Expected: FAIL (модуль не существует).

- [ ] **Step 4: Реализовать сервис (create/getMine)**

`agent-applications.service.ts`:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentApplicationStatus, Prisma } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { CreateAgentApplicationDto } from './dto/create-agent-application.dto';

/** Заявка «Стать агентом» в пользовательском контракте (API.md §21). */
export interface AgentApplicationResponse {
  id: string;
  status: AgentApplicationStatus;
  agency_name: string | null;
  about: string;
  reject_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

const APPLICATION_SELECT = {
  id: true,
  status: true,
  agencyName: true,
  about: true,
  rejectReason: true,
  createdAt: true,
  resolvedAt: true,
} as const;

type ApplicationRow = Prisma.AgentApplicationGetPayload<{
  select: typeof APPLICATION_SELECT;
}>;

/**
 * AgentApplicationsService — заявки «Стать агентом» (ADR-0140, API.md §21).
 *
 * Пользовательская часть: подача (`POST /users/me/agent-application`, одна
 * PENDING на пользователя — partial unique в БД страхует гонку) и статус
 * последней заявки (`GET`). Админ-часть (список/approve/reject) добавляется
 * в этом же сервисе (Task 5), HTTP — Admin-контроллер в AdminModule.
 */
@Injectable()
export class AgentApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `POST /api/v1/users/me/agent-application` — подать заявку. Уже агент →
   * `409 ALREADY_AGENT`; есть PENDING → `409 AGENT_APPLICATION_PENDING`
   * (проверка + unique-страховка от гонки на P2002).
   */
  async create(
    userId: string,
    dto: CreateAgentApplicationDto,
  ): Promise<AgentApplicationResponse> {
    const proRoleCount = await this.prisma.userRole.count({
      where: {
        userId,
        role: { code: { in: [UserRole.AGENT, UserRole.AGENCY] } },
      },
    });
    if (proRoleCount > 0) {
      throw new ConflictException({
        code: ApiErrorCode.ALREADY_AGENT,
        message: 'User already has a professional role',
      });
    }

    const pending = await this.prisma.agentApplication.findFirst({
      where: { userId, status: AgentApplicationStatus.PENDING },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException({
        code: ApiErrorCode.AGENT_APPLICATION_PENDING,
        message: 'An agent application is already pending',
      });
    }

    try {
      const row = await this.prisma.agentApplication.create({
        data: {
          userId,
          agencyName: dto.agency_name?.trim() || null,
          about: dto.about.trim(),
        },
        select: APPLICATION_SELECT,
      });
      return this.toResponse(row);
    } catch (e) {
      // Гонка двух параллельных подач: partial unique index (user_id WHERE
      // status='PENDING') → P2002 маппим на тот же 409, что и проверка выше.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ApiErrorCode.AGENT_APPLICATION_PENDING,
          message: 'An agent application is already pending',
        });
      }
      throw e;
    }
  }

  /** `GET /api/v1/users/me/agent-application` — последняя заявка или 404. */
  async getMine(userId: string): Promise<AgentApplicationResponse> {
    const row = await this.prisma.agentApplication.findFirst({
      where: { userId },
      select: APPLICATION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    if (!row) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Agent application not found',
      });
    }
    return this.toResponse(row);
  }

  private toResponse(row: ApplicationRow): AgentApplicationResponse {
    return {
      id: row.id,
      status: row.status,
      agency_name: row.agencyName,
      about: row.about,
      reject_reason: row.rejectReason,
      created_at: row.createdAt.toISOString(),
      resolved_at: row.resolvedAt?.toISOString() ?? null,
    };
  }
}
```

- [ ] **Step 5: Прогнать тесты**

```bash
pnpm --filter @avino/api test -- agent-applications.service
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/agent-applications/
git commit -m "feat(api): agent application create/getMine service

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: AgentApplicationsService — админ-часть (list/approve/reject, TDD)

**Files:**
- Modify: `apps/api/src/agent-applications/agent-applications.service.ts`
- Test: `apps/api/src/agent-applications/agent-applications.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.queueAgentApplicationResolved` (Task 3), `UploadsService.resolveMediaUrl(storageKey, url)` (существующий, как в listings.service.ts:1133), `PaginatedResponse<T>` из `../moderation`.
- Produces:
  - `AdminAgentApplicationResponse extends AgentApplicationResponse` + `{ user: { id: string; name: string | null; phone: string | null; avatar_url: string | null }; moderator_id: string | null }`
  - `listAdmin(query: ListAgentApplicationsQueryDto): Promise<PaginatedResponse<AdminAgentApplicationResponse>>`
  - `approve(moderatorId: string, id: string): Promise<AdminAgentApplicationResponse>`
  - `reject(moderatorId: string, id: string, dto: RejectAgentApplicationDto): Promise<AdminAgentApplicationResponse>`

- [ ] **Step 1: Написать падающие тесты**

Кейсы (тот же харнес; в конструктор сервиса добавятся моки `notifications` и `uploads`):

```ts
describe('approve', () => {
  it('sets APPROVED, grants AGENT role, queues notification in one tx', async () => {
    prisma.agentApplication.findUnique.mockResolvedValue({ ...ROW_PENDING_FULL });
    prisma.role.findUnique.mockResolvedValue({ id: ROLE_AGENT_ID });
    // $transaction(async cb => cb(txMock)) — харнес прокидывает txMock
    const res = await service.approve(MODERATOR_ID, ROW_PENDING_FULL.id);
    expect(res.status).toBe('APPROVED');
    expect(txMock.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_roleId: { userId: USER_ID, roleId: ROLE_AGENT_ID } },
        create: expect.objectContaining({ grantedBy: MODERATOR_ID }),
      }),
    );
    expect(notifications.queueAgentApplicationResolved).toHaveBeenCalledWith(
      txMock,
      USER_ID,
      expect.objectContaining({ status: 'APPROVED' }),
    );
  });

  it('422 INVALID_STATUS_TRANSITION for non-PENDING application', async () => {
    prisma.agentApplication.findUnique.mockResolvedValue({ ...ROW_PENDING_FULL, status: 'APPROVED' });
    await expect(service.approve(MODERATOR_ID, ROW_PENDING_FULL.id)).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
  });

  it('404 for missing application', async () => {
    prisma.agentApplication.findUnique.mockResolvedValue(null);
    await expect(service.approve(MODERATOR_ID, 'missing')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});

describe('reject', () => {
  it('sets REJECTED with reason and queues notification', async () => {
    prisma.agentApplication.findUnique.mockResolvedValue({ ...ROW_PENDING_FULL });
    const res = await service.reject(MODERATOR_ID, ROW_PENDING_FULL.id, { reason: 'нет данных' });
    expect(res.status).toBe('REJECTED');
    expect(res.reject_reason).toBe('нет данных');
    expect(notifications.queueAgentApplicationResolved).toHaveBeenCalledWith(
      txMock,
      USER_ID,
      expect.objectContaining({ status: 'REJECTED', rejectReason: 'нет данных' }),
    );
  });
});

describe('listAdmin', () => {
  it('filters by status and returns applicant info with resolved avatar', async () => {
    prisma.agentApplication.findMany.mockResolvedValue([ROW_PENDING_WITH_USER]);
    prisma.agentApplication.count.mockResolvedValue(1);
    uploads.resolveMediaUrl.mockResolvedValue('https://signed/avatar.jpg');
    const res = await service.listAdmin({ status: 'PENDING' });
    expect(res.meta.total).toBe(1);
    expect(res.data[0].user).toEqual(
      expect.objectContaining({ avatar_url: 'https://signed/avatar.jpg' }),
    );
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

```bash
pnpm --filter @avino/api test -- agent-applications.service
```

Expected: FAIL (методы не существуют).

- [ ] **Step 3: Реализовать админ-методы**

Дополнить сервис (конструктор: `+ private readonly notifications: NotificationsService, private readonly uploads: UploadsService`):

```ts
/** Заявка в админ-контракте: + заявитель и модератор (API.md §21). */
export interface AdminAgentApplicationResponse extends AgentApplicationResponse {
  user: {
    id: string;
    name: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  moderator_id: string | null;
}

const ADMIN_APPLICATION_INCLUDE = {
  user: {
    select: {
      id: true,
      phone: true,
      profile: {
        select: {
          firstName: true,
          lastName: true,
          displayName: true,
          avatarUrl: true,
          avatarStorageKey: true,
          contactPhone: true,
        },
      },
    },
  },
} as const;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
```

```ts
  /** `GET /api/v1/admin/agent-applications` — модерационный список. */
  async listAdmin(
    query: ListAgentApplicationsQueryDto,
  ): Promise<PaginatedResponse<AdminAgentApplicationResponse>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.AgentApplicationWhereInput = {};
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.agentApplication.findMany({
        where,
        include: ADMIN_APPLICATION_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.agentApplication.count({ where }),
    ]);

    return {
      data: await Promise.all(rows.map((r) => this.toAdminResponse(r))),
      meta: { page, limit, total },
    };
  }

  /**
   * `POST /api/v1/admin/agent-applications/:id/approve` — одобрить: статус
   * APPROVED + роль AGENT (идемпотентно через upsert — переживает роль,
   * выданную админом вручную ранее) + аудит + уведомление, всё в одной
   * транзакции. Не-PENDING → `422 INVALID_STATUS_TRANSITION`.
   */
  async approve(
    moderatorId: string,
    id: string,
  ): Promise<AdminAgentApplicationResponse> {
    const app = await this.requirePending(id);
    const role = await this.prisma.role.findUnique({
      where: { code: UserRole.AGENT },
      select: { id: true },
    });
    if (!role) throw new Error('AGENT role is not seeded');

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.agentApplication.update({
        where: { id },
        data: {
          status: AgentApplicationStatus.APPROVED,
          moderatorId,
          resolvedAt: new Date(),
        },
        include: ADMIN_APPLICATION_INCLUDE,
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: app.userId, roleId: role.id } },
        update: {},
        create: { userId: app.userId, roleId: role.id, grantedBy: moderatorId },
      });
      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'ROLE_CHANGE',
          entityType: 'user',
          entityId: app.userId,
          metadata: { role: UserRole.AGENT, op: 'grant', agent_application_id: id },
        },
      });
      await this.notifications.queueAgentApplicationResolved(tx, app.userId, {
        applicationId: id,
        status: 'APPROVED',
        rejectReason: null,
      });
      return row;
    });
    return this.toAdminResponse(updated);
  }

  /** `POST /api/v1/admin/agent-applications/:id/reject` — отклонить с причиной. */
  async reject(
    moderatorId: string,
    id: string,
    dto: RejectAgentApplicationDto,
  ): Promise<AdminAgentApplicationResponse> {
    const app = await this.requirePending(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.agentApplication.update({
        where: { id },
        data: {
          status: AgentApplicationStatus.REJECTED,
          rejectReason: dto.reason?.trim() || null,
          moderatorId,
          resolvedAt: new Date(),
        },
        include: ADMIN_APPLICATION_INCLUDE,
      });
      await this.notifications.queueAgentApplicationResolved(tx, app.userId, {
        applicationId: id,
        status: 'REJECTED',
        rejectReason: dto.reason?.trim() || null,
      });
      return row;
    });
    return this.toAdminResponse(updated);
  }

  /** Заявка существует и в PENDING, иначе 404 / 422. */
  private async requirePending(id: string) {
    const app = await this.prisma.agentApplication.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!app) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Agent application not found',
      });
    }
    if (app.status !== AgentApplicationStatus.PENDING) {
      throw new HttpException(
        {
          code: ApiErrorCode.INVALID_STATUS_TRANSITION,
          message: `Cannot resolve application in status ${app.status}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return app;
  }

  private async toAdminResponse(
    row: Prisma.AgentApplicationGetPayload<{
      include: typeof ADMIN_APPLICATION_INCLUDE;
    }>,
  ): Promise<AdminAgentApplicationResponse> {
    const profile = row.user.profile;
    const fullName = [profile?.firstName, profile?.lastName]
      .filter((p): p is string => Boolean(p))
      .join(' ');
    // sign-on-read аватара — как в ListingsService (ADR-0086/ADR-0134).
    const avatarUrl =
      profile?.avatarStorageKey || profile?.avatarUrl
        ? await this.uploads.resolveMediaUrl(
            profile?.avatarStorageKey ?? null,
            profile?.avatarUrl ?? null,
          )
        : null;
    return {
      ...this.toResponse(row),
      moderator_id: row.moderatorId,
      user: {
        id: row.user.id,
        name: profile?.displayName ?? (fullName.length > 0 ? fullName : null),
        phone: profile?.contactPhone ?? row.user.phone ?? null,
        avatar_url: avatarUrl,
      },
    };
  }
```

Примечания: `HttpException/HttpStatus` — импорт из `@nestjs/common`; сигнатуру `resolveMediaUrl` сверить по факту (listings.service.ts:1133) и подстроить null-обработку; `toResponse` из Task 4 должен принимать и include-строку (поля совпадают — TS structural typing).

- [ ] **Step 4: Прогнать тесты**

```bash
pnpm --filter @avino/api test -- agent-applications.service
```

Expected: PASS (все кейсы Task 4 + Task 5).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/agent-applications/
git commit -m "feat(api): admin list/approve/reject for agent applications

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Контроллеры + модуль + регистрация

**Files:**
- Create: `apps/api/src/agent-applications/agent-applications.controller.ts`
- Create: `apps/api/src/agent-applications/admin-agent-applications.controller.ts`
- Create: `apps/api/src/agent-applications/agent-applications.module.ts`
- Create: `apps/api/src/agent-applications/index.ts`
- Modify: `apps/api/src/app.module.ts` (imports)
- Modify: `apps/api/src/admin/admin.module.ts` (imports + controllers)
- Modify: `apps/api/src/common/openapi/swagger.documents.ts` (PUBLIC_MODULES += AgentApplicationsModule; префикс `/api/v1/users` уже в allowlist)

**Interfaces:**
- Consumes: `AgentApplicationsService` (Tasks 4–5), гварды/декораторы как в complaints.

- [ ] **Step 1: Пользовательский контроллер**

```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import {
  AgentApplicationResponse,
  AgentApplicationsService,
} from './agent-applications.service';
import { CreateAgentApplicationDto } from './dto/create-agent-application.dto';

/**
 * AgentApplicationsController — заявка «Стать агентом» (ADR-0140, API.md §21).
 * `JwtAuthGuard` на классе: GUEST → 401. Путь `users/me/agent-application` —
 * ресурс текущего пользователя (рядом с /users/me/* в UsersController).
 * Админ-разбор — {@link AdminAgentApplicationsController}.
 */
@Controller({ path: 'users/me/agent-application', version: '1' })
@UseGuards(JwtAuthGuard)
export class AgentApplicationsController {
  constructor(private readonly service: AgentApplicationsService) {}

  /** `POST /api/v1/users/me/agent-application` — подать заявку. */
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAgentApplicationDto,
  ): Promise<AgentApplicationResponse> {
    return this.service.create(userId, dto);
  }

  /** `GET /api/v1/users/me/agent-application` — последняя заявка (или 404). */
  @Get()
  getMine(@CurrentUser('id') userId: string): Promise<AgentApplicationResponse> {
    return this.service.getMine(userId);
  }
}
```

- [ ] **Step 2: Админ-контроллер (зеркало AdminComplaintsController)**

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PaginatedResponse } from '../moderation';
import {
  AdminAgentApplicationResponse,
  AgentApplicationsService,
} from './agent-applications.service';
import { ListAgentApplicationsQueryDto } from './dto/list-agent-applications.dto';
import { RejectAgentApplicationDto } from './dto/reject-agent-application.dto';

/**
 * AdminAgentApplicationsController — модерация заявок «Стать агентом»
 * (ADR-0140, API.md §21). Регистрируется в {@link AdminModule}.
 */
@Controller({ path: 'admin/agent-applications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class AdminAgentApplicationsController {
  constructor(private readonly service: AgentApplicationsService) {}

  /** `GET /api/v1/admin/agent-applications` — список (фильтр `status`). */
  @Get()
  list(
    @Query() query: ListAgentApplicationsQueryDto,
  ): Promise<PaginatedResponse<AdminAgentApplicationResponse>> {
    return this.service.listAdmin(query);
  }

  /** `POST /api/v1/admin/agent-applications/:id/approve` — одобрить. */
  @Post(':id/approve')
  approve(
    @CurrentUser('id') moderatorId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminAgentApplicationResponse> {
    return this.service.approve(moderatorId, id);
  }

  /** `POST /api/v1/admin/agent-applications/:id/reject` — отклонить. */
  @Post(':id/reject')
  reject(
    @CurrentUser('id') moderatorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAgentApplicationDto,
  ): Promise<AdminAgentApplicationResponse> {
    return this.service.reject(moderatorId, id, dto);
  }
}
```

- [ ] **Step 3: Модуль + index + регистрация**

`agent-applications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RolesModule } from '../roles';
import { UploadsModule } from '../uploads';
import { AgentApplicationsController } from './agent-applications.controller';
import { AgentApplicationsService } from './agent-applications.service';

/**
 * AgentApplicationsModule — заявки «Стать агентом» (ADR-0140, API.md §21).
 * Сервис экспортируется для {@link AdminAgentApplicationsController} в AdminModule.
 */
@Module({
  imports: [RolesModule, NotificationsModule, UploadsModule],
  controllers: [AgentApplicationsController],
  providers: [AgentApplicationsService],
  exports: [AgentApplicationsService],
})
export class AgentApplicationsModule {}
```

(Пути импортов NotificationsModule/UploadsModule сверить с тем, как их импортирует `tour-requests.module.ts` / `listings.module.ts` — там же видно, есть ли barrel-index.)

`index.ts`:

```ts
export * from './agent-applications.module';
export * from './agent-applications.service';
```

- `app.module.ts`: добавить `AgentApplicationsModule` в imports (алфавитно к соседям).
- `admin/admin.module.ts`: `imports += AgentApplicationsModule`, `controllers += AdminAgentApplicationsController` (import из `../agent-applications/admin-agent-applications.controller`).
- `swagger.documents.ts`: `PUBLIC_MODULES += AgentApplicationsModule` (пути под `/api/v1/users` уже в PUBLIC_PATH_PREFIXES; admin-контроллер отфильтруется allowlist'ом).

- [ ] **Step 4: Сборка + все unit-тесты api**

```bash
pnpm --filter @avino/api build
pnpm --filter @avino/api test
```

Expected: build OK, тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/agent-applications/ apps/api/src/app.module.ts apps/api/src/admin/admin.module.ts apps/api/src/common/openapi/swagger.documents.ts
git commit -m "feat(api): agent application routes (user + admin)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Публичные агенты — AgentsModule (TDD)

**Files:**
- Create: `apps/api/src/agents/agents.service.ts`
- Create: `apps/api/src/agents/agents.controller.ts`
- Create: `apps/api/src/agents/agents.module.ts`
- Create: `apps/api/src/agents/dto/list-agents.dto.ts`
- Create: `apps/api/src/agents/index.ts`
- Test: `apps/api/src/agents/agents.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/common/openapi/swagger.documents.ts` (PUBLIC_MODULES += AgentsModule; PUBLIC_PATH_PREFIXES += '/api/v1/agents')

**Interfaces:**
- Produces:
  - `AgentResponse = { id: string; name: string | null; avatar_url: string | null; agency_name: string | null; about: string | null; active_listings_count: number }`
  - `AgentsService.list(query: ListAgentsQueryDto): Promise<PaginatedResponse<AgentResponse>>`
  - `AgentsService.getById(id: string): Promise<AgentResponse>`

- [ ] **Step 1: Падающие тесты**

```ts
describe('list', () => {
  it('returns agents sorted by active listings count desc', async () => {
    prisma.user.findMany.mockResolvedValue([AGENT_A, AGENT_B]); // A: 1 листинг, B: 5
    prisma.listing.groupBy.mockResolvedValue([
      { ownerId: AGENT_A.id, _count: { _all: 1 } },
      { ownerId: AGENT_B.id, _count: { _all: 5 } },
    ]);
    const res = await service.list({});
    expect(res.data.map((a) => a.id)).toEqual([AGENT_B.id, AGENT_A.id]);
    expect(res.data[0].active_listings_count).toBe(5);
    expect(res.meta.total).toBe(2);
  });

  it('takes agency_name/about from the latest APPROVED application', async () => {
    prisma.user.findMany.mockResolvedValue([AGENT_WITH_APPLICATION]);
    prisma.listing.groupBy.mockResolvedValue([]);
    const res = await service.list({});
    expect(res.data[0].agency_name).toBe('Avino Realty');
    expect(res.data[0].about).toBe('10 лет на рынке');
  });
});

describe('getById', () => {
  it('404 for a user without AGENT/AGENCY role', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.getById('some-id')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});
```

- [ ] **Step 2: Убедиться, что падают**

```bash
pnpm --filter @avino/api test -- agents.service
```

Expected: FAIL.

- [ ] **Step 3: Реализация**

`dto/list-agents.dto.ts` — page/limit как в ListAgentApplicationsQueryDto (без status).

`agents.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AgentApplicationStatus,
  ListingStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';
import { ListAgentsQueryDto } from './dto/list-agents.dto';

/** Публичная карточка агента (ADR-0140, API.md §21). */
export interface AgentResponse {
  id: string;
  name: string | null;
  avatar_url: string | null;
  agency_name: string | null;
  about: string | null;
  active_listings_count: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Профиль + последняя APPROVED-заявка (источник agency_name/about). */
const AGENT_SELECT = {
  id: true,
  status: true,
  profile: {
    select: {
      firstName: true,
      lastName: true,
      displayName: true,
      avatarUrl: true,
      avatarStorageKey: true,
    },
  },
  agentApplications: {
    where: { status: AgentApplicationStatus.APPROVED },
    orderBy: { resolvedAt: 'desc' as const },
    take: 1,
    select: { agencyName: true, about: true },
  },
} as const;

type AgentRow = Prisma.UserGetPayload<{ select: typeof AGENT_SELECT }>;

/**
 * AgentsService — публичный каталог агентов (ADR-0140, API.md §21).
 *
 * Агент = ACTIVE-пользователь с ролью AGENT|AGENCY (независимо от того, выдана
 * роль по заявке или админом вручную). `agency_name`/`about` — из последней
 * APPROVED-заявки (NULL для назначенных вручную). Сортировка по числу активных
 * объявлений: агентов немного (модерация), поэтому счётчики агрегируются
 * groupBy и сортировка/пагинация выполняются в памяти по полному списку.
 */
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /** `GET /api/v1/agents` — список агентов, самые активные сверху. */
  async list(
    query: ListAgentsQueryDto,
  ): Promise<PaginatedResponse<AgentResponse>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const rows = await this.prisma.user.findMany({
      where: this.agentWhere(),
      select: AGENT_SELECT,
    });
    const counts = await this.activeCounts(rows.map((r) => r.id));

    const sorted = rows
      .map((row) => ({ row, count: counts.get(row.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.row.id.localeCompare(b.row.id));
    const pageRows = sorted.slice((page - 1) * limit, page * limit);

    return {
      data: await Promise.all(
        pageRows.map(({ row, count }) => this.toResponse(row, count)),
      ),
      meta: { page, limit, total: rows.length },
    };
  }

  /** `GET /api/v1/agents/:id` — профиль агента; не-агент → 404. */
  async getById(id: string): Promise<AgentResponse> {
    const row = await this.prisma.user.findFirst({
      where: { id, ...this.agentWhere() },
      select: AGENT_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Agent not found',
      });
    }
    const counts = await this.activeCounts([row.id]);
    return this.toResponse(row, counts.get(row.id) ?? 0);
  }

  private agentWhere(): Prisma.UserWhereInput {
    return {
      status: UserStatus.ACTIVE,
      deletedAt: null,
      roles: {
        some: { role: { code: { in: [UserRole.AGENT, UserRole.AGENCY] } } },
      },
    };
  }

  private async activeCounts(ownerIds: string[]): Promise<Map<string, number>> {
    if (ownerIds.length === 0) return new Map();
    const groups = await this.prisma.listing.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: ownerIds }, status: ListingStatus.ACTIVE },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.ownerId, g._count._all]));
  }

  private async toResponse(
    row: AgentRow,
    count: number,
  ): Promise<AgentResponse> {
    const profile = row.profile;
    const fullName = [profile?.firstName, profile?.lastName]
      .filter((p): p is string => Boolean(p))
      .join(' ');
    const application = row.agentApplications[0] ?? null;
    const avatarUrl =
      profile?.avatarStorageKey || profile?.avatarUrl
        ? await this.uploads.resolveMediaUrl(
            profile?.avatarStorageKey ?? null,
            profile?.avatarUrl ?? null,
          )
        : null;
    return {
      id: row.id,
      name: profile?.displayName ?? (fullName.length > 0 ? fullName : null),
      avatar_url: avatarUrl,
      agency_name: application?.agencyName ?? null,
      about: application?.about ?? null,
      active_listings_count: count,
    };
  }
}
```

`agents.controller.ts` (публичный, без гвардов — как PublicSettingsController):

```ts
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PaginatedResponse } from '../moderation';
import { AgentResponse, AgentsService } from './agents.service';
import { ListAgentsQueryDto } from './dto/list-agents.dto';

/**
 * AgentsController — публичный каталог агентов (ADR-0140, API.md §21).
 * Без авторизации: данные публичны (имя/агентство/«о себе»/счётчик).
 * Объявления агента — существующий `GET /search?agent_id=` (ADR-0140).
 */
@Controller({ path: 'agents', version: '1' })
export class AgentsController {
  constructor(private readonly service: AgentsService) {}

  /** `GET /api/v1/agents` — список агентов (самые активные сверху). */
  @Get()
  list(@Query() query: ListAgentsQueryDto): Promise<PaginatedResponse<AgentResponse>> {
    return this.service.list(query);
  }

  /** `GET /api/v1/agents/:id` — публичный профиль агента. */
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<AgentResponse> {
    return this.service.getById(id);
  }
}
```

`agents.module.ts`: imports `[UploadsModule]`, controllers `[AgentsController]`, providers/exports `[AgentsService]`. Регистрация: `app.module.ts` imports; `swagger.documents.ts`: `PUBLIC_MODULES += AgentsModule`, `PUBLIC_PATH_PREFIXES += '/api/v1/agents'`.

- [ ] **Step 4: Прогнать тесты + build**

```bash
pnpm --filter @avino/api test -- agents.service
pnpm --filter @avino/api build
```

Expected: PASS, build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/agents/ apps/api/src/app.module.ts apps/api/src/common/openapi/swagger.documents.ts
git commit -m "feat(api): public agents catalog (GET /agents, /agents/:id)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: `agent_id`-фильтр в /search (TDD)

**Files:**
- Modify: `apps/api/src/search/dto/search-listings.dto.ts` (после `district_id`, ~строка 148)
- Modify: `apps/api/src/search/search.service.ts` (`buildWhereSql`, после region_id-блока ~строка 1227)
- Test: существующий спек поиска (`rtk find apps/api/src/search -name "*.spec.ts"`) — добавить кейс в тот файл, где тестируется buildWhereSql/фильтры (стиль соседних кейсов district_id).

**Interfaces:**
- Produces: query-параметр `GET /api/v1/search?agent_id=<uuid>` — только объявления этого владельца (в сочетании со всеми остальными фильтрами и сортировками).

- [ ] **Step 1: Падающий тест (в стиле соседнего кейса district_id в спеке поиска)**

```ts
it('filters by agent_id (owner)', async () => {
  // arrange как в кейсе district_id этого же файла
  await service.search({ agent_id: OWNER_ID } as SearchListingsQueryDto);
  // assert: в собранный SQL попало условие owner_id = $..::uuid
  // (проверка тем же способом, каким соседний кейс проверяет district_id)
});
```

- [ ] **Step 2: Убедиться, что падает**

```bash
pnpm --filter @avino/api test -- search.service
```

Expected: FAIL.

- [ ] **Step 3: DTO + WHERE**

DTO (после `district_id`):

```ts
  /**
   * Только объявления этого владельца-агента (страница агента, ADR-0140).
   * Значение — users.id; применяется к owner_id без проверки роли: owner_id
   * и так публичен в detail-ответе, скрывать нечего.
   */
  @IsOptional()
  @IsUUID()
  agent_id?: string;
```

`buildWhereSql` (после region_id-блока):

```ts
    // Страница агента (ADR-0140): только объявления этого владельца.
    if (query.agent_id !== undefined)
      conds.push(Prisma.sql`owner_id = ${query.agent_id}::uuid`);
```

- [ ] **Step 4: Прогнать тесты**

```bash
pnpm --filter @avino/api test -- search.service
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/search/
git commit -m "feat(search): agent_id filter for agent public page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Int-spec сквозного флоу

**Files:**
- Create: `apps/api/src/agent-applications/agent-applications.int-spec.ts`
- Modify: `.github/workflows/ci.yml` — ТОЛЬКО если int-спеки перечислены там пофайлово (проверить: `rtk grep -n "int-spec" .github/workflows/ci.yml`); если раннер сам находит файлы — не трогать.

**Interfaces:**
- Consumes: сервисы Tasks 4–8; харнес существующих int-спеков.

- [ ] **Step 1: Изучить харнес**

Прочитать `apps/api/src/listings/listings.service.int-spec.ts` (или ближайший int-spec с созданием пользователей): как поднимается модуль, как чистятся данные (НЕ deleteMany по чужим таблицам — гоча #253: точечная очистка своих строк), как создаются пользователи/роли.

- [ ] **Step 2: Написать int-spec (структура; харнес — по образцу из Step 1)**

Сценарий одним файлом:

```ts
describe('AgentApplications (int)', () => {
  it('full flow: apply → pending blocks duplicate → approve grants AGENT → agents list & search filter', async () => {
    // 1. создать пользователя-клиента (без AGENT роли) и модератора
    // 2. service.create(user) → status PENDING
    // 3. повторный create → rejects AGENT_APPLICATION_PENDING (и P2002-ветка:
    //    прямой prisma.create второй PENDING → ошибка unique)
    // 4. adminService.approve(moderator, appId):
    //    - заявка APPROVED, resolved_at ненулевой
    //    - user_roles содержит AGENT
    //    - notifications содержит AGENT_APPLICATION_RESOLVED c application_id
    // 5. создать пользователю ACTIVE-объявление (минимальный create как в
    //    харнесе int-спеков листингов)
    // 6. agentsService.list() содержит пользователя с active_listings_count 1
    // 7. searchService.search({ agent_id: userId }) возвращает только его
    // 8. create() после APPROVED → rejects ALREADY_AGENT
    // 9. reject-ветвь: вторая заявка от другого пользователя → reject(reason)
    //    → REJECTED + уведомление REJECTED + возможна повторная подача
  });
});
```

Каждый комментарий — реальный код по образцу харнеса; финальная очистка — удалить созданные строки (agent_applications, user_roles, notifications, listings, users) в afterAll.

- [ ] **Step 3: Прогнать локально (нужен поднятый postgres из стека)**

```bash
pnpm --filter @avino/api test:int -- agent-applications
```

Expected: PASS. (Точное имя скрипта сверить в apps/api/package.json.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/agent-applications/agent-applications.int-spec.ts
git commit -m "test(api): int-spec for agent application flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: OpenAPI + документация + ADR

**Files:**
- Regenerate: `apps/api/openapi.public.json`, `apps/api/openapi.internal.json` (путь сверить с CI)
- Modify: `docs/API.md` — новая секция `## 21. Agents & agent applications` (после §20); §14 — упомянуть тип `AGENT_APPLICATION_RESOLVED`
- Modify: `docs/DB_SCHEMA.md` — таблица `agent_applications` (стиль соседних секций)
- Create: `docs/adr/ADR-0140-agent-applications.md`
- Modify: `docs/DONE.md`, `docs/LOG.md` (локально, пуш в этой же ветке)

- [ ] **Step 1: Экспорт OpenAPI**

```bash
pnpm openapi:export
rtk git diff --stat
```

Expected: оба json обновились; в public — `/api/v1/agents*` и `/api/v1/users/me/agent-application`, БЕЗ `/api/v1/admin/agent-applications` (гоча PUBLIC_MODULES).

- [ ] **Step 2: docs/API.md §21**

Содержимое: маршруты (user POST/GET, admin GET/approve/reject, public GET /agents, GET /agents/:id), request/response-примеры в стиле соседних секций, ссылка на `?agent_id=` в §9, коды ошибок → §17. Упомянуть: лимит объявлений публичен в `GET /settings/public → activeListingLimit`; бейдж риелтора — существующий `contact.type` detail-ответа (§7).

- [ ] **Step 3: ADR-0140**

`docs/adr/ADR-0140-agent-applications.md` в стиле ADR-0139: контекст (лимит + «молчаливый» UX + запрос фичи), решение (таблица заявок + модерация, публичный каталог, agent_id-фильтр вместо /agents/:id/listings, отказ от owner_is_agent и details{limit,used} — с причинами из «Отклонений от спеки» этого плана), последствия.

- [ ] **Step 4: DONE.md/LOG.md + commit**

```bash
git add apps/api/openapi.public.json apps/api/openapi.internal.json docs/API.md docs/DB_SCHEMA.md docs/adr/ADR-0140-agent-applications.md docs/DONE.md docs/LOG.md
git commit -m "docs(api): agents & agent applications contract (§21) + ADR-0140

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Финальная верификация + PR

- [ ] **Step 1: Полный прогон**

```bash
pnpm --filter @avino/api test
pnpm --filter @avino/api build
rtk lint 2>/dev/null || pnpm --filter @avino/api lint
```

Expected: всё зелёное.

- [ ] **Step 2: Live-verify (обязателен, скилл verify)**

По рецепту local live-verify (stack up, OTP из логов api):
1. Клиент с 2 активными объявлениями → `POST /listings` → 422 `ACTIVE_LISTING_LIMIT_REACHED` (curl).
2. `POST /users/me/agent-application` → 201 PENDING; повторно → 409.
3. Админ-токеном `POST /admin/agent-applications/:id/approve` → APPROVED.
4. `POST /listings` тем же клиентом → 201 (лимит снят).
5. `GET /agents` — агент в списке со счётчиком; `GET /search?agent_id=` — только его объявления; `GET /listings/:id` — `contact.type: "agent"`.
6. `GET /notifications` заявителя — уведомление AGENT_APPLICATION_RESOLVED.
7. Заодно воспроизвести исходный «молчаливый» сценарий в веб-визарде (стейджинг/локально) и зафиксировать наблюдение для PR2.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin feat/agent-applications
gh pr create --title "feat(api): agent registration flow (applications + public agents)" --body "..."
```

Body PR: краткое описание, ссылка на спеку/ADR, чек-лист live-verify, футер `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Мёржит пользователь (main protected).

---

## Self-Review (выполнен)

- Покрытие спеки: заявки ✔ (Tasks 1–6), уведомления ✔ (3), публичные агенты ✔ (7), объявления агента ✔ (8, отклонение задокументировано), details лимита → отклонение 1, owner_is_agent → отклонение 2, openapi/API.md/ADR ✔ (10). Модалка/страницы/бейдж/админ-UI — PR2/PR3 (отдельные планы).
- Типы согласованы: `AgentApplicationResponse` (Task 4) переиспользуется в Task 5/6; `PaginatedResponse` — из `../moderation` везде.
- Известные точки сверки при исполнении (не плейсхолдеры, а проверка предположений о существующем коде): харнес complaints.service.spec.ts, сигнатура `resolveMediaUrl`, barrel-пути NotificationsModule/UploadsModule, имя скрипта int-тестов, стиль соседней миграции.
