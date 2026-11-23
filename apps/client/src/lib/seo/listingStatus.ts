/**
 * SEO-статус объявления: доступность в JSON-LD и индексация закрытых.
 *
 * Проданное/сданное объявление остаётся доступным по ссылке (страница 200),
 * но в разметке не может быть InStock — иначе Google показывает «в наличии».
 */
import type { Listing } from '@/lib/mock/types';

/**
 * Индексировать ли закрытые (SOLD/RENTED) объявления.
 * TODO(owner): решение владельца ещё не принято. По умолчанию — индексировать
 * (страница полезна: цена, район, похожие). `INDEX_CLOSED_LISTINGS=false` —
 * noindex, follow; в sitemap закрытых и так нет (/search без include_closed).
 */
export function indexClosedListings(env: string | undefined = process.env.INDEX_CLOSED_LISTINGS): boolean {
  return env !== 'false';
}

export function isClosedListing(listing: Pick<Listing, 'status'>): boolean {
  return listing.status === 'SOLD' || listing.status === 'RENTED';
}

/** schema.org availability для Offer: SOLD → SoldOut, RENTED → Discontinued. */
export function offerAvailability(listing: Pick<Listing, 'status'>): string {
  if (listing.status === 'SOLD') return 'https://schema.org/SoldOut';
  if (listing.status === 'RENTED') return 'https://schema.org/Discontinued';
  return 'https://schema.org/InStock';
}
