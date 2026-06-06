import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { AdminStatsResponse, AdminStatsService } from './admin-stats.service';

/**
 * AdminStatsController — сводные счётчики дашборда (ADMIN-15, API.md §16).
 *
 * `GET /api/v1/admin/stats` доступен MODERATOR и ADMIN: дашборд — общая стартовая
 * страница админ-панели (как `admin/listings` и `admin/complaints`), а ответ —
 * это агрегированные числа без PII. Версионирование URI обязательно (CLAUDE.md
 * §14); префикс `api` ставит main.ts.
 */
@Controller({ path: 'admin/stats', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MODERATOR, UserRole.ADMIN)
export class AdminStatsController {
  constructor(private readonly adminStatsService: AdminStatsService) {}

  /** `GET /api/v1/admin/stats` — счётчики дашборда. */
  @Get()
  getStats(): Promise<AdminStatsResponse> {
    return this.adminStatsService.getStats();
  }
}
