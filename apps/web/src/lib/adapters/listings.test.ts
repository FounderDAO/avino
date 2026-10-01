import { describe, expect, it } from 'vitest';
import { duplicateToView } from './listings';
import { FALLBACK_PHOTO } from '@/lib/mock';
import type { AdminListingDuplicate } from '@/store/api/adminTypes';

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
