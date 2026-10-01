import { describe, expect, it } from 'vitest';
import { placeholderKpis, statsToKpis } from './stats';
import type { AdminStats } from '@/store/api/adminApi';

const stats: AdminStats = {
  listings_new: 1, complaints_new: 2, users_total: 3, promotions_active: 4,
  listings_active: 5, listings_archived: 6, listings_sale: 7, listings_rent: 8,
  listings_sold: 9, listings_rented: 10,
  agent_applications_new: 11, support_requests_new: 12,
};

/** Спека 2026-10-01: «Продано»/«Сдано» — отдельные KPI после «В архиве». */
describe('statsToKpis', () => {
  it('отдаёт плитки «Продано» и «Сдано» со значениями из stats', () => {
    const kpis = statsToKpis(stats);
    expect(kpis.map((k) => k.label)).toContain('Продано');
    expect(kpis.find((k) => k.label === 'Продано')?.value).toBe('9');
    expect(kpis.find((k) => k.label === 'Сдано')?.value).toBe('10');
  });

  it('placeholderKpis зеркалит тот же набор лейблов', () => {
    expect(placeholderKpis('…').map((k) => k.label)).toEqual(
      statsToKpis(stats).map((k) => k.label),
    );
  });
});
