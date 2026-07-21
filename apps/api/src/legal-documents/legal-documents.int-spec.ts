import { ConfigService } from '@nestjs/config';
import { LegalDocKind, LegalDocStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { LegalConsentFlagService } from '../settings';
import { LegalDocumentsService } from './legal-documents.service';

/**
 * Integration-тесты юр-документов (спека 2026-07-21) на живом PostgreSQL.
 * Полный цикл: createDraft → updateDraft → publish (v1) → getPublished →
 * новый draft → publish с requiresConsent (v2, прежний ARCHIVED, бамп
 * legal_consent_version). Изоляция: таблица legal_documents чистится ЦЕЛИКОМ
 * в before/afterAll (тест «404 до публикации» требует пустую таблицу) — на
 * локальной dev-БД прогон удалит созданные вручную документы; версия согласия
 * восстанавливается в afterAll.
 */
describe('LegalDocumentsService (integration)', () => {
  const prisma = new PrismaService();
  const consent = new LegalConsentFlagService(
    prisma,
    { get: () => undefined } as unknown as ConfigService,
  );
  const service = new LegalDocumentsService(prisma, consent);
  let adminId: string;
  let consentVersionBefore: number;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.legalDocument.deleteMany({});
    const admin = await prisma.user.create({ data: { phone: '+998900000901' } });
    adminId = admin.id;
    consentVersionBefore = await consent.currentVersion();
  });

  afterAll(async () => {
    await prisma.legalDocument.deleteMany({});
    await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
    await prisma.appSetting.upsert({
      where: { key: 'legal_consent_version' },
      update: { value: String(consentVersionBefore) },
      create: { key: 'legal_consent_version', value: String(consentVersionBefore) },
    });
    await prisma.user.delete({ where: { id: adminId } });
    await prisma.$disconnect();
  });

  it('до публикации getPublished → 404', async () => {
    await expect(service.getPublished(LegalDocKind.TERMS, 'ru')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('полный цикл draft → publish v1 → второй draft → publish v2 c бампом согласия', async () => {
    const draft = await service.createDraft(adminId, LegalDocKind.TERMS);
    expect(draft.status).toBe('DRAFT');
    expect(draft.version).toBe(0);

    await service.updateDraft(draft.id, {
      title_ru: 'Правила', title_uz: 'Qoidalar', title_en: 'Terms',
      body_md_ru: '## Общие {#g}\nтекст', body_md_uz: '## Umumiy {#g}\nmatn',
      body_md_en: '## General {#g}\ntext',
    });

    const v1 = await service.publish(adminId, draft.id, false);
    expect(v1.status).toBe('PUBLISHED');
    expect(v1.version).toBe(1);
    expect(await consent.currentVersion()).toBe(consentVersionBefore);

    const pub = await service.getPublished(LegalDocKind.TERMS, 'en');
    expect(pub).toMatchObject({ kind: 'terms', version: 1, title: 'Terms' });

    // Второй цикл: префилл из v1, публикация с чекбоксом.
    const draft2 = await service.createDraft(adminId, LegalDocKind.TERMS);
    expect(draft2.title_ru).toBe('Правила'); // префилл
    const v2 = await service.publish(adminId, draft2.id, true);
    expect(v2.version).toBe(2);
    expect(await consent.currentVersion()).toBe(consentVersionBefore + 1);

    const archived = await prisma.legalDocument.findUnique({
      where: { kind_version: { kind: LegalDocKind.TERMS, version: 1 } },
    });
    expect(archived?.status).toBe(LegalDocStatus.ARCHIVED);
  });

  it('второй черновик того же kind → 422', async () => {
    const d = await service.createDraft(adminId, LegalDocKind.PRIVACY);
    await expect(service.createDraft(adminId, LegalDocKind.PRIVACY)).rejects.toMatchObject({
      status: 422,
    });
    await service.deleteDraft(d.id);
  });
});
