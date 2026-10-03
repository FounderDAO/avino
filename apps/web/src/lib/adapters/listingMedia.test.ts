import { checkMediaFiles, makeCover, mediaErrorText, moveMedia, sortedMedia } from './listingMedia';

const m = (id: string, sort_order: number) => ({ id, url: id, thumbnail_url: null, sort_order, type: 'IMAGE' as const });

describe('listingMedia', () => {
  it('sortedMedia сортирует по sort_order, допуская пропуски', () => {
    expect(sortedMedia([m('b', 5), m('a', 0), m('c', 2)]).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });

  it('moveMedia меняет соседей местами и не выходит за края', () => {
    expect(moveMedia(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveMedia(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveMedia(['a', 'b'], 'a', -1)).toBeNull();
    expect(moveMedia(['a', 'b'], 'b', 1)).toBeNull();
    expect(moveMedia(['a'], 'x', 1)).toBeNull();
  });

  it('makeCover переносит фото в начало; обложка и неизвестный id → null', () => {
    expect(makeCover(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
    expect(makeCover(['a', 'b'], 'a')).toBeNull();
    expect(makeCover(['a'], 'x')).toBeNull();
  });

  it('checkMediaFiles проверяет формат, размер и остаток до 20', () => {
    const files = [
      { name: 'a.jpg', type: 'image/jpeg', size: 100 },
      { name: 'b.heic', type: 'image/heic', size: 100 },
      { name: 'c.png', type: 'image/png', size: 11 * 1024 * 1024 },
      { name: 'd.webp', type: 'image/webp', size: 100 },
      { name: 'e.jpg', type: 'image/jpeg', size: 100 },
    ];
    const result = checkMediaFiles(files, 18);
    expect(result.map((r) => r.ok)).toEqual([true, false, false, true, false]);
    expect(result[1]).toMatchObject({ reason: expect.stringContaining('формат') });
    expect(result[2]).toMatchObject({ reason: expect.stringContaining('10 МБ') });
    expect(result[4]).toMatchObject({ reason: expect.stringContaining('20') });
  });

  it('mediaErrorText по коду API', () => {
    expect(mediaErrorText('MEDIA_LIMIT_EXCEEDED')).toContain('20');
    expect(mediaErrorText(null)).toBe('Не удалось выполнить действие с фото');
  });
});
