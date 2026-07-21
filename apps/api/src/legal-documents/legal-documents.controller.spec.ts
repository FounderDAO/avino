import { NotFoundException } from '@nestjs/common';
import { LegalDocKind } from '@prisma/client';
import { LegalDocumentsService } from './legal-documents.service';
import { LegalDocumentsController } from './legal-documents.controller';

describe('LegalDocumentsController', () => {
  const service = { getPublished: jest.fn() };
  const controller = new LegalDocumentsController(service as unknown as LegalDocumentsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('маппит слаг terms/privacy на enum и передаёт Accept-Language', async () => {
    await controller.get('terms', 'uz');
    expect(service.getPublished).toHaveBeenCalledWith(LegalDocKind.TERMS, 'uz');
    await controller.get('privacy', undefined);
    expect(service.getPublished).toHaveBeenCalledWith(LegalDocKind.PRIVACY, 'ru');
  });

  it('неизвестный kind → 404', async () => {
    await expect(controller.get('cookies', 'ru')).rejects.toBeInstanceOf(NotFoundException);
  });
});
