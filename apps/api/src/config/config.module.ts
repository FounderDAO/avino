import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configurations } from './configuration';
import { validateEnv } from './env.validation';

/**
 * Глобальный модуль конфигурации (TASK-022, CLAUDE.md §3).
 *
 * - isGlobal: ConfigService доступен во всём приложении без повторного импорта.
 * - validate: env проверяется на старте (fail-fast при невалидной конфигурации).
 * - load: типизированные namespaced-конфиги (app/database/redis/...).
 *
 * envFilePath: сначала общий корневой .env монорепо, затем локальный .env
 * приложения (последний переопределяет первый).
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
      load: configurations,
    }),
  ],
})
export class AppConfigModule {}
