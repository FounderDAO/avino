import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Глобальный модуль доступа к базе данных (TASK-030, CLAUDE.md §3).
 *
 * - @Global: PrismaService доступен во всех модулях без повторного импорта,
 *   по аналогии с глобальным AppConfigModule (TASK-022).
 * - exports: PrismaService инжектируется в будущие feature-модули
 *   (listings, users, chat и т.д.).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
