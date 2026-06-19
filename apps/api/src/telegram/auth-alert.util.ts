import { OtpChannel } from '@prisma/client';

/** Минимальное HTML-экранирование для parse_mode=HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface OtpRequestAlert {
  destination: string;
  channel: OtpChannel;
  code?: string;
  ip?: string | null;
  isNewUser: boolean;
}

/** Алерт «запрошен OTP» (опционально с самим кодом — флаг TELEGRAM_INCLUDE_OTP_CODE). */
export function formatOtpRequest(a: OtpRequestAlert): string {
  const lines = [
    '🔔 <b>Avino: запрос OTP</b>',
    `Контакт: ${esc(a.destination)} (${a.channel})`,
  ];
  if (a.code) lines.push(`КОД: <code>${esc(a.code)}</code>`);
  lines.push(`IP: ${esc(a.ip ?? '—')}`);
  lines.push(`Статус: ${a.isNewUser ? 'новый пользователь' : 'существующий'}`);
  return lines.join('\n');
}

export interface LoginSuccessAlert {
  destination: string | null;
  channel?: OtpChannel;
  ip?: string | null;
  isNewUser: boolean;
  roles?: string[];
  provider?: 'GOOGLE' | 'APPLE';
}

/** Алерт «вход выполнен» (OTP или Google). */
export function formatLoginSuccess(a: LoginSuccessAlert): string {
  const via = a.provider ?? a.channel ?? '—';
  const lines = [
    '✅ <b>Avino: вход выполнен</b>',
    `Контакт: ${esc(a.destination ?? '—')} (${via})`,
    `IP: ${esc(a.ip ?? '—')}`,
    `Статус: ${
      a.isNewUser ? 'зарегистрирован новый пользователь' : 'существующий'
    }`,
  ];
  if (a.roles && a.roles.length > 0) {
    lines.push(`Роли: ${esc(a.roles.join(', '))}`);
  }
  return lines.join('\n');
}

export interface LoginFailedAlert {
  destination: string;
  channel: OtpChannel;
  ip?: string | null;
  reason: string;
}

/** Алерт «неудачный вход» (код ошибки OTP). */
export function formatLoginFailed(a: LoginFailedAlert): string {
  return [
    '⚠️ <b>Avino: неудачный вход</b>',
    `Контакт: ${esc(a.destination)} (${a.channel})`,
    `IP: ${esc(a.ip ?? '—')}`,
    `Причина: ${esc(a.reason)}`,
  ].join('\n');
}
