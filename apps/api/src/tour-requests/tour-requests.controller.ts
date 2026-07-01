import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { TourRequestStatusDto } from './dto/tour-request-status.dto';
import {
  TakenSlotsResponse, TourRequestListResponse, TourRequestResponse, TourRequestsService,
} from './tour-requests.service';

/** TourRequestsController — заявки на тур (просмотр). Все роуты Bearer-only. */
@Controller({ path: 'tour-requests', version: '1' })
@UseGuards(JwtAuthGuard)
export class TourRequestsController {
  constructor(private readonly service: TourRequestsService) {}

  /** Парсит query `limit` в число; `undefined`/мусор → undefined (сервис применит дефолт). */
  private parseLimit(limit?: string): number | undefined {
    if (limit === undefined) return undefined;
    const n = Number(limit);
    return Number.isFinite(n) ? n : undefined;
  }

  @Post()
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTourRequestDto,
  ): Promise<TourRequestResponse> {
    return this.service.create(userId, dto);
  }

  /** Занятые слоты листинга для формы заявки (анонимно: только дата и окно). */
  @Get('taken')
  taken(
    @Query('listing_id', ParseUUIDPipe) listingId: string,
  ): Promise<TakenSlotsResponse> {
    return this.service.listTakenSlots(listingId);
  }

  @Get('outgoing')
  outgoing(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TourRequestListResponse> {
    return this.service.listOutgoing(userId, { limit: this.parseLimit(limit), cursor });
  }

  @Get('incoming')
  incoming(
    @CurrentUser('id') userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<TourRequestListResponse> {
    return this.service.listIncoming(userId, { limit: this.parseLimit(limit), cursor });
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
