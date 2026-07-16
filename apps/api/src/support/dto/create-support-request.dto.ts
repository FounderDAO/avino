import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * Body `POST /api/v1/support/requests` — обращение в поддержку с формы /help.
 * Гость пишет без аккаунта, поэтому `contact` (телефон или email) обязателен —
 * иначе ответить некуда. Лимиты длин — под колонки VARCHAR(120)/VARCHAR(160).
 */
export class CreateSupportRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @Length(3, 160)
  contact!: string;

  @IsString()
  @Length(3, 5000)
  message!: string;
}
