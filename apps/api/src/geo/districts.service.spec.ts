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

  describe('matchByComponents (район по точке)', () => {
    const makePrisma = () =>
      ({
        region: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'c11', code: 'toshkent-shahri', nameUz: 'Toshkent shahri', nameRu: 'город Ташкент', nameEn: 'Toshkent shahri' },
            { id: 'c12', code: 'toshkent', nameUz: 'Toshkent viloyati', nameRu: 'Ташкентская область', nameEn: 'Toshkent viloyati' },
          ]),
        },
        district: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'd4', nameUz: "Mirzo Ulug'bek", nameRu: 'Мирзо-Улугбек', nameEn: 'Mirzo-Ulugbek', regionId: 'c11' },
            { id: 'd12', nameUz: 'Yunusobod', nameRu: 'Юнусабад', nameEn: 'Yunusabad', regionId: 'c11' },
            { id: 'e162', nameUz: 'Toshkent tumani', nameRu: 'Ташкентский район', nameEn: 'Toshkent tumani', regionId: 'c12' },
          ]),
        },
      }) as any;

    it('компоненты Yandex → id и имена района справочника', async () => {
      const svc = new DistrictsService(makePrisma());
      await expect(
        svc.matchByComponents([
          { kind: 'province', name: 'Ташкент' },
          { kind: 'locality', name: 'Ташкент' },
          { kind: 'district', name: 'Мирзо-Улугбекский район' },
        ]),
      ).resolves.toEqual({
        id: 'd4',
        names: { nameUz: "Mirzo Ulug'bek", nameRu: 'Мирзо-Улугбек', nameEn: 'Mirzo-Ulugbek' },
      });
    });

    it('район не распознан → null', async () => {
      const svc = new DistrictsService(makePrisma());
      await expect(
        svc.matchByComponents([{ kind: 'province', name: 'Ташкент' }, { kind: 'locality', name: 'Ташкент' }]),
      ).resolves.toBeNull();
    });

    it('справочник читается из БД один раз (кеш)', async () => {
      const prisma = makePrisma();
      const svc = new DistrictsService(prisma);
      await svc.matchByComponents([{ kind: 'district', name: 'Юнусабадский район' }]);
      await svc.matchByComponents([{ kind: 'district', name: 'Юнусабадский район' }]);
      expect(prisma.district.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.region.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
