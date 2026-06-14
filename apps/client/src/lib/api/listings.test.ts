import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  getFeaturedListings,
  mapListing,
  searchListings,
  type ApiSearchItem,
} from './listings';

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
  city_id: 'c1',
  district_id: 'uuid-district',
  district_name: 'Юнусабадский',
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
