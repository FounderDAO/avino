import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PaginatedResponse } from '../moderation';
import {
  AdminAgentApplicationResponse,
  AgentApplicationsService,
} from './agent-applications.service';
import { ListAgentApplicationsQueryDto } from './dto/list-agent-applications.dto';
import { RejectAgentApplicationDto } from './dto/reject-agent-application.dto';

/**
 * AdminAgentApplicationsController — модерация заявок «Стать агентом»
 * (ADR-0140, API.md §21). Регистрируется в {@link AdminModule}.
 */
@Controller({ path: 'admin/agent-applications', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class AdminAgentApplicationsController {
  constructor(private readonly service: AgentApplicationsService) {}

  /** `GET /api/v1/admin/agent-applications` — список (фильтр `status`). */
  @Get()
  list(
    @Query() query: ListAgentApplicationsQueryDto,
  ): Promise<PaginatedResponse<AdminAgentApplicationResponse>> {
    return this.service.listAdmin(query);
  }

  /** `POST /api/v1/admin/agent-applications/:id/approve` — одобрить. */
  @Post(':id/approve')
  approve(
    @CurrentUser('id') moderatorId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminAgentApplicationResponse> {
    return this.service.approve(moderatorId, id);
  }

  /** `POST /api/v1/admin/agent-applications/:id/reject` — отклонить. */
  @Post(':id/reject')
  reject(
    @CurrentUser('id') moderatorId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAgentApplicationDto,
  ): Promise<AdminAgentApplicationResponse> {
    return this.service.reject(moderatorId, id, dto);
  }
}
