/**
 * Реестр юридических документов: статическая карта kind × locale + фолбэк на ru.
 */
import type { LegalDoc, LegalKind } from './types';
import type { Locale } from '@/i18n/routing';
import { termsRu } from './terms.ru';
import { termsUz } from './terms.uz';
import { termsEn } from './terms.en';
import { privacyRu } from './privacy.ru';
import { privacyUz } from './privacy.uz';
import { privacyEn } from './privacy.en';

const DOCS: Record<LegalKind, Record<Locale, LegalDoc>> = {
  terms: { ru: termsRu, uz: termsUz, en: termsEn },
  privacy: { ru: privacyRu, uz: privacyUz, en: privacyEn },
};

export function getLegalDoc(kind: LegalKind, locale: Locale): LegalDoc {
  return DOCS[kind][locale] ?? DOCS[kind].ru;
}
