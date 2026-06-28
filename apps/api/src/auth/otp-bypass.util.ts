import { OtpChannel } from '@prisma/client';

/** Параметры обхода OTP для номеров-ревьюверов (из otp.* конфига). */
export interface OtpBypassConfig {
  /** Глобальный флаг (OTP_BYPASS_ENABLED). */
  enabled: boolean;
  /** Нормализованные E.164 номера-ревьюверы (OTP_BYPASS_PHONES). */
  phones: string[];
}

/**
 * Применять ли обход OTP к данному контакту: флаг включён, канал SMS и
 * (уже нормализованный) номер входит в allowlist. `destination` ДОЛЖЕН быть
 * результатом normalizeContact — сравнение строгое по строке.
 */
export function isReviewerBypass(
  cfg: OtpBypassConfig,
  channel: OtpChannel,
  destination: string,
): boolean {
  return (
    cfg.enabled && channel === OtpChannel.SMS && cfg.phones.includes(destination)
  );
}
