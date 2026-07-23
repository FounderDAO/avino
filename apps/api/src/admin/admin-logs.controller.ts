import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@avino/shared';
import { AuditLogResponse, AuditService } from '../audit';
import { Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { PaginatedResponse } from '../moderation';
import {
  AdminLogsService,
  ModerationLogItem,
  NotificationLogItem,
  PromotionLogItem,
} from './admin-logs.service';
import { AdminOtpLogsService, OtpLogItem } from './admin-otp-logs.service';
import { ListAuditLogsQueryDto } from '../audit/dto/list-audit-logs.dto';
import { ListModerationLogsQueryDto } from './dto/list-moderation-logs.dto';
import { ListNotificationLogsQueryDto } from './dto/list-notification-logs.dto';
import { ListOtpLogsQueryDto } from './dto/list-otp-logs.dto';
import { ListPromotionLogsQueryDto } from './dto/list-promotion-logs.dto';

/**
 * AdminLogsController — read-only журналы для админ-панели (TASK-131, API.md §16).
 *
 * Пять глобальных пагинированных логов под `/api/v1/admin/*-logs`. В отличие от
 * остальных админ-роутов (MODERATOR/ADMIN), логи — только **ADMIN**: это
 * security/audit-поверхность. `JwtAuthGuard` + `RolesGuard` на классе с
 * `@Roles(ADMIN)`. Версионирование URI обязательно (CLAUDE.md §14); префикс
 * `api` ставит main.ts. `audit-logs` делегирует {@link AuditService} (отдельный
 * модуль, владелец кросс-доменной `audit_logs`); три доменных лога —
 * {@link AdminLogsService}.
 */
@Controller({ path: 'admin', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLogsController {
  constructor(
    private readonly adminLogsService: AdminLogsService,
    private readonly adminOtpLogsService: AdminOtpLogsService,
    private readonly auditService: AuditService,
  ) {}

  /** `GET /api/v1/admin/audit-logs` — security audit-лог. */
  @Get('audit-logs')
  auditLogs(
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<PaginatedResponse<AuditLogResponse>> {
    return this.auditService.listAuditLogs(query);
  }

  /** `GET /api/v1/admin/moderation-logs` — глобальный журнал модерации. */
  @Get('moderation-logs')
  moderationLogs(
    @Query() query: ListModerationLogsQueryDto,
  ): Promise<PaginatedResponse<ModerationLogItem>> {
    return this.adminLogsService.listModerationLogs(query);
  }

  /** `GET /api/v1/admin/promotion-logs` — журнал админских промо-действий. */
  @Get('promotion-logs')
  promotionLogs(
    @Query() query: ListPromotionLogsQueryDto,
  ): Promise<PaginatedResponse<PromotionLogItem>> {
    return this.adminLogsService.listPromotionLogs(query);
  }

  /** `GET /api/v1/admin/notification-logs` — глобальный журнал уведомлений. */
  @Get('notification-logs')
  notificationLogs(
    @Query() query: ListNotificationLogsQueryDto,
  ): Promise<PaginatedResponse<NotificationLogItem>> {
    return this.adminLogsService.listNotificationLogs(query);
  }

  /** `GET /api/v1/admin/otp-logs` — журнал OTP-запросов (без кода/хеша). */
  @Get('otp-logs')
  otpLogs(
    @Query() query: ListOtpLogsQueryDto,
  ): Promise<PaginatedResponse<OtpLogItem>> {
    return this.adminOtpLogsService.listOtpLogs(query);
  }
}
