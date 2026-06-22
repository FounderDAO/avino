import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  NOTIFICATION_EMAIL_ENABLED_KEY,
  NOTIFICATION_PUSH_ENABLED_KEY,
  resolveNotificationChannelEnabled,
} from '../notifications/notification.constants';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

export interface NotificationSettingsView {
  emailEnabled: boolean;
  pushEnabled: boolean;
}

/**
 * Runtime-тогглы доставки уведомлений (ADMIN, ADR-0102). Хранит булевы строки
 * в app_settings; их читает NotificationDispatcherService на каждом прогоне —
 * переключение без пересборки. Резолюция (DB-строка > env-дефолт) общая с
 * NotificationDispatcherService. Зеркалит AdminSmsSettingsService.
 */
@Injectable()
export class AdminNotificationSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async get(): Promise<NotificationSettingsView> {
    const emailEnvDefault =
      this.config.get<boolean>('notifications.emailEnabled') ?? true;
    const pushEnvDefault =
      this.config.get<boolean>('notifications.pushEnabled') ?? true;

    const [emailRow, pushRow] = await Promise.all([
      this.prisma.appSetting.findUnique({
        where: { key: NOTIFICATION_EMAIL_ENABLED_KEY },
      }),
      this.prisma.appSetting.findUnique({
        where: { key: NOTIFICATION_PUSH_ENABLED_KEY },
      }),
    ]);

    return {
      emailEnabled: resolveNotificationChannelEnabled(
        emailRow?.value,
        emailEnvDefault,
      ),
      pushEnabled: resolveNotificationChannelEnabled(
        pushRow?.value,
        pushEnvDefault,
      ),
    };
  }

  async update(
    adminId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsView> {
    // Partial update — обновляем только переданные ключи.
    if (dto.emailEnabled !== undefined) {
      const value = String(dto.emailEnabled);
      await this.prisma.appSetting.upsert({
        where: { key: NOTIFICATION_EMAIL_ENABLED_KEY },
        update: { value },
        create: { key: NOTIFICATION_EMAIL_ENABLED_KEY, value },
      });
    }

    if (dto.pushEnabled !== undefined) {
      const value = String(dto.pushEnabled);
      await this.prisma.appSetting.upsert({
        where: { key: NOTIFICATION_PUSH_ENABLED_KEY },
        update: { value },
        create: { key: NOTIFICATION_PUSH_ENABLED_KEY, value },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'NOTIFICATION_SETTINGS_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { ...(dto.emailEnabled !== undefined ? { emailEnabled: dto.emailEnabled } : {}), ...(dto.pushEnabled !== undefined ? { pushEnabled: dto.pushEnabled } : {}) },
      },
    });

    return this.get();
  }
}
