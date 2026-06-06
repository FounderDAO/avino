import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PaginatedResponse } from '../moderation';
import {
  ComplaintResponse,
  ComplaintsService,
} from './complaints.service';
import { ListComplaintsQueryDto } from './dto/list-complaints.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';

/**
 * AdminComplaintsController — разбор жалоб модератором/админом (TASK-132,
 * API.md §16). Регистрируется в {@link AdminModule} рядом с прочими админ-роутами.
 *
 * Все роуты под `/api/v1/admin/complaints` — `JwtAuthGuard` + `RolesGuard` на
 * классе, `@Roles(MODERATOR, ADMIN)` (как `admin/listings`). Версионирование URI
 * обязательно (CLAUDE.md §14); префикс `api` ставит main.ts.
 */
@Controller({ path: 'admin/complaints', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class AdminComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  /** `GET /api/v1/admin/complaints` — список жалоб (фильтры `status`/`listing_id`). */
  @Get()
  list(
    @Query() query: ListComplaintsQueryDto,
  ): Promise<PaginatedResponse<ComplaintResponse>> {
    return this.complaintsService.listAdmin(query);
  }

  /** `PATCH /api/v1/admin/complaints/:id` — сменить статус жалобы. */
  @Patch(':id')
  updateStatus(
    @CurrentUser('id') handlerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComplaintStatusDto,
  ): Promise<ComplaintResponse> {
    return this.complaintsService.updateStatus(handlerId, id, dto);
  }
}
