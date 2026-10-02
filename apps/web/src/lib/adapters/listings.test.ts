import { describe, expect, it } from 'vitest';
import { apiToUiStatus, UI_FILTER_TO_API_STATUS, duplicateToView } from './listings';
import { FALLBACK_PHOTO } from '@/lib/mock';
import type { AdminListingDuplicate } from '@/store/api/adminTypes';

/** Спека 2026-10-01: SOLD/RENTED — собственные UI-статусы, не «В архиве». */
describe('apiToUiStatus', () => {
  it.each([
    ['ACTIVE', 'ACTIVE'],
    ['NEW', 'PENDING'],
    ['SOLD', 'SOLD'],
    ['RENTED', 'RENTED'],
    ['ARCHIVED', 'ARCHIVED'],
    ['DELETED', 'DELETED'],
  ] as const)('%s → %s', (api, ui) => {
    expect(apiToUiStatus(api)).toBe(ui);
  });
});

describe('UI_FILTER_TO_API_STATUS', () => {
  it('фильтры «Продано»/«Сдано» транслируются в API-статусы', () => {
    expect(UI_FILTER_TO_API_STATUS.SOLD).toBe('SOLD');
    expect(UI_FILTER_TO_API_STATUS.RENTED).toBe('RENTED');
  });

  it('«Архив» и «Удалённые» — разные API-статусы', () => {
    expect(UI_FILTER_TO_API_STATUS.ARCHIVED).toBe('ARCHIVED');
    expect(UI_FILTER_TO_API_STATUS.DELETED).toBe('DELETED');
  });
});

/**
 * `duplicateToView` — карточка возможного дубликата
 * (`GET /admin/listings/:id/duplicates`) → view-модель блока/модалки дубликатов.
 */
describe('duplicateToView', () => {
  const dup: AdminListingDuplicate = {
    id: 'dup-1',
    reference: 100123,
    status: 'ACTIVE',
    transaction_type: 'SALE',
    price: '120000.00',
    currency: 'USD',
    area: '65.50',
    total_floors: 9,
    address: 'Ташкент, ул. Навои, 10',
    title: '2-комн квартира',
    photo_url: 'https://cdn/img.jpg',
    created_at: '2026-05-01T09:00:00.000Z',
  };

  it('maps a full card: №, formatted price, area, floors, UI status, date', () => {
    expect(duplicateToView(dup)).toEqual({
      id: 'dup-1',
      reference: '№100123',
      title: '2-комн квартира',
      address: 'Ташкент, ул. Навои, 10',
      price: '$120,000',
      area: '65.5 м²',
      floors: '9 эт.',
      status: 'ACTIVE',
      photo: 'https://cdn/img.jpg',
      created: '01.05.2026',
    });
  });

  it('falls back to dash/placeholder for null area, floors, address and photo', () => {
    const view = duplicateToView({
      ...dup,
      status: 'NEW',
      area: null,
      total_floors: null,
      address: null,
      photo_url: null,
    });
    expect(view).toMatchObject({
      area: '—',
      floors: '—',
      address: '—',
      photo: FALLBACK_PHOTO,
      // NEW (на модерации) → UI-статус PENDING.
      status: 'PENDING',
    });
  });
});
