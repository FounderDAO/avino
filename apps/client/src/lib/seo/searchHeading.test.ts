import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import ru from '../../../messages/ru.json';
import uz from '../../../messages/uz.json';
import en from '../../../messages/en.json';
import { buildSearchCanonical, buildSearchHeading, searchSubjectKey } from './searchHeading';

const MESSAGES = { ru, uz, en } as const;
type Loc = keyof typeof MESSAGES;

function tr(locale: Loc) {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'search' });
  return (k: string, v?: Record<string, string | number>) => t(k as never, v as never);
}

describe('searchSubjectKey', () => {
  it('prefers new construction, then a single type, else ALL', () => {
    expect(searchSubjectKey(['HOUSE'], true)).toBe('NEW');
    expect(searchSubjectKey(['HOUSE'])).toBe('HOUSE');
    expect(searchSubjectKey(['HOUSE', 'LAND'])).toBe('ALL');
    expect(searchSubjectKey(undefined)).toBe('ALL');
  });
});

describe('buildSearchHeading', () => {
  it('builds distinct headings for the landing set', () => {
    const t = tr('ru');
    const headings = [
      buildSearchHeading({ tx: 'SALE', t }).heading,
      buildSearchHeading({ tx: 'RENT', t }).heading,
      buildSearchHeading({ tx: 'SALE', types: ['HOUSE'], t }).heading,
      buildSearchHeading({ tx: 'SALE', districtName: 'Юнусабадский район', t }).heading,
      buildSearchHeading({ tx: 'SALE', regionName: 'Самаркандская область', t }).heading,
    ];
    expect(headings).toEqual([
      'Покупка жилья · Ташкент',
      'Аренда жилья · Ташкент',
      'Продажа домов · Ташкент',
      'Покупка жилья · Юнусабадский район',
      'Покупка жилья · Самаркандская область',
    ]);
  });

  it('district wins over region and query', () => {
    const t = tr('en');
    expect(
      buildSearchHeading({ tx: 'RENT', types: ['APARTMENT'], districtName: 'Yunusabad', regionName: 'Tashkent', query: 'x', t }).heading,
    ).toBe('Apartments for rent · Yunusabad');
  });

  it('uses the agent heading when an agent is given', () => {
    const t = tr('uz');
    expect(buildSearchHeading({ tx: 'SALE', agentName: 'Ali', t }).heading).toBe(t('headingAgentSale', { name: 'Ali' }));
  });

  it('keeps descriptions within 110–160 chars in every locale', () => {
    for (const loc of ['ru', 'uz', 'en'] as const) {
      const t = tr(loc);
      for (const tx of ['SALE', 'RENT'] as const) {
        for (const types of [undefined, ['APARTMENT'], ['HOUSE'], ['LAND'], ['COMMERCIAL']] as const) {
          const { description } = buildSearchHeading({ tx, types: types as never, t });
          expect(description.length, `${loc} ${tx} ${types}: ${description}`).toBeGreaterThanOrEqual(110);
          expect(description.length, `${loc} ${tx} ${types}: ${description}`).toBeLessThanOrEqual(160);
        }
      }
    }
  });
});

describe('buildSearchCanonical', () => {
  it('defaults tx to SALE so /search and ?tx=SALE share one canonical', () => {
    expect(buildSearchCanonical({})).toEqual({ path: '/search?tx=SALE', noindex: false });
    expect(buildSearchCanonical({ tx: 'SALE' }).path).toBe('/search?tx=SALE');
  });

  it('orders semantic params and drops view/cursor noise', () => {
    expect(
      buildSearchCanonical({ district_id: 'd1', type: 'HOUSE', region_id: 'r1', tx: 'RENT', new_construction: 'true' }).path,
    ).toBe('/search?tx=RENT&type=HOUSE&new_construction=true&region_id=r1&district_id=d1');
    expect(buildSearchCanonical({ tx: 'SALE', view: 'list', cursor: 'abc' }).path).toBe('/search?tx=SALE');
  });

  it('keeps page above 1 as a self-canonical', () => {
    expect(buildSearchCanonical({ tx: 'RENT', page: '2' }).path).toBe('/search?tx=RENT&page=2');
    expect(buildSearchCanonical({ tx: 'RENT', page: '1' }).path).toBe('/search?tx=RENT');
  });

  it('maps legacy type=NEW_BUILDING to new_construction', () => {
    expect(buildSearchCanonical({ type: 'NEW_BUILDING' }).path).toBe('/search?tx=SALE&new_construction=true');
  });

  it.each([
    [{ type: ['HOUSE', 'LAND'] }],
    [{ query: 'чиланзар' }],
    [{ region_id: 'all' }],
    [{ view: 'map' }],
    [{ sort: 'price_asc' }],
    [{ priceMin: '1000' }],
    [{ agent_id: 'a1' }],
    [{ points: 'xyz' }],
  ])('noindex for %j', (sp) => {
    expect(buildSearchCanonical(sp)).toEqual({ path: null, noindex: true });
  });
});
