import { OtpChannel } from '@prisma/client';
import { isReviewerBypass } from './otp-bypass.util';

describe('isReviewerBypass', () => {
  const phones = ['+998902793100'];

  it('true когда включено, канал SMS и номер в allowlist', () => {
    expect(
      isReviewerBypass({ enabled: true, phones }, OtpChannel.SMS, '+998902793100'),
    ).toBe(true);
  });

  it('false когда флаг выключен', () => {
    expect(
      isReviewerBypass({ enabled: false, phones }, OtpChannel.SMS, '+998902793100'),
    ).toBe(false);
  });

  it('false для номера вне allowlist', () => {
    expect(
      isReviewerBypass({ enabled: true, phones }, OtpChannel.SMS, '+998901234567'),
    ).toBe(false);
  });

  it('false для канала EMAIL даже при совпадении строки', () => {
    expect(
      isReviewerBypass({ enabled: true, phones }, OtpChannel.EMAIL, '+998902793100'),
    ).toBe(false);
  });

  it('false при пустом allowlist', () => {
    expect(
      isReviewerBypass({ enabled: true, phones: [] }, OtpChannel.SMS, '+998902793100'),
    ).toBe(false);
  });
});
