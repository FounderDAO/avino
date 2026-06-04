import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Тело `PATCH /api/v1/admin/listing-promotions/:id/cancel` (TASK-122, API.md §15).
 *
 * `reason` — необязательная человекочитаемая причина отмены, попадает в
 * `promotion_logs.reason` (аудит цепочки). Промо ищется по своему `id` (а не по
 * листингу), поэтому в теле нет идентификаторов.
 */
export class CancelPromotionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
