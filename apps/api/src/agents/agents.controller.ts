import { Controller, Get, Header, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PaginatedResponse } from '../moderation';
import {
  AgentProfileResponse,
  AgentResponse,
  AgentsService,
} from './agents.service';
import { ListAgentsQueryDto } from './dto/list-agents.dto';
import { AGENTS_CACHE_CONTROL } from '../common/seo/cache-control';

/**
 * AgentsController — публичный каталог агентов (ADR-0140, API.md §21).
 * Без авторизации: данные публичны (имя/агентство/«о себе»/счётчик).
 * Контакты (телефон/e-mail) отдаёт только профиль `:id`, не список (ADR-0155).
 * Объявления агента — существующий `GET /search?agent_id=` (ADR-0140).
 */
@Controller({ path: 'agents', version: '1' })
export class AgentsController {
  constructor(private readonly service: AgentsService) {}

  /** `GET /api/v1/agents` — список агентов (самые активные сверху). */
  @Get()
  @Header('Cache-Control', AGENTS_CACHE_CONTROL)
  list(
    @Query() query: ListAgentsQueryDto,
  ): Promise<PaginatedResponse<AgentResponse>> {
    return this.service.list(query);
  }

  /** `GET /api/v1/agents/:id` — публичный профиль агента (с контактами). */
  @Get(':id')
  @Header('Cache-Control', AGENTS_CACHE_CONTROL)
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AgentProfileResponse> {
    return this.service.getById(id);
  }
}
