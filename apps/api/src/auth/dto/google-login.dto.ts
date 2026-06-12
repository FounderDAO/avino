import { IsNotEmpty, IsString } from 'class-validator';

/** Тело `POST /api/v1/auth/google` — ID-token из Google Identity Services. */
export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  id_token!: string;
}
