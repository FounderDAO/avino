import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Body `POST /api/v1/complaints` (TASK-132, API.md §16).
 *
 * USER жалуется на листинг. `listing_id` — в теле (snake_case контракт), как и
 * у `POST /favorites`. `reason` ограничен 120 символами под колонку
 * `complaints.reason VARCHAR(120)` (DB_SCHEMA §7); `details` — опциональный
 * свободный текст (`text NULL`).
 */
export class CreateComplaintDto {
  @IsUUID()
  listing_id!: string;

  @IsString()
  @MaxLength(120)
  reason!: string;

  @IsOptional()
  @IsString()
  details?: string;
}
