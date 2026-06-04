import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromotionStatus, PromotionType } from '@prisma/client';
import { NotificationsService } from '../notifications';
import { PrismaService } from '../prisma';

/** Размер батча sweep'а по умолчанию (если конфиг не задан). */
const DEFAULT_BATCH_SIZE = 100;

/** Одна просроченная ACTIVE-промо, выбранная для истечения. */
interface DuePromotion {
  id: string;
  listingId: string;
  type: PromotionType;
  expiresAt: Date | null;
  listing: { ownerId: string };
}

/**
 * PromotionExpiryService — бизнес-логика истечения промо VIP/TOP (TASK-123).
 *
 * Запускается периодической джобой `expire_listing_promotions`
 * ({@link PromotionWorker} → `promotion_queue`). Находит все `ACTIVE`-промо с
 * `expires_at <= now()` и по каждой атомарно (одна транзакция):
 *
 *  1. `status → EXPIRED` (условно `WHERE status = ACTIVE` — идемпотентно и
 *     безопасно к гонке с админ-действиями: если статус уже сменился, строка
 *     пропускается);
 *  2. сброс read-cache на `listings` в `NORMAL` — но только `WHERE
 *     promotion_expires_at <= now()`, чтобы НЕ затереть свежую ре-активацию,
 *     успевшую обновить кэш в зазоре между выборкой и транзакцией;
 *  3. постановка PENDING-уведомления владельцу ({@link NotificationsService});
 *  4. системная запись в `audit_logs` (`actor_id = null`).
 *
 * `promotion_logs` здесь НЕ пишется: этот журнал — аудит *админских* действий
 * (его enum не содержит EXPIRE), а истечение инициирует система. Поиск и так
 * трактует истёкшую промо как `NORMAL` через time-guard в SQL (ADR-0004 §4):
 * корректность выдачи не зависит от того, отработала ли уже джоба.
 */
@Injectable()
export class PromotionExpiryService {
  private readonly logger = new Logger(PromotionExpiryService.name);
  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    configService: ConfigService,
  ) {
    this.batchSize =
      configService.get<number>('promotion.expiryBatchSize') ??
      DEFAULT_BATCH_SIZE;
  }

  /**
   * Прогнать один sweep: истечь все просроченные `ACTIVE`-промо (до `batchSize`
   * за запуск). Возвращает число фактически истёкших строк. Ошибка по одной
   * промо логируется и не валит весь прогон — остальные обрабатываются.
   */
  async run(): Promise<number> {
    const now = new Date();
    const due = (await this.prisma.listingPromotion.findMany({
      where: { status: PromotionStatus.ACTIVE, expiresAt: { lte: now } },
      select: {
        id: true,
        listingId: true,
        type: true,
        expiresAt: true,
        listing: { select: { ownerId: true } },
      },
      orderBy: { expiresAt: 'asc' },
      take: this.batchSize,
    })) as DuePromotion[];

    let expired = 0;
    for (const promo of due) {
      try {
        if (await this.expireOne(promo, now)) {
          expired += 1;
        }
      } catch (error) {
        this.logger.error(
          `Failed to expire promotion ${promo.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (expired > 0) {
      this.logger.log(`Expired ${expired} promotion(s)`);
    }
    return expired;
  }

  /**
   * Истечь одну промо атомарно. Возвращает `false`, если строку уже перехватило
   * конкурентное действие (флип `ACTIVE → EXPIRED` не затронул ни одной строки)
   * — тогда уведомление и аудит не пишутся.
   */
  private expireOne(promo: DuePromotion, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const flip = await tx.listingPromotion.updateMany({
        where: { id: promo.id, status: PromotionStatus.ACTIVE },
        data: { status: PromotionStatus.EXPIRED },
      });
      if (flip.count === 0) {
        return false;
      }

      // Сброс read-cache → NORMAL, но НЕ затирая более свежую ре-активацию
      // (её promotion_expires_at в будущем → не попадёт под `lte: now`).
      await tx.listing.updateMany({
        where: { id: promo.listingId, promotionExpiresAt: { lte: now } },
        data: {
          promotionType: PromotionType.NORMAL,
          promotionStartedAt: null,
          promotionExpiresAt: null,
        },
      });

      await this.notifications.queuePromotionExpired(tx, promo.listing.ownerId, {
        listingId: promo.listingId,
        promotionId: promo.id,
        promotionType: promo.type,
        expiredAt: (promo.expiresAt ?? now).toISOString(),
      });

      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'LISTING_PROMOTION_EXPIRE',
          entityType: 'listing',
          entityId: promo.listingId,
          metadata: {
            promotion_id: promo.id,
            type: promo.type,
            expired_at: (promo.expiresAt ?? now).toISOString(),
          },
        },
      });

      return true;
    });
  }
}
