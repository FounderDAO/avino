/**
 * Чистые функции гейтинга Swagger-документации (без зависимостей от Nest/ENV).
 * Вынесены отдельно, чтобы покрыть unit-тестами без подъёма приложения.
 */

/** Сырые настройки Swagger из конфигурации. */
export interface SwaggerSettings {
  enabled: boolean;
  basicAuthUser?: string;
  basicAuthPass?: string;
}

/** Решение о монтировании документации. */
export interface SwaggerGating {
  mountPublic: boolean;
  mountInternal: boolean;
  basicAuth?: { user: string; pass: string };
}

/**
 * Включён ли Swagger. Явный флаг `SWAGGER_ENABLED` имеет приоритет; если он не
 * задан — включаем везде, кроме production (по аналогии с telegramConfig).
 */
export function resolveSwaggerEnabled(
  rawFlag?: string,
  nodeEnv?: string,
): boolean {
  if (rawFlag != null) {
    return rawFlag === 'true';
  }
  return nodeEnv !== 'production';
}

/**
 * Что монтировать. Internal-документ поднимается только при наличии обеих
 * basic-auth credentials (fail-closed: без логина/пароля internal не светим).
 */
export function resolveSwaggerGating(settings: SwaggerSettings): SwaggerGating {
  if (!settings.enabled) {
    return { mountPublic: false, mountInternal: false };
  }
  const user = settings.basicAuthUser;
  const pass = settings.basicAuthPass;
  if (user && pass) {
    return { mountPublic: true, mountInternal: true, basicAuth: { user, pass } };
  }
  return { mountPublic: true, mountInternal: false };
}
