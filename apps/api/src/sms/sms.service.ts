import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SmsService — абстракция отправки SMS (TASK-041, CLAUDE.md §3, ARCHITECTURE §6).
 *
 * Провайдер для MVP — Eskiz.uz (запрещено заменять без подтверждения, CLAUDE.md
 * §13). Контракт намеренно узкий (`sendOtp`), чтобы вызывающий код (OtpService)
 * не зависел от деталей провайдера; реальная интеграция инкапсулирована здесь.
 *
 * Поведение по конфигурации:
 * - креды Eskiz заданы  → реальная отправка через Eskiz REST API;
 * - креды не заданы (dev) → код логируется (NODE_ENV !== production), чтобы можно
 *   было пройти flow request → verify локально без внешнего провайдера.
 *
 * Eskiz-токен (Bearer, живёт ~30 дней) кэшируется в памяти и переполучается при
 * 401. HTTP — через глобальный `fetch` (Node ≥ 20, см. engines в package.json),
 * поэтому дополнительная HTTP-зависимость не нужна.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private cachedToken: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  /** Отправить OTP-код на телефон (E.164). */
  async sendOtp(phone: string, code: string): Promise<void> {
    const message = `Avino: kirish uchun kod ${code}. Hech kimga aytmang.`;
    await this.send(phone, message);
  }

  /** Отправить произвольное SMS. */
  async send(phone: string, message: string): Promise<void> {
    const email = this.configService.get<string>('sms.eskizEmail');
    const password = this.configService.get<string>('sms.eskizPassword');

    if (!email || !password) {
      this.logUndelivered('SMS', phone, message);
      return;
    }

    const token = await this.getToken(email, password);
    const ok = await this.sendViaEskiz(token, phone, message);
    if (!ok) {
      // Токен мог протухнуть — переполучаем и пробуем один раз.
      this.cachedToken = null;
      const fresh = await this.getToken(email, password);
      const retried = await this.sendViaEskiz(fresh, phone, message);
      if (!retried) {
        throw new Error('Eskiz SMS delivery failed');
      }
    }
  }

  private baseUrl(): string {
    return (
      this.configService.get<string>('sms.eskizBaseUrl') ??
      'https://notify.eskiz.uz/api'
    );
  }

  private async getToken(email: string, password: string): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken;
    }
    const body = new URLSearchParams({ email, password });
    const res = await fetch(`${this.baseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      throw new Error(`Eskiz auth failed: ${res.status}`);
    }
    const json = (await res.json()) as { data?: { token?: string } };
    const token = json.data?.token;
    if (!token) {
      throw new Error('Eskiz auth returned no token');
    }
    this.cachedToken = token;
    return token;
  }

  private async sendViaEskiz(
    token: string,
    phone: string,
    message: string,
  ): Promise<boolean> {
    const from = this.configService.get<string>('sms.eskizFrom') ?? '4546';
    // Eskiz ожидает номер без ведущего «+».
    const mobile = phone.replace(/^\+/, '');
    const body = new URLSearchParams({
      mobile_phone: mobile,
      message,
      from,
    });
    const res = await fetch(`${this.baseUrl()}/message/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (res.status === 401) {
      return false;
    }
    if (!res.ok) {
      this.logger.error(`Eskiz send failed: ${res.status}`);
      throw new Error(`Eskiz send failed: ${res.status}`);
    }
    return true;
  }

  /**
   * Dev-фолбэк: провайдер не настроен. Код логируем только вне production, чтобы
   * не утекали секреты в прод-логи (ARCHITECTURE §23 «environment secrets»).
   */
  private logUndelivered(channel: string, to: string, message: string): void {
    const env = this.configService.get<string>('app.env');
    if (env === 'production') {
      this.logger.warn(
        `${channel} provider is not configured; message to ${to} was NOT sent`,
      );
      return;
    }
    this.logger.warn(`[DEV ${channel} → ${to}] ${message}`);
  }
}
