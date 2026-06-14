/**
 * locationParams — выбранная подсказка → параметры локации для выдачи /search.
 *
 * Единый источник истины для Hero (главная) и FilterBar (/search), чтобы оба
 * экрана вели себя одинаково.
 *
 * Почему так:
 *  - Район → рабочий серверный фильтр `district_id` (UUID, ADR-0068). Бэкенд-`q`
 *    (search.service.buildWhereSql) — это ILIKE-подстрока по title/description/
 *    address листинга, а НЕ по названию района, поэтому название района в `q`
 *    ничего не находит. Фильтр `district_id` — единственный, что реально режет по
 *    району (как блок «Районы» на главной → /search?district_id=…).
 *  - Гео-место Yandex / свободный текст → `q`-текст (`query`). Радиусный круг
 *    (`?clat=&clng=&radius=`) убран из выдачи (ADR-0070/0071) и сервером не
 *    читается, поэтому геокодирование подсказки больше не нужно.
 */
import type { Suggestion } from './useGeoSuggest';

/** Параметры локации для URL /search. Заданный ключ исключает другой. */
export interface LocationParams {
  district_id?: string;
  query?: string;
}

/** Подсказка → {district_id} (район) либо {query} (гео-место/текст). */
export function suggestionToLocation(s: Suggestion): LocationParams {
  return s.kind === 'district'
    ? { district_id: s.districtId, query: undefined }
    : { district_id: undefined, query: s.title };
}
