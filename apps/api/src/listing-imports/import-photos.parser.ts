import { extname } from 'path';
import type { ImportRowError } from './import-row.validator';

/** Лимит галереи (`MAX_MEDIA_PER_LISTING`) — больше в строку не влезет. */
export const MAX_PHOTOS_PER_ROW = 20;
const URL_MAX = 2048;
const NAME_MAX = 255;
const FILE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const HTTP_PREFIX = /^https?:\/\//i;

export type ImportPhotoSource = 'URL' | 'FILE';

export interface ParsedPhoto {
  position: number;
  source: ImportPhotoSource;
  ref: string;
}

export type PhotoCellResult = { ok: true; photos: ParsedPhoto[] } | { ok: false; error: ImportRowError };

/**
 * Элементы ячейки: перевод строки, `;` и `,` — разделители. Запятая внутри
 * ссылки (`…/w_100,h_100/…`) не делит: кусок без пробела, не начинающий новую
 * ссылку, приклеивается к текущей ссылке.
 */
function splitCell(raw: string): string[] {
  const out: string[] = [];
  for (const chunk of raw.split(/[\r\n;]+/)) {
    const pieces = chunk.split(',');
    let current = pieces[0];
    for (const piece of pieces.slice(1)) {
      const glue = HTTP_PREFIX.test(current.trim()) && !/^\s/.test(piece) && !HTTP_PREFIX.test(piece);
      if (glue) {
        current += `,${piece}`;
      } else {
        out.push(current);
        current = piece;
      }
    }
    out.push(current);
  }
  return out.map((token) => token.trim()).filter(Boolean);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

const fail = (code: ImportRowError['code'], message: string, value?: string): PhotoCellResult => ({
  ok: false,
  error: { column: 'photos', code, message, ...(value !== undefined ? { value } : {}) },
});

/** Ячейка «Фото» → упорядоченный список ссылок и имён файлов (спека 2026-10-03 §1). */
export function parsePhotoCell(raw: string | undefined): PhotoCellResult {
  const seen = new Set<string>();
  const unique: { source: ImportPhotoSource; ref: string }[] = [];
  for (const token of splitCell(raw ?? '')) {
    const source: ImportPhotoSource = HTTP_PREFIX.test(token) ? 'URL' : 'FILE';
    const key = source === 'URL' ? token : token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ source, ref: token });
  }

  if (unique.length > MAX_PHOTOS_PER_ROW) {
    return fail('PHOTO_TOO_MANY', `photos has more than ${MAX_PHOTOS_PER_ROW} items`);
  }
  for (const { source, ref } of unique) {
    if (source === 'URL') {
      if (ref.length > URL_MAX || !isHttpUrl(ref)) return fail('PHOTO_INVALID_URL', 'photo URL is invalid', ref);
      continue;
    }
    if (/[\\/]/.test(ref) || ref.length > NAME_MAX) {
      return fail('PHOTO_INVALID_NAME', 'photo must be a file name without a path', ref);
    }
    if (!FILE_EXTENSIONS.has(extname(ref).toLowerCase())) {
      return fail('PHOTO_UNSUPPORTED_FORMAT', 'photo must be .jpg, .jpeg, .png or .webp', ref);
    }
  }
  return { ok: true, photos: unique.map((photo, position) => ({ position, ...photo })) };
}
