/**
 * llms.txt / llms-full.txt — короткая справка об Avino для AI-ассистентов
 * (формат llmstxt.org: # имя, > сводка, ## разделы со ссылками).
 *
 * Порядок языков: русский, узбекский, английский. Только факты из entity и API
 * (число объявлений, районы), без рекламных превосходных степеней.
 */
import type { T } from '@/lib/format';
import { ENTITY } from './entity';
import { localeUrl } from './alternates';

export const LLMS_LOCALES = ['ru', 'uz', 'en'] as const;
export type LlmsLocale = (typeof LLMS_LOCALES)[number];

export interface LlmsDistrict {
  tx: 'SALE' | 'RENT';
  districtId: string;
  count: number;
  /** Имя района на языке блока. */
  name: string;
}

export interface LlmsLocaleBlock {
  locale: LlmsLocale;
  /** Переводчик неймспейса `llms`. */
  t: T;
  districts: LlmsDistrict[];
  /** Строки последних объявлений (только для llms-full). */
  listings?: { headline: string; price: string; id: string }[];
}

const link = (title: string, url: string, note?: string) => `- [${title}](${url})${note ? `: ${note}` : ''}`;

export function llmsSections(locale: string, t: T): string[] {
  return [
    link(t('sale'), localeUrl(locale, '/search?tx=SALE')),
    link(t('rent'), localeUrl(locale, '/search?tx=RENT')),
    link(t('newConstruction'), localeUrl(locale, '/search?tx=SALE&new_construction=true')),
    link(t('agents'), localeUrl(locale, '/agents')),
    link(t('sell'), localeUrl(locale, '/sell')),
    link(t('help'), localeUrl(locale, '/help')),
  ];
}

export function buildLlmsTxt(total: number, blocks: LlmsLocaleBlock[], fullUrl?: string): string {
  const out: string[] = [`# ${ENTITY.name}`, ''];
  blocks.forEach(({ locale, t, districts, listings }, i) => {
    out.push(`> ${t('identity')} ${t('count', { count: total })}`, '');
    if (i === 0 && fullUrl) out.push(t('full', { url: fullUrl }), '');
    out.push(`## ${t('sections')} (${locale})`, '', ...llmsSections(locale, t), '');
    if (districts.length > 0) {
      out.push(`## ${t('districts')} (${locale})`, '');
      for (const d of districts) {
        const path = `/search?tx=${d.tx}&district_id=${d.districtId}`;
        out.push(link(t(d.tx === 'RENT' ? 'districtRent' : 'districtSale', { district: d.name, count: d.count }), localeUrl(locale, path)));
      }
      out.push('');
    }
    if (listings && listings.length > 0) {
      out.push(`## ${t('listings')} (${locale})`, '');
      for (const l of listings) out.push(`- ${l.headline} — ${l.price} — ${localeUrl(locale, `/listing/${l.id}`)}`);
      out.push('');
    }
  });
  return out.join('\n');
}
