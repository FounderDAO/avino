/**
 * IndexNow: мгновенное уведомление Bing/Yandex (и всех участников протокола)
 * о новых, изменённых и снятых URL. Ключ — env INDEXNOW_KEY, файл ключа
 * отдаётся по /{INDEXNOW_KEY}.txt (rewrite в next.config → /api/indexnow/key).
 *
 * Триггер — на бэкенде (создание/смена цены/закрытие/удаление объявления):
 * он вызывает POST /api/indexnow с Bearer INDEXNOW_SECRET или шлёт сам.
 */
import { BASE } from './base';

export const INDEXNOW_ENDPOINTS = ['https://yandex.com/indexnow', 'https://api.indexnow.org/indexnow'] as const;
/** Лимит протокола на один запрос. */
export const INDEXNOW_BATCH = 10_000;

/** Ключ IndexNow: 8–128 символов [a-zA-Z0-9-] (требование протокола). */
export function isValidIndexNowKey(key: string | undefined): key is string {
  return typeof key === 'string' && /^[a-zA-Z0-9-]{8,128}$/.test(key);
}

export interface PingResult {
  endpoint: string;
  batch: number;
  status: number | null;
  attempts: number;
  ok: boolean;
}

export interface PingOptions {
  key?: string;
  base?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

/** Только URL нашего хоста, без дублей. */
export function sameHostUrls(urls: string[], base = BASE): string[] {
  const host = new URL(base).host;
  const out = new Set<string>();
  for (const u of urls) {
    try {
      const url = new URL(u);
      if (url.host === host && (url.protocol === 'https:' || url.protocol === 'http:')) out.add(url.toString());
    } catch {
      // не URL — пропускаем
    }
  }
  return [...out];
}

/** 200/202 — принято; 429 и 5xx — повторяем с backoff; прочее (400/403/422) — нет. */
const retryable = (status: number) => status === 429 || status >= 500;

export async function pingIndexNow(urls: string[], opts: PingOptions = {}): Promise<PingResult[]> {
  const key = opts.key ?? process.env.INDEXNOW_KEY;
  const base = opts.base ?? BASE;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const maxAttempts = opts.maxAttempts ?? 3;
  if (!isValidIndexNowKey(key)) throw new Error('[indexnow] INDEXNOW_KEY is missing or invalid');

  const list = sameHostUrls(urls, base);
  const host = new URL(base).host;
  const results: PingResult[] = [];
  for (let b = 0; b * INDEXNOW_BATCH < list.length; b++) {
    const body = JSON.stringify({
      host,
      key,
      keyLocation: `${base}/${key}.txt`,
      urlList: list.slice(b * INDEXNOW_BATCH, (b + 1) * INDEXNOW_BATCH),
    });
    for (const endpoint of INDEXNOW_ENDPOINTS) {
      let status: number | null = null;
      let attempts = 0;
      while (attempts < maxAttempts) {
        attempts++;
        try {
          const res = await fetchImpl(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body,
          });
          status = res.status;
          if (!retryable(status)) break;
        } catch {
          status = null;
        }
        if (attempts < maxAttempts) await sleep(1000 * 2 ** (attempts - 1));
      }
      const ok = status === 200 || status === 202;
      results.push({ endpoint, batch: b, status, attempts, ok });
      console.info(`[indexnow] ${endpoint} batch=${b} status=${status} attempts=${attempts}`);
    }
  }
  return results;
}
