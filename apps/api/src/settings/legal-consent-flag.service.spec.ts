import { LegalConsentFlagService } from './legal-consent-flag.service';

describe('LegalConsentFlagService', () => {
  const prisma = {
    appSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const config = { get: jest.fn() };
  let service: LegalConsentFlagService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((k: string) =>
      k === 'legalConsent.required' ? false : k === 'legalConsent.version' ? 1 : undefined,
    );
    service = new LegalConsentFlagService(prisma as never, config as never);
  });

  it('isRequired() returns stored value over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'true' });
    expect(await service.isRequired()).toBe(true);
  });

  it('isRequired() falls back to env default when DB throws', async () => {
    prisma.appSetting.findUnique.mockRejectedValue(new Error('db down'));
    expect(await service.isRequired()).toBe(false);
  });

  it('currentVersion() returns stored integer over env default', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: '4' });
    expect(await service.currentVersion()).toBe(4);
  });

  it('currentVersion() falls back to env default (1) when unset', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);
    expect(await service.currentVersion()).toBe(1);
  });

  it('setRequired() upserts string value + writes audit', async () => {
    expect(await service.setRequired('admin1', true)).toBe(true);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'legal_consent_required' },
        update: { value: 'true' },
        create: { key: 'legal_consent_required', value: 'true' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'LEGAL_CONSENT_REQUIRED_UPDATE',
          metadata: { required: true },
        }),
      }),
    );
  });

  it('setVersion() upserts string value + writes audit', async () => {
    expect(await service.setVersion('admin1', 2)).toBe(2);
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'legal_consent_version' },
        update: { value: '2' },
        create: { key: 'legal_consent_version', value: '2' },
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'admin1',
          action: 'LEGAL_CONSENT_VERSION_UPDATE',
          metadata: { version: 2 },
        }),
      }),
    );
  });
});
