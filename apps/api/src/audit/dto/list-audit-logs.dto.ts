import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Query-параметры `GET /api/v1/admin/audit-logs` (TASK-131, API.md §16).
 *
 * Просмотр security audit-лога (`audit_logs`, ADR-004). `action` — свободная
 * строка (`audit_logs.action` хранится как VarChar, не enum: `ADMIN_USER_UPDATE`,
 * `ROLE_CHANGE`, `LISTING_STATUS_CHANGE`, `LISTING_PROMOTION_CHANGE` и будущие).
 * `entity_type` тоже свободная строка (`user`, `listing`, ...). `actor_id` /
 * `entity_id` — UUID. Числа из query приводятся к `number` глобальным
 * ValidationPipe (`enableImplicitConversion`) + явный `@Type`. Page-based
 * пагинация (1-based) с обязательным `meta.total` (API.md §4).
 */
export class ListAuditLogsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsUUID()
  actor_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entity_type?: string;

  @IsOptional()
  @IsUUID()
  entity_id?: string;

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
