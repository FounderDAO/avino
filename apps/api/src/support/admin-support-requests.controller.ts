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
  SupportRequestResponse,
  SupportRequestsService,
} from './support-requests.service';
import { ListSupportRequestsQueryDto } from './dto/list-support-requests.dto';
import { UpdateSupportRequestStatusDto } from './dto/update-support-request-status.dto';

/**
 * AdminSupportRequestsController — разбор обращений поддержки модератором/
 * админом. Регистрируется в {@link AdminModule} рядом с {@link
 * AdminComplaintsController}; роуты под `/api/v1/admin/support/requests`.
 */
@Controller({ path: 'admin/support/requests', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class AdminSupportRequestsController {
  constructor(private readonly supportRequestsService: SupportRequestsService) {}

  /** `GET /api/v1/admin/support/requests` — список обращений (фильтр `status`). */
  @Get()
  list(
    @Query() query: ListSupportRequestsQueryDto,
  ): Promise<PaginatedResponse<SupportRequestResponse>> {
    return this.supportRequestsService.listAdmin(query);
  }

  /** `PATCH /api/v1/admin/support/requests/:id` — сменить статус обращения. */
  @Patch(':id')
  updateStatus(
    @CurrentUser('id') handlerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportRequestStatusDto,
  ): Promise<SupportRequestResponse> {
    return this.supportRequestsService.updateStatus(handlerId, id, dto);
  }
}
