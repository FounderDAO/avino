import { describe, it, expect } from 'vitest';
import { ownerActionsFor } from './ownerListingActions';

describe('ownerActionsFor', () => {
  it('ACTIVE sale → Hide + Mark sold', () => {
    expect(ownerActionsFor('ACTIVE', 'SALE').map((a) => a.action)).toEqual([
      'HIDE',
      'MARK_SOLD',
    ]);
  });

  it('ACTIVE rent → Hide + Mark rented', () => {
    expect(ownerActionsFor('ACTIVE', 'RENT').map((a) => a.action)).toEqual([
      'HIDE',
      'MARK_RENTED',
    ]);
  });

  it('NEW/DRAFT/REJECTED also offer Hide + sell', () => {
    for (const s of ['NEW', 'DRAFT', 'REJECTED'] as const) {
      expect(ownerActionsFor(s, 'SALE').map((a) => a.action)).toEqual([
        'HIDE',
        'MARK_SOLD',
      ]);
    }
  });

  it('ARCHIVED → Reactivate + sell', () => {
    expect(ownerActionsFor('ARCHIVED', 'RENT').map((a) => a.action)).toEqual([
      'REACTIVATE',
      'MARK_RENTED',
    ]);
  });

  it('SOLD/RENTED → only Reactivate', () => {
    expect(ownerActionsFor('SOLD', 'SALE').map((a) => a.action)).toEqual([
      'REACTIVATE',
    ]);
    expect(ownerActionsFor('RENTED', 'RENT').map((a) => a.action)).toEqual([
      'REACTIVATE',
    ]);
  });

  it('sell actions require confirmation; hide/reactivate do not', () => {
    const [hide, sell] = ownerActionsFor('ACTIVE', 'SALE');
    expect(hide.confirm).toBe(false);
    expect(sell.confirm).toBe(true);
  });

  it('unknown/undefined status → no actions', () => {
    expect(ownerActionsFor(undefined, 'SALE')).toEqual([]);
  });
});
