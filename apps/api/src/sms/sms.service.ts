import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import { SMS_ENABLED_KEY, resolveSmsEnabled } from './sms.constants';

/** Ответ Eskiz `POST /auth/login`. */
interface EskizAuthResponse {
  data?: { token?: string };
}

/**
 * Ответ Eskiz `POST /message/sms/send`. Успех: `{ id, status: "waiting", … }`.
 * Ошибка: HTTP не-2xx с причиной в `message` (например, текст не совпал с
 * одобренным шаблоном — модерация).
 */
interface EskizSendResponse {
  id?: string;
  status?: string;
  message?: string;
}

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
  private tokenAcquiredAt = 0;

  /**
   * Запас до истечения токена Eskiz (живёт ~30 дней). Перелогиниваемся
   * проактивно чуть раньше, чтобы не ловить 401 на боевой отправке. Реактивный
   * фолбэк на 401 всё равно остаётся: токен может быть отозван и раньше срока
   * (смена пароля, ручной сброс на стороне Eskiz).
   */
  private static readonly TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Master-switch SMS (runtime): строка в app_settings главнее env-дефолта
   * `sms.enabled`. Зеркалит TelegramService.isEnabled. Это источник истины для
   * вызывающего кода (OtpService падает 503 на выключенном SMS-канале); сам
   * `send` остаётся механическим. БД недоступна → не роняем, env-дефолт.
   */
  async isEnabled(): Promise<boolean> {
    const envDefault = this.configService.get<boolean>('sms.enabled') ?? true;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: SMS_ENABLED_KEY },
      });
      return resolveSmsEnabled(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  /** Отправить OTP-код на телефон (E.164). */
  async sendOtp(phone: string, code: string): Promise<void> {
    const message = `Avino platformasiga kirish uchun tasdiqlash kodi: ${code}. Kodni hech kimga bermang.`;
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
    // Проактивная проверка перед отправкой: используем кэш, только пока токен
    // не вышел за TTL-запас; иначе перелогиниваемся заранее (без 401).
    if (
      this.cachedToken !== null &&
      Date.now() - this.tokenAcquiredAt < SmsService.TOKEN_TTL_MS
    ) {
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
    const json = (await res.json()) as EskizAuthResponse;
    const token = json.data?.token;
    if (!token) {
      throw new Error('Eskiz auth returned no token');
    }
    this.cachedToken = token;
    this.tokenAcquiredAt = Date.now();
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

    // 401 → токен протух: вызывающий релогинится и повторит один раз.
    if (res.status === 401) {
      return false;
    }

    const payload = (await res
      .json()
      .catch(() => null)) as EskizSendResponse | null;

    if (!res.ok) {
      // Eskiz возвращает причину отказа в поле `message`. Самая частая в
      // production — текст не совпал с одобренным шаблоном (модерация):
      // причина видна и в логе, и в тексте исключения. Подробности и чек-лист
      // модерации — docs/GUIDE_SMS.md.
      const reason = payload?.message ?? res.statusText;
      this.logger.error(`Eskiz send failed: ${res.status} — ${reason}`);
      throw new Error(`Eskiz send failed: ${res.status} — ${reason}`);
    }

    // Успех: Eskiz принял сообщение в очередь (status обычно "waiting").
    // Логируем id для трассировки доставки — без текста и без полного номера.
    this.logger.log(
      `Eskiz SMS accepted: id=${payload?.id ?? 'n/a'} ` +
        `status=${payload?.status ?? 'n/a'} to=${this.maskPhone(mobile)}`,
    );
    return true;
  }

  /** Маска номера для логов: `998901234567` → `998****4567`. */
  private maskPhone(mobile: string): string {
    if (mobile.length <= 7) {
      return '***';
    }
    return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
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
