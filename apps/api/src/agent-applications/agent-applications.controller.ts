import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import {
  AgentApplicationResponse,
  AgentApplicationsService,
} from './agent-applications.service';
import { CreateAgentApplicationDto } from './dto/create-agent-application.dto';

/**
 * AgentApplicationsController — заявка «Стать агентом» (ADR-0140, API.md §21).
 * `JwtAuthGuard` на классе: GUEST → 401. Путь `users/me/agent-application` —
 * ресурс текущего пользователя (рядом с /users/me/* в UsersController).
 * Админ-разбор — {@link AdminAgentApplicationsController}.
 */
@Controller({ path: 'users/me/agent-application', version: '1' })
@UseGuards(JwtAuthGuard)
export class AgentApplicationsController {
  constructor(private readonly service: AgentApplicationsService) {}

  /** `POST /api/v1/users/me/agent-application` — подать заявку. */
  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAgentApplicationDto,
  ): Promise<AgentApplicationResponse> {
    return this.service.create(userId, dto);
  }

  /** `GET /api/v1/users/me/agent-application` — последняя заявка (или 404). */
  @Get()
  getMine(@CurrentUser('id') userId: string): Promise<AgentApplicationResponse> {
    return this.service.getMine(userId);
  }
}
