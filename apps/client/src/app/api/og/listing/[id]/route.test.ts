/**
 * OG-image route-handler: стабильный URL для превью объявления.
 * Стримит первое фото листинга (свежая presigned-ссылка тянется серверно),
 * на любой сбой — 302 на бренд-фолбэк. Закрывает баг «протухающего og:image».
 */
import { it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/api/listings', () => ({
  getListingById: vi.fn(),
}));
vi.mock('@/lib/seo/base', () => ({ BASE: 'https://avino.uz' }));

import { getListingById } from '@/lib/api/listings';

const mockedGet = vi.mocked(getListingById);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('стримит байты фото с image content-type и суточным кешем', async () => {
  mockedGet.mockResolvedValue({
    photos: [{ url: 'https://r2.example/signed.jpg?sig=1' }],
  } as never);
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const res = await GET(new Request('https://avino.uz/api/og/listing/abc'), ctx('abc'));

  expect(fetchMock).toHaveBeenCalledWith(
    'https://r2.example/signed.jpg?sig=1',
    expect.objectContaining({ signal: expect.anything() }),
  );
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
  expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
  expect((await res.arrayBuffer()).byteLength).toBe(4);
});

it('редиректит на бренд-фолбэк, когда у листинга нет фото', async () => {
  mockedGet.mockResolvedValue({ photos: [] } as never);
  const res = await GET(new Request('https://avino.uz/api/og/listing/x'), ctx('x'));
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://avino.uz/apple-icon.png');
});

it('редиректит на бренд-фолбэк, когда листинг не найден', async () => {
  mockedGet.mockResolvedValue(null);
  const res = await GET(new Request('https://avino.uz/api/og/listing/none'), ctx('none'));
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://avino.uz/apple-icon.png');
});

it('редиректит на бренд-фолбэк, когда upstream отдаёт не-2xx', async () => {
  mockedGet.mockResolvedValue({
    photos: [{ url: 'https://r2.example/expired.jpg' }],
  } as never);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
  const res = await GET(new Request('https://avino.uz/api/og/listing/y'), ctx('y'));
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://avino.uz/apple-icon.png');
});

it('редиректит на бренд-фолбэк при исключении в getListingById', async () => {
  mockedGet.mockRejectedValue(new Error('boom'));
  const res = await GET(new Request('https://avino.uz/api/og/listing/e'), ctx('e'));
  expect(res.status).toBe(302);
  expect(res.headers.get('location')).toBe('https://avino.uz/apple-icon.png');
});

it('подменяет не-image content-type на image/jpeg', async () => {
  mockedGet.mockResolvedValue({
    photos: [{ url: 'https://r2.example/octet' }],
  } as never);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      }),
    ),
  );
  const res = await GET(new Request('https://avino.uz/api/og/listing/o'), ctx('o'));
  expect(res.headers.get('content-type')).toBe('image/jpeg');
});
