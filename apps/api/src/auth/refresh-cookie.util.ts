import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

/** Имя httpOnly refresh-cookie (ADR-0153). Источник истины для всех контроллеров. */
export const REFRESH_COOKIE_NAME = 'avino_rt';
/** Путь cookie — узкий, только под auth-эндпоинты. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Опции cookie из конфига (ADR-0153). Express ждёт maxAge в мс. */
export function refreshCookieOptions(config: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: config.get<boolean>('authCookie.secure') ?? false,
    sameSite: 'lax',
    // Пустой домен → host-only cookie (staging/голый IP). См. configuration.ts.
    domain: config.get<string>('authCookie.domain') || undefined,
    path: REFRESH_COOKIE_PATH,
    maxAge: (config.get<number>('authCookie.maxAgeSec') ?? 2592000) * 1000,
  };
}

/** Поставить/обновить refresh-cookie (логин и ротация). */
export function setRefreshCookie(
  res: Response,
  token: string,
  config: ConfigService,
): void {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(config));
}

/**
 * Удалить refresh-cookie. domain/path/secure/sameSite должны совпадать с
 * выставленными, иначе браузер не сматчит cookie; maxAge не нужен.
 */
export function clearRefreshCookie(res: Response, config: ConfigService): void {
  const { maxAge: _maxAge, ...opts } = refreshCookieOptions(config);
  res.clearCookie(REFRESH_COOKIE_NAME, opts);
}
