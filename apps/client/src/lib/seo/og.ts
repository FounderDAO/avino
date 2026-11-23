/**
 * Общая часть Open Graph. Next не сливает openGraph глубоко: страница со своим
 * openGraph теряет поля layout, поэтому базу подмешиваем явно.
 */
import { routing } from '@/i18n/routing';
import { ENTITY } from './entity';

const OG_LOCALES: Record<string, string> = { ru: 'ru_RU', uz: 'uz_UZ', en: 'en_US' };

/** `ru` → `ru_RU` (формат og:locale). */
export function ogLocale(locale: string): string {
  return OG_LOCALES[locale] ?? locale;
}

export function openGraphBase(locale: string) {
  return {
    type: 'website' as const,
    siteName: ENTITY.name,
    locale: ogLocale(locale),
    alternateLocale: routing.locales.filter((l) => l !== locale).map(ogLocale),
    images: [{ url: ENTITY.ogImage.url, width: ENTITY.ogImage.width, height: ENTITY.ogImage.height, alt: ENTITY.name }],
  };
}
