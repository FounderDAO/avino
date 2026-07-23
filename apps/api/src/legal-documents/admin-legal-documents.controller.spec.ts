import { LegalDocKind } from '@prisma/client';
import { LegalDocumentsService } from './legal-documents.service';
import { AdminLegalDocumentsController } from './admin-legal-documents.controller';

describe('AdminLegalDocumentsController', () => {
  const service = {
    listAll: jest.fn(), getById: jest.fn(), createDraft: jest.fn(),
    updateDraft: jest.fn(), publish: jest.fn(), deleteDraft: jest.fn(),
  };
  const controller = new AdminLegalDocumentsController(service as unknown as LegalDocumentsService);

  it('делегирует list/get/create/update/publish/delete сервису', async () => {
    await controller.list(LegalDocKind.TERMS);
    expect(service.listAll).toHaveBeenCalledWith(LegalDocKind.TERMS);
    await controller.get('doc-1');
    expect(service.getById).toHaveBeenCalledWith('doc-1');
    await controller.create('admin-1', { kind: LegalDocKind.PRIVACY });
    expect(service.createDraft).toHaveBeenCalledWith('admin-1', LegalDocKind.PRIVACY);
    await controller.update('doc-1', { title_ru: 'Т' });
    expect(service.updateDraft).toHaveBeenCalledWith('doc-1', { title_ru: 'Т' });
    await controller.publish('admin-1', 'doc-1', { requires_consent: true });
    expect(service.publish).toHaveBeenCalledWith('admin-1', 'doc-1', true);
    await controller.remove('doc-1');
    expect(service.deleteDraft).toHaveBeenCalledWith('doc-1');
  });
});
