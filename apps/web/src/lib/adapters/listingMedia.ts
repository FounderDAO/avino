import type { ListingMedia } from '@/store/api/adminTypes';

/** Лимиты галереи — зеркало API (`listing-media.service.ts`). */
export const MEDIA_MAX = 20;
export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_ACCEPT: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export type MediaFileCheck = { index: number; ok: true } | { index: number; ok: false; reason: string };

/** Медиа по `sort_order`; номера могут идти с пропусками. */
export function sortedMedia(media: ListingMedia[]): ListingMedia[] {
  return [...media].sort((a, b) => a.sort_order - b.sort_order);
}

/** Новый порядок после сдвига на одну позицию; `null` — сдвигать некуда. */
export function moveMedia(ids: string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return null;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Новый порядок с фото на первом месте; `null` — уже обложка или нет такого id. */
export function makeCover(ids: string[], id: string): string[] | null {
  const index = ids.indexOf(id);
  if (index <= 0) return null;
  return [id, ...ids.filter((x) => x !== id)];
}

/** Проверка до отправки: формат, размер, остаток до лимита (по порядку выбора). */
export function checkMediaFiles(
  files: { name: string; type: string; size: number }[],
  existing: number,
): MediaFileCheck[] {
  let room = MEDIA_MAX - existing;
  return files.map((file, index): MediaFileCheck => {
    if (!MEDIA_ACCEPT.includes(file.type)) {
      return { index, ok: false, reason: `${file.name}: формат не поддерживается, нужен JPG, PNG или WebP` };
    }
    if (file.size > MEDIA_MAX_BYTES) return { index, ok: false, reason: `${file.name}: больше 10 МБ` };
    if (room <= 0) return { index, ok: false, reason: `${file.name}: в объявлении уже ${MEDIA_MAX} фото` };
    room -= 1;
    return { index, ok: true };
  });
}

const MEDIA_ERROR_TEXT: Record<string, string> = {
  UNSUPPORTED_MEDIA_TYPE: 'Формат не поддерживается, нужен JPG, PNG или WebP',
  FILE_TOO_LARGE: 'Файл больше 10 МБ',
  MEDIA_LIMIT_EXCEEDED: `В объявлении уже ${MEDIA_MAX} фото`,
  NOT_FOUND: 'Фото или объявление не найдено',
};

export function mediaErrorText(code: string | null): string {
  return (code && MEDIA_ERROR_TEXT[code]) || 'Не удалось выполнить действие с фото';
}
