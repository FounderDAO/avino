import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Тело `POST /api/v1/tour-requests`. snake_case контракт. */
export class CreateTourRequestDto {
  @IsUUID()
  listing_id!: string;

  @Matches(DATE_RE, { message: 'requested_date must be YYYY-MM-DD' })
  requested_date!: string;

  @Matches(HHMM_RE, { message: 'window_start must be HH:MM' })
  window_start!: string;

  @Matches(HHMM_RE, { message: 'window_end must be HH:MM' })
  window_end!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  requester_name!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  requester_phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
