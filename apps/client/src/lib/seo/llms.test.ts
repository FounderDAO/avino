import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import ru from '../../../messages/ru.json';
import uz from '../../../messages/uz.json';
import en from '../../../messages/en.json';
import { buildLlmsTxt, LLMS_LOCALES, type LlmsLocaleBlock } from './llms';

const MESSAGES = { ru, uz, en } as const;
const tr = (locale: keyof typeof MESSAGES) => {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'llms' });
  return (k: string, v?: Record<string, string | number>) => t(k as never, v as never);
};

const blocks: LlmsLocaleBlock[] = LLMS_LOCALES.map((locale) => ({
  locale,
  t: tr(locale),
  districts: [{ tx: 'SALE', districtId: 'd1', count: 21, name: `D-${locale}` }],
}));

describe('buildLlmsTxt', () => {
  const txt = buildLlmsTxt(1785, blocks, 'https://avino.uz/llms-full.txt');

  it('starts with the name and orders languages ru, uz, en', () => {
    expect(txt.startsWith('# Avino\n')).toBe(true);
    const ruAt = txt.indexOf('(ru)');
    const uzAt = txt.indexOf('(uz)');
    const enAt = txt.indexOf('(en)');
    expect(ruAt).toBeGreaterThan(0);
    expect(uzAt).toBeGreaterThan(ruAt);
    expect(enAt).toBeGreaterThan(uzAt);
  });

  it('uses the live count with correct plurals', () => {
    // ICU форматирует число по локали: «1 785» с неразрывным пробелом.
    expect(txt).toMatch(/1\s?785 активных объявлений/);
    expect(txt).toMatch(/1\s?785 ta faol e/);
    expect(txt).toMatch(/1,?785 active listings/);
  });

  it('links canonical URLs per locale', () => {
    expect(txt).toContain('(https://avino.uz/ru/search?tx=SALE)');
    expect(txt).toContain('(https://avino.uz/uz/search?tx=RENT)');
    expect(txt).toContain('(https://avino.uz/en/search?tx=SALE&new_construction=true)');
    expect(txt).toContain('[D-ru: продажа, 21 объявление](https://avino.uz/ru/search?tx=SALE&district_id=d1)');
    expect(txt).toContain('https://avino.uz/llms-full.txt');
  });

  it('has no marketing superlatives', () => {
    expect(txt).not.toMatch(/лучш|национальн|самый|best|leading|number one/i);
  });

  it('lists listings one per line when given', () => {
    const full = buildLlmsTxt(1, [{ ...blocks[0], listings: [{ id: 'x', headline: 'Продаётся дом', price: '$1' }] }]);
    expect(full).toContain('- Продаётся дом — $1 — https://avino.uz/ru/listing/x');
  });
});
