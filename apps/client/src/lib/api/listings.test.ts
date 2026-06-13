import { describe, it, expect } from 'vitest';
import { mapListing, type ApiSearchItem } from './listings';

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
