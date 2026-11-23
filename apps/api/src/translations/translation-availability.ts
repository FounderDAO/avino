import { Language } from '@prisma/client';

/** Языки в порядке справочника (uz, ru, en). */
const LANGUAGE_ORDER: readonly Language[] = [Language.UZ, Language.RU, Language.EN];

export interface TranslationRowState {
  language: Language;
  title: string;
  description: string | null;
  isAutoTranslated: boolean;
}

/**
 * Языки, на которых у объявления есть настоящий текст (SEO AUD-14): оригинал
 * автора, ручная правка и машинный перевод, который отличается от оригинала.
 *
 * Строка-копия (машинный перевод, где заголовок и описание совпадают с
 * авторскими) — не перевод: так раньше сохранялся исходный текст, когда у
 * провайдера не было ключа (969 из 1 905 заголовков одинаковы на трёх языках).
 * Сайт по этому списку решает, какие языковые версии объявления индексировать.
 */
export function availableTranslationLanguages(rows: TranslationRowState[], original: Language): Language[] {
  const author = rows.find((r) => r.language === original);
  const real = new Set<Language>([original]);
  for (const row of rows) {
    if (row.language === original) continue;
    const copy =
      row.isAutoTranslated &&
      author !== undefined &&
      row.title === author.title &&
      (row.description ?? '') === (author.description ?? '');
    if (!copy) real.add(row.language);
  }
  return LANGUAGE_ORDER.filter((lang) => real.has(lang));
}
