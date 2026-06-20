import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { TourRequestStatusDto } from './dto/tour-request-status.dto';
import {
  TourRequestListResponse, TourRequestResponse, TourRequestsService,
} from './tour-requests.service';

/** TourRequestsController — заявки на тур (просмотр). Все роуты Bearer-only. */
@Controller({ path: 'tour-requests', version: '1' })
@UseGuards(JwtAuthGuard)
export class TourRequestsController {
  constructor(private readonly service: TourRequestsService) {}

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTourRequestDto,
  ): Promise<TourRequestResponse> {
    return this.service.create(userId, dto);
  }

  @Get('outgoing')
  outgoing(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TourRequestListResponse> {
    return this.service.listOutgoing(userId, { limit: limit ? Number(limit) : undefined, cursor });
  }

  @Get('incoming')
  incoming(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TourRequestListResponse> {
    return this.service.listIncoming(userId, { limit: limit ? Number(limit) : undefined, cursor });
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TourRequestStatusDto,
  ): Promise<TourRequestResponse> {
    return this.service.setStatus(userId, id, dto.action);
  }
}
