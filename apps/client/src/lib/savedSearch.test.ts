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

describe('filtersToSearchHref ignores points (no redraw)', () => {
  it('does not put points into the URL', () => {
    const href = filtersToSearchHref({ transaction_type: 'SALE', points: '41,69;41,70;42,69' });
    expect(href).not.toContain('points');
  });
});
