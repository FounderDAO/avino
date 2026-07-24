import { Language } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Тело `PATCH /api/v1/admin/listings/:id/original` (ADR-0156).
 *
 * Правка авторского оригинала модератором: сам текст + язык, на котором он
 * написан. Единственный путь исправить листинг, у которого автор выбрал неверный
 * язык оригинала (написал по-русски, пометил как EN) — метка чинится сменой
 * `original_language`, а не правкой строки перевода (та по-прежнему 422, ADR-0091).
 */
export class UpdateOriginalListingDto {
  /** Язык, на котором реально написан авторский текст (может отличаться от текущего). */
  @IsEnum(Language)
  original_language!: Language;

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
