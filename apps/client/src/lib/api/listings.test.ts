import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  buildSearchParams,
  getFeaturedListings,
  mapListing,
  prioritizePhotos,
  searchListings,
  searchListingsPage,
  SEARCH_PAGE_SIZE,
  type ApiSearchItem,
} from './listings';
import type { Listing } from '@/lib/mock/types';

/** ApiListingDetail не экспортируется — приводим фикстуру к входу mapListing. */
type AnyApiListing = Parameters<typeof mapListing>[0];
const asListing = (x: unknown): AnyApiListing => x as AnyApiListing;

/** Краткая карточка поиска (без media/contact). */
const searchItem: ApiSearchItem = {
  id: 's1',
  status: 'ACTIVE',
  transaction_type: 'SALE',
  property_type: 'APARTMENT',
  price: '500000000',
  currency: 'UZS',
  rooms: 2,
  bathrooms: null,
  lot_area: null,
  parking_type: null,
  city_id: 'c1',
  district_id: 'uuid-district',
  district_name: 'Юнусабадский',
  address: 'ул. Амира Темура, 15',
  latitude: '41.31',
  longitude: '69.27',
  promotion_type: 'NORMAL',
  promotion_expires_at: null,
  effective_tier: 'TOP',
  language: 'RU',
  title: '2-комн квартира',
  thumbnail_url: 'https://x/t.jpg',
  created_at: '2026-06-10T00:00:00.000Z',
};

/** Детальный ответ — наличие `media` отличает его от карточки поиска (hasMedia). */
const detail = {
  id: 'd1',
  status: 'ACTIVE',
  transaction_type: 'RENT',
  property_type: 'HOUSE',
  price: '3000000',
  currency: 'UZS',
  area: '120',
  lot_area: null,
  rooms: 4,
  floor: null,
  total_floors: null,
  year_built: 2020,
  city_id: 'c1',
  district_id: 'uuid-district',
  district_name: 'Мирабадский',
  address: 'ул. Тест, 1',
  latitude: '41.30',
  longitude: '69.28',
  promotion_type: 'VIP',
  promotion_expires_at: null,
  owner_id: 'o1',
  agency_id: null,
  contact: { display_name: 'Алишер', type: 'agent' as const, is_pro: true, phone: '+998901234567' },
  language: 'RU',
  title: 'Дом в аренду',
  description: 'Описание',
  address_note: null,
  features_text: 'Парковка, Wi-Fi',
  amenities: ['ELEVATOR', 'INTERNET'] as const,
  media: [{ id: 'm1', url: 'https://x/p.jpg', thumbnail_url: 'https://x/p_t.jpg', sort_order: 0, type: 'IMAGE' }],
  published_at: null,
  created_at: '2026-06-09T00:00:00.000Z',
};

describe('mapListing — district_name', () => {
  it('кладёт district_name (а не uuid) в listing.district для карточки поиска', () => {
    expect(mapListing(searchItem).district).toBe('Юнусабадский');
  });

  it('кладёт district_name для детальной карточки', () => {
    expect(mapListing(asListing(detail)).district).toBe('Мирабадский');
  });

  it('null district_name → пустая строка (без uuid в UI)', () => {
    expect(mapListing({ ...searchItem, district_name: null }).district).toBe('');
  });
});

describe('mapListing — agent.kind (TASK-210/ADR-0069)', () => {
  it('прокидывает contact.type в agent.kind для детальной карточки', () => {
    expect(mapListing(asListing(detail)).agent.kind).toBe('agent');
  });

  it('agency: contact.type=agency → agent.kind=agency', () => {
    const agencyDetail = {
      ...detail,
      contact: { ...detail.contact, type: 'agency' as const },
    };
    expect(mapListing(asListing(agencyDetail)).agent.kind).toBe('agency');
  });

  it('краткая карточка поиска (без contact) → agent.kind=owner по умолчанию', () => {
    expect(mapListing(searchItem).agent.kind).toBe('owner');
  });
});

describe('mapListing — photos (TASK-197)', () => {
  it('карточка поиска с thumbnail → одно фото', () => {
    const photos = mapListing(searchItem).photos;
    expect(photos).toEqual([{ url: 'https://x/t.jpg', thumb: 'https://x/t.jpg' }]);
  });

  it('карточка поиска без thumbnail → пустой photos (без внешнего placehold.co)', () => {
    const photos = mapListing({ ...searchItem, thumbnail_url: null }).photos;
    expect(photos).toEqual([]);
  });

  it('детальная карточка без media → пустой photos', () => {
    const photos = mapListing(asListing({ ...detail, media: [] })).photos;
    expect(photos).toEqual([]);
  });

  it('ни один listing не получает внешний URL placehold.co', () => {
    const all = [
      mapListing({ ...searchItem, thumbnail_url: null }),
      mapListing(asListing({ ...detail, media: [] })),
    ];
    const urls = all.flatMap((l) => l.photos.flatMap((p) => [p.url, p.thumb]));
    expect(urls.some((u) => u.includes('placehold.co'))).toBe(false);
  });
});

describe('mapListing — thumbnails (массив фото из поиска)', () => {
  it('thumbnails[3] → 3 фото, url и thumb из массива', () => {
    const photos = mapListing({
      ...searchItem,
      thumbnails: ['a', 'b', 'c'],
    }).photos;
    expect(photos).toHaveLength(3);
    expect(photos[0]).toEqual({ url: 'a', thumb: 'a' });
    expect(photos[1]).toEqual({ url: 'b', thumb: 'b' });
    expect(photos[2]).toEqual({ url: 'c', thumb: 'c' });
  });

  it('thumbnails приоритетнее thumbnail_url — берём массив', () => {
    const photos = mapListing({
      ...searchItem,
      thumbnail_url: 'https://x/old.jpg',
      thumbnails: ['https://x/new1.jpg', 'https://x/new2.jpg'],
    }).photos;
    expect(photos).toHaveLength(2);
    expect(photos[0].url).toBe('https://x/new1.jpg');
  });

  it('фолбэк: нет thumbnails, есть thumbnail_url → 1 фото (обратная совместимость)', () => {
    const photos = mapListing({
      ...searchItem,
      thumbnail_url: 'https://x/t.jpg',
      thumbnails: undefined,
    }).photos;
    expect(photos).toEqual([{ url: 'https://x/t.jpg', thumb: 'https://x/t.jpg' }]);
  });

  it('нет thumbnails, нет thumbnail_url → пустой список', () => {
    const photos = mapListing({
      ...searchItem,
      thumbnail_url: null,
      thumbnails: undefined,
    }).photos;
    expect(photos).toEqual([]);
  });
});

describe('prioritizePhotos (TASK-197)', () => {
  const withPhoto = (id: string): Listing =>
    ({ id, photos: [{ url: 'u', thumb: 't' }] }) as unknown as Listing;
  const noPhoto = (id: string): Listing =>
    ({ id, photos: [] }) as unknown as Listing;

  it('листинги с фото идут первыми, без фото — в конце', () => {
    const input = [noPhoto('a'), withPhoto('b'), noPhoto('c'), withPhoto('d')];
    const out = prioritizePhotos(input).map((l) => l.id);
    expect(out).toEqual(['b', 'd', 'a', 'c']);
  });

  it('стабильна: сохраняет исходный порядок внутри каждой группы', () => {
    const input = [withPhoto('x'), withPhoto('y'), noPhoto('z')];
    expect(prioritizePhotos(input).map((l) => l.id)).toEqual(['x', 'y', 'z']);
  });

  it('не мутирует входной массив', () => {
    const input = [noPhoto('a'), withPhoto('b')];
    prioritizePhotos(input);
    expect(input.map((l) => l.id)).toEqual(['a', 'b']);
  });
});

describe('getFeaturedListings — фото-приоритет (TASK-197)', () => {
  const item = (id: string, withThumb: boolean): ApiSearchItem => ({
    ...searchItem,
    id,
    thumbnail_url: withThumb ? `https://x/${id}.jpg` : null,
  });

  const stubFetch = (items: ApiSearchItem[]) => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: items,
        meta: { limit: items.length, total: items.length, next_cursor: null },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  afterEach(() => vi.unstubAllGlobals());

  it('двигает листинги с фото вперёд, без фото — в конец', async () => {
    stubFetch([item('a', false), item('b', true), item('c', false), item('d', true)]);
    const out = await getFeaturedListings(4, 'ru');
    expect(out.map((l) => l.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('режет до limit после переупорядочивания (фото попадают в срез)', async () => {
    stubFetch([item('a', false), item('b', false), item('c', true), item('d', true)]);
    const out = await getFeaturedListings(2, 'ru');
    expect(out.map((l) => l.id)).toEqual(['c', 'd']);
  });
});

describe('mapListing — contact', () => {
  it('детальный contact → agent (имя/pro/телефон)', () => {
    const agent = mapListing(asListing(detail)).agent;
    expect(agent.name).toBe('Алишер');
    expect(agent.pro).toBe(true);
    expect(agent.phone).toBe('+998901234567');
  });

  it('карточка поиска без contact → нейтральный плейсхолдер (пустой агент)', () => {
    const agent = mapListing(searchItem).agent;
    expect(agent.name).toBe('');
    expect(agent.pro).toBe(false);
    expect(agent.phone).toBeUndefined();
  });

  it('null display_name/phone в contact → пустое имя и undefined телефон', () => {
    const noName = {
      ...detail,
      contact: { display_name: null, type: 'owner' as const, is_pro: false, phone: null },
    };
    const agent = mapListing(asListing(noName)).agent;
    expect(agent.name).toBe('');
    expect(agent.pro).toBe(false);
    expect(agent.phone).toBeUndefined();
  });
});

/**
 * Контракт sort (API.md §9 / search-listings.dto.ts SORT_MODES):
 * бэк принимает только date_desc|price_asc|price_desc|area_desc, промо-тир всегда
 * первичен. Невалидное значение → 400 → safeSearch деградирует в пустую выдачу
 * (пустые карусели/«Ничего не найдено»). Поэтому клиент НЕ должен слать
 * `promotion_priority_desc` (= серверный дефолт) и неподдержанный `area_asc`.
 */
describe('searchListings / getFeaturedListings — sort соответствует API §9', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [], meta: { limit: 24, total: 0, next_cursor: null } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const calledUrl = () => String(fetchMock.mock.calls[0]?.[0] ?? '');

  it('getFeaturedListings НЕ шлёт невалидный sort=promotion_priority_desc', async () => {
    await getFeaturedListings(8, 'ru');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calledUrl()).not.toContain('promotion_priority_desc');
  });

  it('sort=promotion из UI → серверный дефолт (sort не отправляется)', async () => {
    await searchListings({ tx: 'SALE', sort: 'promotion' }, 'ru');
    const url = calledUrl();
    expect(url).not.toContain('promotion_priority_desc');
    expect(url).not.toContain('sort=');
  });

  it('валидный sort (price_asc) проходит как есть', async () => {
    await searchListings({ sort: 'price_asc' }, 'ru');
    expect(calledUrl()).toContain('sort=price_asc');
  });

  it('area_asc не поддержан API §9 → sort опускается (без 400)', async () => {
    await searchListings({ sort: 'area_asc' }, 'ru');
    expect(calledUrl()).not.toContain('sort=');
  });
});

/**
 * searchListingsPage (TASK-199): первая страница SSR /search вместе с `meta`
 * (total/next_cursor), плюс keyset-дозагрузка по `cursor`.
 */
describe('searchListingsPage — keyset-пагинация (TASK-199)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  const mockEnvelope = (env: unknown) => {
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => env }));
    vi.stubGlobal('fetch', fetchMock);
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const calledUrl = () => String(fetchMock.mock.calls[0]?.[0] ?? '');

  it('возвращает listings + total + nextCursor из meta', async () => {
    mockEnvelope({
      data: [searchItem],
      meta: { limit: 24, total: 134, next_cursor: 'CURSOR_2' },
    });
    const page = await searchListingsPage({ tx: 'SALE' }, 'ru');
    expect(page.total).toBe(134);
    expect(page.nextCursor).toBe('CURSOR_2');
    expect(page.listings).toHaveLength(1);
    expect(page.listings[0].id).toBe('s1');
  });

  it('первая страница не шлёт cursor; limit по умолчанию SEARCH_PAGE_SIZE', async () => {
    mockEnvelope({ data: [], meta: { limit: SEARCH_PAGE_SIZE, total: 0, next_cursor: null } });
    await searchListingsPage({ tx: 'SALE' }, 'ru');
    const url = calledUrl();
    expect(url).not.toContain('cursor=');
    expect(url).toContain(`limit=${SEARCH_PAGE_SIZE}`);
  });

  it('следующая страница шлёт cursor=<token>', async () => {
    mockEnvelope({ data: [], meta: { limit: 24, total: 134, next_cursor: null } });
    await searchListingsPage({ tx: 'SALE' }, 'ru', 24, 'CURSOR_2');
    expect(calledUrl()).toContain('cursor=CURSOR_2');
  });

  it('ошибка API → пустая страница без курсора (деградация, без краха SSR)', async () => {
    fetchMock = vi.fn(async () => ({ ok: false, status: 500, statusText: 'ERR' }));
    vi.stubGlobal('fetch', fetchMock);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const page = await searchListingsPage({ tx: 'SALE' }, 'ru');
    expect(page).toEqual({ listings: [], total: 0, nextCursor: null });
    errSpy.mockRestore();
  });
});

describe('mapListing — amenities (ADR-0111)', () => {
  it('detail содержит amenities из API', () => {
    const listing = mapListing(asListing(detail));
    expect(listing.amenities).toEqual(['ELEVATOR', 'INTERNET']);
  });

  it('detail без amenities → пустой массив', () => {
    const listing = mapListing(asListing({ ...detail, amenities: undefined }));
    expect(listing.amenities).toEqual([]);
  });

  it('карточка поиска (searchItem) — amenities отсутствует (не в карточке)', () => {
    const listing = mapListing(searchItem);
    expect(listing.amenities).toEqual([]);
  });
});

describe('buildSearchParams — Zillow-фильтры (Task 4)', () => {
  it('мультивыбор типов → повторяющийся property_type', () => {
    const p = buildSearchParams({ types: ['APARTMENT', 'HOUSE'] }, 24);
    expect(p.getAll('property_type')).toEqual(['APARTMENT', 'HOUSE']);
  });

  it('amenities → повторяющийся параметр amenities (AND)', () => {
    const p = buildSearchParams({ amenities: ['ELEVATOR', 'INTERNET'] }, 24);
    expect(p.getAll('amenities')).toEqual(['ELEVATOR', 'INTERNET']);
  });

  it('amenities пустой → параметр не отправляется', () => {
    const p = buildSearchParams({ amenities: [] }, 24);
    expect(p.getAll('amenities')).toEqual([]);
  });

  it('regionId → region_id в параметрах запроса', () => {
    const p = buildSearchParams({ regionId: 'uuid-region-tashkent' }, 24);
    expect(p.get('region_id')).toBe('uuid-region-tashkent');
  });

  it('regionId не задан → region_id отсутствует', () => {
    const p = buildSearchParams({ tx: 'SALE' }, 24);
    expect(p.has('region_id')).toBe(false);
  });

  it('agentId → agent_id в параметрах запроса (страница /agents/:id, API.md §21)', () => {
    const p = buildSearchParams({ agentId: 'u1' }, 24);
    expect(p.get('agent_id')).toBe('u1');
  });

  it('agentId не задан → agent_id отсутствует', () => {
    const p = buildSearchParams({ tx: 'SALE' }, 24);
    expect(p.has('agent_id')).toBe(false);
  });

  it('rooms_min, area, floor, year, source, tours', () => {
    const p = buildSearchParams(
      {
        roomsMin: 2,
        areaMin: 40, areaMax: 90,
        floorMin: 2, notFirstFloor: true,
        yearMin: 2010,
        listingSource: ['OWNER', 'AGENCY'],
        toursEnabled: true,
      },
      24,
    );
    expect(p.get('rooms_min')).toBe('2');
    expect(p.get('area_min')).toBe('40');
    expect(p.get('area_max')).toBe('90');
    expect(p.get('floor_min')).toBe('2');
    expect(p.get('not_first_floor')).toBe('true');
    expect(p.get('year_min')).toBe('2010');
    expect(p.getAll('listing_source')).toEqual(['OWNER', 'AGENCY']);
    expect(p.get('tours_enabled')).toBe('true');
  });

  it('newConstruction → new_construction=true; отсутствие — параметра нет', () => {
    expect(buildSearchParams({ newConstruction: true }, 24).get('new_construction')).toBe('true');
    expect(buildSearchParams({}, 24).has('new_construction')).toBe(false);
  });
});
