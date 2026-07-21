import { IsOptional, IsString } from 'class-validator';

/** Тело PATCH /admin/legal-documents/:id — тексты черновика (любое подмножество). */
export class UpdateLegalDocumentDto {
  @IsOptional() @IsString() title_ru?: string;
  @IsOptional() @IsString() title_uz?: string;
  @IsOptional() @IsString() title_en?: string;
  @IsOptional() @IsString() body_md_ru?: string;
  @IsOptional() @IsString() body_md_uz?: string;
  @IsOptional() @IsString() body_md_en?: string;
}
