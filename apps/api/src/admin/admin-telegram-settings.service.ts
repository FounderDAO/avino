import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  TELEGRAM_NOTIFICATIONS_ENABLED_KEY,
  resolveNotificationsEnabled,
} from '../telegram';
import { UpdateTelegramSettingsDto } from './dto/update-telegram-settings.dto';

export interface TelegramSettingsView {
  notificationsEnabled: boolean;
}

/**
 * Runtime-тоггл Telegram-алертов (ADMIN). Хранит булеву строку в app_settings;
 * её читает TelegramService на каждом алерте — переключение без пересборки.
 * Резолюция (DB-строка > env-дефолт) общая с TelegramService.isEnabled.
 */
@Injectable()
export class AdminTelegramSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async get(): Promise<TelegramSettingsView> {
    const envDefault =
      this.config.get<boolean>('telegram.notificationStateDefault') ?? false;
    const row = await this.prisma.appSetting.findUnique({
      where: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY },
    });
    return {
      notificationsEnabled: resolveNotificationsEnabled(row?.value, envDefault),
    };
  }

  async update(
    adminId: string,
    dto: UpdateTelegramSettingsDto,
  ): Promise<TelegramSettingsView> {
    const value = String(dto.enabled);
    await this.prisma.appSetting.upsert({
      where: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY },
      update: { value },
      create: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'TELEGRAM_SETTINGS_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { enabled: dto.enabled },
      },
    });
    return { notificationsEnabled: dto.enabled };
  }
}
