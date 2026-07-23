import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  ACTIVE_LISTING_LIMIT_KEY,
  resolveActiveListingLimit,
} from './active-listing-limit.constants';

/**
 * Runtime-лимит числа активных объявлений обычного клиента. Хранит целое
 * значение строкой в app_settings (ключ active_listing_limit); читается
 * ListingsService при создании и публичным PublicSettingsController, а меняется
 * admin-контроллером без пересборки. Резолюция (DB-строка > env-дефолт
 * `activeListingLimit.default`, default 2) — общая чистая функция. Зеркалит
 * {@link PromotionsFlagService}.
 *
 * Значение `0` = «без лимита». Профессионалов (AGENT/AGENCY) лимит не касается —
 * это решает вызывающий (ListingsService), сервис хранит только число.
 */
@Injectable()
export class ActiveListingLimitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Текущий лимит. DB-ошибка → безопасный env-дефолт. */
  async getLimit(): Promise<number> {
    const envDefault =
      this.config.get<number>('activeListingLimit.default') ?? 2;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: ACTIVE_LISTING_LIMIT_KEY },
      });
      return resolveActiveListingLimit(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Задать лимит (ADMIN). Пишет app_settings + audit-log. */
  async setLimit(adminId: string, limit: number): Promise<number> {
    const value = String(limit);
    await this.prisma.appSetting.upsert({
      where: { key: ACTIVE_LISTING_LIMIT_KEY },
      update: { value },
      create: { key: ACTIVE_LISTING_LIMIT_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ACTIVE_LISTING_LIMIT_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { limit },
      },
    });
    return limit;
  }
}
