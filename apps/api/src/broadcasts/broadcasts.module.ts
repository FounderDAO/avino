import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RolesModule } from '../roles';
import { AdminBroadcastsController } from './admin-broadcasts.controller';
import { BroadcastAudienceService } from './broadcast-audience.service';
import { BroadcastDispatcherService } from './broadcast-dispatcher.service';
import { BroadcastQueue } from './broadcast.queue';
import { BroadcastWorker } from './broadcast.worker';
import { BroadcastsService } from './broadcasts.service';

/**
 * BroadcastsModule (ADR-0103) — ручная админ-рассылка. `RolesModule` даёт
 * Bearer-аутентификацию (JwtAuthGuard/RolesGuard) для контроллера. Воркер
 * (sweep) + очередь поднимаются с API-процессом. Prisma — глобальный модуль.
 */
@Module({
  imports: [RolesModule, ConfigModule],
  controllers: [AdminBroadcastsController],
  providers: [
    BroadcastsService,
    BroadcastAudienceService,
    BroadcastDispatcherService,
    BroadcastQueue,
    BroadcastWorker,
  ],
})
export class BroadcastsModule {}
