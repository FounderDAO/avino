import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Тело `PATCH /api/v1/admin/listings/:id/translations/:language` (ADR-0091).
 * Ручная правка перевода модератором; ставит is_auto_translated=false.
 */
export class UpdateModeratorTranslationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  address_note?: string;

  @IsOptional()
  @IsString()
  features_text?: string;
}
