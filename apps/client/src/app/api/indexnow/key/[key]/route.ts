/**
 * Файл ключа IndexNow. Публичный адрес /{INDEXNOW_KEY}.txt переписывается сюда
 * (next.config rewrites); отвечаем ключом только на совпадение с env.
 */
import { isValidIndexNowKey } from '@/lib/seo/indexnow';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await params;
  const expected = process.env.INDEXNOW_KEY;
  if (!isValidIndexNowKey(expected) || key !== expected) {
    return new Response('Not Found', { status: 404 });
  }
  return new Response(expected, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
