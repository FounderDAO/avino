import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { resolveApiBase } from './lib/api/base';
import {
  AvailabilityCache,
  LISTING_PATH_RE,
  RETRY_AFTER_SECONDS,
  classifyListingResponse,
  type ListingAvailability,
} from './lib/seo/listingAvailability';

const intl = createMiddleware(routing);
const availability = new AvailabilityCache();

/** Состояние объявления в API; при любом сбое — без вмешательства (страница решит сама). */
async function listingAvailability(id: string): Promise<ListingAvailability> {
  const cached = availability.get(id);
  if (cached) return cached;
  try {
    const res = await fetch(`${resolveApiBase()}/listings/${id}`, {
      headers: { Accept: 'application/json', 'Accept-Language': 'ru' },
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    });
    const body = res.ok ? null : await res.json().catch(() => null);
    const value = classifyListingResponse(res.status, body);
    availability.set(id, value);
    return value;
  } catch {
    return { kind: 'pass' };
  }
}

export default async function middleware(req: NextRequest) {
  const response = intl(req);
  const match = req.nextUrl.pathname.match(LISTING_PATH_RE);
  if (!match) return response;

  // Объявление удалено (410) или временно на повторной модерации (503 + Retry-After):
  // та же страница, но с честным для поисковиков статусом (SEO AUD-10, контракт B).
  const state = await listingAvailability(match[2].toLowerCase());
  if (state.kind === 'pass') return response;
  const status = state.kind === 'gone' ? 410 : 503;
  const out = NextResponse.rewrite(req.nextUrl, { status });
  response.headers.forEach((value, key) => out.headers.set(key, value));
  if (state.kind === 'under_review') out.headers.set('Retry-After', String(RETRY_AFTER_SECONDS));
  return out;
}

export const config = {
  // Все маршруты, кроме API, статики Next и файлов с расширением.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
  // Node.js runtime: рантайм-env (API_INTERNAL_URL) и кэш состояния объявлений в памяти процесса.
  runtime: 'nodejs',
};
