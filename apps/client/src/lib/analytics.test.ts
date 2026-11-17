import { afterEach, describe, expect, it } from 'vitest';
import { toPrice, track, trackSignUp } from './analytics';

describe('analytics.track', () => {
  afterEach(() => {
    delete window.dataLayer;
  });

  it('создаёт dataLayer и кладёт событие', () => {
    track({ event: 'contact_click', listing_id: '123', method: 'phone' });
    expect(window.dataLayer).toEqual([
      { event: 'contact_click', listing_id: '123', method: 'phone' },
    ]);
  });

  it('дописывает в существующий dataLayer (его создаёт GTM)', () => {
    window.dataLayer = [{ 'gtm.start': 1 }];
    track({ event: 'listing_start' });
    expect(window.dataLayer).toHaveLength(2);
  });
});

describe('analytics.toPrice', () => {
  it('Decimal-строка → число, мусор → null', () => {
    expect(toPrice('1250000.00')).toBe(1250000);
    expect(toPrice('')).toBeNull();
    expect(toPrice(undefined)).toBeNull();
    expect(toPrice('abc')).toBeNull();
  });
});

describe('analytics.trackSignUp', () => {
  afterEach(() => {
    delete window.dataLayer;
    window.history.replaceState(null, '', '/');
  });

  it.each([
    ['/ru/sell/new', 'owner'],
    ['/uz/become-agent', 'agent'],
    ['/en/listing/1', 'seeker'],
    ['/ru', 'seeker'],
  ])('%s → %s', (path, userType) => {
    window.history.replaceState(null, '', path);
    trackSignUp();
    expect(window.dataLayer).toEqual([{ event: 'sign_up', user_type: userType }]);
  });
});
