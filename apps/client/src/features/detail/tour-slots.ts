/**
 * Занятость окон тура (spec 2026-07-02-tour-slot-exclusivity, секция B).
 * Чистые хелперы для TourRequestModal: слот = дата (YYYY-MM-DD) + окно (start-end).
 */
import type { TakenSlot } from '@/store/api/tourRequestsApi';

/** Ключ окна для сравнения «занято/свободно»: "HH:MM-HH:MM". */
export const windowKey = (w: { start: string; end: string }): string =>
  `${w.start}-${w.end}`;

/** Set ключей окон, занятых на выбранную дату. Нет данных/даты → пустой Set. */
export function takenWindowKeys(
  slots: TakenSlot[] | undefined,
  date: string,
): Set<string> {
  if (!slots || !date) return new Set();
  return new Set(
    slots
      .filter((s) => s.requested_date === date)
      .map((s) => windowKey({ start: s.window_start, end: s.window_end })),
  );
}
