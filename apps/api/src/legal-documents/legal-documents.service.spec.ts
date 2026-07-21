import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { LegalDocKind, LegalDocStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { LegalConsentFlagService } from '../settings';
import { LegalDocumentsService } from './legal-documents.service';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  kind: LegalDocKind.TERMS,
  version: 0,
  status: LegalDocStatus.DRAFT,
  titleRu: 'Правила',
  titleUz: 'Qoidalar',
  titleEn: 'Terms',
  bodyMdRu: '## A {#a}\nтекст',
  bodyMdUz: '## A {#a}\nmatn',
  bodyMdEn: '## A {#a}\ntext',
  publishedAt: null,
  createdById: 'admin-1',
  createdAt: new Date('2026-07-21T00:00:00Z'),
  updatedAt: new Date('2026-07-21T00:00:00Z'),
  ...over,
});

describe('LegalDocumentsService', () => {
  let prisma: {
    legalDocument: Record<string, jest.Mock>;
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let consent: { currentVersion: jest.Mock; setVersion: jest.Mock };
  let service: LegalDocumentsService;

  beforeEach(() => {
    prisma = {
      legalDocument: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    consent = { currentVersion: jest.fn().mockResolvedValue(3), setVersion: jest.fn() };
    service = new LegalDocumentsService(
      prisma as unknown as PrismaService,
      consent as unknown as LegalConsentFlagService,
    );
  });

  it('getPublished: отдаёт локаль по Accept-Language и lowercase kind', async () => {
    prisma.legalDocument.findFirst.mockResolvedValue(
      row({ status: LegalDocStatus.PUBLISHED, version: 2, publishedAt: new Date('2026-07-21T10:00:00Z') }),
    );
    const doc = await service.getPublished(LegalDocKind.TERMS, 'uz-UZ');
    expect(doc).toEqual({
      kind: 'terms',
      version: 2,
      title: 'Qoidalar',
      body_md: '## A {#a}\nmatn',
      published_at: '2026-07-21T10:00:00.000Z',
    });
  });

  it('getPublished: нет публикации → 404', async () => {
    prisma.legalDocument.findFirst.mockResolvedValue(null);
    await expect(service.getPublished(LegalDocKind.PRIVACY, 'ru')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('createDraft: существующий DRAFT → 422 LEGAL_DRAFT_EXISTS', async () => {
    prisma.legalDocument.findFirst.mockResolvedValue(row());
    await expect(service.createDraft('admin-1', LegalDocKind.TERMS)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('createDraft: префилл из PUBLISHED — все 6 полей скопированы', async () => {
    const pubRow = row({
      status: LegalDocStatus.PUBLISHED,
      version: 2,
      titleRu: 'Старые Правила',
      titleUz: 'Eski Qoidalar',
      titleEn: 'Old Terms',
      bodyMdRu: '## Старый текст',
      bodyMdUz: '## Eski matn',
      bodyMdEn: '## Old text',
    });
    prisma.legalDocument.findFirst
      .mockResolvedValueOnce(null) // нет драфта
      .mockResolvedValueOnce(pubRow); // published
    prisma.legalDocument.create.mockResolvedValue(row());
    await service.createDraft('admin-1', LegalDocKind.TERMS);
    expect(prisma.legalDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: LegalDocKind.TERMS,
          createdById: 'admin-1',
          titleRu: 'Старые Правила',
          titleUz: 'Eski Qoidalar',
          titleEn: 'Old Terms',
          bodyMdRu: '## Старый текст',
          bodyMdUz: '## Eski matn',
          bodyMdEn: '## Old text',
        }),
      }),
    );
  });

  it('updateDraft: не DRAFT → 422 LEGAL_NOT_DRAFT', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row({ status: LegalDocStatus.PUBLISHED }));
    await expect(service.updateDraft('doc-1', { title_ru: 'x' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('publish: неполные локали → 422 LEGAL_TRANSLATIONS_INCOMPLETE', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row({ bodyMdEn: '  ' }));
    await expect(service.publish('admin-1', 'doc-1', false)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LEGAL_TRANSLATIONS_INCOMPLETE' }),
    });
  });

  it('publish: архивирует текущий PUBLISHED, ставит version=max+1, без чекбокса согласие не трогает', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row());
    prisma.legalDocument.aggregate.mockResolvedValue({ _max: { version: 4 } });
    prisma.legalDocument.update.mockResolvedValue(
      row({ status: LegalDocStatus.PUBLISHED, version: 5, publishedAt: new Date() }),
    );
    await service.publish('admin-1', 'doc-1', false);
    expect(prisma.legalDocument.updateMany).toHaveBeenCalledWith({
      where: { kind: LegalDocKind.TERMS, status: LegalDocStatus.PUBLISHED },
      data: { status: LegalDocStatus.ARCHIVED },
    });
    expect(prisma.legalDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: expect.objectContaining({ status: LegalDocStatus.PUBLISHED, version: 5 }),
      }),
    );
    expect(consent.setVersion).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it('publish: с чекбоксом бампает legal_consent_version (current+1)', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row());
    prisma.legalDocument.aggregate.mockResolvedValue({ _max: { version: 0 } });
    prisma.legalDocument.update.mockResolvedValue(row({ status: LegalDocStatus.PUBLISHED, version: 1 }));
    await service.publish('admin-1', 'doc-1', true);
    expect(consent.setVersion).toHaveBeenCalledWith('admin-1', 4);
  });

  it('getById: happy path → возвращает полный snake_case-ответ', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row());
    const doc = await service.getById('doc-1');
    expect(doc).toEqual({
      id: 'doc-1',
      kind: LegalDocKind.TERMS,
      version: 0,
      status: LegalDocStatus.DRAFT,
      published_at: null,
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:00:00.000Z',
      title_ru: 'Правила',
      title_uz: 'Qoidalar',
      title_en: 'Terms',
      body_md_ru: '## A {#a}\nтекст',
      body_md_uz: '## A {#a}\nmatn',
      body_md_en: '## A {#a}\ntext',
    });
    expect(prisma.legalDocument.findUnique).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });

  it('getById: документ не найден → 404', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(null);
    await expect(service.getById('missing-id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('listAll: без фильтра — возвращает все документы с маппингом toMeta и orderBy', async () => {
    const docs = [
      row({ kind: LegalDocKind.PRIVACY, version: 2 }),
      row({ kind: LegalDocKind.TERMS, version: 1 }),
      row({ kind: LegalDocKind.TERMS, version: 0, status: LegalDocStatus.DRAFT }),
    ];
    prisma.legalDocument.findMany.mockResolvedValue(docs);
    const result = await service.listAll();
    expect(prisma.legalDocument.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ kind: 'asc' }, { version: 'desc' }],
    });
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: 'doc-1',
      kind: LegalDocKind.PRIVACY,
      version: 2,
      status: LegalDocStatus.DRAFT,
      published_at: null,
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T00:00:00.000Z',
    });
  });

  it('listAll: с фильтром kind — передаёт where {kind}', async () => {
    prisma.legalDocument.findMany.mockResolvedValue([row({ kind: LegalDocKind.TERMS })]);
    await service.listAll(LegalDocKind.TERMS);
    expect(prisma.legalDocument.findMany).toHaveBeenCalledWith({
      where: { kind: LegalDocKind.TERMS },
      orderBy: [{ kind: 'asc' }, { version: 'desc' }],
    });
  });

  it('updateDraft: поднабор полей — update вызывается ровно с переданными полями', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row());
    prisma.legalDocument.update.mockResolvedValue(row());
    await service.updateDraft('doc-1', { title_uz: 'Yangi Qoidalar', body_md_en: '## New text' });
    expect(prisma.legalDocument.update).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      data: {
        titleUz: 'Yangi Qoidalar',
        bodyMdEn: '## New text',
      },
    });
  });

  it('updateDraft: документ не найден → 404', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(null);
    await expect(service.updateDraft('missing-id', { title_ru: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deleteDraft: не DRAFT → 422; DRAFT удаляется', async () => {
    prisma.legalDocument.findUnique.mockResolvedValue(row({ status: LegalDocStatus.ARCHIVED }));
    await expect(service.deleteDraft('doc-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    prisma.legalDocument.findUnique.mockResolvedValue(row());
    await service.deleteDraft('doc-1');
    expect(prisma.legalDocument.delete).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
  });
});
