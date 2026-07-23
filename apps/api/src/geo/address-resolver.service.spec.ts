import { ConfigService } from '@nestjs/config';
import { AddressResolverService } from './address-resolver.service';
import { DistrictsService } from './districts.service';

/**
 * Юнит-тесты AddressResolverService (ADR-0147): fetch мокается глобально,
 * проверяются сборка формата ru/en, фолбэк без ключа/при сбое, подстановка
 * района из НАШЕЙ таблицы districts.
 */
describe('AddressResolverService', () => {
  const geocoderBody = (components: Array<{ kind: string; name: string }>) => ({
    response: {
      GeoObjectCollection: {
        featureMember: [
          { GeoObject: { metaDataProperty: { GeocoderMetaData: { Address: { Components: components } } } } },
        ],
      },
    },
  });

  const RU_COMPONENTS = [
    { kind: 'country', name: 'Узбекистан' },
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

  let districts: { namesByIds: jest.Mock; pickName: jest.Mock };
  let fetchMock: jest.SpyInstance;

  const makeService = (apiKey: string | undefined) => {
    const config = { get: jest.fn().mockReturnValue(apiKey) } as unknown as ConfigService;
    return new AddressResolverService(config, districts as unknown as DistrictsService);
  };

  beforeEach(() => {
    districts = {
      namesByIds: jest.fn().mockResolvedValue(new Map()),
      pickName: jest.fn((district, lang) => {
        if (!district) return null;
        if (lang === 'EN') return district.nameEn;
        if (lang === 'UZ') return district.nameUz;
        return district.nameRu;
      }),
    };
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  const okResponse = (body: unknown) =>
    ({ ok: true, json: () => Promise.resolve(body) }) as unknown as Response;

  it('без ключа → null, fetch не вызывается', async () => {
    const service = makeService(undefined);
    await expect(service.resolve('41.2995', '69.2401')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('собирает ru+en с районом из БД', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(
        okResponse(String(url).includes('lang=en_US') ? geocoderBody(EN_COMPONENTS) : geocoderBody(RU_COMPONENTS)),
      ),
    );
    districts.namesByIds.mockResolvedValue(
      new Map([['d1', { nameUz: 'Chilonzor', nameRu: 'Чиланзар', nameEn: 'Chilanzar' }]]),
    );
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401', 'd1')).resolves.toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
    });
    // geocode=lng,lat (longlat-порядок Яндекса)
    expect(String(fetchMock.mock.calls[0][0])).toContain('geocode=69.2401%2C41.2995');
  });

  it('без district_id — район опускается', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(
        okResponse(String(url).includes('lang=en_US') ? geocoderBody(EN_COMPONENTS) : geocoderBody(RU_COMPONENTS)),
      ),
    );
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toEqual({
      address: 'Ташкент, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Seul koʻchasi, 7/1',
    });
  });

  it('ru-запрос упал → null (фолбэк вызывающего)', async () => {
    fetchMock.mockRejectedValue(new Error('network'));
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toBeNull();
  });

  it('en упал, ru ок → addressEn null', async () => {
    fetchMock.mockImplementation((url: RequestInfo | URL) =>
      String(url).includes('lang=en_US')
        ? Promise.reject(new Error('network'))
        : Promise.resolve(okResponse(geocoderBody(RU_COMPONENTS))),
    );
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toEqual({
      address: 'Ташкент, ул. Сеул, 7/1',
      addressEn: null,
    });
  });

  it('пустой ответ геокодера (нет компонентов) → null', async () => {
    fetchMock.mockResolvedValue(okResponse({ response: { GeoObjectCollection: { featureMember: [] } } }));
    const service = makeService('test-key');
    await expect(service.resolve('41.2995', '69.2401')).resolves.toBeNull();
  });
});
