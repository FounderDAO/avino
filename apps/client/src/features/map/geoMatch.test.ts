/**
 * geoMatch — юнит-тесты сопоставления компонент адреса Yandex со справочником.
 *
 * Данные — реальные строки справочника (миграции add_districts / add_regions),
 * прогнанные через те же мапперы, что и в проде (mapRegion / mapDistrict), для
 * ru / uz / en интерфейса. Компоненты — в форме, в которой их отдаёт Yandex:
 * на ru- и uz-интерфейсе SDK грузится с lang=ru_RU, на en — en_US.
 */
import { describe, it, expect } from 'vitest';
import {
  mapDistrict,
  mapRegion,
  type ApiDistrict,
  type ApiRegion,
} from '@/lib/api/geo';
import {
  composeAutoAddress,
  matchRegionDistrict,
  normalizeGeoName,
  resolveMapLocation,
  type AddressComponent,
} from './geoMatch';

// ── Реальные строки справочника ───────────────────────────────────────────────

const R_CITY = 'c-tashkent-city';
const R_OBL = 'c-tashkent-obl';
const R_SAM = 'c-samarkand';
const R_FER = 'c-fergana';
const R_KAR = 'c-karakalpak';

const region = (
  id: string,
  code: string,
  name_uz: string,
  name_ru: string,
): ApiRegion => ({ id, code, name_uz, name_ru, name_en: name_uz });

const API_REGIONS: ApiRegion[] = [
  region(R_CITY, 'toshkent-shahri', 'Toshkent shahri', 'город Ташкент'),
  region(R_OBL, 'toshkent', 'Toshkent viloyati', 'Ташкентская область'),
  region(R_SAM, 'samarqand', 'Samarqand viloyati', 'Самаркандская область'),
  region(R_FER, 'fargona', "Farg'ona viloyati", 'Ферганская область'),
  region(R_KAR, 'qoraqalpogiston', "Qoraqalpog'iston Respublikasi", 'Республика Каракалпакстан'),
];

const district = (
  id: string,
  region_id: string,
  name_uz: string,
  name_ru: string,
  name_en = name_uz,
): ApiDistrict => ({ id, code: id, name_uz, name_ru, name_en, region_id });

const API_DISTRICTS: ApiDistrict[] = [
  // г. Ташкент (12 районов, без суффикса «район»)
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
  // Ташкентская область
  district('zangiota', R_OBL, 'Zangiota tumani', 'Зангиатинский район'),
  district('toshkent-tumani', R_OBL, 'Toshkent tumani', 'Ташкентский район'),
  district('qibray', R_OBL, 'Qibray tumani', 'Кибрайский район'),
  // В справочнике латинская «p» вместо «р» — как в реальных данных.
  district('chirchiq', R_OBL, 'Chirchiq', 'Чиpчик'),
  // Самаркандская область: и район, и город с одной основой
  district('samarqand-tumani', R_SAM, 'Samarqand tumani', 'Самаркандский район'),
  district('samarqand', R_SAM, 'Samarqand', 'Самарканд'),
  district('urgut', R_SAM, 'Urgut tumani', 'Ургутский район'),
  // Ферганская область
  district('fargona-tumani', R_FER, "Farg'ona tumani", 'Ферганский район'),
  district('fargona', R_FER, "Farg'ona", 'Фергана'),
  district('qoqon', R_FER, "Qo'qon", 'Коканд'),
];

const dict = (lang: string) => ({
  regions: API_REGIONS.map((r) => mapRegion(r, lang)),
  districts: API_DISTRICTS.map((d) => mapDistrict(d, lang)),
});

const c = (kind: string, name: string): AddressComponent => ({ kind, name });

/** Точка в Ташкенте, как её отдаёт Yandex (ru): province и locality — «Ташкент». */
const tashkentRu = (districtName: string): AddressComponent[] => [
  c('country', 'Узбекистан'),
  c('province', 'Ташкент'),
  c('locality', 'Ташкент'),
  c('district', districtName),
  c('street', 'улица Амира Темура'),
  c('house', '12'),
];

// ── normalizeGeoName ──────────────────────────────────────────────────────────

describe('normalizeGeoName', () => {
  it('регистр, ё→е, дефис↔пробел', () => {
    expect(normalizeGeoName('Янгихаёт')).toBe('янгихает');
    expect(normalizeGeoName('Мирзо-Улугбек')).toBe('мирзо улугбек');
    expect(normalizeGeoName('  МИРЗО   УЛУГБЕК ')).toBe('мирзо улугбек');
  });

  it('апострофы o‘ / oʻ / o’ / o\' убираются одинаково', () => {
    const expected = 'qoqon';
    expect(normalizeGeoName("Qo'qon")).toBe(expected);
    expect(normalizeGeoName('Qo‘qon')).toBe(expected);
    expect(normalizeGeoName('Qoʻqon')).toBe(expected);
    expect(normalizeGeoName('Qo’qon')).toBe(expected);
    expect(normalizeGeoName("Mirzo Ulug'bek")).toBe('mirzo ulugbek');
  });

  it('служебные слова: район / tumani / district / область / viloyati / город / shahri', () => {
    expect(normalizeGeoName('Юнусабадский район')).toBe('юнусабадский');
    expect(normalizeGeoName('Yunusobod tumani')).toBe('yunusobod');
    expect(normalizeGeoName('Yunusabad District')).toBe('yunusabad');
    expect(normalizeGeoName('Ташкентская область')).toBe('ташкентская');
    expect(normalizeGeoName('Toshkent viloyati')).toBe('toshkent');
    expect(normalizeGeoName('город Ташкент')).toBe('ташкент');
    expect(normalizeGeoName('г. Ташкент')).toBe('ташкент');
    expect(normalizeGeoName('Toshkent shahri')).toBe('toshkent');
    expect(normalizeGeoName('Республика Каракалпакстан')).toBe('каракалпакстан');
  });

  it('латинские гомоглифы внутри кириллического слова («Чиpчик»)', () => {
    expect(normalizeGeoName('Чиpчик')).toBe(normalizeGeoName('Чирчик'));
    // Чисто латинское слово не трогаем.
    expect(normalizeGeoName('Chirchiq')).toBe('chirchiq');
  });
});

// ── matchRegionDistrict: Ташкент ──────────────────────────────────────────────

describe('matchRegionDistrict — г. Ташкент', () => {
  const cases: [string, string][] = [
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
  ];

  it.each(cases)('ru-интерфейс: «%s» → %s', (yandexName, districtId) => {
    const { regions, districts } = dict('ru');
    expect(matchRegionDistrict(tashkentRu(yandexName), regions, districts)).toEqual({
      regionId: R_CITY,
      districtId,
    });
  });

  // uz-интерфейс: справочник на узбекском («Toshkent shahri», «Yunusobod»), а
  // Yandex всё равно отвечает по-русски — матчим по aliases.
  it.each(cases)('uz-интерфейс: «%s» → %s', (yandexName, districtId) => {
    const { regions, districts } = dict('uz');
    expect(matchRegionDistrict(tashkentRu(yandexName), regions, districts)).toEqual({
      regionId: R_CITY,
      districtId,
    });
  });

  it('узбекские названия компонент (tumani, апострофы) тоже матчатся', () => {
    const { regions, districts } = dict('uz');
    const comps = [
      c('province', 'Toshkent'),
      c('locality', 'Toshkent'),
      c('district', 'Mirzo Ulugʻbek tumani'),
    ];
    expect(matchRegionDistrict(comps, regions, districts)).toEqual({
      regionId: R_CITY,
      districtId: 'mirzo-ulugbek',
    });
    expect(
      matchRegionDistrict(
        [c('province', 'Toshkent shahri'), c('district', 'Yunusobod tumani')],
        regions,
        districts,
      ),
    ).toEqual({ regionId: R_CITY, districtId: 'yunusobod' });
  });

  it('en-интерфейс: «Tashkent» + «Yunusabad District»', () => {
    const { regions, districts } = dict('en');
    const comps = [
      c('country', 'Uzbekistan'),
      c('province', 'Tashkent'),
      c('locality', 'Tashkent'),
      c('district', 'Yunusabad District'),
    ];
    expect(matchRegionDistrict(comps, regions, districts)).toEqual({
      regionId: R_CITY,
      districtId: 'yunusobod',
    });
  });

  it('район не распознан → только регион', () => {
    const { regions, districts } = dict('ru');
    expect(
      matchRegionDistrict(tashkentRu('Какой-то неизвестный район'), regions, districts),
    ).toEqual({ regionId: R_CITY, districtId: undefined });
  });

  it('микрорайон-компонента не мешает: берётся административный район', () => {
    const { regions, districts } = dict('ru');
    const comps = [
      c('province', 'Ташкент'),
      c('locality', 'Ташкент'),
      c('district', 'Чиланзарский район'),
      c('district', 'массив Чиланзар-9'),
    ];
    expect(matchRegionDistrict(comps, regions, districts).districtId).toBe('chilonzor');
  });
});

// ── matchRegionDistrict: город vs область, коллизии ───────────────────────────

describe('matchRegionDistrict — область и коллизии названий', () => {
  it('«Ташкентская область» не путается с «город Ташкент» (ru)', () => {
    const { regions, districts } = dict('ru');
    const comps = [
      c('province', 'Ташкентская область'),
      c('area', 'Зангиатинский район'),
      c('locality', 'посёлок Назарбек'),
    ];
    expect(matchRegionDistrict(comps, regions, districts)).toEqual({
      regionId: R_OBL,
      districtId: 'zangiota',
    });
  });

  it('uz-интерфейс: «Toshkent viloyati» и «Toshkent shahri» различаются по типу', () => {
    const { regions, districts } = dict('uz');
    expect(
      matchRegionDistrict([c('province', 'Toshkent viloyati')], regions, districts).regionId,
    ).toBe(R_OBL);
    expect(
      matchRegionDistrict([c('province', 'Toshkent shahri')], regions, districts).regionId,
    ).toBe(R_CITY);
    // Без уточнения — город.
    expect(
      matchRegionDistrict([c('province', 'Toshkent')], regions, districts).regionId,
    ).toBe(R_CITY);
  });

  it('«Ташкентский район» области не уводит в город Ташкент', () => {
    const { regions, districts } = dict('ru');
    const comps = [c('province', 'Ташкентская область'), c('area', 'Ташкентский район')];
    expect(matchRegionDistrict(comps, regions, districts)).toEqual({
      regionId: R_OBL,
      districtId: 'toshkent-tumani',
    });
  });

  it('район ищется только среди районов найденного региона', () => {
    const { regions, districts } = dict('ru');
    // «Юнусабадский район» в компонентах, но регион — область: совпадения нет.
    const comps = [c('province', 'Ташкентская область'), c('district', 'Юнусабадский район')];
    expect(matchRegionDistrict(comps, regions, districts)).toEqual({
      regionId: R_OBL,
      districtId: undefined,
    });
  });

  it('Самарканд: точное совпадение важнее основы (район vs город)', () => {
    const { regions, districts } = dict('ru');
    expect(
      matchRegionDistrict(
        [c('province', 'Самаркандская область'), c('locality', 'Самарканд')],
        regions,
        districts,
      ),
    ).toEqual({ regionId: R_SAM, districtId: 'samarqand' });
    expect(
      matchRegionDistrict(
        [
          c('province', 'Самаркандская область'),
          c('area', 'Самаркандский район'),
          c('locality', 'село Гулабад'),
        ],
        regions,
        districts,
      ),
    ).toEqual({ regionId: R_SAM, districtId: 'samarqand-tumani' });
  });

  it('город областного подчинения из locality + гомоглиф в справочнике («Чиpчик»)', () => {
    const { regions, districts } = dict('ru');
    const comps = [c('province', 'Ташкентская область'), c('locality', 'Чирчик')];
    expect(matchRegionDistrict(comps, regions, districts)).toEqual({
      regionId: R_OBL,
      districtId: 'chirchiq',
    });
  });

  it('en-названия областей — по синонимам кода региона', () => {
    const { regions, districts } = dict('en');
    expect(
      matchRegionDistrict([c('province', 'Tashkent Region')], regions, districts).regionId,
    ).toBe(R_OBL);
    expect(
      matchRegionDistrict([c('province', 'Fergana Region')], regions, districts).regionId,
    ).toBe(R_FER);
    expect(
      matchRegionDistrict([c('province', 'Republic of Karakalpakstan')], regions, districts)
        .regionId,
    ).toBe(R_KAR);
  });

  it('uz-интерфейс + русский ответ Yandex для области и республики', () => {
    const { regions, districts } = dict('uz');
    expect(
      matchRegionDistrict(
        [c('province', 'Ферганская область'), c('locality', 'Коканд')],
        regions,
        districts,
      ),
    ).toEqual({ regionId: R_FER, districtId: 'qoqon' });
    expect(
      matchRegionDistrict([c('province', 'Республика Каракалпакстан')], regions, districts)
        .regionId,
    ).toBe(R_KAR);
  });

  it('регион не распознан, район совпал точно и однозначно → регион берём у района', () => {
    const { regions, districts } = dict('ru');
    const comps = [c('province', 'Неведомая губерния'), c('area', 'Кибрайский район')];
    expect(matchRegionDistrict(comps, regions, districts)).toEqual({
      regionId: R_OBL,
      districtId: 'qibray',
    });
  });

  it('ничего не распознано / пустые компоненты → пусто', () => {
    const { regions, districts } = dict('ru');
    expect(matchRegionDistrict([], regions, districts)).toEqual({});
    expect(
      matchRegionDistrict(
        [c('country', 'Казахстан'), c('province', 'Туркестанская область')],
        regions,
        districts,
      ),
    ).toEqual({});
  });
});

// ── resolveMapLocation ────────────────────────────────────────────────────────

describe('resolveMapLocation', () => {
  it('регион не распознан → ничего не меняем', () => {
    expect(resolveMapLocation({ regionId: 'r1', districtId: 'd1' }, {})).toBeNull();
  });

  it('распознаны регион и район → ставим оба', () => {
    expect(
      resolveMapLocation({ regionId: 'r1', districtId: 'd1' }, { regionId: 'r2', districtId: 'd9' }),
    ).toEqual({ regionId: 'r2', districtId: 'd9' });
  });

  it('то же, что уже выбрано → ничего не меняем', () => {
    expect(
      resolveMapLocation({ regionId: 'r1', districtId: 'd1' }, { regionId: 'r1', districtId: 'd1' }),
    ).toBeNull();
  });

  it('регион тот же, район не распознан → выбранный район сохраняем', () => {
    expect(resolveMapLocation({ regionId: 'r1', districtId: 'd1' }, { regionId: 'r1' })).toBeNull();
  });

  it('регион другой, район не распознан → новый регион, район сброшен', () => {
    expect(resolveMapLocation({ regionId: 'r1', districtId: 'd1' }, { regionId: 'r2' })).toEqual({
      regionId: 'r2',
      districtId: undefined,
    });
  });
});

// ── composeAutoAddress ────────────────────────────────────────────────────────

describe('composeAutoAddress', () => {
  it('«Регион, Район» / только регион / пусто', () => {
    expect(composeAutoAddress('город Ташкент', 'Юнусабад')).toBe('город Ташкент, Юнусабад');
    expect(composeAutoAddress('город Ташкент')).toBe('город Ташкент');
    expect(composeAutoAddress(undefined, 'Юнусабад')).toBe('');
  });
});
