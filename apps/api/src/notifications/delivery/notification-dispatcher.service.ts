import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Language,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { EmailService } from '../../email/email.service';
import { SmsService } from '../../sms/sms.service';
import { PrismaService } from '../../prisma';
import {
  NOTIFICATION_EMAIL_ENABLED_KEY,
  NOTIFICATION_PUSH_ENABLED_KEY,
  resolveNotificationChannelEnabled,
} from '../notification.constants';
import { FcmService } from './fcm.service';
import { NotificationRendererService } from './notification-renderer.service';
import {
  EMAIL_THROTTLED_TYPES,
  channelsFor,
} from './notification-routing';
import { smsBroadcastNudge } from './notification-templates';

/** Тип доставки с вложенными notification → user, используемый в deliver(). */
type DeliveryWithContext = {
  id: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  attempts: number;
  notification: {
    id: string;
    type: string;
    dataJson: Prisma.JsonValue;
    title: string | null;
    body: string | null;
    user: {
      id: string;
      email: string | null;
      phone: string | null;
      defaultLanguage: Language;
      profile: { preferredLanguage: Language | null } | null;
    };
  };
};

/** Максимальное число попыток до прекращения ретраев. */
const MAX_ATTEMPTS = 3;

/**
 * NotificationDispatcherService — бизнес-логика диспетчера уведомлений
 * (ADR-0102, §3.5). Вызывается из {@link NotificationDispatchWorker} по расписанию.
 *
 * Два этапа за прогон:
 *  1. **Fan-out**: находит свежие Notification, для каждого создаёт PENDING
 *     NotificationDelivery по каналам из routing-политики (если ещё нет).
 *     Тротлинг NEW_CHAT_MESSAGE: не создаёт EMAIL-доставку, если за
 *     emailChatThrottleMin минут уже была такая для данного получателя/thread.
 *  2. **Deliver**: обрабатывает PENDING/FAILED(attempts<3) доставки:
 *     EMAIL → NotificationRenderer → EmailService.sendEmail;
 *     PUSH → FcmService.send; мёртвые токены деактивируются.
 *
 * Best-effort: падение одной доставки не прерывает прогон.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly renderer: NotificationRendererService,
    private readonly fcm: FcmService,
    private readonly emailService: EmailService,
    private readonly sms: SmsService,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────

  /** Один прогон диспетчера: fan-out + deliver. */
  async run(): Promise<void> {
    await this.fanOut();
    await this.deliver();
  }

  // ─── isEnabled helpers (mirror SmsService.isEnabled) ─────────────────────

  async isEmailEnabled(): Promise<boolean> {
    const envDefault =
      this.config.get<boolean>('notifications.emailEnabled') ?? true;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: NOTIFICATION_EMAIL_ENABLED_KEY },
      });
      return resolveNotificationChannelEnabled(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  async isPushEnabled(): Promise<boolean> {
    const envDefault =
      this.config.get<boolean>('notifications.pushEnabled') ?? true;
    try {
      const row = await this.prisma.appSetting.findUnique({
        where: { key: NOTIFICATION_PUSH_ENABLED_KEY },
      });
      return resolveNotificationChannelEnabled(row?.value, envDefault);
    } catch {
      return envDefault;
    }
  }

  // ─── Fan-out ──────────────────────────────────────────────────────────────

  /**
   * Создаём PENDING NotificationDelivery для каналов, которых ещё нет.
   * Ретроспектива: уведомления за последние lookbackMin минут.
   */
  private async fanOut(): Promise<void> {
    const lookbackMin =
      this.config.get<number>('notifications.dispatchLookbackMin') ?? 60;
    const throttleMin =
      this.config.get<number>('notifications.emailChatThrottleMin') ?? 30;

    const since = new Date(Date.now() - lookbackMin * 60 * 1000);

    // Загружаем свежие доменные уведомления (broadcastId=null).
    // Broadcast-уведомления (ADMIN_BROADCAST) имеют broadcastId != null —
    // их доставки создаёт BroadcastDispatcher, а не этот fan-out (иначе дубли).
    const notifications = await this.prisma.notification.findMany({
      where: { createdAt: { gte: since }, broadcastId: null },
      include: {
        deliveries: { select: { channel: true } },
      },
    });

    for (const notif of notifications) {
      const channels = channelsFor(notif.type as NotificationType);
      if (channels.length === 0) continue;

      const existingChannels = new Set(notif.deliveries.map((d) => d.channel));

      for (const channel of channels) {
        if (existingChannels.has(channel)) continue;

        // Тротлинг чат-email.
        if (
          channel === NotificationChannel.EMAIL &&
          EMAIL_THROTTLED_TYPES.has(notif.type as NotificationType)
        ) {
          const shouldThrottle = await this.isEmailThrottled(
            notif.userId,
            notif.dataJson,
            throttleMin,
          );
          if (shouldThrottle) continue;
        }

        // Создаём PENDING-доставку; unique-constraint гарантирует идемпотентность.
        try {
          await this.prisma.notificationDelivery.create({
            data: {
              notificationId: notif.id,
              channel,
              status: NotificationStatus.PENDING,
            },
          });
        } catch (err) {
          // Unique-constraint race или другая ошибка — пропускаем, идемпотентно.
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.debug(
            `fanOut skip notif=${notif.id} channel=${channel}: ${msg}`,
          );
        }
      }
    }
  }

  /**
   * Проверяем, не было ли EMAIL-доставки по тому же thread_id для этого
   * пользователя в течение throttleMin минут.
   */
  private async isEmailThrottled(
    userId: string,
    dataJson: Prisma.JsonValue,
    throttleMin: number,
  ): Promise<boolean> {
    const data = this.dataJsonAsRecord(dataJson);
    const threadId = this.strVal(data['thread_id']);
    if (!threadId) return false;

    const since = new Date(Date.now() - throttleMin * 60 * 1000);

    // Ищем EMAIL-доставки по уведомлениям того же пользователя
    // с тем же thread_id, созданные в окне throttle.
    const existing = await this.prisma.notificationDelivery.findFirst({
      where: {
        channel: NotificationChannel.EMAIL,
        createdAt: { gte: since },
        notification: {
          userId,
          // dataJson содержит thread_id — фильтруем через path query.
          dataJson: {
            path: ['thread_id'],
            equals: threadId,
          },
        },
      },
    });

    return existing !== null;
  }

  // ─── Deliver ──────────────────────────────────────────────────────────────

  /** Обрабатываем PENDING/FAILED(attempts<MAX) доставки. */
  private async deliver(): Promise<void> {
    const batchSize =
      this.config.get<number>('notifications.dispatchBatch') ?? 200;

    const deliveries = (await this.prisma.notificationDelivery.findMany({
      where: {
        OR: [
          { status: NotificationStatus.PENDING },
          {
            status: NotificationStatus.FAILED,
            attempts: { lt: MAX_ATTEMPTS },
          },
        ],
      },
      take: batchSize,
      include: {
        notification: {
          select: {
            id: true,
            type: true,
            dataJson: true,
            title: true,
            body: true,
            user: {
              select: {
                id: true,
                email: true,
                phone: true,
                defaultLanguage: true,
                profile: { select: { preferredLanguage: true } },
              },
            },
          },
        },
      },
    })) as unknown as DeliveryWithContext[];

    const [emailEnabled, pushEnabled, smsEnabled] = await Promise.all([
      this.isEmailEnabled(),
      this.isPushEnabled(),
      this.sms.isEnabled(),
    ]);

    for (const delivery of deliveries) {
      try {
        await this.processDelivery(delivery, emailEnabled, pushEnabled, smsEnabled);
      } catch (err) {
        // Не должны сюда попасть (processDelivery всё ловит сама), но на всякий.
        this.logger.error(
          `Unexpected error processing delivery ${delivery.id}: ${String(err)}`,
        );
      }
    }
  }

  /**
   * Обработать одну доставку. Любые исключения пишем в FAILED + attempts++.
   */
  private async processDelivery(
    delivery: DeliveryWithContext,
    emailEnabled: boolean,
    pushEnabled: boolean,
    smsEnabled: boolean,
  ): Promise<void> {
    const { id: deliveryId, channel, notification } = delivery;
    const { user, id: notifId, type, dataJson, title, body } = notification;
    const lang: Language =
      user.profile?.preferredLanguage ?? user.defaultLanguage ?? Language.RU;

    // Если глобальный тоггл выключен — оставляем PENDING (доедет при включении).
    if (channel === NotificationChannel.EMAIL && !emailEnabled) return;
    if (channel === NotificationChannel.PUSH && !pushEnabled) return;
    if (channel === NotificationChannel.SMS && !smsEnabled) return;

    const notifContext = {
      id: notifId,
      type: type as NotificationType,
      dataJson,
      title,
      body,
    };

    if (channel === NotificationChannel.EMAIL) {
      await this.deliverEmail(deliveryId, notifContext, user, lang);
    } else if (channel === NotificationChannel.PUSH) {
      await this.deliverPush(deliveryId, notifContext, user, lang);
    } else if (channel === NotificationChannel.SMS) {
      await this.deliverSms(deliveryId, user, lang);
    }
  }

  private async deliverEmail(
    deliveryId: string,
    notifContext: { id: string; type: NotificationType; dataJson: Prisma.JsonValue; title?: string | null; body?: string | null },
    user: { id: string; email: string | null },
    lang: Language,
  ): Promise<void> {
    try {
      const rendered = await this.renderer.renderEmail(notifContext, lang);

      if (!rendered || !user.email) {
        const reason = !rendered
          ? 'no email template for type'
          : 'recipient has no email';
        await this.markFailed(deliveryId, reason);
        return;
      }

      await this.emailService.sendEmail({
        to: user.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      await this.markSent(deliveryId);
    } catch (err) {
      await this.markFailed(
        deliveryId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async deliverPush(
    deliveryId: string,
    notifContext: { id: string; type: NotificationType; dataJson: Prisma.JsonValue; title?: string | null; body?: string | null },
    user: { id: string },
    lang: Language,
  ): Promise<void> {
    try {
      // Загрузить активные токены устройств получателя.
      const devices = await this.prisma.notificationDevice.findMany({
        where: { userId: user.id, isActive: true },
        select: { pushToken: true },
      });

      const tokens = devices.map((d) => d.pushToken);

      if (tokens.length === 0) {
        await this.markFailed(deliveryId, 'no active devices');
        return;
      }

      const rendered = await this.renderer.renderPush(notifContext, lang);

      if (!rendered) {
        await this.markFailed(deliveryId, 'no push template for type');
        return;
      }

      const result = await this.fcm.send(tokens, rendered);

      // Деактивируем невалидные токены.
      if (result.invalidTokens.length > 0) {
        await this.prisma.notificationDevice.updateMany({
          where: { pushToken: { in: result.invalidTokens } },
          data: { isActive: false },
        });
      }

      if (result.successCount > 0) {
        await this.markSent(deliveryId);
      } else {
        await this.markFailed(deliveryId, 'FCM returned 0 successes');
      }
    } catch (err) {
      await this.markFailed(
        deliveryId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private async deliverSms(
    deliveryId: string,
    user: { phone: string | null },
    lang: Language,
  ): Promise<void> {
    try {
      if (!user.phone) {
        await this.markFailed(deliveryId, 'recipient has no phone');
        return;
      }
      await this.sms.send(user.phone, smsBroadcastNudge(lang));
      await this.markSent(deliveryId);
    } catch (err) {
      await this.markFailed(
        deliveryId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // ─── Status helpers ───────────────────────────────────────────────────────

  private async markSent(deliveryId: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
  }

  private async markFailed(deliveryId: string, reason: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: NotificationStatus.FAILED,
        lastError: reason,
        attempts: { increment: 1 },
      },
    });
  }

  // ─── Util ─────────────────────────────────────────────────────────────────

  private dataJsonAsRecord(raw: Prisma.JsonValue): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  private strVal(v: unknown): string | undefined {
    if (v === null || v === undefined) return undefined;
    return String(v);
  }
}
