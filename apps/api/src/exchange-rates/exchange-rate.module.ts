import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { ExchangeRateController } from './exchange-rate.controller';
import { AdminExchangeRateController } from './admin-exchange-rate.controller';
import { ExchangeRateService } from './exchange-rate.service';
import { ExchangeRateWorker } from './exchange-rate.worker';

/**
 * ExchangeRateModule — доменный модуль курса валют.
 *
 * Предоставляет `ExchangeRateService` (доступен через `exports`).
 * `ExchangeRateWorker` — внутренний консьюмер очереди BullMQ; `ExchangeRateQueue`
 * (продюсер) живёт в QueuesModule (Global).
 *
 * `RolesModule` импортируется ради Bearer-аутентификации и проверки ролей
 * ({@link JwtAuthGuard}/{@link RolesGuard}) для {@link AdminExchangeRateController}
 * — без него guard'ы не резолвят `JwtService` в контексте этого модуля (тот же
 * приём, что в AuthModule/UsersModule/AdminModule).
 */
@Module({
  imports: [RolesModule],
  controllers: [ExchangeRateController, AdminExchangeRateController],
  providers: [ExchangeRateService, ExchangeRateWorker],
  exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
