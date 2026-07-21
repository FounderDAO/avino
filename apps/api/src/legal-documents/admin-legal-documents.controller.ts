import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe,
  Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@avino/shared';
import { LegalDocKind } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import {
  LegalDocumentMetaResponse, LegalDocumentResponse, LegalDocumentsService,
} from './legal-documents.service';
import { CreateLegalDocumentDto } from './dto/create-legal-document.dto';
import { UpdateLegalDocumentDto } from './dto/update-legal-document.dto';
import { PublishLegalDocumentDto } from './dto/publish-legal-document.dto';

/**
 * AdminLegalDocumentsController — управление версиями юр-документов.
 * Роуты `/api/v1/admin/legal-documents`, регистрируется в {@link AdminModule}.
 * Изменяем только DRAFT; publish архивирует прежний PUBLISHED и (по чекбоксу)
 * бампает версию согласия.
 */
@Controller({ path: 'admin/legal-documents', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminLegalDocumentsController {
  constructor(private readonly legalDocuments: LegalDocumentsService) {}

  /** `GET /admin/legal-documents?kind=` — версии (метаданные, без тел). */
  @Get()
  @ApiQuery({
    name: 'kind',
    required: false,
    enum: LegalDocKind,
    description: 'Фильтр по типу документа (TERMS или PRIVACY); без параметра возвращаются все',
  })
  list(@Query('kind') kind?: LegalDocKind): Promise<LegalDocumentMetaResponse[]> {
    return this.legalDocuments.listAll(kind);
  }

  /** `GET /admin/legal-documents/:id` — полный документ (3 локали). */
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<LegalDocumentResponse> {
    return this.legalDocuments.getById(id);
  }

  /** `POST /admin/legal-documents` — черновик (префилл из PUBLISHED). 422 LEGAL_DRAFT_EXISTS. */
  @Post()
  create(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateLegalDocumentDto,
  ): Promise<LegalDocumentResponse> {
    return this.legalDocuments.createDraft(adminId, dto.kind);
  }

  /** `PATCH /admin/legal-documents/:id` — тексты черновика. 422 LEGAL_NOT_DRAFT. */
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLegalDocumentDto,
  ): Promise<LegalDocumentResponse> {
    return this.legalDocuments.updateDraft(id, dto);
  }

  /** `POST /admin/legal-documents/:id/publish` — публикация. 422 LEGAL_TRANSLATIONS_INCOMPLETE. */
  @Post(':id/publish')
  publish(
    @CurrentUser('id') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishLegalDocumentDto,
  ): Promise<LegalDocumentResponse> {
    return this.legalDocuments.publish(adminId, id, dto.requires_consent);
  }

  /** `DELETE /admin/legal-documents/:id` — удалить черновик. 422 LEGAL_NOT_DRAFT. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.legalDocuments.deleteDraft(id);
  }
}
