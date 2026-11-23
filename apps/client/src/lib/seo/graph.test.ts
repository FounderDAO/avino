import { describe, expect, it } from 'vitest';
import type { Listing } from '@/lib/mock/types';
import {
  ORG_ID,
  WEBSITE_ID,
  agentNode,
  breadcrumbNode,
  danglingRefs,
  faqNode,
  itemListNode,
  listingNodes,
  pageGraph,
  webPageNode,
  type Node,
} from './graph';

const BASE = 'https://avino.uz';

const listing = {
  id: 'd64bed72-8421-4249-967b-b68d85065dcd',
  tx: 'SALE',
  type: 'HOUSE',
  promo: 'NONE',
  price: '165000',
  currency: 'USD',
  title: 'ул. Мустакиллик 1',
  desc: 'Просторный дом',
  district: 'Фергана',
  address: 'ул. Мустакиллик 1',
  lat: 40.38,
  lng: 71.78,
  photos: [
    { url: 'https://x.r2.cloudflarestorage.com/a.jpg?X-Amz-Expires=3600' },
    { url: 'https://x.r2.cloudflarestorage.com/b.jpg?X-Amz-Expires=3600' },
  ],
  agent: { name: 'КупиДом', pro: true, agency: '', kind: 'agent' },
  ownerId: 'c2d23e5d-76b2-40ce-bfb0-36f04471373a',
  createdAt: '2026-11-01T10:00:00Z',
  status: 'SOLD',
} as unknown as Listing;

/** Узел графа по @type. */
const byType = (graph: Node, type: string) =>
  (graph['@graph'] as Node[]).find((n) => n['@type'] === type) as Node;

/** Как браузер/валидатор: строка JSON-LD → объект. */
const roundTrip = (graph: Node) => JSON.parse(JSON.stringify(graph)) as Node;

const pages: Record<string, Node> = {
  home: pageGraph('ru', [faqNode(`${BASE}/ru`, [{ q: 'Сколько стоит?', a: 'Бесплатно.' }])]),
  listing: pageGraph('ru', [
    ...listingNodes({
      listing,
      locale: 'ru',
      headline: 'Продаётся дом — Фергана',
      agent: { id: listing.ownerId!, name: 'КупиДом' },
    }),
    breadcrumbNode(`${BASE}/ru/listing/${listing.id}`, [
      { name: 'Главная', url: `${BASE}/ru` },
      { name: 'Продаётся дом — Фергана', url: `${BASE}/ru/listing/${listing.id}` },
    ]),
  ]),
  agent: pageGraph('uz', [agentNode('uz', { id: 'a1', name: 'Ali', agencyName: 'KupiDom' })]),
  search: pageGraph('en', [
    breadcrumbNode(`${BASE}/en/search?tx=SALE`, [{ name: 'Home', url: `${BASE}/en` }]),
    itemListNode(`${BASE}/en/search?tx=SALE`, [`${BASE}/en/listing/x`, `${BASE}/en/listing/y`]),
  ]),
};

describe('page graphs', () => {
  it.each(Object.keys(pages))('%s: one @graph, every @id reference resolves', (name) => {
    const graph = roundTrip(pages[name]);
    expect(graph['@context']).toBe('https://schema.org');
    expect(Array.isArray(graph['@graph'])).toBe(true);
    expect(danglingRefs(graph)).toEqual([]);
    expect(byType(graph, 'Organization')['@id']).toBe(ORG_ID);
    expect((byType(graph, 'WebSite').publisher as Node)['@id']).toBe(ORG_ID);
  });

  it.each(Object.keys(pages))('%s: no expiring presigned image URLs', (name) => {
    const json = JSON.stringify(pages[name]);
    expect(json).not.toMatch(/X-Amz-|r2\.cloudflarestorage\.com/);
  });

  it('organization has logo and only verified sameAs', () => {
    const org = byType(pages.home, 'Organization');
    expect((org.logo as Node).url).toBe(`${BASE}/apple-icon.png`);
    expect(org.sameAs).toEqual(['https://t.me/avino_uz', 'https://www.instagram.com/avino.uz']);
    expect(org).not.toHaveProperty('contactPoint');
  });

  it('website search action uses the query param /search reads', () => {
    const site = byType(pages.search, 'WebSite');
    expect(site['@id']).toBe(WEBSITE_ID);
    expect(JSON.stringify(site.potentialAction)).toContain('/en/search?query={search_term_string}');
  });

  it('listing: SoldOut, offeredBy the agent node, stable images, inLanguage', () => {
    const node = byType(pages.listing, 'RealEstateListing');
    expect(node['@id']).toBe(`${BASE}/ru/listing/${listing.id}#listing`);
    expect(node.inLanguage).toBe('ru');
    const offer = node.offers as Node;
    expect(offer.availability).toBe('https://schema.org/SoldOut');
    expect((offer.offeredBy as Node)['@id']).toBe(`${BASE}/ru/agents/${listing.ownerId}#agent`);
    expect(node.image).toEqual([
      `${BASE}/api/og/listing/${listing.id}`,
      `${BASE}/api/og/listing/${listing.id}?i=1`,
    ]);
    expect(byType(pages.listing, 'RealEstateAgent')['@id']).toBe(`${BASE}/ru/agents/${listing.ownerId}#agent`);
  });

  it('dateModified only when the API gives a content date (SEO AUD-6)', () => {
    const withDate = { ...listing, updatedAt: '2026-11-20T08:00:00.000Z' } as Listing;
    expect(byType(pageGraph('ru', listingNodes({ listing: withDate, locale: 'ru', headline: 'h' })), 'RealEstateListing').dateModified).toBe(
      '2026-11-20T08:00:00.000Z',
    );
    expect(byType(pages.listing, 'RealEstateListing')).not.toHaveProperty('dateModified');
  });

  it('owner listing has no offeredBy and no agent node', () => {
    const graph = pageGraph('ru', listingNodes({ listing, locale: 'ru', headline: 'h' }));
    expect((byType(graph, 'RealEstateListing').offers as Node).offeredBy).toBeUndefined();
    expect(byType(graph, 'RealEstateAgent')).toBeUndefined();
    expect(danglingRefs(graph)).toEqual([]);
  });

  it('private seller: rounded geo, no street address; agent listing keeps both', () => {
    const owner = { ...listing, agent: { ...listing.agent, kind: 'owner' } } as Listing;
    const node = byType(pageGraph('ru', listingNodes({ listing: owner, locale: 'ru', headline: 'h' })), 'RealEstateListing');
    expect(node.geo).toMatchObject({ latitude: 40.38, longitude: 71.78 });
    const precise = { ...owner, lat: 41.311081, lng: 69.279737 } as Listing;
    const geo = byType(pageGraph('ru', listingNodes({ listing: precise, locale: 'ru', headline: 'h' })), 'RealEstateListing').geo as Node;
    expect(geo).toMatchObject({ latitude: 41.311, longitude: 69.28 });
    expect((node.address as Node).streetAddress).toBeUndefined();
    const agentListing = byType(pages.listing, 'RealEstateListing');
    expect((agentListing.address as Node).streetAddress).toBe('ул. Мустакиллик 1');
  });

  it('agent: name, url, areaServed, worksFor', () => {
    const agent = byType(pages.agent, 'RealEstateAgent');
    expect(agent).toMatchObject({
      name: 'Ali',
      url: `${BASE}/uz/agents/a1`,
      worksFor: { '@type': 'Organization', name: 'KupiDom' },
    });
    expect(agent.areaServed).toBeDefined();
  });

  it('search: ItemList of listing URLs with positions', () => {
    const list = byType(pages.search, 'ItemList');
    expect(list.numberOfItems).toBe(2);
    expect((list.itemListElement as Node[])[1]).toEqual({ '@type': 'ListItem', position: 2, url: `${BASE}/en/listing/y` });
  });

  it('webPageNode links page, breadcrumb and main entity; refs resolve', () => {
    const url = `${BASE}/ru/listing/${listing.id}`;
    const graph = pageGraph('ru', [
      webPageNode({ url, name: 'h', locale: 'ru', type: 'ItemPage', breadcrumbId: `${url}#breadcrumb`, mainEntityId: `${url}#listing` }),
      ...listingNodes({ listing, locale: 'ru', headline: 'h' }),
      breadcrumbNode(url, [{ name: 'Главная', url: `${BASE}/ru` }, { name: 'h', url }]),
    ]);
    expect(byType(graph, 'ItemPage')).toMatchObject({ '@id': `${url}#webpage`, inLanguage: 'ru', isPartOf: { '@id': WEBSITE_ID } });
    expect(danglingRefs(graph)).toEqual([]);
    const home = webPageNode({ url: `${BASE}/ru`, name: 'Avino', locale: 'ru', aboutOrg: true });
    expect(home.about).toEqual({ '@id': ORG_ID });
  });

  it('danglingRefs catches a reference to a missing node', () => {
    const graph = { '@graph': [{ '@type': 'WebSite', '@id': 'w', publisher: { '@id': 'missing' } }] };
    expect(danglingRefs(graph)).toEqual(['missing']);
  });
});
