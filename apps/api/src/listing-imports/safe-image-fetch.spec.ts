import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { ImageFetchError, isBlockedAddress, safeFetchImage, sniffImageMime } from './safe-image-fetch';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

describe('sniffImageMime', () => {
  it('распознаёт три сигнатуры и отвергает остальное', () => {
    expect(sniffImageMime(JPEG)).toBe('image/jpeg');
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(WEBP)).toBe('image/webp');
    expect(sniffImageMime(Buffer.from('<!doctype html>'))).toBeNull();
    expect(sniffImageMime(Buffer.from('GIF89a'))).toBeNull();
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1',
    '::ffff:8.8.8.8', '64:ff9b::808:808', 'fe80::1%lo0', 'not-an-ip',
  ])('%s — заблокирован', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.216.34', '2606:4700::1111'])('%s — разрешён', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('safeFetchImage', () => {
  let server: Server;
  let base: string;
  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
    '/jpeg': (_q, s) => s.writeHead(200, { 'Content-Type': 'text/plain' }).end(JPEG),
    '/html': (_q, s) => s.writeHead(200, { 'Content-Type': 'image/jpeg' }).end('<html></html>'),
    '/404': (_q, s) => s.writeHead(404).end(),
    '/503': (_q, s) => s.writeHead(503).end(),
    '/r1': (_q, s) => s.writeHead(302, { Location: '/jpeg' }).end(),
    '/r-loop': (_q, s) => s.writeHead(302, { Location: '/r-loop' }).end(),
    '/big-header': (_q, s) => s.writeHead(200, { 'Content-Length': String(11 * 1024 * 1024) }).end(),
    '/big-stream': (_q, s) => {
      s.writeHead(200);
      s.write(JPEG);
      s.end(Buffer.alloc(2048));
    },
    '/slow': () => undefined, // никогда не отвечает
    '/slow-body': (_q, s) => {
      // заголовки и начало тела приходят, остаток — никогда
      s.writeHead(200);
      s.write(JPEG);
    },
  };

  beforeAll(async () => {
    server = createServer((req, res) => (routes[req.url ?? ''] ?? routes['/404'])(req, res));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  // Локальный сервер слушает 127.0.0.1 на случайном порту: в тестах снимаем
  // блок-лист и ограничение портов, кроме кейсов, которые проверяют именно их.
  const open = { allowPrivate: true };

  const expectError = async (promise: Promise<unknown>, code: string, retryable?: boolean) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ImageFetchError);
    expect((error as ImageFetchError).code).toBe(code);
    if (retryable !== undefined) expect((error as ImageFetchError).retryable).toBe(retryable);
    return error as ImageFetchError;
  };

  it('скачивает картинку, тип — по байтам, а не по Content-Type', async () => {
    const result = await safeFetchImage(`${base}/jpeg`, open);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.buffer.equals(JPEG)).toBe(true);
  });

  it('HTML под видом image/jpeg → NOT_AN_IMAGE', async () => {
    await expectError(safeFetchImage(`${base}/html`, open), 'NOT_AN_IMAGE', false);
  });

  it('404 → HTTP_ERROR без повтора, 503 → с повтором', async () => {
    const e404 = await expectError(safeFetchImage(`${base}/404`, open), 'HTTP_ERROR', false);
    expect(e404.httpStatus).toBe(404);
    await expectError(safeFetchImage(`${base}/503`, open), 'HTTP_ERROR', true);
  });

  it('следует редиректу; больше 3 редиректов → BLOCKED_HOST', async () => {
    expect((await safeFetchImage(`${base}/r1`, open)).mimeType).toBe('image/jpeg');
    await expectError(safeFetchImage(`${base}/r-loop`, open), 'BLOCKED_HOST', false);
  });

  it('без allowPrivate: 127.0.0.1 и IPv4-mapped литералы блокируются до запроса', async () => {
    await expectError(safeFetchImage(`${base}/jpeg`), 'BLOCKED_HOST', false);
    await expectError(safeFetchImage('http://[::ffff:127.0.0.1]/x'), 'BLOCKED_HOST', false);
  });

  it('без allowPrivate: localhost блокируется через lookup', async () => {
    await expectError(safeFetchImage('http://localhost/x'), 'BLOCKED_HOST', false);
  });

  it('недопустимые схема и порт → BLOCKED_HOST', async () => {
    await expectError(safeFetchImage('ftp://example.com/x.jpg'), 'BLOCKED_HOST', false);
    await expectError(safeFetchImage('http://example.com:8080/x.jpg'), 'BLOCKED_HOST', false);
  });

  it('Content-Length больше лимита → TOO_LARGE; поток больше лимита → TOO_LARGE', async () => {
    await expectError(safeFetchImage(`${base}/big-header`, open), 'TOO_LARGE', false);
    await expectError(safeFetchImage(`${base}/big-stream`, { ...open, maxBytes: 1024 }), 'TOO_LARGE', false);
  });

  it('таймаут → FETCH_FAILED с повтором', async () => {
    await expectError(safeFetchImage(`${base}/slow`, { ...open, timeoutMs: 200 }), 'FETCH_FAILED', true);
  });

  it('таймаут во время чтения тела → FETCH_FAILED с повтором', async () => {
    await expectError(safeFetchImage(`${base}/slow-body`, { ...open, timeoutMs: 200 }), 'FETCH_FAILED', true);
  });
});
