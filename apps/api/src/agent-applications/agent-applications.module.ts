import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RolesModule } from '../roles';
import { UploadsModule } from '../uploads';
import { AgentApplicationsController } from './agent-applications.controller';
import { AgentApplicationsService } from './agent-applications.service';

/**
 * AgentApplicationsModule — заявки «Стать агентом» (ADR-0140, API.md §21).
 * Сервис экспортируется для {@link AdminAgentApplicationsController} в AdminModule.
 */
@Module({
  imports: [RolesModule, NotificationsModule, UploadsModule],
  controllers: [AgentApplicationsController],
  providers: [AgentApplicationsService],
  exports: [AgentApplicationsService],
})
export class AgentApplicationsModule {}
