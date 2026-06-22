import { Injectable, Logger } from '@nestjs/common';
import {
  BroadcastStatus,
  NotificationChannel,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma';
import { BroadcastAudienceService } from './broadcast-audience.service';
import { MATERIALIZE_BATCH_SIZE, SWEEP_LIMIT } from './broadcasts.constants';

/** Внешние каналы, для которых создаётся строка доставки (IN_APP = сама notification). */
const EXTERNAL_CHANNELS: NotificationChannel[] = [
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH,
  NotificationChannel.SMS,
];

/**
 * BroadcastDispatcherService (ADR-0103) — зеркалит NotificationDispatcher:
 *  run(): забрать SCHEDULED-рассылки, у которых scheduled_at <= now, и материализовать.
 *  materialize(): резолв аудитории батчами → Notification(type=ADMIN_BROADCAST,
 *    broadcastId, title/body вшиты) + NotificationDelivery по выбранным внешним
 *    каналам, куда получатель достижим. Дальше их доставляет существующий
 *    NotificationDispatcher.deliver(). Идемпотентна: переход SCHEDULED→SENDING
 *    через updateMany-гард; повторный прогон по SENT — no-op.
 */
@Injectable()
export class BroadcastDispatcherService {
  private readonly logger = new Logger(BroadcastDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: BroadcastAudienceService,
  ) {}

  async run(): Promise<void> {
    const due = await this.prisma.broadcast.findMany({
      where: { status: BroadcastStatus.SCHEDULED, scheduledAt: { lte: new Date() } },
      orderBy: { scheduledAt: 'asc' },
      take: SWEEP_LIMIT,
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        await this.materialize(id);
      } catch (err) {
        // materialize() уже поставил FAILED; здесь только логируем.
        this.logger.error(`Broadcast ${id} materialize failed: ${String(err)}`);
      }
    }
  }

  /** Материализовать рассылку. Возвращает число получателей (recipientCount). */
  async materialize(broadcastId: string): Promise<number> {
    // Гард-переход: только если ещё SCHEDULED. Иначе кто-то уже взял — выходим.
    const claimed = await this.prisma.broadcast.updateMany({
      where: { id: broadcastId, status: BroadcastStatus.SCHEDULED },
      data: { status: BroadcastStatus.SENDING },
    });
    if (claimed.count === 0) return 0;
    try {
      return await this.fanOutRecipients(broadcastId);
    } catch (err) {
      await this.prisma.broadcast.update({
        where: { id: broadcastId },
        data: { status: BroadcastStatus.FAILED },
      });
      throw err;
    }
  }

  /** Основная логика материализации: резолв аудитории батчами + создание Notification/Delivery. */
  private async fanOutRecipients(broadcastId: string): Promise<number> {
    const b = await this.prisma.broadcast.findUnique({ where: { id: broadcastId } });
    if (!b) return 0;

    const where = this.audience.buildUserWhere({
      audienceType: b.audienceType,
      targetUserId: b.targetUserId,
      language: b.language,
      filterStatus: b.filterStatus,
      filterRole: b.filterRole,
    });
    const externalSelected = b.channels.filter((c) =>
      EXTERNAL_CHANNELS.includes(c),
    );

    let total = 0;
    let cursorId: string | undefined;

    // Keyset-батчи по users.id.
    for (;;) {
      const users = await this.prisma.user.findMany({
        where,
        select: { id: true, email: true, phone: true },
        orderBy: { id: 'asc' },
        take: MATERIALIZE_BATCH_SIZE,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      });
      if (users.length === 0) break;
      cursorId = users[users.length - 1].id;

      // 1) Notification на каждого получателя (= in-app колокольчик).
      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          type: NotificationType.ADMIN_BROADCAST,
          channel: NotificationChannel.IN_APP,
          broadcastId,
          title: b.title,
          body: b.body,
          dataJson: { broadcast_id: broadcastId } as Prisma.InputJsonValue,
        })),
      });
      total += users.length;

      // 2) Подтянуть id созданных notification (по broadcastId + userId батча).
      const batchIds = users.map((u) => u.id);
      const notifs = await this.prisma.notification.findMany({
        where: { broadcastId, userId: { in: batchIds } },
        select: { id: true, userId: true },
      });

      // 3) Достижимость push: userId с активными устройствами в батче.
      const deviceUserIds = externalSelected.includes(NotificationChannel.PUSH)
        ? new Set(
            (
              await this.prisma.notificationDevice.findMany({
                where: { isActive: true, userId: { in: batchIds } },
                select: { userId: true },
                distinct: ['userId'],
              })
            ).map((d) => d.userId),
          )
        : new Set<string>();

      // 4) Доставки по достижимым каналам.
      const byUser = new Map(users.map((u) => [u.id, u]));
      const deliveryRows: Prisma.NotificationDeliveryCreateManyInput[] = [];
      for (const n of notifs) {
        const u = byUser.get(n.userId);
        if (!u) continue;
        for (const ch of externalSelected) {
          const reachable =
            (ch === NotificationChannel.EMAIL && u.email != null) ||
            (ch === NotificationChannel.SMS && u.phone != null) ||
            (ch === NotificationChannel.PUSH && deviceUserIds.has(u.id));
          if (reachable) {
            deliveryRows.push({
              notificationId: n.id,
              channel: ch,
              status: 'PENDING',
            });
          }
        }
      }
      if (deliveryRows.length > 0) {
        await this.prisma.notificationDelivery.createMany({ data: deliveryRows });
      }

      if (users.length < MATERIALIZE_BATCH_SIZE) break;
    }

    await this.prisma.broadcast.update({
      where: { id: broadcastId },
      data: {
        status: BroadcastStatus.SENT,
        recipientCount: total,
        sentAt: new Date(),
      },
    });
    return total;
  }
}
