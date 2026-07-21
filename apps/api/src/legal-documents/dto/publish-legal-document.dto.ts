import { IsBoolean } from 'class-validator';

/** Тело POST /admin/legal-documents/:id/publish. */
export class PublishLegalDocumentDto {
  /** true → бамп app_settings.legal_consent_version (модалка повторного согласия всем). */
  @IsBoolean()
  requires_consent!: boolean;
}
