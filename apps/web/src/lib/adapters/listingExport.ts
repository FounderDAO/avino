/**
 * Выгрузка списка объявлений в `.xlsx` (`GET /admin/listings/export`, API.md §16).
 * Сервер отдаёт не больше {@link EXPORT_MAX_ROWS} самых свежих строк — если под
 * фильтр попадает больше, админ должен узнать, что файл неполный.
 */

/** Потолок строк одной выгрузки — зеркало `EXPORT_MAX_ROWS` в apps/api. */
export const EXPORT_MAX_ROWS = 5000;

/** Потолок отмеченных объявлений одной выгрузки — зеркало `EXPORT_MAX_IDS` в apps/api. */
export const EXPORT_MAX_IDS = 100;

/**
 * Параметры запроса выгрузки. Есть отмеченные строки — уходят только их `ids`,
 * без фильтров: выбор переживает смену фильтра и страницы, и пересечение с
 * текущим фильтром молча выбросило бы часть отмеченного. Иначе — фильтры списка.
 */
export function listingExportParams<F extends object>(filters: F, selectedIds: readonly string[]): F | { ids: string[] } {
  return selectedIds.length > 0 ? { ids: [...selectedIds] } : filters;
}

/** Имя файла с датой выгрузки по локальному времени: `avino-listings-2026-10-03.xlsx`. */
export function listingExportFileName(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `avino-listings-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.xlsx`;
}

/** Текст тоста после скачивания; `total` — сколько объявлений отмечено либо под текущим фильтром. */
export function listingExportToast(total: number): string {
  return total > EXPORT_MAX_ROWS
    ? `Выгружены последние ${EXPORT_MAX_ROWS} из ${total} — сузьте фильтр, чтобы получить остальные`
    : `Экспорт готов: ${total}`;
}
