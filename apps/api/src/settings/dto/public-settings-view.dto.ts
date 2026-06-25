/**
 * Ответ `GET /api/v1/settings/public` — публичные фиче-флаги для портала и
 * мобильных клиентов. Класс в `*.dto.ts` → @nestjs/swagger CLI-плагин
 * документирует поля в openapi.public.json (для Flutter/SDK) без ручных
 * @ApiProperty. Точка расширения: добавляется поле, не эндпоинт.
 */
export class PublicSettingsView {
  promotionsEnabled!: boolean;
  mapHoverRecenter!: boolean;
}
