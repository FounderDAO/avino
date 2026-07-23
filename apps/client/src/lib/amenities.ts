/**
 * Общая модель справочника удобств (Task 5, GET /amenities).
 *
 * Тип и резолв лейбла живут здесь, а не в `store/api/amenitiesApi.ts`, чтобы
 * серверный слой (`lib/api/amenities.ts`, Detail) не зависел от клиентского
 * RTK-модуля: справочник читают и SSR-компоненты, и клиентские формы.
 */

/** Строка справочника удобств GET /amenities (snake_case контракт API.md). */
export interface AmenityOption {
  id: string;
  code: string;
  label_ru: string;
  label_uz: string;
  label_en: string;
  sort_order: number;
}

/** Лейбл удобства для текущей локали (fallback: ru → en → code). */
export function amenityLabel(opt: AmenityOption, locale: string): string {
  const byLocale =
    locale === 'uz' ? opt.label_uz : locale === 'en' ? opt.label_en : opt.label_ru;
  return byLocale || opt.label_ru || opt.label_en || opt.code;
}
