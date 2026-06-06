import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import {
  ComplaintsService,
  CreateComplaintResponse,
} from './complaints.service';
import { CreateComplaintDto } from './dto/create-complaint.dto';

/**
 * ComplaintsController — пользовательская подача жалобы (TASK-132, API.md §16).
 *
 * `JwtAuthGuard` на классе: `GUEST` без Bearer → `401`. Любая аутентифицированная
 * роль (USER и выше) может пожаловаться на листинг. Версионирование URI
 * обязательно (CLAUDE.md §14); префикс `api` ставит main.ts → `/api/v1/complaints`.
 * Админ-разбор жалоб — {@link AdminComplaintsController}.
 */
@Controller({ path: 'complaints', version: '1' })
@UseGuards(JwtAuthGuard)
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  /**
   * `POST /api/v1/complaints` — пожаловаться на листинг. Body:
   * `{ listing_id, reason, details? }`. → `201 { id, status }`. `404` если
   * листинга нет или он `DELETED`.
   */
  @Post()
  create(
    @CurrentUser('id') reporterId: string,
    @Body() dto: CreateComplaintDto,
  ): Promise<CreateComplaintResponse> {
    return this.complaintsService.create(reporterId, dto);
  }
}
