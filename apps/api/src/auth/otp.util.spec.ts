import { OtpChannel } from '@prisma/client';
import { normalizeContact } from './contact.util';
import { generateOtpCode, hashOtpCode, verifyOtpCode } from './otp-hash.util';

describe('otp-hash.util', () => {
  it('generates a 6-digit numeric code (leading zeros preserved)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('hashes and verifies the same code (roundtrip)', async () => {
    const code = '123456';
    const hash = await hashOtpCode(code);
    expect(hash).toContain(':');
    expect(hash).not.toContain(code); // plaintext не хранится
    await expect(verifyOtpCode(code, hash)).resolves.toBe(true);
  });

  it('rejects a wrong code', async () => {
    const hash = await hashOtpCode('000000');
    await expect(verifyOtpCode('000001', hash)).resolves.toBe(false);
  });

  it('uses a unique salt per hash (same code → different hashes)', async () => {
    const a = await hashOtpCode('424242');
    const b = await hashOtpCode('424242');
    expect(a).not.toEqual(b);
  });

  it('treats a malformed stored hash as no match', async () => {
    await expect(verifyOtpCode('123456', 'not-a-valid-hash')).resolves.toBe(
      false,
    );
  });
});

describe('normalizeContact', () => {
  it('accepts and normalizes E.164 phones for SMS', () => {
    expect(normalizeContact(OtpChannel.SMS, '+998901234567')).toBe(
      '+998901234567',
    );
    expect(normalizeContact(OtpChannel.SMS, '+998 90 123-45-67')).toBe(
      '+998901234567',
    );
  });

  it('rejects invalid phones for SMS', () => {
    expect(normalizeContact(OtpChannel.SMS, '998901234567')).toBeNull(); // нет «+»
    expect(normalizeContact(OtpChannel.SMS, '+0123')).toBeNull(); // ведущий 0 / коротко
    expect(normalizeContact(OtpChannel.SMS, 'ali@mail.uz')).toBeNull();
  });

  it('accepts and lowercases emails for EMAIL', () => {
    expect(normalizeContact(OtpChannel.EMAIL, ' Ali@Mail.UZ ')).toBe(
      'ali@mail.uz',
    );
  });

  it('rejects invalid emails for EMAIL', () => {
    expect(normalizeContact(OtpChannel.EMAIL, 'not-an-email')).toBeNull();
    expect(normalizeContact(OtpChannel.EMAIL, '+998901234567')).toBeNull();
  });
});
