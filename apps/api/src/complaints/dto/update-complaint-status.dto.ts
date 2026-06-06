import { IsEnum } from 'class-validator';
import { ComplaintStatus } from '@prisma/client';

/**
 * Body `PATCH /api/v1/admin/complaints/:id` (TASK-132, API.md §16).
 *
 * Модератор/админ меняет статус жалобы; `handled_by`/`handled_at` проставляет
 * сервер (не клиент). Значение валидируется по enum `complaint_status`
 * (NEW|IN_REVIEW|RESOLVED|REJECTED).
 */
export class UpdateComplaintStatusDto {
  @IsEnum(ComplaintStatus)
  status!: ComplaintStatus;
}
