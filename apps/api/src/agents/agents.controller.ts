import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PaginatedResponse } from '../moderation';
import { AgentResponse, AgentsService } from './agents.service';
import { ListAgentsQueryDto } from './dto/list-agents.dto';

/**
 * AgentsController — публичный каталог агентов (ADR-0140, API.md §21).
 * Без авторизации: данные публичны (имя/агентство/«о себе»/счётчик).
 * Объявления агента — существующий `GET /search?agent_id=` (ADR-0140).
 */
@Controller({ path: 'agents', version: '1' })
export class AgentsController {
  constructor(private readonly service: AgentsService) {}

  /** `GET /api/v1/agents` — список агентов (самые активные сверху). */
  @Get()
  list(
    @Query() query: ListAgentsQueryDto,
  ): Promise<PaginatedResponse<AgentResponse>> {
    return this.service.list(query);
  }

  /** `GET /api/v1/agents/:id` — публичный профиль агента. */
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<AgentResponse> {
    return this.service.getById(id);
  }
}
