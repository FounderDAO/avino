import { IsBoolean } from 'class-validator';

/** Тело `POST /api/v1/users/me/legal-consent`. Обе галочки обязательны (true). */
export class AcceptLegalConsentDto {
  @IsBoolean()
  terms_accepted!: boolean;

  @IsBoolean()
  privacy_accepted!: boolean;
}
