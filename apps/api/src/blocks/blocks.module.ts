import { Module } from '@nestjs/common';
import { RolesModule } from '../roles';
import { UploadsModule } from '../uploads';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

/**
 * BlocksModule — блокировка пользователей (Apple Guideline 1.2).
 * `RolesModule` даёт JwtAuthGuard одним импортом; `UploadsModule` — подписанные
 * ссылки аватаров в `GET /blocks` (как в чате). Prisma — глобальный модуль,
 * импорт не нужен.
 */
@Module({
  imports: [RolesModule, UploadsModule],
  controllers: [BlocksController],
  providers: [BlocksService],
  exports: [BlocksService],
})
export class BlocksModule {}
