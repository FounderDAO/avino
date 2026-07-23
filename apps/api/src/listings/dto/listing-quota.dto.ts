/**
 * Ответ `GET /api/v1/listings/quota` — квота активных объявлений текущего
 * пользователя. Класс в `*.dto.ts` → swagger CLI-плагин документирует поля в
 * openapi.internal.json без ручных @ApiProperty (зеркалит PublicSettingsView).
 * `blocked=true` → визард /sell/new сразу показывает модалку «Стать агентом».
 */
export class ListingQuotaDto {
  /** Занятые слоты (статус ACTIVE или NEW). AGENT/AGENCY и лимит 0 → 0. */
  used!: number;
  /** Текущий лимит активных объявлений (0 = без лимита). */
  limit!: number;
  /** Достигнут ли лимит (нельзя создавать ещё; true → модалка агента). */
  blocked!: boolean;
}
