/**
 * POST /api/indexnow — для бэкенда: { "urls": ["https://avino.uz/ru/listing/…", …] }.
 * Авторизация: Authorization: Bearer <INDEXNOW_SECRET>. Чужие хосты отбрасываются.
 */
import { bearerAuthorized } from '@/lib/seo/bearer';
import { pingIndexNow } from '@/lib/seo/indexnow';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!bearerAuthorized(req.headers.get('authorization'), process.env.INDEXNOW_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let urls: unknown;
  try {
    urls = ((await req.json()) as { urls?: unknown }).urls;
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(urls) || urls.length === 0 || !urls.every((u) => typeof u === 'string')) {
    return Response.json({ error: 'urls must be a non-empty string array' }, { status: 400 });
  }
  try {
    const results = await pingIndexNow(urls as string[]);
    return Response.json({ results }, { status: results.every((r) => r.ok) ? 200 : 502 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }
}
