import { resolveImportDistricts } from './import-district.resolver';

describe('resolveImportDistricts', () => {
  const row = (lat?: string, lng?: string, districtId?: string) => ({
    latitude: lat,
    longitude: lng,
    districtId,
  });

  it('ставит район по точке строкам с координатами и без района', async () => {
    const rows = [row('41.3', '69.2'), row('41.35', '69.28')];
    const resolve = jest
      .fn()
      .mockResolvedValueOnce({ districtId: 'd1' })
      .mockResolvedValueOnce({ districtId: null });
    const stats = await resolveImportDistricts(rows, resolve);
    expect(rows[0].districtId).toBe('d1');
    expect(rows[1].districtId).toBeUndefined();
    expect(stats).toEqual({ resolved: 1, unresolved: 1, failed: 0, aborted: false });
    expect(resolve).toHaveBeenCalledWith('41.3', '69.2');
  });

  it('строки без координат и с районом не трогает', async () => {
    const rows = [row(), row('41.3', '69.2', 'd-file')];
    const resolve = jest.fn();
    await resolveImportDistricts(rows, resolve);
    expect(resolve).not.toHaveBeenCalled();
    expect(rows[1].districtId).toBe('d-file');
  });

  it('геокодер недоступен → после N сбоев останавливается, импорт не падает', async () => {
    const rows = Array.from({ length: 20 }, () => row('41.3', '69.2'));
    const resolve = jest.fn().mockResolvedValue(null);
    const stats = await resolveImportDistricts(rows, resolve, { concurrency: 1, maxFailures: 3 });
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(stats).toMatchObject({ resolved: 0, failed: 3, aborted: true });
    expect(rows.every((r) => r.districtId === undefined)).toBe(true);
  });

  it('исключение резолвера считается сбоем, а не ошибкой импорта', async () => {
    const rows = [row('41.3', '69.2')];
    const resolve = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(resolveImportDistricts(rows, resolve)).resolves.toMatchObject({ failed: 1 });
  });
});
