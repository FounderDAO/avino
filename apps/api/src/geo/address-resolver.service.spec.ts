import { ConfigService } from '@nestjs/config';
import { AddressResolverService } from './address-resolver.service';
import { DistrictsService } from './districts.service';

/**
 * Юнит-тесты AddressResolverService (ADR-0147 + правка 2026-10-23): fetch
 * мокается глобально. Проверяются: порядок координат, запрос БЕЗ kind=house,
 * район — по точке (справочник), адрес пользователя не перезаписывается,
 * номер дома не берётся у дома в стороне от точки, фолбэки.
 */
describe('AddressResolverService', () => {
  const LAT = '41.2995';
  const LNG = '69.2401';

  const geocoderBody = (
    components: Array<{ kind: string; name: string }>,
    pos = `${LNG} ${LAT}`,
    kind = 'house',
  ) => ({
    response: {
      GeoObjectCollection: {
        featureMember: [
          {
            GeoObject: {
              metaDataProperty: { GeocoderMetaData: { kind, Address: { Components: components } } },
              Point: { pos },
            },
          },
        ],
      },
    },
  });

  const RU_COMPONENTS = [
    { kind: 'country', name: 'Узбекистан' },
    { kind: 'province', name: 'Ташкент' },
    { kind: 'locality', name: 'Ташкент' },
    { kind: 'district', name: 'Чиланзарский район' },
    { kind: 'street', name: 'улица Сеул' },
    { kind: 'house', name: '7/1' },
  ];
  const EN_COMPONENTS = [
    { kind: 'country', name: 'Uzbekistan' },
    { kind: 'locality', name: 'Tashkent' },
    { kind: 'district', name: 'Chilanzar District' },
    { kind: 'street', name: 'Seul koʻchasi' },
    { kind: 'house', name: '7/1' },
  ];
  const CHILANZAR = { nameUz: 'Chilonzor', nameRu: 'Чиланзар', nameEn: 'Chilanzar' };
  const YUNUSABAD = { nameUz: 'Yunusobod', nameRu: 'Юнусабад', nameEn: 'Yunusabad' };

  let districts: { namesByIds: jest.Mock; matchByComponents: jest.Mock };
  let fetchMock: jest.SpyInstance;

  const makeService = (apiKey: string | undefined) => {
    const config = { get: jest.fn().mockReturnValue(apiKey) } as unknown as ConfigService;
    return new AddressResolverService(config, districts as unknown as DistrictsService);
  };

  const okResponse = (body: unknown) =>
    ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

  const respondWith = (ru: unknown, en: unknown) =>
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(okResponse(String(url).includes('lang=en_US') ? en : ru)),
    );

  beforeEach(() => {
    districts = {
      namesByIds: jest.fn().mockResolvedValue(new Map()),
      matchByComponents: jest.fn().mockResolvedValue({ id: 'd-chil', names: CHILANZAR }),
    };
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('без ключа → null, fetch не вызывается', async () => {
    const service = makeService(undefined);
    await expect(service.resolve(LAT, LNG)).resolves.toBeNull();
    await expect(service.resolveDistrictId(LAT, LNG)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('адреса нет → собирает ru+en по точке, район — по точке', async () => {
    respondWith(geocoderBody(RU_COMPONENTS), geocoderBody(EN_COMPONENTS));
    const service = makeService('test-key');
    await expect(service.resolve(LAT, LNG)).resolves.toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
      districtId: 'd-chil',
    });
    const url = String(fetchMock.mock.calls[0][0]);
    // geocode=lng,lat (longlat-порядок Яндекса)
    expect(url).toContain('geocode=69.2401%2C41.2995');
    expect(url).toContain('sco=longlat');
    // Без kind=house: самый точный объект у точки, а не принудительно ближайший дом.
    expect(url).not.toContain('kind=');
    expect(districts.matchByComponents).toHaveBeenCalledWith(RU_COMPONENTS);
  });

  it('район в адресе — по точке, даже если пользователь выбрал другой district_id', async () => {
    respondWith(geocoderBody(RU_COMPONENTS), geocoderBody(EN_COMPONENTS));
    districts.namesByIds.mockResolvedValue(new Map([['d-yun', YUNUSABAD]]));
    const service = makeService('test-key');
    const result = await service.resolve(LAT, LNG, { districtId: 'd-yun' });
    expect(result?.address).toBe('Ташкент, Чиланзар, ул. Сеул, 7/1');
    expect(result?.districtId).toBe('d-chil');
  });

  it('район по точке не распознан → район из переданного district_id', async () => {
    respondWith(geocoderBody(RU_COMPONENTS), geocoderBody(EN_COMPONENTS));
    districts.matchByComponents.mockResolvedValue(null);
    districts.namesByIds.mockResolvedValue(new Map([['d-yun', YUNUSABAD]]));
    const service = makeService('test-key');
    await expect(service.resolve(LAT, LNG, { districtId: 'd-yun' })).resolves.toEqual({
      address: 'Ташкент, Юнусабад, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Yunusabad, Seul koʻchasi, 7/1',
      districtId: null,
    });
  });

  it('ближайший дом в 80 м от точки → номер не берём, адрес до улицы', async () => {
    // ~80 м к северу от точки
    const farPos = `${LNG} ${(Number(LAT) + 0.00072).toFixed(6)}`;
    respondWith(geocoderBody(RU_COMPONENTS, farPos), geocoderBody(EN_COMPONENTS, farPos));
    const service = makeService('test-key');
    await expect(service.resolve(LAT, LNG)).resolves.toMatchObject({
      address: 'Ташкент, Чиланзар, ул. Сеул',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi',
    });
  });

  it('адрес пользователя с другим номером дома не перезаписывается соседним домом', async () => {
    respondWith(geocoderBody(RU_COMPONENTS), geocoderBody(EN_COMPONENTS));
    const service = makeService('test-key');
    await expect(
      service.resolve(LAT, LNG, { userAddress: 'Узбекистан, Ташкент, улица Сеул, 9' }),
    ).resolves.toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 9',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 9',
      districtId: 'd-chil',
    });
  });

  it('адрес пользователя, которого геокодер не знает (новостройка) → текст пользователя', async () => {
    respondWith(geocoderBody(RU_COMPONENTS), geocoderBody(EN_COMPONENTS));
    const service = makeService('test-key');
    await expect(
      service.resolve(LAT, LNG, { userAddress: 'Ташкент, ЖК Сеул Плаза, 3' }),
    ).resolves.toEqual({ address: 'Ташкент, ЖК Сеул Плаза, 3', addressEn: null, districtId: 'd-chil' });
  });

  it('ru-запрос упал → null (фолбэк вызывающего)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const service = makeService('test-key');
    await expect(service.resolve(LAT, LNG)).resolves.toBeNull();
  });

  it('en упал, ru ок → addressEn null', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      String(url).includes('lang=en_US')
        ? Promise.reject(new Error('network'))
        : Promise.resolve(okResponse(geocoderBody(RU_COMPONENTS))),
    );
    const service = makeService('test-key');
    await expect(service.resolve(LAT, LNG)).resolves.toMatchObject({
      address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
      addressEn: null,
    });
  });

  it('пустой ответ геокодера (нет компонентов) → null', async () => {
    fetchMock.mockResolvedValue(okResponse({ response: { GeoObjectCollection: { featureMember: [] } } }));
    const service = makeService('test-key');
    await expect(service.resolve(LAT, LNG)).resolves.toBeNull();
  });

  describe('resolveDistrictId', () => {
    it('один ru-запрос → район справочника', async () => {
      fetchMock.mockResolvedValue(okResponse(geocoderBody(RU_COMPONENTS)));
      const service = makeService('test-key');
      await expect(service.resolveDistrictId(LAT, LNG)).resolves.toEqual({ districtId: 'd-chil' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain('lang=ru_RU');
    });

    it('район не распознан → { districtId: null }', async () => {
      fetchMock.mockResolvedValue(okResponse(geocoderBody(RU_COMPONENTS)));
      districts.matchByComponents.mockResolvedValue(null);
      const service = makeService('test-key');
      await expect(service.resolveDistrictId(LAT, LNG)).resolves.toEqual({ districtId: null });
    });

    it('геокодер недоступен → null (отличаем от «не распознан»)', async () => {
      fetchMock.mockRejectedValue(new Error('timeout'));
      const service = makeService('test-key');
      await expect(service.resolveDistrictId(LAT, LNG)).resolves.toBeNull();
    });
  });
});
