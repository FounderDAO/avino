# Listing Wizard Variant B + R2 Orphan Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Убрать ручной ввод имени/телефона из визарда размещения объявления (контакт берётся из профиля), перенести блок «заявки на тур» в шаг «Описание», убрать демо-фото; добавить фоновый воркер чистки осиротевших фото в R2.

**Architecture:** Чисто-клиентские правки в `apps/client` (визард + загрузчик + i18n; контакт уже публикуется бэкендом из профиля, так что тело POST не меняется). На бэкенде — новый config-gated BullMQ-воркер (по образцу `promotion`/`saved-search`), который сметает R2-объекты под префиксом `listings/`, не имеющие живой строки в `listing_media`.

**Tech Stack:** Next.js (next-intl, RTK Query) + Vitest/RTL на клиенте; NestJS + BullMQ + Prisma + AWS SDK v3 (`@aws-sdk/client-s3`) + Jest на бэкенде.

## Global Constraints

- **Границы папок:** правки клиента — только в `apps/client`; бэкенда — только в `apps/api`. Один таск не пересекает обе папки.
- **Git:** main защищён. Ветка фичи: `feat/listing-wizard-variant-b` (уже создана, на ней лежит spec-коммит). Никаких `--admin`-мержей; мержит пользователь. Субагенты git НЕ трогают — все коммиты делает контроллер.
- **i18n:** паритет `ru`/`uz`/`en` — любой ключ удаляется/добавляется во всех трёх файлах. Никаких хардкод-строк в UI.
- **Никаких дефолтов для секретов**; финансы — `Numeric`; UTC. (К этой задаче не относится напрямую, но действует.)
- **Секрет-сейф воркер:** удаление R2-объектов — деструктивно, поэтому воркер **config-gated** (`MEDIA_CLEANUP_ENABLED`, по умолчанию выключен) и удаляет только объекты **старше grace-окна**, у которых нет живой строки в `listing_media` (ключ резолвится так же, как в delete-пути: `storageKey ?? extractKey(url)`).
- **RTK** для всех bash-команд.

---

## Part A — Бэкенд: чистка осиротевших фото в R2 (`apps/api`)

### Task 1: `UploadsService.listKeys` — пагинированный листинг объектов

**Files:**
- Modify: `apps/api/src/uploads/uploads.service.ts`
- Test: `apps/api/src/uploads/uploads.service.spec.ts`

**Interfaces:**
- Consumes: существующий приватный `getClient()` и `bucket()`.
- Produces: `listKeys(prefix: string): Promise<Array<{ key: string; lastModified: Date }>>` — перебирает все страницы `ListObjectsV2` под `prefix`.

- [ ] **Step 1: Расширить мок AWS SDK в spec новой командой**

В `apps/api/src/uploads/uploads.service.spec.ts` в `jest.mock('@aws-sdk/client-s3', ...)` добавить `ListObjectsV2Command` рядом с существующими командами:

```ts
  ListObjectsV2Command: jest.fn().mockImplementation((input) => ({
    __type: 'list',
    input,
  })),
```

- [ ] **Step 2: Написать падающий тест `listKeys`**

Добавить в `describe('UploadsService', ...)`:

```ts
  it('listKeys возвращает ключи со всех страниц ListObjectsV2', async () => {
    const service = makeService();
    send
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'listings/a/media/1.jpg', LastModified: new Date('2026-01-01T00:00:00Z') },
        ],
        IsTruncated: true,
        NextContinuationToken: 'tok',
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'listings/b/media/2.jpg', LastModified: new Date('2026-02-01T00:00:00Z') },
        ],
        IsTruncated: false,
      });

    const keys = await service.listKeys('listings/');

    expect(keys).toEqual([
      { key: 'listings/a/media/1.jpg', lastModified: new Date('2026-01-01T00:00:00Z') },
      { key: 'listings/b/media/2.jpg', lastModified: new Date('2026-02-01T00:00:00Z') },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 3: Запустить тест — убедиться, что падает**

Run: `cd apps/api && rtk pnpm jest src/uploads/uploads.service.spec.ts -t listKeys`
Expected: FAIL (`service.listKeys is not a function`).

- [ ] **Step 4: Реализовать `listKeys`**

В `apps/api/src/uploads/uploads.service.ts` добавить `ListObjectsV2Command` в импорт из `@aws-sdk/client-s3`:

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
```

И публичный метод (рядом с `delete`):

```ts
  /**
   * Перечислить все объекты под префиксом (пагинация ListObjectsV2). Для
   * media-cleanup воркера (чистка осиротевших объектов). Возвращает ключ и время
   * последней модификации — последнее нужно для grace-окна.
   */
  async listKeys(
    prefix: string,
  ): Promise<Array<{ key: string; lastModified: Date }>> {
    const client = this.getClient();
    const out: Array<{ key: string; lastModified: Date }> = [];
    let token: string | undefined;
    do {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket(),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) {
          out.push({ key: obj.Key, lastModified: obj.LastModified ?? new Date(0) });
        }
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }
```

- [ ] **Step 5: Запустить тест — зелёный**

Run: `cd apps/api && rtk pnpm jest src/uploads/uploads.service.spec.ts`
Expected: PASS (все тесты файла).

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/uploads/uploads.service.ts apps/api/src/uploads/uploads.service.spec.ts
git commit -m "feat(uploads): listKeys for paginated R2 object enumeration"
```

---

### Task 2: `MediaCleanupService` — бизнес-логика sweep'а + config namespace

**Files:**
- Create: `apps/api/src/media-cleanup/media-cleanup.service.ts`
- Create: `apps/api/src/media-cleanup/media-cleanup.service.spec.ts`
- Modify: `apps/api/src/config/configuration.ts`

**Interfaces:**
- Consumes: `UploadsService.listKeys`, `UploadsService.delete`, `UploadsService.extractKey`, `PrismaService.listingMedia.findMany`, `ConfigService`.
- Produces: `MediaCleanupService.run(): Promise<number>` — число удалённых orphan-объектов.

- [ ] **Step 1: Добавить config namespace `mediaCleanup`**

В `apps/api/src/config/configuration.ts` добавить (рядом с `promotionConfig`):

```ts
// Фоновая чистка осиротевших фото в R2 (ADR-XXXX). Деструктивно → по умолчанию
// ВЫКЛЮЧЕНО (явный MEDIA_CLEANUP_ENABLED=true в deploy env включает). cron —
// расписание (по умолчанию ежедневно 04:00); graceHours — не трогать объекты
// моложе N часов (защита от гонки с только что загруженным фото, чья DB-строка
// могла ещё коммититься); batchSize — потолок объектов на запуск.
export const mediaCleanupConfig = registerAs('mediaCleanup', () => ({
  enabled: process.env.MEDIA_CLEANUP_ENABLED === 'true',
  cron: process.env.MEDIA_CLEANUP_CRON ?? '0 4 * * *',
  graceHours: parseInt(process.env.MEDIA_CLEANUP_GRACE_HOURS ?? '24', 10),
  batchSize: parseInt(process.env.MEDIA_CLEANUP_BATCH_SIZE ?? '500', 10),
}));
```

И зарегистрировать в массиве `configurations` (добавить `mediaCleanupConfig,` в конец списка).

- [ ] **Step 2: Написать падающие тесты сервиса**

Создать `apps/api/src/media-cleanup/media-cleanup.service.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';
import { MediaCleanupService } from './media-cleanup.service';

/**
 * Юнит-тесты MediaCleanupService. UploadsService и Prisma мокаются. Проверяют:
 * удаление осиротевшего объекта; сохранение объекта с живой listing_media-строкой
 * (по storageKey И по legacy extractKey(url)); сохранение свежего объекта внутри
 * grace-окна; фильтрацию не-media ключей.
 */
describe('MediaCleanupService', () => {
  const HOUR = 3600_000;
  const old = () => new Date(Date.now() - 72 * HOUR); // старше grace (24ч)
  const fresh = () => new Date(Date.now() - 1 * HOUR); // внутри grace

  let uploads: {
    listKeys: jest.Mock;
    delete: jest.Mock;
    extractKey: jest.Mock;
  };
  let prisma: any;

  const config = (): ConfigService =>
    ({
      get: (key: string) =>
        key === 'mediaCleanup.graceHours'
          ? 24
          : key === 'mediaCleanup.batchSize'
            ? 500
            : undefined,
    }) as unknown as ConfigService;

  const make = () =>
    new MediaCleanupService(uploads as any, prisma, config());

  beforeEach(() => {
    uploads = {
      listKeys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      // legacy extractKey: из url достаём path после домена/бакета.
      extractKey: jest.fn((url: string) => new URL(url).pathname.replace(/^\/+/, '')),
    };
    prisma = {
      listingMedia: { findMany: jest.fn().mockResolvedValue([]) },
    };
  });

  it('удаляет осиротевший объект старше grace-окна', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/orphan.jpg', lastModified: old() },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).toHaveBeenCalledWith('listings/a/media/orphan.jpg');
    expect(deleted).toBe(1);
  });

  it('НЕ трогает объект с живой строкой (storageKey)', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/live.jpg', lastModified: old() },
    ]);
    prisma.listingMedia.findMany.mockResolvedValue([
      { storageKey: 'listings/a/media/live.jpg', url: 'ignored' },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('НЕ трогает legacy-объект, чей ключ резолвится из url (storageKey=null)', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/legacy.jpg', lastModified: old() },
    ]);
    prisma.listingMedia.findMany.mockResolvedValue([
      { storageKey: null, url: 'https://cdn.example/listings/a/media/legacy.jpg' },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('НЕ трогает свежий объект внутри grace-окна', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/media/justuploaded.jpg', lastModified: fresh() },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('пропускает не-media ключи под listings/', async () => {
    uploads.listKeys.mockResolvedValue([
      { key: 'listings/a/other/doc.pdf', lastModified: old() },
    ]);
    const deleted = await make().run();
    expect(uploads.delete).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `cd apps/api && rtk pnpm jest src/media-cleanup/media-cleanup.service.spec.ts`
Expected: FAIL (`Cannot find module './media-cleanup.service'`).

- [ ] **Step 4: Реализовать сервис**

Создать `apps/api/src/media-cleanup/media-cleanup.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';

/** Дефолты sweep'а, если конфиг не задан. */
const DEFAULT_GRACE_HOURS = 24;
const DEFAULT_BATCH_SIZE = 500;

/**
 * MediaCleanupService — фоновый sweep осиротевших фото в R2 (ADR-XXXX).
 *
 * Запускается периодической джобой `cleanup_orphan_media` (MediaCleanupWorker →
 * `media_cleanup_queue`). Перечисляет объекты под префиксом `listings/`, берёт
 * только ключи медиа (`/media/`) старше grace-окна (свежие не трогаем — их
 * DB-строка могла ещё коммититься в момент скана), и удаляет те, для которых нет
 * живой строки в `listing_media`. «Живой ключ» резолвится так же, как в
 * delete-пути: `storageKey ?? extractKey(url)` — чтобы НЕ удалить legacy-объект
 * (storageKey=null), у которого ключ восстанавливается из сохранённого url.
 *
 * Закрывает два источника orphan'ов: (а) упавший best-effort `uploads.delete`
 * при удалении медиа; (б) удачный upload, но упавший `listingMedia.create`.
 */
@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);
  private readonly graceHours: number;
  private readonly batchSize: number;

  constructor(
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.graceHours =
      configService.get<number>('mediaCleanup.graceHours') ?? DEFAULT_GRACE_HOURS;
    this.batchSize =
      configService.get<number>('mediaCleanup.batchSize') ?? DEFAULT_BATCH_SIZE;
  }

  /**
   * Один проход sweep'а. Возвращает число удалённых orphan-объектов. Ошибка
   * удаления одного объекта логируется и не валит весь прогон.
   */
  async run(): Promise<number> {
    const cutoff = new Date(Date.now() - this.graceHours * 3600_000);

    const objects = await this.uploads.listKeys('listings/');
    const candidates = objects
      .filter((o) => o.key.includes('/media/') && o.lastModified < cutoff)
      .slice(0, this.batchSize);
    if (candidates.length === 0) {
      return 0;
    }

    // Множество живых ключей: резолвим ровно как в delete-пути.
    const rows = await this.prisma.listingMedia.findMany({
      select: { storageKey: true, url: true },
    });
    const live = new Set<string>(
      rows.map((r: { storageKey: string | null; url: string }) =>
        r.storageKey ?? this.uploads.extractKey(r.url),
      ),
    );

    let deleted = 0;
    for (const obj of candidates) {
      if (live.has(obj.key)) {
        continue;
      }
      try {
        await this.uploads.delete(obj.key);
        deleted += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to delete orphan object ${obj.key}: ${String(error)}`,
        );
      }
    }

    if (deleted > 0) {
      this.logger.log(`Deleted ${deleted} orphan media object(s)`);
    }
    return deleted;
  }
}
```

- [ ] **Step 5: Запустить — зелёный**

Run: `cd apps/api && rtk pnpm jest src/media-cleanup/media-cleanup.service.spec.ts`
Expected: PASS (5 тестов).

- [ ] **Step 6: Коммит**

```bash
git add apps/api/src/media-cleanup/media-cleanup.service.ts apps/api/src/media-cleanup/media-cleanup.service.spec.ts apps/api/src/config/configuration.ts
git commit -m "feat(media-cleanup): orphan R2 sweep service + config namespace"
```

---

### Task 3: Очередь, воркер, модуль и проводка (config-gated)

**Files:**
- Modify: `apps/api/src/queues/queue.constants.ts`
- Create: `apps/api/src/queues/media-cleanup.queue.ts`
- Create: `apps/api/src/queues/media-cleanup.queue.spec.ts`
- Modify: `apps/api/src/queues/queues.module.ts`
- Modify: `apps/api/src/queues/index.ts`
- Create: `apps/api/src/media-cleanup/media-cleanup.worker.ts`
- Create: `apps/api/src/media-cleanup/media-cleanup.module.ts`
- Create: `apps/api/src/media-cleanup/index.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `MediaCleanupService.run` (Task 2), `buildBullConnection`, `ConfigService`.
- Produces: `MEDIA_CLEANUP_QUEUE_NAME`, `CLEANUP_ORPHAN_MEDIA_JOB` constants; `MediaCleanupQueue` (config-gated producer); `MediaCleanupWorker` (config-gated consumer); `MediaCleanupModule`.

- [ ] **Step 1: Добавить константы очереди**

В конец `apps/api/src/queues/queue.constants.ts`:

```ts
/**
 * Очередь фоновой чистки осиротевших фото в R2 (ADR-XXXX). Несёт периодическую
 * джобу `cleanup_orphan_media` (sweep, без точечной нагрузки).
 */
export const MEDIA_CLEANUP_QUEUE_NAME = 'media_cleanup_queue';

/** Периодическая sweep-джоба чистки orphan-медиа. Нагрузка пустая. */
export const CLEANUP_ORPHAN_MEDIA_JOB = 'cleanup_orphan_media';

/** Нагрузка пустая: джоба сама перечисляет объекты и сверяет с listing_media. */
export type CleanupOrphanMediaJobData = Record<string, never>;
```

- [ ] **Step 2: Написать падающий тест продюсера (config-gated scheduling)**

Создать `apps/api/src/queues/media-cleanup.queue.spec.ts`:

```ts
import { ConfigService } from '@nestjs/config';

const upsertMock = jest.fn();
const closeMock = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: upsertMock,
    close: closeMock,
  })),
}));

import { Queue } from 'bullmq';
import { CLEANUP_ORPHAN_MEDIA_JOB } from './queue.constants';
import { MediaCleanupQueue } from './media-cleanup.queue';

/**
 * Юнит-тесты продюсера `media_cleanup_queue`. Проверяют config-gating: при
 * enabled=true джоба регистрируется по cron; при enabled=false — НЕ регистрируется.
 */
describe('MediaCleanupQueue', () => {
  const config = (enabled: boolean, cron?: string): ConfigService =>
    ({
      get: (key: string) =>
        key === 'redis.url'
          ? 'redis://localhost:6379'
          : key === 'mediaCleanup.enabled'
            ? enabled
            : key === 'mediaCleanup.cron'
              ? cron
              : undefined,
    }) as unknown as ConfigService;

  beforeEach(() => {
    upsertMock.mockReset();
    closeMock.mockReset();
    (Queue as unknown as jest.Mock).mockClear();
  });

  it('регистрирует cleanup_orphan_media по cron, когда включено', async () => {
    const queue = new MediaCleanupQueue(config(true, '0 4 * * *'));
    await queue.onModuleInit();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.any(String),
      { pattern: '0 4 * * *' },
      expect.objectContaining({ name: CLEANUP_ORPHAN_MEDIA_JOB }),
    );
  });

  it('НЕ регистрирует джобу, когда выключено', async () => {
    const queue = new MediaCleanupQueue(config(false));
    await queue.onModuleInit();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Запустить — падает**

Run: `cd apps/api && rtk pnpm jest src/queues/media-cleanup.queue.spec.ts`
Expected: FAIL (`Cannot find module './media-cleanup.queue'`).

- [ ] **Step 4: Реализовать продюсер**

Создать `apps/api/src/queues/media-cleanup.queue.ts`:

```ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { buildBullConnection } from './bullmq-connection';
import {
  CLEANUP_ORPHAN_MEDIA_JOB,
  MEDIA_CLEANUP_QUEUE_NAME,
} from './queue.constants';

const CLEANUP_SCHEDULER_ID = 'cleanup-orphan-media';

/**
 * MediaCleanupQueue — продюсер очереди `media_cleanup_queue` (ADR-XXXX). По
 * аналогии с {@link SavedSearchQueue}: тонкая обёртка над BullMQ `Queue`.
 * Config-gated: при `mediaCleanup.enabled=false` repeatable-джоба НЕ ставится
 * (sweep деструктивен — по умолчанию выключен).
 */
@Injectable()
export class MediaCleanupQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupQueue.name);
  private readonly queue: Queue;
  private readonly enabled: boolean;
  private readonly cron: string;

  constructor(configService: ConfigService) {
    const url = configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }
    this.enabled = configService.get<boolean>('mediaCleanup.enabled') ?? false;
    this.cron = configService.get<string>('mediaCleanup.cron') ?? '0 4 * * *';
    this.queue = new Queue(MEDIA_CLEANUP_QUEUE_NAME, {
      connection: buildBullConnection(url),
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Media cleanup disabled — not scheduling sweep');
      return;
    }
    await this.queue.upsertJobScheduler(
      CLEANUP_SCHEDULER_ID,
      { pattern: this.cron },
      {
        name: CLEANUP_ORPHAN_MEDIA_JOB,
        data: {},
        opts: { removeOnComplete: true, removeOnFail: 100 },
      },
    );
    this.logger.log(`Scheduled ${CLEANUP_ORPHAN_MEDIA_JOB} (cron="${this.cron}")`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
```

- [ ] **Step 5: Запустить — зелёный**

Run: `cd apps/api && rtk pnpm jest src/queues/media-cleanup.queue.spec.ts`
Expected: PASS (2 теста).

- [ ] **Step 6: Реализовать воркер**

Создать `apps/api/src/media-cleanup/media-cleanup.worker.ts`:

```ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { buildBullConnection } from '../queues/bullmq-connection';
import { MEDIA_CLEANUP_QUEUE_NAME } from '../queues/queue.constants';
import { MediaCleanupService } from './media-cleanup.service';

/**
 * MediaCleanupWorker — консьюмер `media_cleanup_queue` (ADR-XXXX). По аналогии с
 * {@link PromotionWorker}. Config-gated: при `mediaCleanup.enabled=false` воркер
 * не стартует (sweep деструктивен — выключен по умолчанию).
 */
@Injectable()
export class MediaCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupWorker.name);
  private worker?: Worker;

  constructor(
    private readonly configService: ConfigService,
    private readonly cleanupService: MediaCleanupService,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.configService.get<boolean>('mediaCleanup.enabled') ?? false;
    if (!enabled) {
      this.logger.log('Media cleanup disabled — worker not started');
      return;
    }
    const url = this.configService.get<string>('redis.url');
    if (!url) {
      throw new Error('REDIS_URL is not configured');
    }

    this.worker = new Worker(
      MEDIA_CLEANUP_QUEUE_NAME,
      () => this.cleanupService.run(),
      { connection: buildBullConnection(url), concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Media cleanup job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`,
      );
    });
    this.logger.log('Media cleanup worker started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
```

- [ ] **Step 7: Реализовать модуль + barrel**

Создать `apps/api/src/media-cleanup/media-cleanup.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads';
import { MediaCleanupService } from './media-cleanup.service';
import { MediaCleanupWorker } from './media-cleanup.worker';

/**
 * MediaCleanupModule — фоновая чистка осиротевших фото в R2 (ADR-XXXX).
 * {@link MediaCleanupService} — бизнес-логика sweep'а, {@link MediaCleanupWorker}
 * — консьюмер `media_cleanup_queue` (расписание ставит {@link MediaCleanupQueue}
 * из QueuesModule). Prisma — глобальный, импорт не нужен; UploadsService — из
 * UploadsModule.
 */
@Module({
  imports: [UploadsModule],
  providers: [MediaCleanupService, MediaCleanupWorker],
  exports: [MediaCleanupService],
})
export class MediaCleanupModule {}
```

Создать `apps/api/src/media-cleanup/index.ts`:

```ts
export { MediaCleanupModule } from './media-cleanup.module';
export { MediaCleanupService } from './media-cleanup.service';
```

- [ ] **Step 8: Зарегистрировать продюсер в QueuesModule и barrel**

В `apps/api/src/queues/queues.module.ts` импортировать `MediaCleanupQueue` и добавить в `providers` и `exports` (рядом с `SavedSearchQueue`).

В `apps/api/src/queues/index.ts` до-экспортировать `MediaCleanupQueue` и новые константы (`MEDIA_CLEANUP_QUEUE_NAME`, `CLEANUP_ORPHAN_MEDIA_JOB`, `CleanupOrphanMediaJobData`).

- [ ] **Step 9: Подключить модуль в AppModule**

В `apps/api/src/app.module.ts` импортировать `MediaCleanupModule` из `./media-cleanup/media-cleanup.module` и добавить в массив `imports` (после `UploadsModule`).

- [ ] **Step 10: Сборка + полный прогон тестов API**

Run: `cd apps/api && rtk pnpm build && rtk pnpm jest`
Expected: build OK; все тесты зелёные (включая новые).

- [ ] **Step 11: Коммит**

```bash
git add apps/api/src/queues apps/api/src/media-cleanup apps/api/src/app.module.ts
git commit -m "feat(media-cleanup): config-gated BullMQ worker + queue wiring"
```

---

## Part B — Клиент: вариант B визарда (`apps/client`)

### Task 4: PhotoUploader — убрать демо-фото

**Files:**
- Modify: `apps/client/src/features/listing-new/PhotoUploader.tsx`
- Create: `apps/client/src/features/listing-new/PhotoUploader.test.tsx`

**Interfaces:**
- Consumes: ничего нового.
- Produces: PhotoUploader без `DEMO_PHOTOS`/`addDemo`/кнопки демо.

- [ ] **Step 1: Написать падающий тест**

Создать `apps/client/src/features/listing-new/PhotoUploader.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('next-intl', () => ({
  useTranslations: (ns: string) => (k: string) =>
    (ru as any)[ns]?.photoUploader?.[k.replace('photoUploader.', '')] ??
    (ru as any)[ns]?.[k] ??
    k,
}));

import { PhotoUploader } from './PhotoUploader';

describe('PhotoUploader', () => {
  it('в пустом состоянии НЕ показывает кнопку демо-фото', () => {
    render(<PhotoUploader photos={[]} setPhotos={vi.fn()} />);
    // dropzone присутствует
    expect(screen.getByText(ru.listingNew.photoUploader.dropTitle)).toBeInTheDocument();
    // демо-кнопки больше нет
    expect(screen.queryByText('Добавить демо-фото')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — падает (кнопка пока есть)**

Run: `rtk pnpm --filter @avino/client test -- PhotoUploader`
Expected: FAIL (найдена кнопка «Добавить демо-фото»).

- [ ] **Step 3: Убрать демо-фото из компонента**

В `apps/client/src/features/listing-new/PhotoUploader.tsx`:
- Удалить массив `DEMO_PHOTOS` (строки 29–36).
- Удалить функцию `addDemo` (строки 64–65).
- Удалить блок кнопки (строки 92–96):

```tsx
      {photos.length === 0 && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addDemo}>
          {t('photoUploader.addDemo')}
        </Button>
      )}
```

- Если `Button` после этого больше нигде в файле не используется — удалить его импорт (`import { Button } ...`). Проверить: `grep -n "Button" apps/client/src/features/listing-new/PhotoUploader.tsx` → если 0 совпадений вне импорта, импорт убрать.

- [ ] **Step 4: Запустить — зелёный**

Run: `rtk pnpm --filter @avino/client test -- PhotoUploader`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add apps/client/src/features/listing-new/PhotoUploader.tsx apps/client/src/features/listing-new/PhotoUploader.test.tsx
git commit -m "feat(listing-new): remove demo-photo quick-fill from uploader"
```

---

### Task 5: ListingNew — убрать шаг «Контакты», туры → в «Описание», убрать имя/телефон

**Files:**
- Modify: `apps/client/src/features/listing-new/ListingNew.tsx`
- Modify: `apps/client/messages/ru.json`, `apps/client/messages/uz.json`, `apps/client/messages/en.json`
- Create: `apps/client/src/features/listing-new/ListingNew.test.tsx`

**Interfaces:**
- Consumes: `ToursSection` (уже импортирован), `useGetMeQuery` НЕ нужен (вариант B без read-only превью).
- Produces: визард из 7 шагов; блок туров на шаге «Описание»; контакт не запрашивается.

- [ ] **Step 1: Написать падающий тест (нет шага «Контакты»)**

Создать `apps/client/src/features/listing-new/ListingNew.test.tsx`:

```tsx
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ru from '../../../messages/ru.json';

vi.mock('@/store/hooks', () => ({ useAppSelector: () => true }));
vi.mock('@/store/api/createListingApi', () => ({
  useCreateListingMutation: () => [vi.fn(), { isLoading: false }],
  useUploadListingMediaMutation: () => [vi.fn(), { isLoading: false }],
}));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./AddressStep', () => ({ AddressStep: () => null }));
vi.mock('@/components/layout/LoginModal', () => ({ LoginModal: () => null }));
vi.mock('next-intl', () => {
  const resolve =
    (ns: string) =>
    (key: string): string => {
      const root = (ns ? (ru as any)[ns] : ru) as any;
      const val = key
        .split('.')
        .reduce((o: any, k: string) => (o && typeof o === 'object' ? o[k] : undefined), root);
      return typeof val === 'string' ? val : key;
    };
  return { useTranslations: resolve, useLocale: () => 'ru' };
});

import { ListingNew } from './ListingNew';

describe('ListingNew wizard (variant B)', () => {
  it('прогресс-бар не содержит шаг «Контакты», но содержит «Описание» и «Превью»', () => {
    render(<ListingNew />);
    expect(screen.queryByText('Контакты')).toBeNull();
    expect(screen.getByText('Описание')).toBeInTheDocument();
    expect(screen.getByText('Превью')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить — падает («Контакты» ещё в STEPS)**

Run: `rtk pnpm --filter @avino/client test -- ListingNew`
Expected: FAIL (`screen.queryByText('Контакты')` нашёл лейбл).

- [ ] **Step 3: Убрать шаг из STEPS**

В `apps/client/src/features/listing-new/ListingNew.tsx` в массиве `STEPS` (строки 55–64) удалить строку `'contacts',`. Должно остаться 7 ключей: `type, address, params, price, photos, description, preview`.

- [ ] **Step 4: Убрать поля name/phone из стейта**

В `interface FormState` удалить:

```ts
  name: string;
  phone: string;
```

В `const INITIAL` удалить:

```ts
  name: '',
  phone: '',
```

- [ ] **Step 5: Убрать валидацию шага «Контакты»**

В `canNext()` удалить `case 7` (имя/телефон):

```ts
      case 7:
        return f.name.trim().length > 1 && f.phone.replace(/\D/g, '').length >= 9;
```

(Превью становится шагом 7 и попадает в `default: return true`.)

- [ ] **Step 6: Почистить buildBody-комментарий**

В `buildBody()` удалить устаревшие строки:

```ts
    // name/phone — контакт владельца, не часть create-тела.
    // TODO: опционально PATCH профиля contact_phone.
```

(Блок `if (f.toursEnabled) { ... }` ниже — оставить.)

- [ ] **Step 7: Перенести ToursSection в шаг «Описание»**

В блоке `{step === 6 && ( ... )}` (шаг «Описание») после закрывающего тега `FormField` поля описания (перед `</div>` блока) вставить:

```tsx
            <ToursSection
              enabled={f.toursEnabled}
              windows={f.tourWindows}
              onChange={(v) => { set('toursEnabled', v.enabled); set('tourWindows', v.windows); }}
            />
```

- [ ] **Step 8: Удалить блок шага «Контакты»**

Удалить целиком блок (строки ~563–588):

```tsx
        {/* Шаг 7 — Контакты */}
        {step === 7 && (
          <div className="flex flex-col gap-5">
            <FormField label={t('fields.name.label')}>
              <Field
                placeholder={t('fields.name.placeholder')}
                value={f.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </FormField>
            <FormField label={t('fields.phone.label')} hint={t('fields.phone.hint')}>
              <Field
                type="tel"
                inputMode="tel"
                placeholder="+998 90 123 45 67"
                value={f.phone}
                onChange={(e) => set('phone', e.target.value)}
              />
            </FormField>
            <ToursSection
              enabled={f.toursEnabled}
              windows={f.tourWindows}
              onChange={(v) => { set('toursEnabled', v.enabled); set('tourWindows', v.windows); }}
            />
          </div>
        )}
```

- [ ] **Step 9: Перенумеровать превью + убрать строку контакта**

Изменить заголовок и условие превью с `{step === 8 && (` на `{step === 7 && (` (комментарий «Шаг 8 — Превью» → «Шаг 7 — Превью»).

В превью удалить строку контакта:

```tsx
              <Row label={t('preview.rows.contact')} value={f.name ? `${f.name} · ${f.phone}` : null} />
```

- [ ] **Step 10: Удалить i18n-ключи (ru/uz/en)**

В каждом из `apps/client/messages/{ru,uz,en}.json` под `listingNew` удалить ключи (в `ru` значения показаны; в `uz`/`en` — те же пути):
- `steps.contacts`
- `fields.name` (объект целиком)
- `fields.phone` (объект целиком)
- `photoUploader.addDemo`
- `preview.rows.contact`

После правок проверить валидность JSON (нет висячих запятых):

Run: `node -e "require('./apps/client/messages/ru.json');require('./apps/client/messages/uz.json');require('./apps/client/messages/en.json');console.log('json ok')"`
Expected: `json ok`

- [ ] **Step 11: Запустить тест визарда — зелёный**

Run: `rtk pnpm --filter @avino/client test -- ListingNew`
Expected: PASS.

- [ ] **Step 12: Полный прогон клиентских тестов + сборка**

Run: `rtk pnpm --filter @avino/client test`
Expected: все тесты зелёные (включая ToursSection, PhotoUploader, ListingNew).

Run: `cd apps/client && rtk pnpm exec next build`
Expected: сборка без ошибок. (Не доверять `rtk next build` — проверять raw `next build`, см. memory.)

- [ ] **Step 13: Коммит**

```bash
git add apps/client/src/features/listing-new/ListingNew.tsx apps/client/src/features/listing-new/ListingNew.test.tsx apps/client/messages/ru.json apps/client/messages/uz.json apps/client/messages/en.json
git commit -m "feat(listing-new): variant B — drop contact step, tours under description"
```

---

## Part C — Финализация

### Task 6: ADR + DONE.md + проверка

**Files:**
- Create: `docs/adr/ADR-00XX-media-cleanup-worker.md` (номер — следующий свободный; проверить `ls docs/adr | tail`)
- Modify: `docs/DONE.md` (если ведётся — добавить запись о фиче)
- Modify: спека (заменить `ADR-XXXX` в коде-комментариях на присвоенный номер)

**Interfaces:** нет (документация).

- [ ] **Step 1: Определить номер ADR**

Run: `ls docs/adr 2>/dev/null | tail -5`
Взять следующий свободный номер. Заменить `ADR-XXXX`/`ADR-00XX` в комментариях бэкенда (`media-cleanup.service.ts`, `media-cleanup.queue.ts`, `media-cleanup.worker.ts`, `media-cleanup.module.ts`, `queue.constants.ts`, `configuration.ts`) на присвоенный.

- [ ] **Step 2: Написать ADR**

Создать `docs/adr/ADR-00XX-media-cleanup-worker.md` с разделами: Context (best-effort delete глотает ошибку; нет cleanup-джобы → orphan'ы копятся; второй источник — upload без create), Decision (config-gated бакет-свип `listings/`+`/media/`, grace 24ч, live-key = `storageKey ?? extractKey(url)`, default OFF), Consequences (нет миграции; ListObjectsV2 при MVP-объёме дёшев; включается явно через `MEDIA_CLEANUP_ENABLED`), Alternatives (очередь отложенного удаления через новую таблицу — отклонена, требует миграцию).

- [ ] **Step 3: Зафиксировать ENV-переменные**

Если есть `docs/ENV.md` — добавить `MEDIA_CLEANUP_ENABLED` (default false), `MEDIA_CLEANUP_CRON` (`0 4 * * *`), `MEDIA_CLEANUP_GRACE_HOURS` (24), `MEDIA_CLEANUP_BATCH_SIZE` (500). Проверить наличие: `ls docs/ENV.md`.

- [ ] **Step 4: Коммит**

```bash
git add docs/
git commit -m "docs(media-cleanup): ADR-00XX + ENV; finalize plan"
```

- [ ] **Step 5: Открыть PR (контроллер, не субагент)**

Открыть stacked PR в main (main защищён → мержит пользователь). Тело PR: что сделано (вариант B + cleanup), как проверено (тесты API/клиента зелёные, `next build` OK), прод-TODO (для активации cleanup на staging/prod выставить `MEDIA_CLEANUP_ENABLED=true`).

---

## Self-Review

**Spec coverage:**
- Часть 1 спеки (убрать шаг «Контакты», имя/телефон, туры → описание, превью) → Task 5. ✓
- Часть 2 (демо-фото) → Task 4. ✓
- Часть 3 (i18n ru/uz/en) → Task 5 Step 10. ✓
- Часть 4 (media-cleanup воркер: listKeys, сервис, очередь/воркер/модуль, config-gating, grace, тесты) → Tasks 1–3. ✓
- Тесты/верификация (vitest, API jest, next build) → Tasks 1–5 + Task 5 Step 12. ✓
- ADR + DONE.md в той же ветке → Task 6. ✓

**Placeholder scan:** `ADR-XXXX`/`ADR-00XX` намеренно оставлены как плейсхолдер ИМЕНИ ADR, разрешаются в Task 6 Step 1 (номер присваивается из `docs/adr`). Прочих TBD/TODO нет.

**Type consistency:**
- `listKeys` сигнатура `Array<{ key: string; lastModified: Date }>` — одинакова в Task 1 (реализация/тест) и Task 2 (потребление в `run()`). ✓
- `MediaCleanupService.run(): Promise<number>` — Task 2 определяет, Task 3 (воркер) вызывает `() => this.cleanupService.run()`. ✓
- Константы `MEDIA_CLEANUP_QUEUE_NAME` / `CLEANUP_ORPHAN_MEDIA_JOB` — Task 3 Step 1 определяет, продюсер/воркер/тест используют те же имена. ✓
- Config-ключи `mediaCleanup.enabled/cron/graceHours/batchSize` — Task 2 (namespace) ↔ Task 2/3 (чтение). ✓
- `live = storageKey ?? extractKey(url)` совпадает с delete-путём `ListingMediaService.remove`. ✓
