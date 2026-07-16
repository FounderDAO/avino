import { Module } from '@nestjs/common';
import { AdminAgentApplicationsController } from '../agent-applications/admin-agent-applications.controller';
import { AgentApplicationsModule } from '../agent-applications';
import { AuditModule } from '../audit';
import { AdminComplaintsController, ComplaintsModule } from '../complaints';
import { ModerationModule } from '../moderation';
import { PromotionsModule } from '../promotions';
import { RolesModule } from '../roles';
import { SettingsModule, AdminPromotionsFlagController, AdminActiveListingLimitController, AdminMapHoverRecenterFlagController, AdminLegalConsentFlagController } from '../settings';
import { AdminSupportRequestsController, SupportModule } from '../support';
import { TranslationsModule } from '../translations';
import { AdminListingPromotionsController } from './admin-listing-promotions.controller';
import { AdminListingsController } from './admin-listings.controller';
import { AdminPromotionPlansController } from './admin-promotion-plans.controller';
import { AdminPromotionPlansService } from './admin-promotion-plans.service';
import { AdminPromotionSettingsController } from './admin-promotion-settings.controller';
import { AdminPromotionSettingsService } from './admin-promotion-settings.service';
import { AdminNotificationSettingsController } from './admin-notification-settings.controller';
import { AdminNotificationSettingsService } from './admin-notification-settings.service';
import { AdminSmsSettingsController } from './admin-sms-settings.controller';
import { AdminSmsSettingsService } from './admin-sms-settings.service';
import { AdminTelegramSettingsController } from './admin-telegram-settings.controller';
import { AdminTelegramSettingsService } from './admin-telegram-settings.service';
import { AdminLogsController } from './admin-logs.controller';
import { AdminLogsService } from './admin-logs.service';
import { AdminPromotionsController } from './admin-promotions.controller';
import { AdminPromotionsOverviewController } from './admin-promotions-overview.controller';
import { AdminPromotionsOverviewService } from './admin-promotions-overview.service';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/**
 * AdminModule — HTTP-слой админ/модераторских операций (TASK-053/TASK-121/
 * TASK-130, M5/M12/M13).
 *
 * `RolesModule` даёт Bearer-аутентификацию ({@link JwtAuthGuard}) и проверку
 * ролей ({@link RolesGuard}); `ModerationModule` — бизнес-логику модерации;
 * `PromotionsModule` — ручную активацию/историю промо ({@link AdminPromotionsService})
 * и управление существующей промо ({@link AdminListingPromotionsController}:
 * cancel/extend, TASK-122). {@link AdminUsersController}/{@link AdminUsersService}
 * — управление пользователями и ролями (TASK-130, API.md §6).
 * {@link AdminLogsController}/{@link AdminLogsService} + `AuditModule` — read-only
 * журналы (audit/moderation/promotion/notification, TASK-131, ADMIN-only).
 * {@link AdminComplaintsController} + `ComplaintsModule` — разбор жалоб
 * (MODERATOR/ADMIN, TASK-132); бизнес-логика живёт в {@link ComplaintsService}.
 * {@link AdminAgentApplicationsController} + `AgentApplicationsModule` —
 * модерация заявок «Стать агентом» (ADR-0140, API.md §21).
 */
@Module({
  imports: [
    RolesModule,
    ModerationModule,
    PromotionsModule,
    AuditModule,
    AgentApplicationsModule,
    ComplaintsModule,
    SupportModule,
    TranslationsModule,
    SettingsModule,
  ],
  controllers: [
    AdminAgentApplicationsController,
    AdminListingsController,
    AdminPromotionsController,
    AdminPromotionsOverviewController,
    AdminListingPromotionsController,
    AdminPromotionPlansController,
    AdminPromotionSettingsController,
    AdminTelegramSettingsController,
    AdminSmsSettingsController,
    AdminNotificationSettingsController,
    AdminPromotionsFlagController,
    AdminActiveListingLimitController,
    AdminMapHoverRecenterFlagController,
    AdminLegalConsentFlagController,
    AdminUsersController,
    AdminLogsController,
    AdminComplaintsController,
    AdminSupportRequestsController,
    AdminStatsController,
    AdminAnalyticsController,
  ],
  providers: [
    AdminUsersService,
    AdminLogsService,
    AdminStatsService,
    AdminPromotionsOverviewService,
    AdminAnalyticsService,
    AdminPromotionPlansService,
    AdminPromotionSettingsService,
    AdminTelegramSettingsService,
    AdminSmsSettingsService,
    AdminNotificationSettingsService,
  ],
})
export class AdminModule {}
