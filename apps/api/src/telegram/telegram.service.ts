import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {
  TELEGRAM_NOTIFICATIONS_ENABLED_KEY,
  resolveNotificationsEnabled,
} from './telegram.constants';

/**
 * TelegramService — отправка admin-алертов через Bot API (config-gated).
 *
 * Зеркалит паттерн SmsService: нет кредов → dev-лог/no-op. Доставка
 * best-effort: метод НИКОГДА не бросает, чтобы сбой Telegram не ломал логин.
 * Включённость двухслойна: app_settings-строка (runtime, через admin-эндпоинт)
 * главнее env-дефолта (dev=true / prod=false).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Включены ли алерты сейчас: DB-override > env-дефолт. */
  async isEnabled(): Promise<boolean> {
    const envDefault =
      this.config.get<boolean>('telegram.notificationStateDefault') ?? false;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: TELEGRAM_NOTIFICATIONS_ENABLED_KEY },
      });
      return resolveNotificationsEnabled(row?.value, envDefault);
    } catch {
      // БД недоступна — не роняем поток, падаем на env-дефолт.
      return envDefault;
    }
  }

  /** Отправить алерт админу. Best-effort, никогда не бросает. */
  async sendAdminAlert(text: string): Promise<void> {
    try {
      if (!(await this.isEnabled())) return;

      const token = this.config.get<string>('telegram.botToken');
      const chatId = this.config.get<string>('telegram.adminChatId');
      if (!token || !chatId) {
        this.logUndelivered(text);
        return;
      }

      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        },
      );
      if (!res.ok) {
        this.logger.error(`Telegram sendMessage failed: ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `Telegram alert error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Dev-фолбэк: провайдер не настроен. Вне production логируем текст, чтобы
   * можно было проверить алерты локально; в production — только warn.
   */
  private logUndelivered(text: string): void {
    if (this.config.get<string>('app.env') === 'production') {
      this.logger.warn('Telegram is not configured; admin alert NOT sent');
      return;
    }
    this.logger.warn(`[DEV Telegram → admin]\n${text}`);
  }
}
