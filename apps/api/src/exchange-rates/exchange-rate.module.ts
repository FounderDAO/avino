import { Module } from '@nestjs/common';
import { ExchangeRateController } from './exchange-rate.controller';
import { AdminExchangeRateController } from './admin-exchange-rate.controller';
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
  controllers: [ExchangeRateController, AdminExchangeRateController],
  providers: [ExchangeRateService, ExchangeRateWorker],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
