import { IsEnum } from 'class-validator';
import { SupportRequestStatus } from '@prisma/client';

/**
 * Body `PATCH /api/v1/admin/support/requests/:id`. Модератор/админ меняет
 * статус; `handled_by`/`handled_at` проставляет сервер (не клиент).
 */
export class UpdateSupportRequestStatusDto {
  @IsEnum(SupportRequestStatus)
  status!: SupportRequestStatus;
}
