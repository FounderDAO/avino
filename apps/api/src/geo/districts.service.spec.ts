import { DistrictsService } from './districts.service';

describe('DistrictsService (unit)', () => {
  it('listAll() без параметра вызывает findMany без where и маппит поля', async () => {
    const prisma = {
      district: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'd1', code: 'olmazor', nameUz: 'Olmazor', nameRu: 'Алмазар', nameEn: 'Almazar', regionId: 'c11' },
        ]),
      },
    } as any;
    const svc = new DistrictsService(prisma);
    const rows = await svc.listAll();
    expect(prisma.district.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
    expect(rows[0]).toMatchObject({
      id: 'd1', code: 'olmazor', name_uz: 'Olmazor', name_ru: 'Алмазар', name_en: 'Almazar',
    });
    // Поле region_id присутствует в ответе (Task A4).
    expect(rows[0].region_id).toBe('c11');
  });

  it('listAll(regionId) фильтрует по региону и отдаёт region_id', async () => {
    const prisma = {
      district: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'd1', code: 'olmazor', nameUz: 'Olmazor', nameRu: 'Алмазар', nameEn: 'Almazar', regionId: 'c11' },
        ]),
      },
    } as any;
    const svc = new DistrictsService(prisma);
    const rows = await svc.listAll('c11');
    expect(prisma.district.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { regionId: 'c11' } }),
    );
    expect(rows[0].region_id).toBe('c11');
  });
});
