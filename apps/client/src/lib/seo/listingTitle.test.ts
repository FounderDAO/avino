import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import ru from '../../../messages/ru.json';
import uz from '../../../messages/uz.json';
import en from '../../../messages/en.json';
import { listingHeadline, listingSummary, type HeadlineListing } from './listingTitle';

const MESSAGES = { ru, uz, en } as const;
type Loc = keyof typeof MESSAGES;

function tr(locale: Loc) {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'listing' });
  const tUnits = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'units' });
  return {
    t: (k: string, v?: Record<string, string | number>) => t(k as never, v as never),
    tUnits: (k: string, v?: Record<string, string | number>) => tUnits(k as never, v as never),
  };
}

const flat: HeadlineListing = {
  tx: 'SALE', type: 'APARTMENT', rooms: 3, area: '78.00', district: 'Юнусабадский район',
};

describe('listingHeadline', () => {
  it('builds a specific headline per locale', () => {
    let { t, tUnits } = tr('ru');
    expect(listingHeadline(flat, t, tUnits)).toBe('Продаётся 3-комн. квартира, 78 м² — Юнусабадский район');
    ({ t, tUnits } = tr('uz'));
    expect(listingHeadline({ ...flat, district: 'Yunusobod tumani' }, t, tUnits)).toBe(
      '3 xonali kvartira sotiladi, 78 m² — Yunusobod tumani',
    );
    ({ t, tUnits } = tr('en'));
    expect(listingHeadline({ ...flat, tx: 'RENT', district: 'Yunusabad' }, t, tUnits)).toBe(
      '3-room apartment for rent, 78 m² — Yunusabad',
    );
  });

  it('skips missing fields without leftovers', () => {
    const { t, tUnits } = tr('ru');
    const out = listingHeadline({ tx: 'SALE', type: 'COMMERCIAL', district: '' }, t, tUnits);
    expect(out).toBe('Продаётся коммерческое помещение');
    expect(out).not.toMatch(/undefined|,\s*,|—\s*$|\s{2}/);
  });

  it('uses the lot size for land and adds it for houses', () => {
    const { t, tUnits } = tr('ru');
    expect(listingHeadline({ tx: 'SALE', type: 'LAND', lotArea: '6', district: 'Кибрай' }, t, tUnits)).toBe(
      'Продаётся участок, 6 соток — Кибрай',
    );
    expect(
      listingHeadline({ tx: 'SALE', type: 'HOUSE', rooms: 5, area: '180', lotArea: '8', district: 'Фергана' }, t, tUnits),
    ).toBe('Продаётся 5-комн. дом, 180 м², 8 соток — Фергана');
  });

  it('never leaks raw enum values in any locale', () => {
    for (const loc of ['ru', 'uz', 'en'] as const) {
      const { t, tUnits } = tr(loc);
      for (const type of ['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'] as const) {
        for (const tx of ['SALE', 'RENT'] as const) {
          const out = listingSummary({ tx, type, rooms: 2, area: '50', district: 'X' }, '$1', t, tUnits);
          expect(out).not.toMatch(/APARTMENT|HOUSE|LAND|COMMERCIAL|SALE|RENT/);
        }
      }
    }
  });
});
