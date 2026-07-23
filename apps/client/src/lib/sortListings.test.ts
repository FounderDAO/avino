import { describe, it, expect } from 'vitest';
import { sortListings, PINNED_PROMO_COUNT } from './sortListings';
import type { Listing, PromotionType, Currency } from './mock/types';

/** Минимальный фейк листинга: только поля, по которым сортируем. */
function L(
  id: string,
  opts: {
    promo?: PromotionType;
    price?: string;
    currency?: Currency;
    area?: string;
    createdAt?: string;
  } = {},
): Listing {
  return {
    id,
    promo: opts.promo ?? 'NORMAL',
    price: opts.price ?? '0',
    currency: opts.currency ?? 'USD',
    area: opts.area,
    createdAt: opts.createdAt ?? '2020-01-01T00:00:00.000Z',
  } as Listing;
}

const ids = (list: Listing[]) => list.map((l) => l.id);

describe('sortListings', () => {
  it('не мутирует исходный массив', () => {
    const input = [L('a'), L('b')];
    const copy = [...input];
    sortListings(input, 'date_desc');
    expect(input).toEqual(copy);
  });

  describe('promotion (дефолт) — полный промо-приоритет', () => {
    it('tier desc → createdAt desc → id desc', () => {
      const list = [
        L('n1', { promo: 'NORMAL', createdAt: '2021-01-01T00:00:00Z' }),
        L('vip', { promo: 'VIP', createdAt: '2020-01-01T00:00:00Z' }),
        L('top', { promo: 'TOP', createdAt: '2020-01-01T00:00:00Z' }),
        L('n2', { promo: 'NORMAL', createdAt: '2022-01-01T00:00:00Z' }),
      ];
      // VIP(2) > TOP(1) > NORMAL(0); среди NORMAL — свежее (n2) раньше n1.
      expect(ids(sortListings(list, 'promotion'))).toEqual(['vip', 'top', 'n2', 'n1']);
    });

    it('одинаковый tier+createdAt → tie-break id desc', () => {
      const list = [
        L('a', { createdAt: '2020-01-01T00:00:00Z' }),
        L('c', { createdAt: '2020-01-01T00:00:00Z' }),
        L('b', { createdAt: '2020-01-01T00:00:00Z' }),
      ];
      expect(ids(sortListings(list, 'promotion'))).toEqual(['c', 'b', 'a']);
    });
  });

  describe('area_desc — топ-3 промо + площадь desc, null в конец', () => {
    it('закрепляет топ-3 промо, остальное по площади убыв.', () => {
      const list = [
        L('small', { area: '30' }),
        L('vip', { promo: 'VIP', area: '10' }),
        L('big', { area: '200' }),
        L('mid', { area: '80' }),
      ];
      // vip закреплён первым (промо), дальше строго по площади: big>mid>small.
      // vip НЕ участвует в потоке (исключён из хвоста).
      expect(ids(sortListings(list, 'area_desc'))).toEqual(['vip', 'big', 'mid', 'small']);
    });

    it('пустая/NULL площадь — в конец потока', () => {
      const list = [
        L('noarea', {}),
        L('a', { area: '50' }),
        L('b', { area: '90' }),
      ];
      expect(ids(sortListings(list, 'area_desc'))).toEqual(['b', 'a', 'noarea']);
    });
  });

  describe('price_asc / price_desc — FX-нормализация в USD', () => {
    it('сравнивает UZS и USD по реальной стоимости (rate)', () => {
      const rate = 12000; // 1 USD = 12000 UZS
      const list = [
        L('uzs', { price: '120000000', currency: 'UZS' }), // = $10 000
        L('usd', { price: '9000', currency: 'USD' }), //       = $9 000
      ];
      expect(ids(sortListings(list, 'price_asc', rate))).toEqual(['usd', 'uzs']);
      expect(ids(sortListings(list, 'price_desc', rate))).toEqual(['uzs', 'usd']);
    });

    it('без курса (rate undefined) — по сырой цене', () => {
      const list = [
        L('a', { price: '300', currency: 'USD' }),
        L('b', { price: '100', currency: 'USD' }),
      ];
      expect(ids(sortListings(list, 'price_asc'))).toEqual(['b', 'a']);
    });

    it('промо закреплены и не пере-сортируются по цене', () => {
      const list = [
        L('cheap', { price: '100', currency: 'USD' }),
        L('vip', { promo: 'VIP', price: '999999', currency: 'USD' }),
        L('mid', { price: '500', currency: 'USD' }),
      ];
      // vip дорогой, но закреплён первым; поток по цене возр.: cheap, mid.
      expect(ids(sortListings(list, 'price_asc'))).toEqual(['vip', 'cheap', 'mid']);
    });
  });

  describe('date_desc — топ-3 промо + createdAt desc', () => {
    it('промо вперёд, остальное по свежести', () => {
      const list = [
        L('old', { createdAt: '2020-01-01T00:00:00Z' }),
        L('vip', { promo: 'VIP', createdAt: '2019-01-01T00:00:00Z' }),
        L('new', { createdAt: '2023-01-01T00:00:00Z' }),
      ];
      expect(ids(sortListings(list, 'date_desc'))).toEqual(['vip', 'new', 'old']);
    });
  });

  describe('закрепление максимум PINNED_PROMO_COUNT промо', () => {
    it('при >3 промо закрепляются только топ-3, остальные идут в поток', () => {
      const promos = Array.from({ length: 5 }, (_, i) =>
        L(`v${i}`, { promo: 'VIP', area: String(10 + i), createdAt: `202${i}-01-01T00:00:00Z` }),
      );
      const out = sortListings(promos, 'area_desc');
      expect(PINNED_PROMO_COUNT).toBe(3);
      // Первые 3 — закреплённые по промо-порядку (tier=VIP, createdAt desc): v4,v3,v2.
      expect(ids(out).slice(0, 3)).toEqual(['v4', 'v3', 'v2']);
      // Остаток (v0,v1) — по площади desc: v1(11) > v0(10).
      expect(ids(out).slice(3)).toEqual(['v1', 'v0']);
    });
  });
});
