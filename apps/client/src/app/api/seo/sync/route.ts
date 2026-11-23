/**
 * POST /api/seo/sync — backend сообщает об изменении объявлений и агентов.
 *
 *   Authorization: Bearer <SEO_SYNC_SECRET>
 *   { "listing_ids": ["<uuid>"], "agent_ids": ["<uuid>"] }
 *
 * Сбрасывает кэш страниц (теги Data Cache) и отправляет URL uz/ru/en в IndexNow.
 * Ответ 200 — кэш сброшен; результат IndexNow — в теле (повторять стоит только 5xx).
 */
import { revalidateTag } from 'next/cache';
import { bearerAuthorized } from '@/lib/seo/bearer';
import { isValidIndexNowKey, pingIndexNow } from '@/lib/seo/indexnow';
import { parseSyncBody, syncTags, syncUrls } from '@/lib/seo/sync';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!bearerAuthorized(req.headers.get('authorization'), process.env.SEO_SYNC_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = parseSyncBody(body);
  if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 });

  const tags = syncTags(parsed);
  for (const tag of tags) revalidateTag(tag);

  const urls = syncUrls(parsed);
  let indexnow: unknown = 'skipped: INDEXNOW_KEY is not set';
  if (isValidIndexNowKey(process.env.INDEXNOW_KEY)) {
    try {
      indexnow = await pingIndexNow(urls);
    } catch (err) {
      indexnow = { error: (err as Error).message };
    }
  }
  console.info(`[seo-sync] tags=${tags.length} urls=${urls.length}`);
  return Response.json({ revalidated: tags.length, urls: urls.length, indexnow });
}
