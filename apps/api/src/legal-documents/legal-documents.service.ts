import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { LegalDocKind, LegalDocStatus, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { LegalConsentFlagService } from '../settings';

/** Метаданные версии (admin list, без тел). */
export interface LegalDocumentMetaResponse {
  id: string;
  kind: 'TERMS' | 'PRIVACY';
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Полный документ (admin, все 3 локали). */
export interface LegalDocumentResponse extends LegalDocumentMetaResponse {
  title_ru: string;
  title_uz: string;
  title_en: string;
  body_md_ru: string;
  body_md_uz: string;
  body_md_en: string;
}

/** Публичный контракт GET /legal/:kind — одна локаль по Accept-Language. */
export interface PublicLegalDocResponse {
  kind: 'terms' | 'privacy';
  version: number;
  title: string;
  body_md: string;
  published_at: string;
}

export interface UpdateLegalDraftInput {
  title_ru?: string;
  title_uz?: string;
  title_en?: string;
  body_md_ru?: string;
  body_md_uz?: string;
  body_md_en?: string;
}

type Row = Prisma.LegalDocumentGetPayload<Record<string, never>>;

/** `uz*` → uz, `en*` → en, иначе ru (правило Accept-Language проекта). */
function pickLocale(lang: string): 'ru' | 'uz' | 'en' {
  const l = lang.toLowerCase();
  if (l.startsWith('uz')) return 'uz';
  if (l.startsWith('en')) return 'en';
  return 'ru';
}

/**
 * LegalDocumentsService — версионируемые юр-документы (спека 2026-07-21).
 * Draft/publish-флоу: на kind ≤1 DRAFT (version 0) и ≤1 PUBLISHED; публикация
 * архивирует предыдущий PUBLISHED, назначает version=max+1 и (по чекбоксу)
 * бампает app_settings.legal_consent_version через LegalConsentFlagService.
 */
@Injectable()
export class LegalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalConsentFlag: LegalConsentFlagService,
  ) {}

  async getPublished(kind: LegalDocKind, lang: string): Promise<PublicLegalDocResponse> {
    const doc = await this.prisma.legalDocument.findFirst({
      where: { kind, status: LegalDocStatus.PUBLISHED },
    });
    if (!doc || !doc.publishedAt) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Опубликованных версий документа нет',
      });
    }
    const locale = pickLocale(lang);
    const title = { ru: doc.titleRu, uz: doc.titleUz, en: doc.titleEn }[locale];
    const bodyMd = { ru: doc.bodyMdRu, uz: doc.bodyMdUz, en: doc.bodyMdEn }[locale];
    return {
      kind: kind === LegalDocKind.TERMS ? 'terms' : 'privacy',
      version: doc.version,
      title,
      body_md: bodyMd,
      published_at: doc.publishedAt.toISOString(),
    };
  }

  async listAll(kind?: LegalDocKind): Promise<LegalDocumentMetaResponse[]> {
    const rows = await this.prisma.legalDocument.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { version: 'desc' }],
    });
    return rows.map((r) => this.toMeta(r));
  }

  async getById(id: string): Promise<LegalDocumentResponse> {
    return this.toFull(await this.mustFind(id));
  }

  async createDraft(adminId: string, kind: LegalDocKind): Promise<LegalDocumentResponse> {
    const draft = await this.prisma.legalDocument.findFirst({
      where: { kind, status: LegalDocStatus.DRAFT },
      select: { id: true },
    });
    if (draft) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.LEGAL_DRAFT_EXISTS,
        message: 'Черновик этого документа уже существует',
      });
    }
    const published = await this.prisma.legalDocument.findFirst({
      where: { kind, status: LegalDocStatus.PUBLISHED },
    });
    try {
      const row = await this.prisma.legalDocument.create({
        data: {
          kind,
          createdById: adminId,
          titleRu: published?.titleRu ?? '',
          titleUz: published?.titleUz ?? '',
          titleEn: published?.titleEn ?? '',
          bodyMdRu: published?.bodyMdRu ?? '',
          bodyMdUz: published?.bodyMdUz ?? '',
          bodyMdEn: published?.bodyMdEn ?? '',
        },
      });
      return this.toFull(row);
    } catch (error) {
      // Гонка: два параллельных createDraft — unique(kind, version=0) отдаёт P2002.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UnprocessableEntityException({
          code: ApiErrorCode.LEGAL_DRAFT_EXISTS,
          message: 'Черновик этого документа уже существует',
        });
      }
      throw error;
    }
  }

  async updateDraft(id: string, dto: UpdateLegalDraftInput): Promise<LegalDocumentResponse> {
    await this.mustBeDraft(id);
    const row = await this.prisma.legalDocument.update({
      where: { id },
      data: {
        ...(dto.title_ru !== undefined && { titleRu: dto.title_ru }),
        ...(dto.title_uz !== undefined && { titleUz: dto.title_uz }),
        ...(dto.title_en !== undefined && { titleEn: dto.title_en }),
        ...(dto.body_md_ru !== undefined && { bodyMdRu: dto.body_md_ru }),
        ...(dto.body_md_uz !== undefined && { bodyMdUz: dto.body_md_uz }),
        ...(dto.body_md_en !== undefined && { bodyMdEn: dto.body_md_en }),
      },
    });
    return this.toFull(row);
  }

  async publish(adminId: string, id: string, requiresConsent: boolean): Promise<LegalDocumentResponse> {
    const draft = await this.mustBeDraft(id);
    const missing = (
      [
        ['title_ru', draft.titleRu],
        ['title_uz', draft.titleUz],
        ['title_en', draft.titleEn],
        ['body_md_ru', draft.bodyMdRu],
        ['body_md_uz', draft.bodyMdUz],
        ['body_md_en', draft.bodyMdEn],
      ] as const
    )
      .filter(([, v]) => v.trim() === '')
      .map(([k]) => k);
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.LEGAL_TRANSLATIONS_INCOMPLETE,
        message: `Для публикации заполните все локали: ${missing.join(', ')}`,
      });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const max = await tx.legalDocument.aggregate({
        _max: { version: true },
        where: { kind: draft.kind },
      });
      await tx.legalDocument.updateMany({
        where: { kind: draft.kind, status: LegalDocStatus.PUBLISHED },
        data: { status: LegalDocStatus.ARCHIVED },
      });
      return tx.legalDocument.update({
        where: { id },
        data: {
          status: LegalDocStatus.PUBLISHED,
          version: (max._max.version ?? 0) + 1,
          publishedAt: new Date(),
        },
      });
    });
    // Бамп версии согласия — вне транзакции (setVersion пишет app_settings +
    // audit сам); при падении здесь документ уже опубликован — допустимо,
    // админ повторит бамп из настроек.
    if (requiresConsent) {
      const current = await this.legalConsentFlag.currentVersion();
      await this.legalConsentFlag.setVersion(adminId, current + 1);
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'LEGAL_DOCUMENT_PUBLISH',
        entityType: 'legal_document',
        entityId: id,
        metadata: { kind: row.kind, version: row.version, requiresConsent },
      },
    });
    return this.toFull(row);
  }

  async deleteDraft(id: string): Promise<void> {
    await this.mustBeDraft(id);
    await this.prisma.legalDocument.delete({ where: { id } });
  }

  private async mustFind(id: string): Promise<Row> {
    const row = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Документ не найден' });
    }
    return row;
  }

  private async mustBeDraft(id: string): Promise<Row> {
    const row = await this.mustFind(id);
    if (row.status !== LegalDocStatus.DRAFT) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.LEGAL_NOT_DRAFT,
        message: 'Изменять можно только черновик — опубликованные версии неизменяемы',
      });
    }
    return row;
  }

  private toMeta(r: Row): LegalDocumentMetaResponse {
    return {
      id: r.id,
      kind: r.kind,
      version: r.version,
      status: r.status,
      published_at: r.publishedAt?.toISOString() ?? null,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
    };
  }

  private toFull(r: Row): LegalDocumentResponse {
    return {
      ...this.toMeta(r),
      title_ru: r.titleRu,
      title_uz: r.titleUz,
      title_en: r.titleEn,
      body_md_ru: r.bodyMdRu,
      body_md_uz: r.bodyMdUz,
      body_md_en: r.bodyMdEn,
    };
  }
}
