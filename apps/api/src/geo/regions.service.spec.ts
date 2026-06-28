import { RegionsService } from './regions.service';

describe('RegionsService', () => {
  it('listAll маппит camelCase → snake_case и сортирует по sort_order', async () => {
    const prisma = {
      region: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'c1', code: 'andijon', nameUz: 'Andijon viloyati', nameRu: 'Андижанская область', nameEn: 'Andijon viloyati' },
        ]),
      },
    } as any;
    const svc = new RegionsService(prisma);
    const rows = await svc.listAll();
    expect(prisma.region.findMany).toHaveBeenCalledWith({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, nameUz: true, nameRu: true, nameEn: true },
    });
    expect(rows[0]).toEqual({
      id: 'c1', code: 'andijon', name_uz: 'Andijon viloyati', name_ru: 'Андижанская область', name_en: 'Andijon viloyati',
    });
  });
});
