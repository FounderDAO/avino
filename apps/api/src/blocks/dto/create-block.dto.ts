import { IsUUID } from 'class-validator';

/**
 * Body `POST /api/v1/blocks` (Apple Guideline 1.2, спека 2026-08-19).
 * `user_id` — кого блокируем; snake_case контракт, как у `POST /favorites`.
 */
export class CreateBlockDto {
  @IsUUID()
  user_id!: string;
}
