import { IsEnum } from 'class-validator';
import { LegalDocKind } from '@prisma/client';

/** Тело POST /admin/legal-documents — создать черновик документа. */
export class CreateLegalDocumentDto {
  @IsEnum(LegalDocKind)
  kind!: LegalDocKind;
}
