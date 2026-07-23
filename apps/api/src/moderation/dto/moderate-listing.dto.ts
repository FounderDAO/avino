import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ModerationAction } from '@prisma/client';

/** Решения модератора (подмножество ModerationAction без системного OWNER_EDIT). */
const MODERATOR_ACTIONS = [
  ModerationAction.APPROVE,
  ModerationAction.SEND_TO_DRAFT,
  ModerationAction.REJECT,
  ModerationAction.DELETE,
] as const;

/**
 * Тело `PATCH /api/v1/admin/listings/:id/status` (TASK-053, API.md §16).
 *
 * `action` — решение модератора (`APPROVE | SEND_TO_DRAFT | REJECT | DELETE`);
 * маппинг на listing_status делает сервис. Системное `OWNER_EDIT` через этот
 * эндпоинт недопустимо (оно пишется автоматически при правке владельцем).
 * `reason` — опциональная причина (например для REJECT: «недостаточно фото»),
 * пишется в moderation_logs и audit_logs.
 */
export class ModerateListingDto {
  @IsIn(MODERATOR_ACTIONS as unknown as ModerationAction[])
  action!: ModerationAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
