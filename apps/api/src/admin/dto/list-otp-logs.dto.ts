import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query-параметры `GET /api/v1/admin/otp-logs` — журнал OTP-запросов.
 *
 * `destination` — substring-поиск по контакту (телефон/email): ключевой
 * сценарий поддержки «SMS не пришла». Page-based пагинация (1-based)
 * с обязательным `meta.total` (API.md §4).
 */
export class ListOtpLogsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  destination?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
