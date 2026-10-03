import { lookup as dnsLookup, LookupAddress } from 'dns';
import { IncomingMessage, request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { BlockList, isIP, LookupFunction } from 'net';
import type { ImageMimeType } from '../listing-media';

export type ImportPhotoErrorCode =
  | 'HTTP_ERROR'
  | 'FETCH_FAILED'
  | 'NOT_AN_IMAGE'
  | 'TOO_LARGE'
  | 'BLOCKED_HOST'
  | 'MEDIA_LIMIT'
  | 'LISTING_UNAVAILABLE'
  | 'INTERNAL';

export class ImageFetchError extends Error {
  constructor(
    readonly code: ImportPhotoErrorCode,
    readonly retryable: boolean,
    readonly httpStatus: number | null = null,
  ) {
    super(code);
    this.name = 'ImageFetchError';
  }
}

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_PORTS = new Set(['', '80', '443']);
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const BLOCKED_CODE = 'EBLOCKEDHOST';

// Два отдельных списка: в общем BlockList правило `::ffff:0:0/96` (ipv6)
// срабатывает на любой IPv4-адрес при check(..., 'ipv4') — 8.8.8.8 оказался бы
// заблокирован. Каждое семейство проверяем только своим списком.
const blockListV4 = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  blockListV4.addSubnet(network, prefix, 'ipv4');
}
const blockListV6 = new BlockList();
for (const [network, prefix] of [
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
  // IPv4-mapped и NAT64 — целиком: публичные сайты так не резолвятся, а URL-парсер
  // переписывает [::ffff:127.0.0.1] в [::ffff:7f00:1].
  ['::ffff:0:0', 96], ['64:ff9b::', 96],
] as const) {
  blockListV6.addSubnet(network, prefix, 'ipv6');
}

/** Адрес нельзя запрашивать с сервера (SSRF, спека 2026-10-03 §3). Не-IP — тоже нельзя. */
export function isBlockedAddress(address: string): boolean {
  // Адрес с zone ID (fe80::1%lo0) публичным не бывает; не полагаемся на то,
  // как BlockList разбирает такую запись.
  if (address.includes('%')) return true;
  const family = isIP(address);
  if (family === 4) return blockListV4.check(address, 'ipv4');
  if (family === 6) return blockListV6.check(address, 'ipv6');
  return true;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Тип по первым байтам: JPEG, PNG, WebP; остальное — `null`. */
export function sniffImageMime(buffer: Buffer): ImageMimeType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/**
 * `lookup` для http(s).request: проверка адресов в момент соединения, поэтому
 * подмена DNS между проверкой и запросом (rebinding) не проходит. Блокируем,
 * если в блок-листе хотя бы один адрес: Node (autoSelectFamily) может пойти
 * на любой из них.
 */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, '', 0);
      const list = addresses as unknown as LookupAddress[];
      if (list.length === 0 || (!allowPrivate && list.some((a) => isBlockedAddress(a.address)))) {
        return callback(Object.assign(new Error('blocked host'), { code: BLOCKED_CODE }), '', 0);
      }
      if ((options as { all?: boolean }).all) {
        return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      }
      callback(null, list[0].address, list[0].family);
    });
  };
}

function assertAllowedUrl(raw: string, allowPrivate: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageFetchError('BLOCKED_HOST', false);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImageFetchError('BLOCKED_HOST', false);
  if (allowPrivate) return url;
  if (!ALLOWED_PORTS.has(url.port)) throw new ImageFetchError('BLOCKED_HOST', false);
  // IP-литерал Node соединяет без lookup — проверяем сами. URL-парсер уже
  // нормализовал 0x7f.1 / 2130706433 / [::ffff:127.0.0.1] в канонический вид.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isBlockedAddress(host)) throw new ImageFetchError('BLOCKED_HOST', false);
  return url;
}

/** Закрыть ответ, тело которого не нужно (редирект, ошибка): не дочитываем. */
function discard(response: IncomingMessage): void {
  response.on('error', () => undefined);
  response.destroy();
}

function requestOnce(url: URL, signal: AbortSignal, allowPrivate: boolean): Promise<IncomingMessage> {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'GET',
      headers: { 'User-Agent': 'AvinoImporter/1.0', Accept: 'image/*' },
      lookup: guardedLookup(allowPrivate),
      signal,
      agent: false,
    });
    req.on('response', resolve);
    // Обработчик остаётся и после ответа: обрыв во время чтения тела не должен
    // стать необработанным 'error'.
    req.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === BLOCKED_CODE
          ? new ImageFetchError('BLOCKED_HOST', false)
          : new ImageFetchError('FETCH_FAILED', true),
      );
    });
    req.end();
  });
}

function readCapped(response: IncomingMessage, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const declared = Number(response.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBytes) {
    discard(response);
    return Promise.reject(new ImageFetchError('TOO_LARGE', false));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;
    const finish = (error: ImageFetchError | null) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (error) {
        discard(response);
        reject(error);
      } else {
        resolve(Buffer.concat(chunks));
      }
    };
    // Таймаут — общий на весь запрос, включая чтение тела.
    const onAbort = () => finish(new ImageFetchError('FETCH_FAILED', true));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });

    response.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) return finish(new ImageFetchError('TOO_LARGE', false));
      chunks.push(chunk);
    });
    response.on('end', () => finish(null));
    response.on('error', () => finish(new ImageFetchError('FETCH_FAILED', true)));
    // 'close' без 'end' — соединение оборвалось.
    response.on('close', () => finish(new ImageFetchError('FETCH_FAILED', true)));
  });
}

/**
 * Скачать изображение по ссылке из файла импорта. Вся SSRF-защита — здесь
 * (спека 2026-10-03 §3). `allowPrivate` — только для тестов на локальном сервере.
 */
export async function safeFetchImage(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; allowPrivate?: boolean } = {},
): Promise<{ buffer: Buffer; mimeType: ImageMimeType }> {
  const allowPrivate = opts.allowPrivate ?? false;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = assertAllowedUrl(current, allowPrivate);
    const response = await requestOnce(url, signal, allowPrivate);
    const status = response.statusCode ?? 0;
    if (REDIRECTS.has(status)) {
      const location = response.headers.location;
      discard(response);
      if (!location) throw new ImageFetchError('HTTP_ERROR', false, status);
      try {
        current = new URL(location, url).toString();
      } catch {
        throw new ImageFetchError('BLOCKED_HOST', false);
      }
      continue;
    }
    if (status < 200 || status >= 300) {
      discard(response);
      throw new ImageFetchError('HTTP_ERROR', status === 429 || status >= 500, status);
    }
    const buffer = await readCapped(response, maxBytes, signal);
    const mimeType = sniffImageMime(buffer);
    if (!mimeType) throw new ImageFetchError('NOT_AN_IMAGE', false);
    return { buffer, mimeType };
  }
  throw new ImageFetchError('BLOCKED_HOST', false);
}
