# Admin Broadcast — Backend Implementation Plan (PR-1, `apps/api`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать ADMIN отправлять ручные уведомления (массовые и точечные) с выбором каналов (IN_APP/EMAIL/PUSH/SMS) и временем (сейчас/по расписанию), переиспользуя слой доставки #221; история — через сущность `Broadcast`.

**Architecture:** Тонкий слой `Broadcast` (сущность + sweep-воркер) поверх существующего диспетчера уведомлений. Воркер материализует аудиторию в строки `Notification` (type `ADMIN_BROADCAST`, текст вшит) + `NotificationDelivery` по выбранным каналам; существующий `NotificationDispatcherService.deliver()` их доставляет. Добавляется аддитивно: новый канал `SMS`, ветка `ADMIN_BROADCAST` в рендерере (свободный текст из `notification.title/body`), новый модуль `broadcasts`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), BullMQ (Redis, через `buildBullConnection`, без `BullModule`), class-validator, Jest (plain `jest.fn()` моки, без `TestingModule`).

**Spec:** `docs/superpowers/specs/2026-06-22-admin-broadcast-design.md`

## Global Constraints

- **Авторизация:** admin-роуты — `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.ADMIN)`; `UserRole` импортируется из `@avino/shared` (НЕ из `@prisma/client`). MODERATOR не имеет доступа.
- **Версионирование:** все admin-роуты `@Controller({ path: 'admin/...', version: '1' })` → `/api/v1/admin/...`.
- **Контракт ответов API:** snake_case в телах ответов (как `NotificationResponse`). Внутренние DTO/типы — camelCase.
- **Финансы/деньги:** не применимо (этой фичи не касается).
- **Локализация:** строки уведомлений на RU/UZ/EN с фолбэком на RU (паттерн `pickCopy`).
- **Один путь доставки:** не дублировать email/push/sms отправку — только через существующий `NotificationDispatcherService.deliver()`.
- **Миграция:** локально НЕ применяется (нет `DATABASE_URL`); `prisma generate` работает офлайн; SQL миграции коммитится, `migrate deploy` идёт на staging/CI.
- **i18n parity:** любые новые user-facing строки — во всех трёх языках (RU/UZ/EN).
- **Тесты:** `pnpm --filter @avino/api test`; стиль — `new Service(prisma as never, config as never)` с `jest.fn()`-моками.

---

## Task 1: Схема БД — enum'ы, модель Broadcast, связи

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (enum `NotificationChannel` ~190; enum `NotificationType` ~177; model `Notification` ~774; model `User` ~232-276)
- Create (генерируется): `apps/api/prisma/migrations/<timestamp>_admin_broadcast/migration.sql`

**Interfaces:**
- Produces: Prisma-модели `Broadcast`, enum `BroadcastAudience { SINGLE SEGMENT }`, enum `BroadcastStatus { SCHEDULED SENDING SENT FAILED CANCELED }`; `NotificationChannel.SMS`; `NotificationType.ADMIN_BROADCAST`; `Notification.broadcastId`. Все таблицы/поля используются последующими задачами.

- [ ] **Step 1: Добавить `SMS` в enum `NotificationChannel`**

В `schema.prisma`, enum `NotificationChannel`:

```prisma
enum NotificationChannel {
  EMAIL
  PUSH
  IN_APP
  SMS
}
```

- [ ] **Step 2: Добавить `ADMIN_BROADCAST` в enum `NotificationType`**

```prisma
enum NotificationType {
  SAVED_SEARCH_NEW_LISTING
  FAVORITE_PRICE_DROP
  NEW_CHAT_MESSAGE
  LISTING_MODERATION_STATUS_CHANGED
  NEW_LEAD
  PROMOTION_ACTIVATED
  PROMOTION_EXPIRED
  TOUR_REQUEST_STATUS_CHANGED
  ADMIN_BROADCAST
}
```

- [ ] **Step 3: Добавить `broadcastId` в модель `Notification`**

В модель `Notification` добавить поле и связь (рядом с существующими полями/связями):

```prisma
  broadcastId String? @map("broadcast_id") @db.Uuid
  broadcast   Broadcast? @relation(fields: [broadcastId], references: [id], onDelete: SetNull)
```

И индекс в блоке индексов модели:

```prisma
  @@index([broadcastId])
```

- [ ] **Step 4: Добавить модель `Broadcast` и enum'ы**

В конец `schema.prisma` (после модели `Notification`/`NotificationDelivery`):

```prisma
/// Ручная админ-рассылка (массовая или точечная). Одна строка = одна рассылка
/// = запись истории. Воркер материализует её в Notification+NotificationDelivery.
model Broadcast {
  id             String                @id @default(uuid()) @db.Uuid
  createdById    String                @map("created_by") @db.Uuid
  audienceType   BroadcastAudience     @map("audience_type")
  targetUserId   String?               @map("target_user_id") @db.Uuid
  language       Language
  filterStatus   UserStatus?           @map("filter_status")
  filterRole     String?               @map("filter_role") @db.VarChar(40)
  channels       NotificationChannel[]
  title          String                @db.VarChar(255)
  body           String
  status         BroadcastStatus        @default(SCHEDULED)
  scheduledAt    DateTime?             @map("scheduled_at") @db.Timestamptz(6)
  recipientCount Int                   @default(0) @map("recipient_count")
  sentAt         DateTime?             @map("sent_at") @db.Timestamptz(6)
  createdAt      DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)

  createdBy     User           @relation("BroadcastCreatedBy", fields: [createdById], references: [id], onDelete: Cascade)
  targetUser    User?          @relation("BroadcastTargetUser", fields: [targetUserId], references: [id], onDelete: SetNull)
  notifications Notification[]

  @@index([status, scheduledAt])
  @@index([createdById, createdAt])
  @@map("broadcasts")
}

/// Тип аудитории рассылки: SINGLE — конкретный пользователь; SEGMENT — фильтр.
enum BroadcastAudience {
  SINGLE
  SEGMENT
}

/// Статусы рассылки. SCHEDULED → SENDING → SENT; CANCELED из SCHEDULED; FAILED при ошибке.
enum BroadcastStatus {
  SCHEDULED
  SENDING
  SENT
  FAILED
  CANCELED
}
```

> Примечание: `filterRole` — `String?` (хранит `Role.code`, напр. `"USER"`), т.к. роли — справочник `roles`, а не enum.

- [ ] **Step 5: Добавить обратные связи в модель `User`**

В модель `User`, в блок связей (рядом с `notifications Notification[]`):

```prisma
  broadcastsCreated  Broadcast[] @relation("BroadcastCreatedBy")
  broadcastsReceived Broadcast[] @relation("BroadcastTargetUser")
```

- [ ] **Step 6: Сгенерировать Prisma Client (офлайн)**

Run: `pnpm --filter @avino/api prisma:generate`
Expected: `✔ Generated Prisma Client` без ошибок; типы `Broadcast`, `BroadcastAudience`, `BroadcastStatus`, `NotificationChannel.SMS`, `NotificationType.ADMIN_BROADCAST` доступны в `@prisma/client`.

- [ ] **Step 7: Создать SQL миграции (без применения)**

Локально нет `DATABASE_URL`, поэтому генерируем SQL без применения. Run:

```bash
cd apps/api && DATABASE_URL="postgresql://x:x@localhost:5432/x" pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/broadcast.sql && cat /tmp/broadcast.sql
```

Создать каталог `apps/api/prisma/migrations/<timestamp>_admin_broadcast/` (timestamp формата `YYYYMMDDHHMMSS`, как у соседних миграций) и положить туда `migration.sql` с этим содержимым. Проверить, что SQL содержит: `ALTER TYPE "NotificationChannel" ADD VALUE 'SMS'`, `ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_BROADCAST'`, `CREATE TYPE "BroadcastAudience"`, `CREATE TYPE "BroadcastStatus"`, `CREATE TABLE "broadcasts"`, `ALTER TABLE "notifications" ADD COLUMN "broadcast_id"`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat(broadcast): schema — Broadcast model, SMS channel, ADMIN_BROADCAST type"
```

---

## Task 2: SMS broadcast nudge — локализованный шаблон-«пинок»

**Files:**
- Modify: `apps/api/src/notifications/delivery/notification-templates.ts` (добавить функцию в конец)
- Test: `apps/api/src/notifications/delivery/notification-templates.spec.ts` (создать, если нет — добавить describe)

**Interfaces:**
- Produces: `export function smsBroadcastNudge(lang: Language): string` — фикс. SMS-текст рассылки на языке получателя.

- [ ] **Step 1: Написать падающий тест**

Создать/дополнить `apps/api/src/notifications/delivery/notification-templates.spec.ts`:

```typescript
import { Language } from '@prisma/client';
import { smsBroadcastNudge } from './notification-templates';

describe('smsBroadcastNudge', () => {
  it('returns a non-empty localized string per language', () => {
    expect(smsBroadcastNudge(Language.RU)).toContain('Avino');
    expect(smsBroadcastNudge(Language.UZ)).toContain('Avino');
    expect(smsBroadcastNudge(Language.EN)).toContain('Avino');
  });

  it('falls back to RU for an unknown language value', () => {
    expect(smsBroadcastNudge('XX' as Language)).toBe(smsBroadcastNudge(Language.RU));
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- notification-templates`
Expected: FAIL — `smsBroadcastNudge is not a function` / нет экспорта.

- [ ] **Step 3: Реализовать функцию**

В конец `notification-templates.ts`:

```typescript
/**
 * Фикс. SMS-«пинок» для админ-рассылки (ADMIN_BROADCAST). Eskiz доставляет
 * только предодобренные шаблоны, поэтому SMS несёт не свободный текст рассылки,
 * а короткий локализованный нудж — полный текст пользователь видит в приложении.
 * ВАЖНО: текст должен совпадать с одобренным шаблоном в кабинете Eskiz.
 */
export function smsBroadcastNudge(lang: Language): string {
  const byLang: Record<Language, string> = {
    [Language.RU]: 'Avino: у вас новое сообщение. Откройте приложение: avino.uz',
    [Language.UZ]: 'Avino: sizda yangi xabar bor. Ilovani oching: avino.uz',
    [Language.EN]: 'Avino: you have a new message. Open the app: avino.uz',
  };
  return byLang[lang] ?? byLang[Language.RU];
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/api test -- notification-templates`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/delivery/notification-templates.ts apps/api/src/notifications/delivery/notification-templates.spec.ts
git commit -m "feat(broadcast): localized SMS nudge template for ADMIN_BROADCAST"
```

---

## Task 3: Рендерер — ветка ADMIN_BROADCAST (свободный текст из title/body)

**Files:**
- Modify: `apps/api/src/notifications/delivery/notification-renderer.service.ts`
- Test: `apps/api/src/notifications/delivery/notification-renderer.service.spec.ts` (создать/дополнить)

**Interfaces:**
- Consumes: `renderEmailHtml`, `escapeHtml`, `ctaLabelFor` из `notification-templates`; `RenderedEmail`, `RenderedPush`.
- Produces: `NotificationContext` расширен полями `title?: string | null; body?: string | null`. `renderEmail`/`renderPush` для `type === ADMIN_BROADCAST` строят результат из `title`/`body`, минуя `pickCopy`.

- [ ] **Step 1: Написать падающий тест**

В `notification-renderer.service.spec.ts`:

```typescript
import { Language, NotificationType } from '@prisma/client';
import { NotificationRendererService } from './notification-renderer.service';

function makeRenderer() {
  const prisma = {
    listingTranslation: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const config = { get: jest.fn().mockReturnValue('https://avino.uz') };
  return new NotificationRendererService(prisma as never, config as never);
}

describe('renderEmail (ADMIN_BROADCAST)', () => {
  it('uses notification title/body as subject/body and escapes HTML', async () => {
    const renderer = makeRenderer();
    const result = await renderer.renderEmail(
      {
        id: 'n1',
        type: NotificationType.ADMIN_BROADCAST,
        dataJson: {},
        title: 'Важное <b>объявление</b>',
        body: 'Привет, <script>alert(1)</script>',
      },
      Language.RU,
    );
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Важное <b>объявление</b>'); // subject = plain text
    expect(result!.html).toContain('&lt;script&gt;'); // body экранирован в HTML
    expect(result!.html).not.toContain('<script>');
    expect(result!.text).toContain('Привет');
  });
});

describe('renderPush (ADMIN_BROADCAST)', () => {
  it('uses notification title/body directly', async () => {
    const renderer = makeRenderer();
    const result = await renderer.renderPush(
      { id: 'n1', type: NotificationType.ADMIN_BROADCAST, dataJson: {}, title: 'Заголовок', body: 'Тело' },
      Language.RU,
    );
    expect(result).toEqual(
      expect.objectContaining({ title: 'Заголовок', body: 'Тело' }),
    );
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- notification-renderer`
Expected: FAIL — `result` null (нет шаблона ADMIN_BROADCAST) либо TS-ошибка про `title`/`body`.

- [ ] **Step 3: Расширить `NotificationContext`**

В `notification-renderer.service.ts`, интерфейс `NotificationContext`:

```typescript
export interface NotificationContext {
  id: string;
  type: NotificationType;
  dataJson: Prisma.JsonValue;
  /** Свободный текст для ADMIN_BROADCAST (вшит в строку notification). */
  title?: string | null;
  body?: string | null;
}
```

- [ ] **Step 4: Добавить ветку ADMIN_BROADCAST в `renderEmail`**

В начало метода `renderEmail`, перед `const copy = pickCopy(...)`:

```typescript
    if (n.type === NotificationType.ADMIN_BROADCAST) {
      const publicUrl =
        this.config.get<string>('app.publicUrl') ?? 'https://avino.uz';
      const subject = n.title ?? '';
      const safeBody = escapeHtml(n.body ?? '').replace(/\n/g, '<br>');
      const ctaLabel = ctaLabelFor(n.type, lang); // 'default' → «Открыть Avino»
      const html = renderEmailHtml(safeBody, publicUrl, ctaLabel, lang);
      return { subject, html, text: n.body ?? '' };
    }
```

Добавить `escapeHtml`, `ctaLabelFor` в импорт из `./notification-templates` (если ещё не импортированы; `ctaLabelFor` уже импортирован, `escapeHtml` тоже — проверить и при необходимости дополнить).

- [ ] **Step 5: Добавить ветку ADMIN_BROADCAST в `renderPush`**

В начало метода `renderPush`, перед `const copy = pickCopy(...)`:

```typescript
    if (n.type === NotificationType.ADMIN_BROADCAST) {
      return {
        title: n.title ?? '',
        body: n.body ?? '',
        data: { type: n.type, notificationId: n.id },
      };
    }
```

- [ ] **Step 6: Запустить тесты — убедиться, что проходят**

Run: `pnpm --filter @avino/api test -- notification-renderer`
Expected: PASS (включая существующие тесты рендерера).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/notifications/delivery/notification-renderer.service.ts apps/api/src/notifications/delivery/notification-renderer.service.spec.ts
git commit -m "feat(broadcast): renderer ADMIN_BROADCAST branch (free-text email/push)"
```

---

## Task 4: Диспетчер — SMS-ветка доставки + проброс title/body + routing

**Files:**
- Modify: `apps/api/src/notifications/delivery/notification-dispatcher.service.ts`
- Modify: `apps/api/src/notifications/delivery/notification-routing.ts`
- Modify: `apps/api/src/notifications/notifications.module.ts` (импорт SmsModule)
- Modify: `apps/api/src/sms/sms.module.ts` (убедиться, что `SmsService` в `exports`)
- Test: `apps/api/src/notifications/delivery/notification-dispatcher.service.spec.ts`

**Interfaces:**
- Consumes: `SmsService.isEnabled()`, `SmsService.send(phone, message)`; `smsBroadcastNudge(lang)`; расширенный `NotificationContext`.
- Produces: диспетчер доставляет канал `SMS` (фикс. нудж), пробрасывает `title/body` в рендер для ADMIN_BROADCAST; `notificationRouting[ADMIN_BROADCAST] = []`.

- [ ] **Step 1: Добавить routing-запись для ADMIN_BROADCAST**

В `notification-routing.ts`, в объект `notificationRouting`:

```typescript
  // Админ-рассылка: доставки создаёт BroadcastDispatcher напрямую (по выбранным
  // каналам), а не штатный fan-out — поэтому здесь пусто (иначе будут дубли).
  [NotificationType.ADMIN_BROADCAST]: [],
```

- [ ] **Step 2: Написать падающие тесты SMS-доставки**

В `notification-dispatcher.service.spec.ts` добавить describe (используя фабрики `buildPrisma/buildConfig/buildRenderer/buildFcm/buildEmailService` из файла) + фабрику `buildSms`:

```typescript
function buildSms(enabled = true) {
  return {
    isEnabled: jest.fn().mockResolvedValue(enabled),
    send: jest.fn().mockResolvedValue(undefined),
  };
}

describe('deliver — SMS channel', () => {
  it('sends localized nudge when SMS enabled and user has phone', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        id: 'd1',
        channel: 'SMS',
        status: 'PENDING',
        attempts: 0,
        notification: {
          id: 'n1',
          type: 'ADMIN_BROADCAST',
          dataJson: {},
          title: 'T',
          body: 'B',
          user: { id: 'u1', email: null, phone: '+998901234567', defaultLanguage: 'RU', profile: null },
        },
      },
    ]);
    const sms = buildSms(true);
    const service = new NotificationDispatcherService(
      prisma as never, buildConfig() as never, buildRenderer() as never,
      buildFcm() as never, buildEmailService() as never, sms as never,
    );
    await service.run();
    expect(sms.send).toHaveBeenCalledWith('+998901234567', expect.stringContaining('Avino'));
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1' }, data: expect.objectContaining({ status: 'SENT' }) }),
    );
  });

  it('leaves PENDING (no send) when SMS globally disabled', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.findMany.mockResolvedValue([
      { id: 'd1', channel: 'SMS', status: 'PENDING', attempts: 0,
        notification: { id: 'n1', type: 'ADMIN_BROADCAST', dataJson: {}, title: 'T', body: 'B',
          user: { id: 'u1', email: null, phone: '+998901234567', defaultLanguage: 'RU', profile: null } } },
    ]);
    const sms = buildSms(false);
    const service = new NotificationDispatcherService(
      prisma as never, buildConfig() as never, buildRenderer() as never,
      buildFcm() as never, buildEmailService() as never, sms as never,
    );
    await service.run();
    expect(sms.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
  });

  it('marks FAILED when recipient has no phone', async () => {
    const prisma = buildPrisma();
    prisma.notificationDelivery.findMany.mockResolvedValue([
      { id: 'd1', channel: 'SMS', status: 'PENDING', attempts: 0,
        notification: { id: 'n1', type: 'ADMIN_BROADCAST', dataJson: {}, title: 'T', body: 'B',
          user: { id: 'u1', email: null, phone: null, defaultLanguage: 'RU', profile: null } } },
    ]);
    const sms = buildSms(true);
    const service = new NotificationDispatcherService(
      prisma as never, buildConfig() as never, buildRenderer() as never,
      buildFcm() as never, buildEmailService() as never, sms as never,
    );
    await service.run();
    expect(sms.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });
});
```

- [ ] **Step 3: Запустить тесты — убедиться, что падают**

Run: `pnpm --filter @avino/api test -- notification-dispatcher`
Expected: FAIL — конструктор не принимает 6-й аргумент / SMS не доставляется.

- [ ] **Step 4: Внедрить `SmsService` и расширить тип контекста доставки**

В `notification-dispatcher.service.ts`:

1. Импорт: `import { SmsService } from '../../sms/sms.service';` и `import { smsBroadcastNudge } from './notification-templates';`
2. В конструктор добавить параметр (последним): `private readonly sms: SmsService,`
3. Расширить тип `DeliveryWithContext`:

```typescript
type DeliveryWithContext = {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  attempts: number;
  notification: {
    id: string;
    type: string;
    dataJson: Prisma.JsonValue;
    title: string | null;
    body: string | null;
    user: {
      id: string;
      email: string | null;
      phone: string | null;
      defaultLanguage: Language;
      profile: { preferredLanguage: Language | null } | null;
    };
  };
};
```

- [ ] **Step 5: Расширить select в `deliver()` и вычислить `smsEnabled`**

В `deliver()`, в `findMany(...).include.notification`:

```typescript
        notification: {
          select: {
            id: true,
            type: true,
            dataJson: true,
            title: true,
            body: true,
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                defaultLanguage: true,
                profile: { select: { preferredLanguage: true } },
              },
            },
          },
        },
```

> Заменить `include: { notification: { include: {...} } }` на `select`-форму выше (нужны title/body/phone). Каст `as unknown as DeliveryWithContext[]` сохранить.

Заменить вычисление флагов:

```typescript
    const [emailEnabled, pushEnabled, smsEnabled] = await Promise.all([
      this.isEmailEnabled(),
      this.isPushEnabled(),
      this.sms.isEnabled(),
    ]);
```

И прокинуть `smsEnabled` в `processDelivery(delivery, emailEnabled, pushEnabled, smsEnabled)`.

- [ ] **Step 6: Расширить `processDelivery` — проброс title/body + SMS-ветка**

```typescript
  private async processDelivery(
    delivery: DeliveryWithContext,
    emailEnabled: boolean,
    pushEnabled: boolean,
    smsEnabled: boolean,
  ): Promise<void> {
    const { id: deliveryId, channel, notification } = delivery;
    const { user, id: notifId, type, dataJson, title, body } = notification;
    const lang: Language =
      user.profile?.preferredLanguage ?? user.defaultLanguage ?? Language.RU;

    if (channel === NotificationChannel.EMAIL && !emailEnabled) return;
    if (channel === NotificationChannel.PUSH && !pushEnabled) return;
    if (channel === NotificationChannel.SMS && !smsEnabled) return;

    const notifContext = {
      id: notifId,
      type: type as NotificationType,
      dataJson,
      title,
      body,
    };

    if (channel === NotificationChannel.EMAIL) {
      await this.deliverEmail(deliveryId, notifContext, user, lang);
    } else if (channel === NotificationChannel.PUSH) {
      await this.deliverPush(deliveryId, notifContext, user, lang);
    } else if (channel === NotificationChannel.SMS) {
      await this.deliverSms(deliveryId, user, lang);
    }
  }
```

> `notifContext` теперь несёт `title/body` — рендерер использует их для ADMIN_BROADCAST (Task 3). Обновить сигнатуры `deliverEmail`/`deliverPush` `notifContext`-параметра, добавив `title?: string | null; body?: string | null` (или принять тип `NotificationContext`).

- [ ] **Step 7: Реализовать `deliverSms`**

Добавить метод (рядом с `deliverPush`):

```typescript
  private async deliverSms(
    deliveryId: string,
    user: { phone: string | null },
    lang: Language,
  ): Promise<void> {
    try {
      if (!user.phone) {
        await this.markFailed(deliveryId, 'recipient has no phone');
        return;
      }
      await this.sms.send(user.phone, smsBroadcastNudge(lang));
      await this.markSent(deliveryId);
    } catch (err) {
      await this.markFailed(
        deliveryId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
```

- [ ] **Step 8: Экспортировать SmsService и импортировать SmsModule**

1. В `apps/api/src/sms/sms.module.ts` — убедиться, что `exports: [SmsService]` присутствует (если нет — добавить).
2. В `apps/api/src/notifications/notifications.module.ts` — добавить `SmsModule` в `imports`:

```typescript
import { SmsModule } from '../sms/sms.module';
// ...
  imports: [RolesModule, ConfigModule, EmailModule, SmsModule],
```

- [ ] **Step 9: Запустить тесты — убедиться, что проходят**

Run: `pnpm --filter @avino/api test -- notification-dispatcher`
Expected: PASS (новые SMS-тесты + существующие email/push).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/notifications apps/api/src/sms/sms.module.ts
git commit -m "feat(broadcast): dispatcher SMS delivery branch + ADMIN_BROADCAST content passthrough"
```

---

## Task 5: BroadcastAudienceService — where-построение и превью аудитории

**Files:**
- Create: `apps/api/src/broadcasts/broadcast-audience.service.ts`
- Test: `apps/api/src/broadcasts/broadcast-audience.service.spec.ts`

**Interfaces:**
- Produces:
  - `type AudienceParams = { audienceType: BroadcastAudience; targetUserId?: string | null; language: Language; filterStatus?: UserStatus | null; filterRole?: string | null }`
  - `buildUserWhere(params: AudienceParams): Prisma.UserWhereInput`
  - `previewCounts(params: AudienceParams): Promise<{ total: number; perChannel: { inApp: number; email: number; push: number; sms: number } }>`

- [ ] **Step 1: Написать падающие тесты**

`apps/api/src/broadcasts/broadcast-audience.service.spec.ts`:

```typescript
import { BroadcastAudience, Language, UserStatus } from '@prisma/client';
import { BroadcastAudienceService } from './broadcast-audience.service';

function makePrisma() {
  return { user: { count: jest.fn().mockResolvedValue(0) } };
}

describe('BroadcastAudienceService.buildUserWhere', () => {
  it('SEGMENT: filters by language + default status ACTIVE', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    const where = svc.buildUserWhere({
      audienceType: BroadcastAudience.SEGMENT,
      language: Language.RU,
    });
    expect(where).toEqual({ status: UserStatus.ACTIVE, defaultLanguage: Language.RU });
  });

  it('SEGMENT: applies role filter via roles relation', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    const where = svc.buildUserWhere({
      audienceType: BroadcastAudience.SEGMENT,
      language: Language.UZ,
      filterRole: 'USER',
    });
    expect(where.roles).toEqual({ some: { role: { code: 'USER' } } });
  });

  it('SINGLE: targets a single user id', () => {
    const svc = new BroadcastAudienceService(makePrisma() as never);
    const where = svc.buildUserWhere({
      audienceType: BroadcastAudience.SINGLE,
      language: Language.RU,
      targetUserId: 'u-1',
    });
    expect(where).toEqual({ id: 'u-1' });
  });
});

describe('BroadcastAudienceService.previewCounts', () => {
  it('returns total + per-channel reachable counts', async () => {
    const prisma = makePrisma();
    // total, email, push, sms (в порядке вызовов)
    prisma.user.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(80)  // email
      .mockResolvedValueOnce(20)  // push
      .mockResolvedValueOnce(95); // sms
    const svc = new BroadcastAudienceService(prisma as never);
    const res = await svc.previewCounts({
      audienceType: BroadcastAudience.SEGMENT,
      language: Language.RU,
    });
    expect(res).toEqual({
      total: 100,
      perChannel: { inApp: 100, email: 80, push: 20, sms: 95 },
    });
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- broadcast-audience`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать сервис**

`apps/api/src/broadcasts/broadcast-audience.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import {
  BroadcastAudience,
  Language,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma';

export interface AudienceParams {
  audienceType: BroadcastAudience;
  targetUserId?: string | null;
  language: Language;
  filterStatus?: UserStatus | null;
  filterRole?: string | null;
}

export interface AudiencePreview {
  total: number;
  perChannel: { inApp: number; email: number; push: number; sms: number };
}

/**
 * Резолв аудитории рассылки (ADR-0103). Единственный источник правды
 * «параметры рассылки → Prisma where по users». Достижимость по каналу
 * (email/phone/устройство) применяется поверх базового where.
 */
@Injectable()
export class BroadcastAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Базовый where аудитории (без фильтра достижимости канала). */
  buildUserWhere(params: AudienceParams): Prisma.UserWhereInput {
    if (params.audienceType === BroadcastAudience.SINGLE) {
      return { id: params.targetUserId ?? '__none__' };
    }
    const where: Prisma.UserWhereInput = {
      status: params.filterStatus ?? UserStatus.ACTIVE,
      defaultLanguage: params.language,
    };
    if (params.filterRole) {
      where.roles = { some: { role: { code: params.filterRole } } };
    }
    return where;
  }

  /** Размер аудитории + достижимые по каждому каналу (для превью/подтверждения). */
  async previewCounts(params: AudienceParams): Promise<AudiencePreview> {
    const base = this.buildUserWhere(params);
    const [total, email, push, sms] = await Promise.all([
      this.prisma.user.count({ where: base }),
      this.prisma.user.count({ where: { ...base, email: { not: null } } }),
      this.prisma.user.count({
        where: { ...base, notificationDevices: { some: { isActive: true } } },
      }),
      this.prisma.user.count({ where: { ...base, phone: { not: null } } }),
    ]);
    return { total, perChannel: { inApp: total, email, push, sms } };
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/api test -- broadcast-audience`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/broadcasts/broadcast-audience.service.ts apps/api/src/broadcasts/broadcast-audience.service.spec.ts
git commit -m "feat(broadcast): audience service — where-building + per-channel preview"
```

---

## Task 6: BroadcastDispatcherService — sweep due + материализация

**Files:**
- Create: `apps/api/src/broadcasts/broadcast-dispatcher.service.ts`
- Create: `apps/api/src/broadcasts/broadcasts.constants.ts`
- Test: `apps/api/src/broadcasts/broadcast-dispatcher.service.spec.ts`

**Interfaces:**
- Consumes: `BroadcastAudienceService.buildUserWhere`.
- Produces:
  - `BroadcastDispatcherService.run(): Promise<void>` — забрать SCHEDULED где `scheduledAt <= now`, материализовать.
  - `materialize(broadcastId: string): Promise<number>` — создаёт Notification+Delivery, возвращает `recipientCount`. Идемпотентна.
  - `broadcasts.constants.ts`: `MATERIALIZE_BATCH_SIZE = 500`.

- [ ] **Step 1: Написать падающий тест**

`apps/api/src/broadcasts/broadcast-dispatcher.service.spec.ts`:

```typescript
import { BroadcastAudience, Language, NotificationChannel } from '@prisma/client';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';
import { BroadcastAudienceService } from './broadcast-audience.service';

function makeAudience() {
  return new BroadcastAudienceService({ user: { count: jest.fn() } } as never);
}

describe('BroadcastDispatcherService.materialize', () => {
  it('creates a notification per recipient + deliveries for selected reachable channels', async () => {
    const broadcast = {
      id: 'b1',
      audienceType: BroadcastAudience.SEGMENT,
      targetUserId: null,
      language: Language.RU,
      filterStatus: null,
      filterRole: null,
      channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      title: 'T',
      body: 'B',
      status: 'SENDING',
    };
    const prisma = {
      broadcast: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }), // гард-переход SCHEDULED→SENDING
        findUnique: jest.fn().mockResolvedValue(broadcast),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'u1', email: 'a@b.uz', phone: '+998901112233' }, // email+sms
            { id: 'u2', email: null, phone: null },                // ни email, ни phone
          ])
          .mockResolvedValueOnce([]), // следующий батч пуст
      },
      notification: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', userId: 'u1' },
          { id: 'n2', userId: 'u2' },
        ]),
      },
      notificationDevice: {
        findMany: jest.fn().mockResolvedValue([]), // нет активных устройств
      },
      notificationDelivery: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const svc = new BroadcastDispatcherService(prisma as never, makeAudience());
    const count = await svc.materialize('b1');

    expect(count).toBe(2);
    expect(prisma.notification.createMany).toHaveBeenCalled();
    // Только u1 достижим по email и sms → 2 доставки; u2 — 0.
    const deliveryRows = prisma.notificationDelivery.createMany.mock.calls[0][0].data;
    expect(deliveryRows).toEqual(
      expect.arrayContaining([
        { notificationId: 'n1', channel: NotificationChannel.EMAIL, status: 'PENDING' },
        { notificationId: 'n1', channel: NotificationChannel.SMS, status: 'PENDING' },
      ]),
    );
    expect(deliveryRows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- broadcast-dispatcher`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Создать `broadcasts.constants.ts`**

```typescript
/** Размер батча материализации аудитории рассылки (Notification createMany). */
export const MATERIALIZE_BATCH_SIZE = 500;

/** Сколько SCHEDULED-рассылок обрабатывать за один прогон sweep. */
export const SWEEP_LIMIT = 5;
```

- [ ] **Step 4: Реализовать сервис**

`apps/api/src/broadcasts/broadcast-dispatcher.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import {
  BroadcastStatus,
  NotificationChannel,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { BroadcastAudienceService } from './broadcast-audience.service';
import { MATERIALIZE_BATCH_SIZE, SWEEP_LIMIT } from './broadcasts.constants';

/** Внешние каналы, для которых создаётся строка доставки (IN_APP = сама notification). */
const EXTERNAL_CHANNELS: NotificationChannel[] = [
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH,
  NotificationChannel.SMS,
];

/**
 * BroadcastDispatcherService (ADR-0103) — зеркалит NotificationDispatcher:
 *  run(): забрать SCHEDULED-рассылки, у которых scheduled_at <= now, и материализовать.
 *  materialize(): резолв аудитории батчами → Notification(type=ADMIN_BROADCAST,
 *    broadcastId, title/body вшиты) + NotificationDelivery по выбранным внешним
 *    каналам, куда получатель достижим. Дальше их доставляет существующий
 *    NotificationDispatcher.deliver(). Идемпотентна: переход SCHEDULED→SENDING
 *    через updateMany-гард; повторный прогон по SENT — no-op.
 */
@Injectable()
export class BroadcastDispatcherService {
  private readonly logger = new Logger(BroadcastDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: BroadcastAudienceService,
  ) {}

  async run(): Promise<void> {
    const due = await this.prisma.broadcast.findMany({
      where: { status: BroadcastStatus.SCHEDULED, scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: SWEEP_LIMIT,
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        await this.materialize(id);
      } catch (err) {
        this.logger.error(`Broadcast ${id} materialize failed: ${String(err)}`);
        await this.prisma.broadcast.update({
          where: { id },
          data: { status: BroadcastStatus.FAILED },
        });
      }
    }
  }

  /** Материализовать рассылку. Возвращает число получателей (recipientCount). */
  async materialize(broadcastId: string): Promise<number> {
    // Гард-переход: только если ещё SCHEDULED. Иначе кто-то уже взял — выходим.
    const claimed = await this.prisma.broadcast.updateMany({
      where: { id: broadcastId, status: BroadcastStatus.SCHEDULED },
      data: { status: BroadcastStatus.SENDING },
    });
    if (claimed.count === 0) return 0;

    const b = await this.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!b) return 0;

    const where = this.audience.buildUserWhere({
      audienceType: b.audienceType,
      targetUserId: b.targetUserId,
      language: b.language,
      filterStatus: b.filterStatus,
      filterRole: b.filterRole,
    });
    const externalSelected = b.channels.filter((c) =>
      EXTERNAL_CHANNELS.includes(c),
    );

    let total = 0;
    let cursorId: string | undefined;

    // Keyset-батчи по users.id.
    for (;;) {
      const users = await this.prisma.user.findMany({
        where,
        select: { id: true, email: true, phone: true },
        orderBy: { id: 'asc' },
        take: MATERIALIZE_BATCH_SIZE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      if (users.length === 0) break;
      cursorId = users[users.length - 1].id;

      // 1) Notification на каждого получателя (= in-app колокольчик).
      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: NotificationType.ADMIN_BROADCAST,
          channel: NotificationChannel.IN_APP,
          broadcastId,
          title: b.title,
          body: b.body,
          dataJson: { broadcast_id: broadcastId } as Prisma.InputJsonValue,
        })),
      });
      total += users.length;

      // 2) Подтянуть id созданных notification (по broadcastId + userId батча).
      const batchIds = users.map((u) => u.id);
      const notifs = await this.prisma.notification.findMany({
        where: { broadcastId, userId: { in: batchIds } },
        select: { id: true, userId: true },
      });

      // 3) Достижимость push: userId с активными устройствами в батче.
      const deviceUserIds = externalSelected.includes(NotificationChannel.PUSH)
        ? new Set(
            (
              await this.prisma.notificationDevice.findMany({
                where: { isActive: true, userId: { in: batchIds } },
                select: { userId: true },
                distinct: ['userId'],
              })
            ).map((d) => d.userId),
          )
        : new Set<string>();

      // 4) Доставки по достижимым каналам.
      const byUser = new Map(users.map((u) => [u.id, u]));
      const deliveryRows: Prisma.NotificationDeliveryCreateManyInput[] = [];
      for (const n of notifs) {
        const u = byUser.get(n.userId);
        if (!u) continue;
        for (const ch of externalSelected) {
          const reachable =
            (ch === NotificationChannel.EMAIL && u.email != null) ||
            (ch === NotificationChannel.SMS && u.phone != null) ||
            (ch === NotificationChannel.PUSH && deviceUserIds.has(u.id));
          if (reachable) {
            deliveryRows.push({
              notificationId: n.id,
              channel: ch,
              status: 'PENDING',
            });
          }
        }
      }
      if (deliveryRows.length > 0) {
        await this.prisma.notificationDelivery.createMany({ data: deliveryRows });
      }

      if (users.length < MATERIALIZE_BATCH_SIZE) break;
    }

    await this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: BroadcastStatus.SENT,
        recipientCount: total,
        sentAt: new Date(),
      },
    });
    return total;
  }
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/api test -- broadcast-dispatcher`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/broadcasts/broadcast-dispatcher.service.ts apps/api/src/broadcasts/broadcasts.constants.ts apps/api/src/broadcasts/broadcast-dispatcher.service.spec.ts
git commit -m "feat(broadcast): dispatcher service — sweep due + batched materialization"
```

---

## Task 7: BullMQ — очередь и воркер sweep-рассылок

**Files:**
- Modify: `apps/api/src/queues/queue.constants.ts` (имена очереди/джобы)
- Create: `apps/api/src/broadcasts/broadcast.queue.ts`
- Create: `apps/api/src/broadcasts/broadcast.worker.ts`
- Modify: `apps/api/src/config/configuration.ts` (config-блок `broadcasts`)
- Modify: `apps/api/src/config/index.ts` (или где собирается `load`-массив `ConfigModule`) — зарегистрировать `broadcastsConfig`

**Interfaces:**
- Consumes: `buildBullConnection`, `BroadcastDispatcherService.run()`.
- Produces: repeatable job `dispatch_broadcasts` (cron `broadcasts.dispatchCron`).

- [ ] **Step 1: Добавить имена очереди/джобы**

В `apps/api/src/queues/queue.constants.ts` (в конец):

```typescript
export const BROADCAST_DISPATCH_QUEUE_NAME = 'broadcast_dispatch_queue';
export const DISPATCH_BROADCASTS_JOB = 'dispatch_broadcasts';
export type DispatchBroadcastsJobData = Record<string, never>;
```

- [ ] **Step 2: Добавить config-блок `broadcasts`**

В `apps/api/src/config/configuration.ts`:

```typescript
export const broadcastsConfig = registerAs('broadcasts', () => ({
  // Расписание sweep'а запланированных рассылок (по умолчанию каждую минуту).
  dispatchCron: process.env.BROADCAST_DISPATCH_CRON ?? '*/1 * * * *',
}));
```

И зарегистрировать `broadcastsConfig` в массиве `load` у `ConfigModule.forRoot(...)` (там же, где `notificationsConfig`/`smsConfig`).

- [ ] **Step 3: Создать `broadcast.queue.ts` (по образцу `notification-dispatch.queue.ts`)**

```typescript
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import {
  BROADCAST_DISPATCH_QUEUE_NAME,
  DISPATCH_BROADCASTS_JOB,
} from '../queues/queue.constants';

const BROADCAST_SCHEDULER_ID = 'dispatch-broadcasts';

@Injectable()
export class BroadcastQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastQueue.name);
  private readonly queue: Queue;
  private readonly cron: string;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.cron =
      configService.get<string>('broadcasts.dispatchCron') ?? '*/1 * * * *';
    this.queue = new Queue(BROADCAST_DISPATCH_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      BROADCAST_SCHEDULER_ID,
      { pattern: this.cron },
      {
        name: DISPATCH_BROADCASTS_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(`Scheduled ${DISPATCH_BROADCASTS_JOB} (cron="${this.cron}")`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
```

- [ ] **Step 4: Создать `broadcast.worker.ts` (по образцу `notification-dispatch.worker.ts`)**

```typescript
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { BROADCAST_DISPATCH_QUEUE_NAME } from '../queues/queue.constants';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';

@Injectable()
export class BroadcastWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly dispatcher: BroadcastDispatcherService,
  ) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.worker = new Worker(
      BROADCAST_DISPATCH_QUEUE_NAME,
      () => this.dispatcher.run(),
      { connection: buildBullConnection(url), concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(`Broadcast dispatch job ${job?.id} failed: ${err.message}`);
    });
    this.logger.log('Broadcast dispatch worker started (concurrency=1)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
```

- [ ] **Step 5: Сборка проверяет типы (тестов на транспорт нет — логика в Task 6)**

Run: `pnpm --filter @avino/api exec tsc --noEmit`
Expected: без ошибок (после Task 9 модуль зарегистрируется; сейчас проверяем типы файлов).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/broadcasts/broadcast.queue.ts apps/api/src/broadcasts/broadcast.worker.ts apps/api/src/queues/queue.constants.ts apps/api/src/config
git commit -m "feat(broadcast): BullMQ queue + worker for scheduled broadcast sweep"
```

---

## Task 8: DTO + BroadcastsService (create/list/detail/cancel)

**Files:**
- Create: `apps/api/src/broadcasts/dto/create-broadcast.dto.ts`
- Create: `apps/api/src/broadcasts/dto/preview-audience.dto.ts`
- Create: `apps/api/src/broadcasts/dto/list-broadcasts.query.dto.ts`
- Create: `apps/api/src/broadcasts/broadcasts.service.ts`
- Test: `apps/api/src/broadcasts/broadcasts.service.spec.ts`

**Interfaces:**
- Consumes: `BroadcastAudienceService.previewCounts`.
- Produces:
  - `BroadcastsService.create(adminId, dto): Promise<BroadcastView>`
  - `BroadcastsService.preview(dto): Promise<AudiencePreview>`
  - `BroadcastsService.list(query): Promise<{ data: BroadcastListItem[]; meta: { page; limit; total } }>`
  - `BroadcastsService.getDetail(id): Promise<BroadcastDetail>`
  - `BroadcastsService.cancel(adminId, id): Promise<BroadcastView>`

- [ ] **Step 1: Создать DTO**

`dto/create-broadcast.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  BroadcastAudience,
  Language,
  NotificationChannel,
  UserStatus,
} from '@prisma/client';

export class CreateBroadcastDto {
  @IsEnum(BroadcastAudience)
  audienceType!: BroadcastAudience;

  @ValidateIf((o) => o.audienceType === BroadcastAudience.SINGLE)
  @IsUUID()
  targetUserId?: string;

  @IsEnum(Language)
  language!: Language;

  @IsOptional()
  @IsEnum(UserStatus)
  filterStatus?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  filterRole?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(NotificationChannel, { each: true })
  channels!: NotificationChannel[];

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsIn(['now', 'scheduled'])
  mode!: 'now' | 'scheduled';

  @ValidateIf((o) => o.mode === 'scheduled')
  @IsISO8601()
  scheduledAt?: string;
}
```

`dto/preview-audience.dto.ts`:

```typescript
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { BroadcastAudience, Language, UserStatus } from '@prisma/client';

export class PreviewAudienceDto {
  @IsEnum(BroadcastAudience)
  audienceType!: BroadcastAudience;

  @ValidateIf((o) => o.audienceType === BroadcastAudience.SINGLE)
  @IsUUID()
  targetUserId?: string;

  @IsEnum(Language)
  language!: Language;

  @IsOptional()
  @IsEnum(UserStatus)
  filterStatus?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  filterRole?: string;
}
```

`dto/list-broadcasts.query.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BroadcastStatus } from '@prisma/client';

export class ListBroadcastsQueryDto {
  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;

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

- [ ] **Step 2: Написать падающие тесты сервиса**

`broadcasts.service.spec.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import {
  BroadcastAudience,
  BroadcastStatus,
  Language,
  NotificationChannel,
} from '@prisma/client';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastAudienceService } from './broadcast-audience.service';

function makeAudience() {
  return {
    previewCounts: jest.fn().mockResolvedValue({
      total: 10,
      perChannel: { inApp: 10, email: 8, push: 2, sms: 9 },
    }),
  } as unknown as BroadcastAudienceService;
}

function baseDto() {
  return {
    audienceType: BroadcastAudience.SEGMENT,
    language: Language.RU,
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    title: 'T',
    body: 'B',
    mode: 'now' as const,
  };
}

describe('BroadcastsService.create', () => {
  it('creates a SCHEDULED broadcast with scheduledAt=now for mode "now" + audit', async () => {
    const prisma = {
      broadcast: { create: jest.fn().mockResolvedValue({ id: 'b1', status: 'SCHEDULED' }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const svc = new BroadcastsService(prisma as never, makeAudience());
    const res = await svc.create('admin1', baseDto());
    expect(prisma.broadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: 'admin1',
          status: BroadcastStatus.SCHEDULED,
          scheduledAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: 'admin1', action: 'BROADCAST_CREATE' }),
      }),
    );
    expect(res).toEqual(expect.objectContaining({ id: 'b1' }));
  });

  it('rejects scheduled mode with a past scheduledAt', async () => {
    const prisma = { broadcast: { create: jest.fn() }, auditLog: { create: jest.fn() } };
    const svc = new BroadcastsService(prisma as never, makeAudience());
    await expect(
      svc.create('admin1', {
        ...baseDto(),
        mode: 'scheduled',
        scheduledAt: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BroadcastsService.cancel', () => {
  it('cancels a SCHEDULED broadcast', async () => {
    const prisma = {
      broadcast: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'b1', status: 'CANCELED' }),
      },
      auditLog: { create: jest.fn() },
    };
    const svc = new BroadcastsService(prisma as never, makeAudience());
    const res = await svc.cancel('admin1', 'b1');
    expect(prisma.broadcast.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b1', status: BroadcastStatus.SCHEDULED },
        data: { status: BroadcastStatus.CANCELED },
      }),
    );
    expect(res.status).toBe('CANCELED');
  });
});
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `pnpm --filter @avino/api test -- broadcasts.service`
Expected: FAIL — модуль не найден.

- [ ] **Step 4: Реализовать сервис**

`apps/api/src/broadcasts/broadcasts.service.ts`:

```typescript
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BroadcastStatus,
  NotificationChannel,
  NotificationStatus,
  Prisma,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import {
  AudiencePreview,
  BroadcastAudienceService,
} from './broadcast-audience.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts.query.dto';
import { PreviewAudienceDto } from './dto/preview-audience.dto';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface BroadcastView {
  id: string;
  status: BroadcastStatus;
  audience_type: string;
  language: string;
  channels: NotificationChannel[];
  title: string;
  recipient_count: number;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
}

@Injectable()
export class BroadcastsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: BroadcastAudienceService,
  ) {}

  async preview(dto: PreviewAudienceDto): Promise<AudiencePreview> {
    return this.audience.previewCounts(dto);
  }

  async create(adminId: string, dto: CreateBroadcastDto): Promise<BroadcastView> {
    const scheduledAt =
      dto.mode === 'now' ? new Date() : new Date(dto.scheduledAt as string);
    if (dto.mode === 'scheduled' && scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'scheduledAt must be in the future',
      });
    }

    const row = await this.prisma.broadcast.create({
      data: {
        createdById: adminId,
        audienceType: dto.audienceType,
        targetUserId: dto.targetUserId ?? null,
        language: dto.language,
        filterStatus: dto.filterStatus ?? null,
        filterRole: dto.filterRole ?? null,
        channels: dto.channels,
        title: dto.title,
        body: dto.body,
        status: BroadcastStatus.SCHEDULED,
        scheduledAt,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'BROADCAST_CREATE',
        entityType: 'broadcast',
        entityId: row.id,
        metadata: {
          audienceType: dto.audienceType,
          language: dto.language,
          channels: dto.channels,
          mode: dto.mode,
        },
      },
    });

    return this.toView(row);
  }

  async list(query: ListBroadcastsQueryDto): Promise<{
    data: BroadcastView[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.BroadcastWhereInput = {};
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.broadcast.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.broadcast.count({ where }),
    ]);

    return { data: rows.map((r) => this.toView(r)), meta: { page, limit, total } };
  }

  async getDetail(id: string): Promise<
    BroadcastView & {
      body: string;
      filter_status: string | null;
      filter_role: string | null;
      target_user_id: string | null;
      delivery_stats: Record<string, Record<string, number>>;
    }
  > {
    const row = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Broadcast not found',
      });
    }

    // Разбивка доставок по каналам/статусам: deliveries ← notifications(broadcastId).
    const grouped = await this.prisma.notificationDelivery.groupBy({
      by: ['channel', 'status'],
      where: { notification: { broadcastId: id } },
      _count: { _all: true },
    });
    const stats: Record<string, Record<string, number>> = {};
    for (const g of grouped) {
      stats[g.channel] ??= {};
      stats[g.channel][g.status] = g._count._all;
    }
    // IN_APP: считаем по самим notification (read/unread).
    const [inAppTotal, inAppRead] = await Promise.all([
      this.prisma.notification.count({ where: { broadcastId: id } }),
      this.prisma.notification.count({
        where: { broadcastId: id, status: NotificationStatus.READ },
      }),
    ]);
    stats[NotificationChannel.IN_APP] = { total: inAppTotal, read: inAppRead };

    return {
      ...this.toView(row),
      body: row.body,
      filter_status: row.filterStatus,
      filter_role: row.filterRole,
      target_user_id: row.targetUserId,
      delivery_stats: stats,
    };
  }

  async cancel(adminId: string, id: string): Promise<BroadcastView> {
    const { count } = await this.prisma.broadcast.updateMany({
      where: { id, status: BroadcastStatus.SCHEDULED },
      data: { status: BroadcastStatus.CANCELED },
    });
    if (count === 0) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Only a SCHEDULED broadcast can be canceled',
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'BROADCAST_CANCEL',
        entityType: 'broadcast',
        entityId: id,
        metadata: {},
      },
    });
    const row = await this.prisma.broadcast.findUnique({ where: { id } });
    return this.toView(row!);
  }

  private toView(row: {
    id: string;
    status: BroadcastStatus;
    audienceType: string;
    language: string;
    channels: NotificationChannel[];
    title: string;
    recipientCount: number;
    scheduledAt: Date | null;
    sentAt: Date | null;
    createdAt: Date;
  }): BroadcastView {
    return {
      id: row.id,
      status: row.status,
      audience_type: row.audienceType,
      language: row.language,
      channels: row.channels,
      title: row.title,
      recipient_count: row.recipientCount,
      scheduled_at: row.scheduledAt ? row.scheduledAt.toISOString() : null,
      sent_at: row.sentAt ? row.sentAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 5: Запустить тест — убедиться, что проходит**

Run: `pnpm --filter @avino/api test -- broadcasts.service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/broadcasts/dto apps/api/src/broadcasts/broadcasts.service.ts apps/api/src/broadcasts/broadcasts.service.spec.ts
git commit -m "feat(broadcast): DTOs + BroadcastsService (create/list/detail/cancel + audit)"
```

---

## Task 9: AdminBroadcastsController + BroadcastsModule + регистрация в AppModule

**Files:**
- Create: `apps/api/src/broadcasts/admin-broadcasts.controller.ts`
- Create: `apps/api/src/broadcasts/broadcasts.module.ts`
- Create: `apps/api/src/broadcasts/index.ts`
- Modify: `apps/api/src/app.module.ts` (импорт `BroadcastsModule`)

**Interfaces:**
- Consumes: `BroadcastsService`, все DTO, `JwtAuthGuard`/`RolesGuard`/`@Roles`/`@CurrentUser`.
- Produces: роуты `/api/v1/admin/broadcasts*`; `BroadcastsModule` поднимает воркер/очередь.

- [ ] **Step 1: Создать контроллер**

`apps/api/src/broadcasts/admin-broadcasts.controller.ts`:

```typescript
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
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts.query.dto';
import { PreviewAudienceDto } from './dto/preview-audience.dto';

/**
 * Ручная админ-рассылка уведомлений (ADR-0103, ADMIN-only). Создание/история/
 * деталь/отмена; превью аудитории без создания. MODERATOR доступа не имеет.
 */
@Controller({ path: 'admin/broadcasts', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminBroadcastsController {
  constructor(private readonly service: BroadcastsService) {}

  @Post('preview')
  preview(@Body() dto: PreviewAudienceDto) {
    return this.service.preview(dto);
  }

  @Post()
  create(@CurrentUser('id') adminId: string, @Body() dto: CreateBroadcastDto) {
    return this.service.create(adminId, dto);
  }

  @Get()
  list(@Query() query: ListBroadcastsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser('id') adminId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.cancel(adminId, id);
  }
}
```

- [ ] **Step 2: Создать модуль**

`apps/api/src/broadcasts/broadcasts.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RolesModule } from '../roles';
import { AdminBroadcastsController } from './admin-broadcasts.controller';
import { BroadcastAudienceService } from './broadcast-audience.service';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';
import { BroadcastQueue } from './broadcast.queue';
import { BroadcastWorker } from './broadcast.worker';
import { BroadcastsService } from './broadcasts.service';

/**
 * BroadcastsModule (ADR-0103) — ручная админ-рассылка. `RolesModule` даёт
 * Bearer-аутентификацию (JwtAuthGuard/RolesGuard) для контроллера. Воркер
 * (sweep) + очередь поднимаются с API-процессом. Prisma — глобальный модуль.
 */
@Module({
  imports: [RolesModule, ConfigModule],
  controllers: [AdminBroadcastsController],
  providers: [
    BroadcastsService,
    BroadcastAudienceService,
    BroadcastDispatcherService,
    BroadcastQueue,
    BroadcastWorker,
  ],
})
export class BroadcastsModule {}
```

`apps/api/src/broadcasts/index.ts`:

```typescript
export { BroadcastsModule } from './broadcasts.module';
```

- [ ] **Step 3: Зарегистрировать в AppModule**

В `apps/api/src/app.module.ts`: импорт `import { BroadcastsModule } from './broadcasts';` и добавить `BroadcastsModule` в массив `imports` (рядом с `NotificationsModule`).

- [ ] **Step 4: Сборка + полный прогон тестов**

Run: `pnpm --filter @avino/api exec tsc --noEmit && pnpm --filter @avino/api test`
Expected: компиляция без ошибок; все тесты PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/broadcasts/admin-broadcasts.controller.ts apps/api/src/broadcasts/broadcasts.module.ts apps/api/src/broadcasts/index.ts apps/api/src/app.module.ts
git commit -m "feat(broadcast): admin controller + module wiring (/admin/broadcasts)"
```

---

## Task 10: Финал — OpenAPI regen, ADR, DONE.md, проверки

**Files:**
- Modify (генерируется): `apps/api/openapi.internal.json`
- Create: `docs/adr/ADR-0103-admin-broadcast.md` (номер уточнить — следующий свободный)
- Modify: `docs/DONE.md`

**Interfaces:** —

- [ ] **Step 1: Регенерировать OpenAPI**

Run:
```bash
cd apps/api && DATABASE_URL="postgresql://x:x@localhost:5432/x" REDIS_URL="redis://localhost:6379" \
  JWT_ACCESS_SECRET="x" JWT_REFRESH_SECRET="x" pnpm --filter @avino/api openapi:export
```
Expected: `openapi.internal.json` обновлён, в нём появились пути `/api/v1/admin/broadcasts*`. `git diff --stat` показывает изменение только `openapi.internal.json` (public-док не должен содержать admin-роуты).

- [ ] **Step 2: Написать ADR**

Создать `docs/adr/ADR-0103-admin-broadcast.md` (проверить следующий свободный номер ADR в `docs/adr/`): контекст (нет ручной рассылки), решение (слой `Broadcast` поверх диспетчера #221, SMS как канал, один язык на рассылку, IN_APP = строка notification), последствия (миграция enum/таблицы; SMS-нудж зависит от одобренного шаблона Eskiz; throughput дренится диспетчером).

- [ ] **Step 3: Обновить DONE.md**

Добавить запись о фиче (в стиле существующих записей `docs/DONE.md`): что сделано (backend-слой рассылок), номер PR-1, ссылка на spec/ADR, прод-TODO (SMTP/Firebase/Eskiz-креды + одобренный SMS-шаблон + `migrate deploy` на staging/CI).

- [ ] **Step 4: Финальные проверки**

Run:
```bash
pnpm --filter @avino/api lint
pnpm --filter @avino/api test
pnpm --filter @avino/api exec tsc --noEmit
```
Expected: lint чисто, все тесты PASS, типы без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/api/openapi.internal.json docs/adr/ADR-0103-admin-broadcast.md docs/DONE.md
git commit -m "docs(broadcast): ADR-0103 + DONE.md + regenerated internal OpenAPI"
```

---

## Прод-TODO (вне кода, после мёржа)

- `migrate deploy` миграции `admin_broadcast` на staging/CID (локально не применялась).
- Реальные креды: SMTP (Yandex), Firebase (push), Eskiz (SMS) — как и для #221.
- Одобрить в кабинете Eskiz шаблон, совпадающий с `smsBroadcastNudge` (иначе SMS-доставка не пройдёт модерацию провайдера).
- Live-verify: создать тестовую рассылку (SINGLE на свой аккаунт), проверить in-app/email/push/SMS.
- Клиент (`apps/client`): иконка/лейбл для типа `ADMIN_BROADCAST` в колокольчике (текст уже показывается из server title/body — не блокер).

---

## Следующий план

**План B — web (`apps/web`, PR-2):** экраны `/admin/broadcasts` (история) + `/admin/broadcasts/new` (форма с превью аудитории и модалкой подтверждения) + `/admin/broadcasts/[id]` (деталь), RTK-слайс `adminBroadcastsApi.ts`, пункт навигации «Уведомления» в `Sidebar.tsx`. Пишется после мёржа PR-1 (нужен готовый API-контракт из `openapi.internal.json`).
