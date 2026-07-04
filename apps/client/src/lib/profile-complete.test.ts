import { describe, expect, it } from 'vitest';
import { isProfileCompleteForListing } from './profile-complete';
import type { MeResponse } from '@/store/api/authApi';

/** Минимальный MeResponse: только поля, которые читает предикат. */
function me(over: {
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_phone?: string | null;
}): MeResponse {
  return {
    phone: over.phone ?? null,
    profile: {
      first_name: over.first_name ?? null,
      last_name: over.last_name ?? null,
      contact_phone: over.contact_phone ?? null,
    },
  } as unknown as MeResponse;
}

describe('isProfileCompleteForListing (ADR-0125)', () => {
  it('false для null (гость)', () => {
    expect(isProfileCompleteForListing(null)).toBe(false);
  });

  it('true: имя+фамилия+contact_phone (Google-юзер, заполнил телефон)', () => {
    expect(
      isProfileCompleteForListing(
        me({ first_name: 'Ali', last_name: 'Valiev', contact_phone: '+998901234567' }),
      ),
    ).toBe(true);
  });

  it('true: имя+фамилия+только телефон аккаунта (вход по телефону)', () => {
    expect(
      isProfileCompleteForListing(
        me({ first_name: 'Ali', last_name: 'Valiev', phone: '+998901234567' }),
      ),
    ).toBe(true);
  });

  it('false: нет фамилии', () => {
    expect(
      isProfileCompleteForListing(me({ first_name: 'Ali', phone: '+998901234567' })),
    ).toBe(false);
  });

  it('false: имя из пробелов', () => {
    expect(
      isProfileCompleteForListing(
        me({ first_name: '   ', last_name: 'Valiev', phone: '+998901234567' }),
      ),
    ).toBe(false);
  });

  it('false: нет ни contact_phone, ни телефона аккаунта (Google-юзер)', () => {
    expect(
      isProfileCompleteForListing(me({ first_name: 'Ali', last_name: 'Valiev' })),
    ).toBe(false);
  });
});
