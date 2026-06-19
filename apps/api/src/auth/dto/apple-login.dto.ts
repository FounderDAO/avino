import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Тело `POST /api/v1/auth/apple` — ID-token из Sign in with Apple JS.
 * Имя Apple отдаёт ТОЛЬКО при первой авторизации (поле `user`, не в токене),
 * поэтому first/last опциональны и используются лишь для посева профиля.
 */
export class AppleLoginDto {
  @IsString()
  @IsNotEmpty()
  id_token!: string;

  @IsString()
  @IsOptional()
  first_name?: string;

  @IsString()
  @IsOptional()
  last_name?: string;
}
