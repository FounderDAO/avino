import { describe, expect, it } from 'vitest';
import { ENTITY, footerSocial, verifiedContact, verifiedSameAs } from './entity';
import { ogLocale, openGraphBase } from './og';

describe('entity', () => {
  it('sameAs only lists verified, working profiles', () => {
    expect(verifiedSameAs()).toEqual(['https://t.me/avino_uz', 'https://www.instagram.com/avino.uz']);
  });

  it('footer hides broken profiles but keeps unverified ones', () => {
    expect(footerSocial().map((s) => s.label)).toEqual(['TG', 'IG', 'FB']);
  });

  it('never renders unverified contacts', () => {
    expect(verifiedContact(ENTITY.telephone)).toBeUndefined();
    expect(verifiedContact({ value: '+998 00 000 00 00', verified: false })).toBeUndefined();
    expect(verifiedContact({ value: '+998 00 000 00 00', verified: true })).toBe('+998 00 000 00 00');
  });
});

describe('open graph base', () => {
  it('uses ll_CC locales with alternates and the default image', () => {
    expect(ogLocale('uz')).toBe('uz_UZ');
    const og = openGraphBase('ru');
    expect(og.locale).toBe('ru_RU');
    expect(og.alternateLocale).toEqual(['uz_UZ', 'en_US']);
    expect(og.images[0]).toMatchObject({ url: 'https://avino.uz/og-default.png', width: 1200, height: 630 });
  });
});
