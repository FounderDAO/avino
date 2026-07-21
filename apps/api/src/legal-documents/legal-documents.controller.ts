import { Controller, Get, Headers, NotFoundException, Param } from '@nestjs/common';
import { LegalDocKind } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { LegalDocumentsService, PublicLegalDocResponse } from './legal-documents.service';

/**
 * URL-слаг → enum; всё прочее — 404 (слаг является частью пути).
 * Используем Object.create(null) чтобы слаги вида constructor/toString/hasOwnProperty
 * не пролезли мимо 404, наследуя свойства из Object.prototype.
 */
const KIND_BY_SLUG: Record<string, LegalDocKind> = Object.assign(Object.create(null), {
  terms: LegalDocKind.TERMS,
  privacy: LegalDocKind.PRIVACY,
});

/**
 * LegalDocumentsController — публичный текст юр-документов.
 * `GET /api/v1/legal/:kind` — опубликованная версия одной локали по
 * Accept-Language (`?lang` в проекте не используется). 404 — пока админ не
 * опубликовал ни одной версии (клиент падает на вшитый контент).
 */
@Controller({ path: 'legal', version: '1' })
export class LegalDocumentsController {
  constructor(private readonly legalDocuments: LegalDocumentsService) {}

  @Get(':kind')
  async get(
    @Param('kind') kind: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<PublicLegalDocResponse> {
    const mapped = KIND_BY_SLUG[kind];
    if (!mapped) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Неизвестный документ' });
    }
    return this.legalDocuments.getPublished(mapped, acceptLanguage ?? 'ru');
  }
}
