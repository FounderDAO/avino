import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  MAP_HOVER_RECENTER_KEY,
  resolveMapHoverRecenter,
} from './map-hover-recenter-flag.constants';

/**
 * Runtime-флаг центрирования карты при наведении на карточку (/search). Хранит
 * булеву строку в app_settings (ключ map_hover_recenter); читается публичным
 * PublicSettingsController и admin-тогглом без пересборки. Резолюция (DB-строка
 * > env-дефолт `mapHoverRecenter.enabled`, default false). Зеркалит
 * PromotionsFlagService.
 */
@Injectable()
export class MapHoverRecenterFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Текущее значение флага. DB-ошибка → безопасный env-дефолт (false). */
  async isEnabled(): Promise<boolean> {
    const envDefault =
      this.config.get<boolean>('mapHoverRecenter.enabled') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: MAP_HOVER_RECENTER_KEY },
      });
      return resolveMapHoverRecenter(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Включить/выключить центрирование (ADMIN). Пишет app_settings + audit-log. */
  async setEnabled(adminId: string, enabled: boolean): Promise<boolean> {
    const value = String(enabled);
    await this.prisma.appSetting.upsert({
      where: { key: MAP_HOVER_RECENTER_KEY },
      update: { value },
      create: { key: MAP_HOVER_RECENTER_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'MAP_HOVER_RECENTER_FLAG_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { enabled },
      },
    });
    return enabled;
  }
}
