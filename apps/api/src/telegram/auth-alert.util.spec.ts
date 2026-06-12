import { OtpChannel } from '@prisma/client';
import {
  formatLoginFailed,
  formatLoginSuccess,
  formatOtpRequest,
} from './auth-alert.util';

describe('auth-alert formatters', () => {
  it('formatOtpRequest includes code when provided', () => {
    const msg = formatOtpRequest({
      destination: '+998901234567',
      channel: OtpChannel.SMS,
      code: '482913',
      ip: '84.54.1.1',
      isNewUser: true,
    });
    expect(msg).toContain('+998901234567');
    expect(msg).toContain('482913');
    expect(msg).toContain('новый');
  });

  it('formatOtpRequest omits code when undefined', () => {
    const msg = formatOtpRequest({
      destination: '+998901234567',
      channel: OtpChannel.SMS,
      ip: null,
      isNewUser: false,
    });
    expect(msg).not.toContain('КОД');
  });

  it('formatLoginSuccess shows provider when given', () => {
    const msg = formatLoginSuccess({
      destination: 'a@b.com',
      ip: '1.1.1.1',
      isNewUser: false,
      roles: ['USER'],
      provider: 'GOOGLE',
    });
    expect(msg).toContain('GOOGLE');
    expect(msg).toContain('USER');
  });

  it('formatLoginFailed shows reason', () => {
    const msg = formatLoginFailed({
      destination: '+998901234567',
      channel: OtpChannel.SMS,
      ip: null,
      reason: 'OTP_INVALID',
    });
    expect(msg).toContain('OTP_INVALID');
  });

  it('escapes HTML in destination', () => {
    const msg = formatLoginFailed({
      destination: '<script>@x',
      channel: OtpChannel.EMAIL,
      ip: null,
      reason: 'OTP_EXPIRED',
    });
    expect(msg).toContain('&lt;script&gt;');
  });
});
