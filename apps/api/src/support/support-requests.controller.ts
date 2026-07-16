import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators';
import { OptionalJwtAuthGuard } from '../common/guards';
import type { AuthenticatedUser } from '../common/guards';
import {
  CreateSupportRequestResponse,
  SupportRequestsService,
} from './support-requests.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';

/**
 * SupportRequestsController — обращение в поддержку с формы /help.
 *
 * `OptionalJwtAuthGuard`: гость проходит без Bearer (user_id = null), валидный
 * Bearer привязывает user_id, битый токен → 401. `@Throttle` строже глобального
 * (5 req/60s c IP) — публичная запись в БД, защита от спама. Версионирование
 * URI обязательно (CLAUDE.md §14) → `POST /api/v1/support/requests`.
 * Админ-разбор — {@link AdminSupportRequestsController}.
 */
@Controller({ path: 'support', version: '1' })
@UseGuards(OptionalJwtAuthGuard)
export class SupportRequestsController {
  constructor(private readonly supportRequestsService: SupportRequestsService) {}

  /** `POST /api/v1/support/requests` — оставить обращение. → `201 { id, status }`. */
  @Post('requests')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateSupportRequestDto,
  ): Promise<CreateSupportRequestResponse> {
    return this.supportRequestsService.create(user?.id ?? null, dto);
  }
}
