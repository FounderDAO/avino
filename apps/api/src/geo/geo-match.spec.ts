import {
  matchRegionDistrict,
  normalizeGeoName,
  type DirectoryDistrict,
  type DirectoryRegion,
  type GeoComponent,
} from './geo-match';

/**
 * Юнит-тесты сопоставления компонент Yandex со справочником «Регион → Район».
 * Данные — реальные строки справочника (миграции add_districts / add_regions);
 * кейсы — те же, что у клиентского geoMatch.test.ts, плюс серверные.
 */
const R_CITY = 'c-tashkent-city';
const R_OBL = 'c-tashkent-obl';
const R_SAM = 'c-samarkand';

const region = (id: string, code: string, nameUz: string, nameRu: string): DirectoryRegion => ({
  id,
  code,
  names: [nameUz, nameRu, nameUz],
});

const REGIONS: DirectoryRegion[] = [
  region(R_CITY, 'toshkent-shahri', 'Toshkent shahri', 'город Ташкент'),
  region(R_OBL, 'toshkent', 'Toshkent viloyati', 'Ташкентская область'),
  region(R_SAM, 'samarqand', 'Samarqand viloyati', 'Самаркандская область'),
];

const district = (
  id: string,
  regionId: string,
  nameUz: string,
  nameRu: string,
  nameEn = nameUz,
): DirectoryDistrict => ({ id, regionId, names: [nameUz, nameRu, nameEn] });

const DISTRICTS: DirectoryDistrict[] = [
  district('bektemir', R_CITY, 'Bektemir', 'Бектемир', 'Bektemir'),
  district('chilonzor', R_CITY, 'Chilonzor', 'Чиланзар', 'Chilanzar'),
  district('mirobod', R_CITY, 'Mirobod', 'Мирабад', 'Mirabad'),
  district('mirzo-ulugbek', R_CITY, "Mirzo Ulug'bek", 'Мирзо-Улугбек', 'Mirzo-Ulugbek'),
  district('olmazor', R_CITY, 'Olmazor', 'Алмазар', 'Almazar'),
  district('sergeli', R_CITY, 'Sergeli', 'Сергели', 'Sergeli'),
  district('shayxontohur', R_CITY, 'Shayxontohur', 'Шайхантахур', 'Shaykhantakhur'),
  district('uchtepa', R_CITY, 'Uchtepa', 'Учтепа', 'Uchtepa'),
  district('yakkasaroy', R_CITY, 'Yakkasaroy', 'Яккасарай', 'Yakkasaray'),
  district('yashnobod', R_CITY, 'Yashnobod', 'Яшнабад', 'Yashnabad'),
  district('yangihayot', R_CITY, 'Yangihayot', 'Янгихаёт', 'Yangihayot'),
  district('yunusobod', R_CITY, 'Yunusobod', 'Юнусабад', 'Yunusabad'),
  district('zangiota', R_OBL, 'Zangiota tumani', 'Зангиатинский район'),
  district('toshkent-tumani', R_OBL, 'Toshkent tumani', 'Ташкентский район'),
  district('qibray', R_OBL, 'Qibray tumani', 'Кибрайский район'),
  district('chirchiq', R_OBL, 'Chirchiq', 'Чиpчик'),
  district('samarqand-tumani', R_SAM, 'Samarqand tumani', 'Самаркандский район'),
  district('samarqand', R_SAM, 'Samarqand', 'Самарканд'),
];

const c = (kind: string, name: string): GeoComponent => ({ kind, name });

const tashkentRu = (districtName: string): GeoComponent[] => [
  c('country', 'Узбекистан'),
  c('province', 'Ташкент'),
  c('locality', 'Ташкент'),
  c('district', districtName),
  c('street', 'улица Амира Темура'),
  c('house', '12'),
];

describe('normalizeGeoName', () => {
  it('регистр, ё→е, дефис, служебные слова, гомоглифы', () => {
    expect(normalizeGeoName('Мирзо-Улугбек')).toBe('мирзо улугбек');
    expect(normalizeGeoName('Янгихаёт')).toBe('янгихает');
    expect(normalizeGeoName('Юнусабадский район')).toBe('юнусабадский');
    expect(normalizeGeoName('город Ташкент')).toBe('ташкент');
    expect(normalizeGeoName("Qo'qon")).toBe(normalizeGeoName('Qoʻqon'));
    expect(normalizeGeoName('Чиpчик')).toBe(normalizeGeoName('Чирчик'));
  });
});

describe('matchRegionDistrict — г. Ташкент', () => {
  it.each([
    ['Юнусабадский район', 'yunusobod'],
    ['Мирзо-Улугбекский район', 'mirzo-ulugbek'],
    ['Чиланзарский район', 'chilonzor'],
    ['Яккасарайский район', 'yakkasaroy'],
    ['Мирабадский район', 'mirobod'],
    ['Алмазарский район', 'olmazor'],
    ['Сергелийский район', 'sergeli'],
    ['Шайхантахурский район', 'shayxontohur'],
    ['Учтепинский район', 'uchtepa'],
    ['Яшнабадский район', 'yashnobod'],
    ['Янгихаётский район', 'yangihayot'],
    ['Бектемирский район', 'bektemir'],
  ])('«%s» → %s', (yandexName, districtId) => {
    expect(matchRegionDistrict(tashkentRu(yandexName), REGIONS, DISTRICTS)).toEqual({
      regionId: R_CITY,
      districtId,
    });
  });

  it('махалля/массив после района не мешает', () => {
    const comps = [
      c('province', 'Ташкент'),
      c('locality', 'Ташкент'),
      c('district', 'Чиланзарский район'),
      c('district', 'массив Чиланзар-9'),
    ];
    expect(matchRegionDistrict(comps, REGIONS, DISTRICTS).districtId).toBe('chilonzor');
  });

  it('район не распознан → только регион', () => {
    expect(matchRegionDistrict(tashkentRu('Неизвестный район'), REGIONS, DISTRICTS)).toEqual({
      regionId: R_CITY,
      districtId: undefined,
    });
  });

  it('точка в Ташкенте без компоненты района не уходит в «Ташкентский район» области', () => {
    const comps = [c('province', 'Ташкент'), c('locality', 'Ташкент'), c('street', 'улица Навои')];
    expect(matchRegionDistrict(comps, REGIONS, DISTRICTS)).toEqual({
      regionId: R_CITY,
      districtId: undefined,
    });
  });
});

describe('matchRegionDistrict — область и коллизии', () => {
  it('«Ташкентская область» + area → район области', () => {
    const comps = [
      c('province', 'Ташкентская область'),
      c('area', 'Зангиатинский район'),
      c('locality', 'посёлок Назарбек'),
    ];
    expect(matchRegionDistrict(comps, REGIONS, DISTRICTS)).toEqual({
      regionId: R_OBL,
      districtId: 'zangiota',
    });
  });

  it('район ищется только среди районов найденного региона', () => {
    const comps = [c('province', 'Ташкентская область'), c('district', 'Юнусабадский район')];
    expect(matchRegionDistrict(comps, REGIONS, DISTRICTS)).toEqual({
      regionId: R_OBL,
      districtId: undefined,
    });
  });

  it('Самарканд: точное совпадение важнее основы (город vs район)', () => {
    expect(
      matchRegionDistrict(
        [c('province', 'Самаркандская область'), c('locality', 'Самарканд')],
        REGIONS,
        DISTRICTS,
      ),
    ).toEqual({ regionId: R_SAM, districtId: 'samarqand' });
    expect(
      matchRegionDistrict(
        [
          c('province', 'Самаркандская область'),
          c('area', 'Самаркандский район'),
          c('locality', 'село Гулабад'),
        ],
        REGIONS,
        DISTRICTS,
      ),
    ).toEqual({ regionId: R_SAM, districtId: 'samarqand-tumani' });
  });

  it('город областного подчинения + гомоглиф в справочнике («Чиpчик»)', () => {
    const comps = [c('province', 'Ташкентская область'), c('locality', 'Чирчик')];
    expect(matchRegionDistrict(comps, REGIONS, DISTRICTS)).toEqual({
      regionId: R_OBL,
      districtId: 'chirchiq',
    });
  });

  it('регион не распознан → район только точным и однозначным совпадением', () => {
    expect(matchRegionDistrict([c('district', 'Кибрайский район')], REGIONS, DISTRICTS)).toEqual({
      regionId: R_OBL,
      districtId: 'qibray',
    });
    // По основе без региона не угадываем.
    expect(matchRegionDistrict([c('district', 'Юнусабадский район')], REGIONS, DISTRICTS)).toEqual(
      {},
    );
  });

  it('пустые компоненты → {}', () => {
    expect(matchRegionDistrict([], REGIONS, DISTRICTS)).toEqual({});
  });
});
