import { describe, it, expect } from 'vitest';
import { describeFilters, filtersToSearchHref } from './savedSearch';

const t = ((k: string) => k) as any;

describe('describeFilters territory', () => {
  it('adds a territory chip when points present', () => {
    const out = describeFilters({ transaction_type: 'SALE', points: '41,69;41,70;42,69' }, t);
    expect(out).toContain('savedSearch.territory');
  });
  it('omits territory chip when no points', () => {
    const out = describeFilters({ transaction_type: 'SALE' }, t);
    expect(out).not.toContain('savedSearch.territory');
  });
});

describe('filtersToSearchHref restores points (redraw)', () => {
  it('puts points into the URL', () => {
    const href = filtersToSearchHref({ transaction_type: 'SALE', points: '41,69;41,70;42,69' });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('points')).toBe('41,69;41,70;42,69');
  });
});

describe('filtersToSearchHref — точное восстановление', () => {
  it('эмитит sort и currency', () => {
    const href = filtersToSearchHref({ sort: 'price_asc', currency: 'USD', price_max: '50000' });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('sort')).toBe('price_asc');
    expect(qs.get('currency')).toBe('USD');
  });

  it('эмитит points (нарисованную территорию)', () => {
    const href = filtersToSearchHref({ points: '41.3,69.27;41.3,69.29;41.32,69.29' });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('points')).toBe('41.3,69.27;41.3,69.29;41.32,69.29');
  });

  it('повторяет type для мультивыбора property_types[]', () => {
    const href = filtersToSearchHref({ property_types: ['APARTMENT', 'HOUSE'] });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.getAll('type')).toEqual(['APARTMENT', 'HOUSE']);
  });

  it('фолбэк на одиночный property_type, если массива нет', () => {
    const href = filtersToSearchHref({ property_type: 'APARTMENT' });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.getAll('type')).toEqual(['APARTMENT']);
  });

  it('восстанавливает new_construction=true (и описывает чипом)', () => {
    const href = filtersToSearchHref({ new_construction: true });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('new_construction')).toBe('true');
    expect(describeFilters({ new_construction: true }, t)).toContain(
      'search.filters.newConstruction',
    );
  });

  it('legacy property_type=NEW_BUILDING (тип упразднён) → new_construction=true без type', () => {
    const href = filtersToSearchHref({ property_type: 'NEW_BUILDING' });
    const qs = new URLSearchParams(href.split('?')[1] ?? '');
    expect(qs.getAll('type')).toEqual([]);
    expect(qs.get('new_construction')).toBe('true');
  });

  it('восстанавливает price_reduced=true (и описывает чипом)', () => {
    const href = filtersToSearchHref({ price_reduced: true });
    const qs = new URLSearchParams(href.split('?')[1]);
    expect(qs.get('price_reduced')).toBe('true');
    expect(describeFilters({ price_reduced: true }, t)).toContain('search.filters.priceReduced');
  });
});
