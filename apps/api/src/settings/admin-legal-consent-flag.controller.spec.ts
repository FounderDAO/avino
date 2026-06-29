import { AdminLegalConsentFlagController } from './admin-legal-consent-flag.controller';

describe('AdminLegalConsentFlagController', () => {
  function build() {
    const flags: any = {
      isRequired: jest.fn().mockResolvedValue(false),
      currentVersion: jest.fn().mockResolvedValue(1),
      setRequired: jest.fn().mockResolvedValue(true),
      setVersion: jest.fn().mockResolvedValue(2),
    };
    return { flags, controller: new AdminLegalConsentFlagController(flags) };
  }

  it('GET returns current required + version', async () => {
    const { controller } = build();
    expect(await controller.get()).toEqual({
      legalConsentRequired: false,
      legalConsentVersion: 1,
    });
  });

  it('PATCH sets required when provided', async () => {
    const { flags, controller } = build();
    await controller.update('admin-1', { required: true });
    expect(flags.setRequired).toHaveBeenCalledWith('admin-1', true);
    expect(flags.setVersion).not.toHaveBeenCalled();
  });

  it('PATCH sets version when provided', async () => {
    const { flags, controller } = build();
    await controller.update('admin-1', { version: 2 });
    expect(flags.setVersion).toHaveBeenCalledWith('admin-1', 2);
    expect(flags.setRequired).not.toHaveBeenCalled();
  });

  it('PATCH returns the re-read state', async () => {
    const { flags, controller } = build();
    flags.isRequired.mockResolvedValue(true);
    flags.currentVersion.mockResolvedValue(2);
    expect(await controller.update('admin-1', { required: true, version: 2 })).toEqual({
      legalConsentRequired: true,
      legalConsentVersion: 2,
    });
  });
});
