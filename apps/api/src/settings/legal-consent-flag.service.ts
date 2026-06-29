import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  LEGAL_CONSENT_REQUIRED_KEY,
  LEGAL_CONSENT_VERSION_KEY,
  resolveLegalConsentRequired,
  resolveLegalConsentVersion,
} from './legal-consent-flag.constants';

/**
 * Runtime-настройки согласия с юр-документами. Хранит две строки в app_settings:
 * legal_consent_required (булева) и legal_consent_version (целое). Читается
 * публичным PublicSettingsController и admin-тогглом без пересборки. Резолюция
 * (DB-строка > env-дефолт) — чистые функции. Зеркалит PromotionsFlagService.
 */
@Injectable()
export class LegalConsentFlagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Требуется ли согласие. DB-ошибка → безопасный env-дефолт. */
  async isRequired(): Promise<boolean> {
    const envDefault = this.config.get<boolean>('legalConsent.required') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: LEGAL_CONSENT_REQUIRED_KEY },
      });
      return resolveLegalConsentRequired(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Текущая требуемая версия документов. DB-ошибка → env-дефолт. */
  async currentVersion(): Promise<number> {
    const envDefault = this.config.get<number>('legalConsent.version') ?? 1;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: LEGAL_CONSENT_VERSION_KEY },
      });
      return resolveLegalConsentVersion(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Включить/выключить требование (ADMIN). Пишет app_settings + audit-log. */
  async setRequired(adminId: string, required: boolean): Promise<boolean> {
    const value = String(required);
    await this.prisma.appSetting.upsert({
      where: { key: LEGAL_CONSENT_REQUIRED_KEY },
      update: { value },
      create: { key: LEGAL_CONSENT_REQUIRED_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'LEGAL_CONSENT_REQUIRED_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { required },
      },
    });
    return required;
  }

  /** Установить текущую версию документов (ADMIN). Пишет app_settings + audit. */
  async setVersion(adminId: string, version: number): Promise<number> {
    const value = String(version);
    await this.prisma.appSetting.upsert({
      where: { key: LEGAL_CONSENT_VERSION_KEY },
      update: { value },
      create: { key: LEGAL_CONSENT_VERSION_KEY, value },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'LEGAL_CONSENT_VERSION_UPDATE',
        entityType: 'app_setting',
        entityId: null,
        metadata: { version },
      },
    });
    return version;
  }
}
