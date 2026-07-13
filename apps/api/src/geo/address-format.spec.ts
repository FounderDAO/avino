import {
  abbreviateStreetRu,
  extractGeoParts,
  formatAddress,
  normalizeAddress,
  stripCityPrefix,
} from './address-format';

describe('stripCityPrefix', () => {
  it.each([
    ['город Ташкент', 'Ташкент'],
    ['г. Ташкент', 'Ташкент'],
    ['Ташкент', 'Ташкент'],
    ['Самарканд', 'Самарканд'],
  ])('%s → %s', (input, expected) => {
    expect(stripCityPrefix(input)).toBe(expected);
  });
});

describe('abbreviateStreetRu', () => {
  it.each([
    ['улица Сеул', 'ул. Сеул'],
    ['проспект Амира Темура', 'просп. Амира Темура'],
    ['переулок Тихий', 'пер. Тихий'],
    ['бульвар Мустакиллик', 'бул. Мустакиллик'],
    ['площадь Регистан', 'пл. Регистан'],
    ['ул. Бабура', 'ул. Бабура'], // уже сокращено — не трогаем
    ['Seul koʻchasi', 'Seul koʻchasi'], // en/uz — не трогаем
  ])('%s → %s', (input, expected) => {
    expect(abbreviateStreetRu(input)).toBe(expected);
  });
});

describe('formatAddress', () => {
  it('склеивает непустые части через запятую', () => {
    expect(
      formatAddress({ locality: 'Ташкент', district: 'Мирзо-Улугбек', street: 'ул. Бабура', house: '13' }),
    ).toBe('Ташкент, Мирзо-Улугбек, ул. Бабура, 13');
  });
  it('пропускает null/undefined/пустые части', () => {
    expect(formatAddress({ locality: 'Ташкент', district: null, street: 'ул. Бабура', house: '' })).toBe(
      'Ташкент, ул. Бабура',
    );
  });
  it('все части пусты → пустая строка', () => {
    expect(formatAddress({})).toBe('');
  });
});

describe('normalizeAddress', () => {
  it('срезает «город», страну и хвост-дубль района/города (кейс Tommy)', () => {
    expect(
      normalizeAddress('город Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбек р-н, Ташкент'),
    ).toBe('Ташкент, Мирзо-Улугбек, ул. Бабура, 13');
  });
  it('срезает «Узбекистан» и сокращает «улица»', () => {
    expect(normalizeAddress('Узбекистан, Ташкент, Чиланзарский район, улица Сеул, 7/1')).toBe(
      'Ташкент, Чиланзарский район, ул. Сеул, 7/1',
    );
  });
  it('дедупит «-ский район» против голого имени района', () => {
    expect(normalizeAddress('Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбекский район')).toBe(
      'Ташкент, Мирзо-Улугбек, ул. Бабура, 13',
    );
  });
  it('англ. страна/район: Uzbekistan и Chilanzar District', () => {
    expect(normalizeAddress('Uzbekistan, Tashkent, Chilanzar District, Seul koʻchasi, 7/1')).toBe(
      'Tashkent, Chilanzar District, Seul koʻchasi, 7/1',
    );
  });
  it('идемпотентна', () => {
    const once = normalizeAddress('город Ташкент, Мирзо-Улугбек, ул. Бабура, 13, Мирзо-Улугбек р-н, Ташкент');
    expect(normalizeAddress(once)).toBe(once);
  });
  it('чистая строка проходит без изменений', () => {
    expect(normalizeAddress('Ташкент, Юнусабад, массив Файзли, 18')).toBe('Ташкент, Юнусабад, массив Файзли, 18');
  });
});

describe('extractGeoParts', () => {
  // Реальная форма ответа HTTP Геокодера (curl-проверка 2026-07-13).
  const geocoderJson = (components: Array<{ kind: string; name: string }>) => ({
    response: {
      GeoObjectCollection: {
        featureMember: [
          {
            GeoObject: {
              metaDataProperty: { GeocoderMetaData: { Address: { Components: components } } },
            },
          },
        ],
      },
    },
  });

  it('вытаскивает locality/street/house', () => {
    expect(
      extractGeoParts(
        geocoderJson([
          { kind: 'country', name: 'Узбекистан' },
          { kind: 'province', name: 'Ташкент' },
          { kind: 'locality', name: 'Ташкент' },
          { kind: 'district', name: 'Чиланзарский район' },
          { kind: 'district', name: 'махаллинский сход граждан Бешагач' },
          { kind: 'street', name: 'улица Сеул' },
          { kind: 'house', name: '7/1' },
        ]),
      ),
    ).toEqual({ locality: 'Ташкент', street: 'улица Сеул', house: '7/1' });
  });
  it('нет locality → берёт province', () => {
    expect(
      extractGeoParts(geocoderJson([{ kind: 'province', name: 'Ташкентская область' }, { kind: 'street', name: 'улица Навои' }])),
    ).toEqual({ locality: 'Ташкентская область', street: 'улица Навои', house: null });
  });
  it('пустой featureMember → null', () => {
    expect(
      extractGeoParts({ response: { GeoObjectCollection: { featureMember: [] } } }),
    ).toBeNull();
  });
  it('мусорный json → null', () => {
    expect(extractGeoParts({})).toBeNull();
    expect(extractGeoParts(null)).toBeNull();
  });
});
