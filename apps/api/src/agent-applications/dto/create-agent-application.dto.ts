import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body `POST /api/v1/users/me/agent-application` (ADR-0140, API.md §21).
 * Анкета-минимум: имя/телефон/аватар берутся из профиля. `agency_name`
 * опционален (частный маклер), под колонку VARCHAR(255).
 */
export class CreateAgentApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  agency_name?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  about!: string;
}
