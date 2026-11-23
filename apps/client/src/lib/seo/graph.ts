/**
 * JSON-LD страницы — один связный @graph (Organization ← WebSite ← страница).
 *
 * Узлы ссылаются друг на друга по @id; каждая страница выводит ОДИН скрипт
 * с базовыми узлами (организация и сайт) и своими (объявление, агент, крошки,
 * список, FAQ). Картинки — только стабильные URL (никаких presigned R2 с TTL 1ч).
 */
import type { Listing } from '@/lib/mock/types';
import { BASE } from './base';
import { ENTITY, verifiedContact, verifiedSameAs } from './entity';
import { offerAvailability } from './listingStatus';

export type Node = Record<string, unknown>;

export const ORG_ID = `${BASE}/#organization`;
export const WEBSITE_ID = `${BASE}/#website`;

export const ref = (id: string) => ({ '@id': id });

export function organizationNode(): Node {
  const telephone = verifiedContact(ENTITY.telephone);
  const email = verifiedContact(ENTITY.email);
  const sameAs = verifiedSameAs();
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: ENTITY.name,
    url: ENTITY.url,
    logo: { '@type': 'ImageObject', ...ENTITY.logo },
    areaServed: { '@type': 'Country', name: ENTITY.areaServed },
    ...(sameAs.length > 0 && { sameAs }),
    ...((telephone || email) && {
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        availableLanguage: ENTITY.availableLanguage,
        ...(telephone && { telephone }),
        ...(email && { email }),
      },
    }),
  };
}

export function websiteNode(locale: string): Node {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: ENTITY.name,
    url: ENTITY.url,
    inLanguage: ENTITY.availableLanguage,
    publisher: ref(ORG_ID),
    // `query` — тот параметр, который действительно читает /search.
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${BASE}/${locale}/search?query={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export type WebPageType = 'WebPage' | 'CollectionPage' | 'ProfilePage' | 'AboutPage' | 'ItemPage';

export interface WebPageInput {
  url: string;
  name: string;
  locale: string;
  type?: WebPageType;
  breadcrumbId?: string;
  mainEntityId?: string;
  /** Главная: страница об организации. */
  aboutOrg?: boolean;
}

/** WebPage — у каждого шаблона: имя страницы, язык, связь с сайтом, крошки, главный объект. */
export function webPageNode({ url, name, locale, type = 'WebPage', breadcrumbId, mainEntityId, aboutOrg }: WebPageInput): Node {
  return {
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name,
    inLanguage: locale,
    isPartOf: ref(WEBSITE_ID),
    ...(aboutOrg && { about: ref(ORG_ID) }),
    ...(breadcrumbId && { breadcrumb: ref(breadcrumbId) }),
    ...(mainEntityId && { mainEntity: ref(mainEntityId) }),
  };
}

/** Документ JSON-LD страницы: базовые узлы + узлы страницы. */
export function pageGraph(locale: string, nodes: Node[] = []): Node {
  return { '@context': 'https://schema.org', '@graph': [organizationNode(), websiteNode(locale), ...nodes] };
}

export interface Crumb {
  name: string;
  /** Абсолютный URL; у последней крошки (текущая страница) можно не давать. */
  url?: string;
}

export function breadcrumbNode(pageUrl: string, crumbs: Crumb[]): Node {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${pageUrl}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.url && { item: c.url }),
    })),
  };
}

/** Список объявлений на странице выдачи — только URL. */
export function itemListNode(pageUrl: string, urls: string[]): Node {
  return {
    '@type': 'ItemList',
    '@id': `${pageUrl}#itemlist`,
    numberOfItems: urls.length,
    itemListElement: urls.map((url, i) => ({ '@type': 'ListItem', position: i + 1, url })),
  };
}

export function faqNode(pageUrl: string, qa: { q: string; a: string }[]): Node {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: qa.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

export const agentId = (locale: string, id: string) => `${BASE}/${locale}/agents/${id}#agent`;

export interface AgentNodeInput {
  id: string;
  name: string;
  about?: string | null;
  /** Стабильный URL аватара или undefined. */
  image?: string;
  agencyName?: string | null;
}

export function agentNode(locale: string, agent: AgentNodeInput): Node {
  const url = `${BASE}/${locale}/agents/${agent.id}`;
  return {
    '@type': 'RealEstateAgent',
    '@id': agentId(locale, agent.id),
    name: agent.name,
    url,
    ...(agent.about && { description: agent.about }),
    ...(agent.image && { image: agent.image }),
    areaServed: { '@type': 'Country', name: ENTITY.areaServed },
    ...(agent.agencyName && { worksFor: { '@type': 'Organization', name: agent.agencyName } }),
  };
}

/** Стабильный URL n-й фотографии объявления (стрим через /api/og/listing). */
export const listingImageUrl = (id: string, n: number) =>
  n === 0 ? `${BASE}/api/og/listing/${id}` : `${BASE}/api/og/listing/${id}?i=${n}`;

export interface ListingNodeInput {
  listing: Listing;
  locale: string;
  headline: string;
  /** Узел агента-продавца, если объявление размещено агентом с публичным профилем. */
  agent?: AgentNodeInput;
}

/**
 * Частное объявление (продавец — собственник, не агент). До решения владельца
 * о приватности (аудит backend, раздел K) в разметке нет точной точки и адреса
 * с номером дома: координаты округляются до ~100 м, streetAddress не выводится.
 */
export const isPrivateSeller = (listing: Pick<Listing, 'agent'>) => listing.agent?.kind === 'owner';

/** 3 знака после запятой ≈ 110 м по широте. */
export const roundCoord = (v: number) => Math.round(v * 1000) / 1000;

export function listingNodes({ listing, locale, headline, agent }: ListingNodeInput): Node[] {
  const url = `${BASE}/${locale}/listing/${listing.id}`;
  const privateSeller = isPrivateSeller(listing);
  const node: Node = {
    '@type': 'RealEstateListing',
    '@id': `${url}#listing`,
    name: headline,
    url,
    inLanguage: locale,
    isPartOf: ref(WEBSITE_ID),
    ...(listing.desc && { description: listing.desc }),
    datePosted: listing.createdAt,
    ...(listing.updatedAt && { dateModified: listing.updatedAt }),
    ...(listing.photos.length > 0 && {
      image: listing.photos.slice(0, 10).map((_, i) => listingImageUrl(listing.id, i)),
    }),
    offers: {
      '@type': 'Offer',
      price: listing.price,
      priceCurrency: listing.currency,
      availability: offerAvailability(listing),
      businessFunction:
        listing.tx === 'RENT'
          ? 'http://purl.org/goodrelations/v1#LeaseOut'
          : 'http://purl.org/goodrelations/v1#Sell',
      ...(agent && { offeredBy: ref(agentId(locale, agent.id)) }),
    },
    ...(listing.lat != null &&
      listing.lng != null && {
        geo: {
          '@type': 'GeoCoordinates',
          latitude: privateSeller ? roundCoord(listing.lat) : listing.lat,
          longitude: privateSeller ? roundCoord(listing.lng) : listing.lng,
        },
      }),
    address: {
      '@type': 'PostalAddress',
      ...(listing.district && { addressLocality: listing.district }),
      // addressRegion не задаём: города в карточке нет (жёсткое «Toshkent» было ошибкой).
      addressCountry: 'UZ',
      // Адрес частного продавца (часто с номером дома) в разметку не отдаём.
      ...(listing.address && !privateSeller && { streetAddress: listing.address }),
    },
  };
  return agent ? [node, agentNode(locale, agent)] : [node];
}

/** Все @id, на которые ссылаются узлы, но которых нет в графе (должно быть пусто). */
export function danglingRefs(graph: Node): string[] {
  const nodes = (graph['@graph'] as Node[]) ?? [];
  const ids = new Set<string>();
  const refs: string[] = [];
  const walk = (v: unknown, top: boolean) => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, false));
    if (v && typeof v === 'object') {
      const o = v as Node;
      const keys = Object.keys(o);
      if (typeof o['@id'] === 'string') {
        if (top || keys.length > 1) ids.add(o['@id'] as string);
        else refs.push(o['@id'] as string);
      }
      for (const k of keys) if (k !== '@id') walk(o[k], false);
    }
  };
  nodes.forEach((n) => walk(n, true));
  return refs.filter((r) => !ids.has(r));
}
