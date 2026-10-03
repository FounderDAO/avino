import { parsePhotoCell } from './import-photos.parser';

const ok = (raw: string) => {
  const result = parsePhotoCell(raw);
  if (!result.ok) throw new Error(`unexpected error ${result.error.code}`);
  return result.photos;
};

describe('parsePhotoCell', () => {
  it('пустая ячейка → пустой список', () => {
    expect(ok('')).toEqual([]);
    expect(parsePhotoCell(undefined)).toEqual({ ok: true, photos: [] });
  });

  it('делит по переводу строки, запятой и точке с запятой; пробел — часть имени', () => {
    expect(ok('фото 1.jpg, 2.png;3.webp\nhttps://a.uz/4.jpg').map((p) => [p.position, p.source, p.ref])).toEqual([
      [0, 'FILE', 'фото 1.jpg'],
      [1, 'FILE', '2.png'],
      [2, 'FILE', '3.webp'],
      [3, 'URL', 'https://a.uz/4.jpg'],
    ]);
  });

  it('запятая внутри ссылки не делит (Cloudinary), новая ссылка или пробел — делит', () => {
    const cloud = 'https://res.cloudinary.com/x/image/upload/w_100,h_100/a.jpg';
    expect(ok(`${cloud},https://b.uz/2.jpg, 3.jpg`).map((p) => p.ref)).toEqual([cloud, 'https://b.uz/2.jpg', '3.jpg']);
  });

  it('повторы убираются: ссылки точно, имена без учёта регистра', () => {
    expect(ok('A.jpg, a.JPG, https://x.uz/1.jpg, https://x.uz/1.jpg').map((p) => p.ref)).toEqual(['A.jpg', 'https://x.uz/1.jpg']);
  });

  it('HTTP в верхнем регистре — ссылка', () => {
    expect(ok('HTTPS://X.UZ/1')[0].source).toBe('URL');
  });

  it('20 — можно, 21 — PHOTO_TOO_MANY', () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `${i}.jpg`).join(',');
    expect(ok(names(20))).toHaveLength(20);
    expect(parsePhotoCell(names(21))).toMatchObject({ ok: false, error: { column: 'photos', code: 'PHOTO_TOO_MANY' } });
  });

  it.each([
    ['https://', 'PHOTO_INVALID_URL'],
    [`https://a.uz/${'x'.repeat(2050)}`, 'PHOTO_INVALID_URL'],
    ['photo.heic', 'PHOTO_UNSUPPORTED_FORMAT'],
    ['photo', 'PHOTO_UNSUPPORTED_FORMAT'],
    ['папка/1.jpg', 'PHOTO_INVALID_NAME'],
    ['C:\\фото\\1.jpg', 'PHOTO_INVALID_NAME'],
    [`${'x'.repeat(256)}.jpg`, 'PHOTO_INVALID_NAME'],
  ])('%s → %s с value', (raw, code) => {
    expect(parsePhotoCell(raw)).toMatchObject({ ok: false, error: { column: 'photos', code, value: raw } });
  });

  it('ftp-ссылка — это имя файла без допустимого расширения', () => {
    expect(parsePhotoCell('ftp://a.uz/1.gif')).toMatchObject({ ok: false, error: { code: 'PHOTO_INVALID_NAME' } });
  });
});
