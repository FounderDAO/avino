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
import { BroadcastsService } from './broadcasts.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { ListBroadcastsQueryDto } from './dto/list-broadcasts.query.dto';
import { PreviewAudienceDto } from './dto/preview-audience.dto';

/**
 * Ручная админ-рассылка уведомлений (ADR-0103, ADMIN-only). Создание/история/
 * деталь/отмена; превью аудитории без создания. MODERATOR доступа не имеет.
 */
@Controller({ path: 'admin/broadcasts', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminBroadcastsController {
  constructor(private readonly service: BroadcastsService) {}

  @Post('preview')
  preview(@Body() dto: PreviewAudienceDto) {
    return this.service.preview(dto);
  }

  @Post()
  create(@CurrentUser('id') adminId: string, @Body() dto: CreateBroadcastDto) {
    return this.service.create(adminId, dto);
  }

  @Get()
  list(@Query() query: ListBroadcastsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getDetail(id);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser('id') adminId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.cancel(adminId, id);
  }
}
