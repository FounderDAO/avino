/**
 * API-хост не должен попадать в поисковый индекс (SEO AUD-16).
 *
 * Сайт — avino.uz; api.avino.uz отдаёт JSON для клиентов, а поисковики
 * находили его ссылки (картинки, ответы) и могли индексировать. Здесь:
 * - `GET /robots.txt` → `Disallow: /` (вне глобального префикса /api);
 * - каждый ответ — `X-Robots-Tag: noindex, nofollow` (robots.txt лишь просит
 *   не обходить, из индекса держит именно этот заголовок).
 */
import type { NextFunction, Request, Response } from 'express';

export const API_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n';
export const API_X_ROBOTS_TAG = 'noindex, nofollow';

export function apiNoIndexMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Robots-Tag', API_X_ROBOTS_TAG);
  if (req.path === '/robots.txt' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(req.method === 'HEAD' ? '' : API_ROBOTS_TXT);
    return;
  }
  next();
}
