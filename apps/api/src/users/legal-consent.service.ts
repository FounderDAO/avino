import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { LegalConsentFlagService } from '../settings';
import { AcceptLegalConsentDto } from './dto/accept-legal-consent.dto';

/** Состояние согласия — та же форма, что `MeResponse.legal_consent`. */
export interface LegalConsentState {
  accepted_version: number | null;
  accepted_at: string | null;
}

/**
 * Запись согласия пользователя с Правилами и Политикой (design 2026-06-29).
 * Обе галочки обязательны → иначе 422 CONSENT_INCOMPLETE. Версия берётся из
 * LegalConsentFlagService.currentVersion(); каждое согласие — новая строка
 * legal_consents (append-only аудит) + запись в audit_log.
 */
@Injectable()
export class LegalConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: LegalConsentFlagService,
  ) {}

  async record(
    userId: string,
    dto: AcceptLegalConsentDto,
  ): Promise<LegalConsentState> {
    if (!dto.terms_accepted || !dto.privacy_accepted) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.CONSENT_INCOMPLETE,
        message: 'Both terms and privacy must be accepted',
      });
    }
    const version = await this.flags.currentVersion();
    const row = await this.prisma.legalConsent.create({
      data: { userId, version },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'LEGAL_CONSENT_ACCEPTED',
        entityType: 'legal_consent',
        entityId: row.id,
        metadata: { version },
      },
    });
    return {
      accepted_version: row.version,
      accepted_at: row.acceptedAt.toISOString(),
    };
  }
}
