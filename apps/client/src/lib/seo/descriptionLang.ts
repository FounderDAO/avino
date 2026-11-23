/**
 * `lang` описания объявления (backend SEO AUD-14). Если на язык страницы нет
 * настоящего перевода, текст остаётся на языке автора — помечаем его, чтобы
 * поисковики и скринридеры не считали его текстом страницы. Заголовок и H1 и
 * так на языке страницы (шаблон из полей), поэтому страница индексируется.
 * Пока API не отдаёт список языков — без пометки, как раньше.
 */
import type { Language, Listing } from '@/lib/mock/types';

export function descriptionLang(
  listing: Pick<Listing, 'originalLanguage' | 'translationsAvailable'>,
  locale: string,
): string | undefined {
  const available = listing.translationsAvailable;
  const original = listing.originalLanguage;
  if (!available || !original) return undefined;
  return available.includes(locale.toUpperCase() as Language) ? undefined : original.toLowerCase();
}
