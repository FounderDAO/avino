import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

/** Body `POST /api/v1/admin/amenities` — новое удобство. Лейблы обязательны на
 *  всех трёх языках; `code` опционален (иначе slug из label_en, UPPER_SNAKE). */
export class CreateAmenityDto {
  @IsString() @Length(1, 80) label_ru!: string;
  @IsString() @Length(1, 80) label_uz!: string;
  @IsString() @Length(1, 80) label_en!: string;

  @IsOptional() @IsString() @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'code: только A-Z, 0-9, _ (UPPER_SNAKE)',
  }) code?: string;

  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
