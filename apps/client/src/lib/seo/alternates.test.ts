import { describe, expect, it } from 'vitest';
import { alternatesFor, localeUrl, normalizePath } from './alternates';
import { BASE } from './base';

describe('alternatesFor', () => {
  it('points the canonical at the page’s own locale, not at /ru', () => {
    expect(alternatesFor('/listing/abc', 'uz').canonical).toBe(`${BASE}/uz/listing/abc`);
    expect(alternatesFor('/listing/abc', 'en').canonical).toBe(`${BASE}/en/listing/abc`);
    expect(alternatesFor('/listing/abc', 'ru').canonical).toBe(`${BASE}/ru/listing/abc`);
  });

  it('lists every locale plus x-default = ru in hreflang', () => {
    expect(alternatesFor('/about', 'en').languages).toEqual({
      uz: `${BASE}/uz/about`,
      ru: `${BASE}/ru/about`,
      en: `${BASE}/en/about`,
      'x-default': `${BASE}/ru/about`,
    });
  });

  it('gives the home page no trailing slash (the server redirects /ru/ → /ru)', () => {
    expect(alternatesFor('/', 'uz').canonical).toBe(`${BASE}/uz`);
    expect(alternatesFor('/', 'uz').languages['x-default']).toBe(`${BASE}/ru`);
  });
});

describe('normalizePath / localeUrl', () => {
  it('drops a trailing slash and maps / to empty', () => {
    expect(normalizePath('/')).toBe('');
    expect(normalizePath('')).toBe('');
    expect(normalizePath('/help/')).toBe('/help');
    expect(localeUrl('en', '/search?tx=SALE')).toBe(`${BASE}/en/search?tx=SALE`);
  });
});
