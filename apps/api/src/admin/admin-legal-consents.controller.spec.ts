import { AdminLegalConsentsController } from './admin-legal-consents.controller';

/** Контроллер только пробрасывает query в сервис (guard-логика — интеграционно). */
describe('AdminLegalConsentsController', () => {
  it('list пробрасывает query, versions вызывает сервис', async () => {
    const service = {
      listConsents: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      listVersions: jest.fn().mockResolvedValue([]),
    } as any;
    const controller = new AdminLegalConsentsController(service);

    await controller.list({ version: 2 });
    await controller.versions();

    expect(service.listConsents).toHaveBeenCalledWith({ version: 2 });
    expect(service.listVersions).toHaveBeenCalled();
  });
});
