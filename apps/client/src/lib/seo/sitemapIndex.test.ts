import { describe, expect, it } from 'vitest';
import {
  MAX_LISTING_API_PAGES,
  PAGES_PER_LISTING_FILE,
  SEARCH_API_PAGE,
  listingFileCount,
  listingFilePages,
  parseListingFileId,
  sitemapIds,
  sitemapIndexXml,
} from './sitemapIndex';

const PER_FILE = PAGES_PER_LISTING_FILE * SEARCH_API_PAGE;

describe('listing files', () => {
  it('keeps each file at or under 10,000 URLs after locale expansion', () => {
    expect(PER_FILE * 3).toBeLessThanOrEqual(10_000);
    expect(PER_FILE).toBeGreaterThan(0);
  });

  it('counts files from the listing total, at least one', () => {
    expect(listingFileCount(0)).toBe(1);
    expect(listingFileCount(1785)).toBe(1);
    expect(listingFileCount(PER_FILE)).toBe(1);
    expect(listingFileCount(PER_FILE + 1)).toBe(2);
    expect(listingFileCount(10_000_000)).toBe(Math.ceil(MAX_LISTING_API_PAGES / PAGES_PER_LISTING_FILE));
  });

  it('maps file n to consecutive API page ranges', () => {
    expect(listingFilePages(0)).toEqual({ from: 0, to: PAGES_PER_LISTING_FILE });
    expect(listingFilePages(1)).toEqual({ from: PAGES_PER_LISTING_FILE, to: 2 * PAGES_PER_LISTING_FILE });
  });

  it('parses only listings-<n> ids', () => {
    expect(parseListingFileId('listings-0')).toBe(0);
    expect(parseListingFileId('listings-12')).toBe(12);
    expect(parseListingFileId('listings-01')).toBeNull();
    expect(parseListingFileId('listings-')).toBeNull();
    expect(parseListingFileId('agents')).toBeNull();
  });
});

describe('sitemap index', () => {
  it('lists static, landings, agents and every listings file', () => {
    expect(sitemapIds(PER_FILE * 2 + 5)).toEqual(['static', 'landings', 'agents', 'listings-0', 'listings-1', 'listings-2']);
  });

  it('renders a sitemapindex without lastmod', () => {
    const xml = sitemapIndexXml('https://avino.uz', ['static', 'listings-0']);
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<loc>https://avino.uz/sitemap/static.xml</loc>');
    expect(xml).toContain('<loc>https://avino.uz/sitemap/listings-0.xml</loc>');
    expect(xml).not.toContain('lastmod');
  });
});
