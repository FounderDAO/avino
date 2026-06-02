import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService — единая точка доступа к базе данных (TASK-030, CLAUDE.md §3).
 *
 * Расширяет PrismaClient и управляет жизненным циклом подключения через
 * хуки NestJS:
 * - onModuleInit:    подключение к БД на старте приложения (fail-fast).
 * - onModuleDestroy: корректное закрытие подключения при остановке.
 *
 * Сервис экспортируется глобально из PrismaModule, поэтому инжектируется
 * в любой модуль без повторного импорта.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected to database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from database');
  }
}
