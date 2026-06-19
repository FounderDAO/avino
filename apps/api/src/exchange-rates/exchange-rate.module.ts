import { Module } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateWorker } from './exchange-rate.worker';

/**
 * ExchangeRateModule — доменный модуль курса валют.
 *
 * Предоставляет `ExchangeRateService` (доступен через `exports` для AdminModule
 * и будущих контроллеров Tasks 6–7). `ExchangeRateWorker` — внутренний консьюмер
 * очереди BullMQ. `ExchangeRateQueue` (продюсер) живёт в QueuesModule (Global).
 */
@Module({
  providers: [ExchangeRateService, ExchangeRateWorker],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
