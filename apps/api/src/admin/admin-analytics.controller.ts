import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import {
  AdminAnalyticsResponse,
  AdminAnalyticsService,
} from './admin-analytics.service';

/**
 * AdminAnalyticsController — данные графиков дашборда (ADMIN-15+, API.md §16).
 *
 * `GET /api/v1/admin/analytics` доступен MODERATOR и ADMIN (как `admin/stats`):
 * дашборд — общая стартовая страница админ-панели, ответ — агрегаты без PII
 * (имена районов/модераторов и заголовки — не персональные данные). Версия URI
 * обязательна (CLAUDE.md §14); префикс `api` ставит main.ts.
 */
@Controller({ path: 'admin/analytics', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  /** `GET /api/v1/admin/analytics` — ряды графиков + лента действий. */
  @Get()
  getAnalytics(): Promise<AdminAnalyticsResponse> {
    return this.adminAnalyticsService.getAnalytics();
  }
}
