import { Global, Module } from '@nestjs/common';
import { TranslationQueue } from './translation.queue';

/**
 * QueuesModule — продюсеры BullMQ-очередей (TASK-071, ARCHITECTURE §23).
 *
 * `@Global` (по аналогии с {@link RedisModule}): {@link TranslationQueue}
 * инжектируется в любой модуль (ModerationService) без повторного импорта.
 * Воркеры-консьюмеры живут в своих доменных модулях (например
 * {@link TranslationWorker} в TranslationsModule), а не здесь — этот модуль
 * отвечает только за постановку джоб.
 */
@Global()
@Module({
  providers: [TranslationQueue],
  exports: [TranslationQueue],
})
export class QueuesModule {}
