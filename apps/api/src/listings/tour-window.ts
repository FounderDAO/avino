import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '../common/dto/error-response.dto';

/** Окно доступного времени тура (общее, локальное Asia/Tashkent). */
export interface TourWindow {
  start: string;
  end: string;
}

/** Формат времени окна — `HH:MM` (24ч, zero-padded). */
export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function unprocessable(message: string): HttpException {
  return new HttpException(
    { code: ApiErrorCode.VALIDATION_ERROR, message },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/**
 * Кросс-полевая валидация tours-конфига объявления. Формат каждого окна и размер
 * массива проверяет DTO; здесь — `start < end` и «включено → есть ≥1 окно».
 * `windows` — ЭФФЕКТИВНЫЕ окна (dto.tour_windows ?? существующие).
 */
export function validateToursInput(toursEnabled: boolean, windows: TourWindow[]): void {
  for (const w of windows) {
    if (!HHMM.test(w.start) || !HHMM.test(w.end) || w.start >= w.end) {
      throw unprocessable(`Invalid tour window ${w.start}-${w.end}`);
    }
  }
  if (toursEnabled && windows.length === 0) {
    throw unprocessable('tours_enabled requires at least one tour window');
  }
}

/** Предложено ли продавцом точное окно `{start,end}`. */
export function windowOffered(windows: TourWindow[], start: string, end: string): boolean {
  return windows.some((w) => w.start === start && w.end === end);
}
