/**
 * Ответ `GET /api/v1/settings/public` — публичные фиче-флаги для портала и
 * мобильных клиентов. Класс в `*.dto.ts` → @nestjs/swagger CLI-плагин
 * документирует поля в openapi.public.json (для Flutter/SDK) без ручных
 * @ApiProperty. Точка расширения: добавляется поле, не эндпоинт.
 */
export class PublicSettingsView {
  promotionsEnabled!: boolean;
  /** Лимит активных объявлений обычного клиента; `0` = без лимита. */
  activeListingLimit!: number;
  mapHoverRecenter!: boolean;
  legalConsentRequired!: boolean;
  legalConsentVersion!: number;
  /**
   * Минимальная допустимая сборка iOS-приложения (build number). Сборка ниже —
   * экран обязательного обновления. `0` = не требовать.
   */
  minAppBuildIos!: number;
  /**
   * Минимальная допустимая сборка Android-приложения (versionCode). Сборка
   * ниже — экран обязательного обновления. `0` = не требовать.
   */
  minAppBuildAndroid!: number;
}
