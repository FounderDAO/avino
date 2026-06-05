import { IsString, Length } from 'class-validator';

/**
 * Body `POST /api/v1/chat/threads/:id/messages` (TASK-111, API.md §13).
 *
 * `body` — текст сообщения (обязателен). Тот же лимит 1..5000, что и у
 * зарезервированного `body` в {@link CreateThreadDto}. `sender_id` не принимается
 * из тела — он всегда выводится из Bearer-токена (текущий пользователь), чтобы
 * нельзя было слать от чужого имени.
 */
export class SendMessageDto {
  @IsString()
  @Length(1, 5000)
  body!: string;
}
