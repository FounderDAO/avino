// apps/api/src/scripts/backfill-media-variants.ts
import { NestFactory } from '@nestjs/core';
import { MediaType, Prisma } from '@prisma/client';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma';
import { MediaProcessingQueue } from '../queues/media-processing.queue';

/**
 * Backfill WebP-вариантов уже загруженных фото (SEO AUD-8, one-off ops):
 * ставит в media_processing_queue все IMAGE-медиа без вариантов. Обработку
 * делает обычный воркер в процессе API (sharp, 2 задачи одновременно).
 *
 * По умолчанию DRY-RUN: печатает, сколько фото было бы поставлено. --apply —
 * поставить. Идемпотентно: обработанные фото воркер пропускает, jobId = mediaId
 * не даёт поставить одно фото дважды.
 *
 * Запуск (в контейнере api, после деплоя этой версии):
 *   ... exec api node dist/scripts/backfill-media-variants.js            # dry-run
 *   ... exec api node dist/scripts/backfill-media-variants.js --apply    # поставить
 */
async function backfillMediaVariants(): Promise<void> {
  const apply = process.argv.slice(2).includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  try {
    const prisma = app.get(PrismaService);
    const queue = app.get(MediaProcessingQueue);
    const rows = await prisma.listingMedia.findMany({
      where: { type: MediaType.IMAGE, variants: { equals: Prisma.DbNull } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    /* eslint-disable no-console */
    console.log(`backfill-media-variants (${apply ? 'APPLY' : 'DRY-RUN — ничего не поставлено'}): ${rows.length} фото без вариантов`);
    if (apply) {
      for (let i = 0; i < rows.length; i += 500) {
        await queue.enqueue(rows.slice(i, i + 500).map((r) => r.id));
      }
      console.log('поставлено в media_processing_queue');
    }
    /* eslint-enable no-console */
  } finally {
    await app.close();
  }
}

void backfillMediaVariants();
