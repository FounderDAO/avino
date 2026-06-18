import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { SMS_ENABLED_KEY, resolveSmsEnabled } from '../sms';
import { UpdateSmsSettingsDto } from './dto/update-sms-settings.dto';

export interface SmsSettingsView {
  smsEnabled: boolean;
}

/**
 * Runtime-тоггл отправки SMS (ADMIN). Хранит булеву строку в app_settings;
 * её читает SmsService.isEnabled на каждом запросе OTP — переключение без
 * пересборки. Резолюция (DB-строка > env-дефолт) общая с SmsService.isEnabled.
 * Зеркалит AdminTelegramSettingsService.
 */
@Injectable()
export class AdminSmsSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async get(): Promise<SmsSettingsView> {
    const envDefault = this.config.get<boolean>('sms.enabled') ?? true;
    const row = await this.prisma.appSetting.findUnique({
      where: { key: SMS_ENABLED_KEY },
    });
    return { smsEnabled: resolveSmsEnabled(row?.value, envDefault) };
  }

  async update(
    adminId: string,
    dto: UpdateSmsSettingsDto,
  ): Promise<SmsSettingsView> {
    const value = String(dto.enabled);
    await this.prisma.appSetting.upsert({
      where: { key: SMS_ENABLED_KEY },
      update: { value },
      create: { key: SMS_ENABLED_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'SMS_SETTINGS_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { enabled: dto.enabled },
      },
    });
    return { smsEnabled: dto.enabled };
  }
}
