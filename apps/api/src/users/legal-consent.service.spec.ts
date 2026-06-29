import { UnprocessableEntityException } from '@nestjs/common';
import { LegalConsentService } from './legal-consent.service';
import { ApiErrorCode } from '../common/dto/error-response.dto';

describe('LegalConsentService', () => {
  const prisma = {
    legalConsent: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const flags = { currentVersion: jest.fn() };
  let service: LegalConsentService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new LegalConsentService(prisma as never, flags as never);
  });

  it('records consent at the current version + writes audit', async () => {
    flags.currentVersion.mockResolvedValue(2);
    prisma.legalConsent.create.mockResolvedValue({
      id: 'c1',
      version: 2,
      acceptedAt: new Date('2026-06-29T10:00:00.000Z'),
    });

    const result = await service.record('u1', {
      terms_accepted: true,
      privacy_accepted: true,
    });

    expect(prisma.legalConsent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', version: 2 },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'u1',
          action: 'LEGAL_CONSENT_ACCEPTED',
          entityId: 'c1',
          metadata: { version: 2 },
        }),
      }),
    );
    expect(result).toEqual({
      accepted_version: 2,
      accepted_at: '2026-06-29T10:00:00.000Z',
    });
  });

  it('throws 422 CONSENT_INCOMPLETE when a checkbox is false', async () => {
    const promise = service.record('u1', {
      terms_accepted: true,
      privacy_accepted: false,
    });
    await expect(promise).rejects.toBeInstanceOf(UnprocessableEntityException);
    try {
      await promise;
    } catch (e) {
      const res = (e as UnprocessableEntityException).getResponse() as { code: string };
      expect(res.code).toBe(ApiErrorCode.CONSENT_INCOMPLETE);
    }
    expect(prisma.legalConsent.create).not.toHaveBeenCalled();
  });
});
