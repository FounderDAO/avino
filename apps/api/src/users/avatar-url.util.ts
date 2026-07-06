import { UploadsService } from '../uploads';

/**
 * Разрешить `avatar_url` для отдачи в ответах API (TASK-248, ADR-0134).
 *
 * Приоритет:
 * 1. `avatarStorageKey` задан → аватар загружен пользователем через
 *    `POST /api/v1/users/me/avatar` и лежит в R2; ссылка подписывается
 *    заново на каждое чтение (sign-on-read, как `resolveMediaUrl` для медиа
 *    объявлений — ADR-0086), поэтому presigned TTL физически не успевает
 *    протухнуть.
 * 2. Иначе — `avatarUrl` как есть: это внешняя постоянная ссылка на фото
 *    OAuth-провайдера (Google/Apple, см. `google-auth.service.ts`) либо
 *    `null`, если её тоже нет.
 *
 * Общий helper для всех мест, читающих профиль (`UsersService.getMe`,
 * `AuthService.getMe`, `ChatService` counterparty) — чтобы логика приоритета
 * не дублировалась в каждом.
 */
export async function resolveAvatarUrl(
  uploads: UploadsService,
  avatarStorageKey: string | null | undefined,
  avatarUrl: string | null | undefined,
): Promise<string | null> {
  if (avatarStorageKey) {
    return uploads.getObjectUrl(avatarStorageKey);
  }
  return avatarUrl ?? null;
}
