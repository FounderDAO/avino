import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Глобальный модуль доступа к Redis (TASK-041).
 *
 * - @Global: RedisService доступен во всех модулях без повторного импорта
 *   (по аналогии с PrismaModule/AppConfigModule).
 * - exports: инжектируется в rate-limit, OTP, будущие BullMQ-воркеры.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
