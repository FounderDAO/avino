import { Global, Module } from '@nestjs/common';
import { EmailQueue } from './email.queue';
import { PromotionQueue } from './promotion.queue';
import { SavedSearchQueue } from './saved-search.queue';

/**
 * QueuesModule — продюсеры BullMQ-очередей (TASK-071, ARCHITECTURE §23).
 *
 * `@Global`: очереди инжектируются в любой модуль без повторного импорта.
 * Воркеры-консьюмеры живут в своих доменных модулях, а не здесь — этот модуль
 * отвечает только за постановку джоб.
 */
@Global()
@Module({
  providers: [PromotionQueue, EmailQueue, SavedSearchQueue],
  exports: [PromotionQueue, EmailQueue, SavedSearchQueue],
})
export class QueuesModule {}
