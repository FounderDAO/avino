import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/**
 * Body `POST /api/v1/chat/threads` (TASK-110, API.md §13).
 *
 * `listing_id` (snake_case контракт) — объявление, владельцу которого пишет
 * текущий пользователь; `owner_id` треда выводится из листинга, `initiator_id` —
 * это сам пользователь (поля initiator/owner, НЕ buyer/seller — ADR-0003).
 *
 * `body` — необязательный текст первого сообщения. В TASK-110 он принимается ради
 * совместимости с контрактом (глобальный ValidationPipe с `forbidNonWhitelisted`
 * иначе вернул бы 400 на задокументированное поле), но НЕ персистится: создание
 * сообщений и уведомление `NEW_CHAT_MESSAGE` реализуются в TASK-111
 * (`POST /chat/threads/:id/messages`). Тред создаётся идемпотентно.
 */
export class CreateThreadDto {
  @IsUUID()
  listing_id!: string;

  /** Зарезервировано под первый месседж (TASK-111); в TASK-110 не сохраняется. */
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  body?: string;
}
