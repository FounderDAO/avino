import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ModerationAction } from '@prisma/client';

/**
 * Тело `PATCH /api/v1/admin/listings/:id/status` (TASK-053, API.md §16).
 *
 * `action` — одно из {@link ModerationAction} (`APPROVE | SEND_TO_DRAFT |
 * REJECT | DELETE`); маппинг на listing_status делает сервис. `reason` —
 * опциональная причина (например для REJECT: «недостаточно фото»), пишется в
 * moderation_logs и audit_logs.
 */
export class ModerateListingDto {
  @IsEnum(ModerationAction)
  action!: ModerationAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
