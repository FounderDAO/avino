/**
 * Стабильный OG-image для шаринга объявления (route вне [locale]).
 *
 * Зачем: `og:image` нельзя указывать прямо на presigned R2-ссылку — у неё TTL 1ч,
 * и соцсети, кешируя превью, дотягивают картинку позже → 403 → превью без фото
 * (тот же класс бага, что ADR-0086). Здесь URL стабильный (`/api/og/listing/:id`),
 * а живая presigned-ссылка тянется серверно на каждый запрос и стримится наружу.
 *
 * Фолбэк на любой сбой — бренд-иконка, чтобы превью никогда не было без картинки.
 */
import { getListingById } from '@/lib/api/listings';
import { BASE } from '@/lib/seo/base';

export const dynamic = 'force-dynamic';

const fallback = () =>
  Response.redirect(new URL('/apple-icon.png', BASE).toString(), 302);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const listing = await getListingById(id);
    // ?i=<n> — n-я фотография (стабильные URL картинок для JSON-LD), по умолчанию первая.
    const raw = new URL(req.url).searchParams.get('i');
    const index = raw && /^\d{1,2}$/.test(raw) ? Number(raw) : 0;
    const src = listing?.photos?.[index]?.url;
    if (!src) return fallback();

    const upstream = await fetch(src, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) return fallback();

    const upstreamType = upstream.headers.get('content-type');
    const contentType = upstreamType?.startsWith('image/') ? upstreamType : 'image/jpeg';
    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return fallback();
  }
}
