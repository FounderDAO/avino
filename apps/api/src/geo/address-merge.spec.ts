import { houseNumberOf, mergeListingAddress, streetKey, type PointAddress } from './address-merge';

/**
 * Юнит-тесты слияния адреса пользователя с ответом геокодера: адрес, который
 * ввёл/выбрал пользователь, не перезаписывается «ближайшим домом» Яндекса.
 */
describe('streetKey / houseNumberOf', () => {
  it('тип улицы и регистр не важны', () => {
    expect(streetKey('улица Амира Темура')).toBe(streetKey('ул. Амира Темура'));
    expect(streetKey('проспект Амира Темура')).toBe(streetKey('просп. амира темура'));
    expect(streetKey('Seul koʻchasi')).toBe(streetKey("Seul ko'chasi"));
  });

  it('номер дома распознаётся, текст — нет', () => {
    expect(houseNumberOf('13')).toBe('13');
    expect(houseNumberOf('7/1')).toBe('7/1');
    expect(houseNumberOf('13А')).toBe('13А');
    expect(houseNumberOf('д. 15')).toBe('15');
    expect(houseNumberOf('дом 2Б')).toBe('2Б');
    expect(houseNumberOf('ЖК Сеул Плаза')).toBeNull();
    expect(houseNumberOf('Чиланзар')).toBeNull();
  });
});

describe('mergeListingAddress', () => {
  const point = (overrides: Partial<PointAddress> = {}): PointAddress => ({
    ru: {
      locality: 'Ташкент',
      street: 'улица Сеул',
      house: '7/1',
      components: [
        { kind: 'country', name: 'Узбекистан' },
        { kind: 'province', name: 'Ташкент' },
        { kind: 'locality', name: 'Ташкент' },
        { kind: 'district', name: 'Чиланзарский район' },
        { kind: 'street', name: 'улица Сеул' },
        { kind: 'house', name: '7/1' },
      ],
    },
    en: { locality: 'Tashkent', street: 'Seul koʻchasi', house: '7/1', components: [] },
    houseTrusted: true,
    district: { nameRu: 'Чиланзар', nameEn: 'Chilanzar', nameUz: 'Chilonzor' },
    ...overrides,
  });

  it('адреса от пользователя нет, дом рядом с точкой → полный канонический ru/en', () => {
    expect(mergeListingAddress(undefined, point())).toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
    });
  });

  it('адреса нет, ближайший дом далеко от точки → только улица, чужой номер не берём', () => {
    expect(mergeListingAddress('', point({ houseTrusted: false }))).toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi',
    });
  });

  it('пользователь указал ту же улицу и СВОЙ дом → дом пользователя, не соседний', () => {
    expect(mergeListingAddress('город Ташкент, улица Сеул, 9', point())).toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 9',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 9',
    });
  });

  it('улица пользователя не совпала с геокодером (новостройка) → текст пользователя, en нет', () => {
    expect(mergeListingAddress('Узбекистан, Ташкент, ЖК Сеул Плаза, 3', point())).toEqual({
      address: 'Ташкент, ЖК Сеул Плаза, 3',
      addressEn: null,
    });
  });

  it('пользователь указал только город и район → недостающее дополняется по точке', () => {
    expect(mergeListingAddress('Ташкент, Чиланзар', point())).toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
      addressEn: 'Tashkent, Chilanzar, Seul koʻchasi, 7/1',
    });
  });

  it('пользователь указал дом без улицы → улицу не подставляем, дом его', () => {
    expect(mergeListingAddress('Ташкент, Чиланзарский район, 15', point())).toEqual({
      address: 'Ташкент, Чиланзар, 15',
      addressEn: 'Tashkent, Chilanzar, 15',
    });
  });

  it('район в адресе — по точке (справочник), а не по выбранному пользователем', () => {
    const p = point({ district: { nameRu: 'Юнусабад', nameEn: 'Yunusabad', nameUz: 'Yunusobod' } });
    expect(mergeListingAddress(undefined, p).address).toBe('Ташкент, Юнусабад, ул. Сеул, 7/1');
  });

  it('район по точке не определён → район опускается', () => {
    expect(mergeListingAddress(undefined, point({ district: null })).address).toBe('Ташкент, ул. Сеул, 7/1');
  });

  it('en недоступен → addressEn null', () => {
    expect(mergeListingAddress(undefined, point({ en: null }))).toEqual({
      address: 'Ташкент, Чиланзар, ул. Сеул, 7/1',
      addressEn: null,
    });
  });
});
