import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  PROMOTIONS_ENABLED_KEY,
  resolvePromotionsEnabled,
} from './promotions-flag.constants';

/**
 * Runtime-флаг доступности продвижения объявлений. Хранит булеву строку в
 * app_settings (ключ promotions_enabled); читается публичным
 * PublicSettingsController и admin-тогглом без пересборки. Резолюция
 * (DB-строка > env-дефолт `promotion.enabled`, default false) — общая чистая
 * функция. Зеркалит AdminSmsSettingsService/SmsService.isEnabled.
 */
@Injectable()
export class PromotionsFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Текущее значение флага. DB-ошибка → безопасный env-дефолт (кнопка скрыта). */
  async isEnabled(): Promise<boolean> {
    const envDefault = this.config.get<boolean>('promotion.enabled') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: PROMOTIONS_ENABLED_KEY },
      });
      return resolvePromotionsEnabled(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Включить/выключить продвижение (ADMIN). Пишет app_settings + audit-log. */
  async setEnabled(adminId: string, enabled: boolean): Promise<boolean> {
    const value = String(enabled);
    await this.prisma.appSetting.upsert({
      where: { key: PROMOTIONS_ENABLED_KEY },
      update: { value },
      create: { key: PROMOTIONS_ENABLED_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PROMOTIONS_FLAG_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { enabled },
      },
    });
    return enabled;
  }
}
