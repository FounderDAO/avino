import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

/** Body `PATCH /api/v1/admin/amenities/:id` — правка лейблов, порядка,
 *  видимости. `code` неизменяем и здесь не принимается. */
export class UpdateAmenityDto {
  @IsOptional() @IsString() @Length(1, 80) label_ru?: string;
  @IsOptional() @IsString() @Length(1, 80) label_uz?: string;
  @IsOptional() @IsString() @Length(1, 80) label_en?: string;
  @IsOptional() @IsInt() @Min(0) sort_order?: number;
  @IsOptional() @IsBoolean() is_active?: boolean;
}
