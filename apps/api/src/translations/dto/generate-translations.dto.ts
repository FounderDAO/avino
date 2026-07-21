import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Тело `POST /api/v1/admin/listings/:id/translations/generate` (ADR-0091).
 *
 * `force=true` — перегенерировать целевые языки машинным переводом, даже если
 * строка помечена ручной правкой (`is_auto_translated=false`). Без `force`
 * такие строки сохраняются (прежнее поведение). Оригинальный язык объявления
 * (`original_language`) не переводится и не перезаписывается ни при каком `force`.
 */
export class GenerateTranslationsDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
