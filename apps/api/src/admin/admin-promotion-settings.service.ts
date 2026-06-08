import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { PromotionQueue } from '../queues/promotion.queue';
import {
  EXPIRY_PRESET_CRON,
  PROMOTION_EXPIRY_CRON_KEY,
  cronToHours,
} from '../promotions/promotion-expiry.cron';
import { UpdatePromotionSettingsDto } from './dto/update-promotion-settings.dto';

export interface PromotionSettingsView {
  expiryIntervalHours: 6 | 12;
}

@Injectable()
export class AdminPromotionSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: PromotionQueue,
  ) {}

  async get(): Promise<PromotionSettingsView> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: PROMOTION_EXPIRY_CRON_KEY },
    });
    return { expiryIntervalHours: row?.value ? cronToHours(row.value) : 12 };
  }

  async update(adminId: string, dto: UpdatePromotionSettingsDto): Promise<PromotionSettingsView> {
    const newCron = EXPIRY_PRESET_CRON[dto.expiryIntervalHours];
    const prev = await this.prisma.appSetting.findUnique({
      where: { key: PROMOTION_EXPIRY_CRON_KEY },
    });

    await this.prisma.appSetting.upsert({
      where: { key: PROMOTION_EXPIRY_CRON_KEY },
      update: { value: newCron },
      create: { key: PROMOTION_EXPIRY_CRON_KEY, value: newCron },
    });
    await this.queue.rescheduleExpiry(newCron);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'PROMOTION_SETTINGS_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { old_cron: prev?.value ?? null, new_cron: newCron },
      },
    });
    return { expiryIntervalHours: dto.expiryIntervalHours };
  }
}
