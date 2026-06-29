import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/** Тело `PATCH /api/v1/admin/legal-consent-flag`. Любое подмножество полей. */
export class UpdateLegalConsentFlagDto {
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
