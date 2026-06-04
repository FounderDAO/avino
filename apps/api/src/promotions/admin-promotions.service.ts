import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ListingStatus,
  PaymentStatus,
  Prisma,
  PromotionAdminAction,
  PromotionStatus,
  PromotionType,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { ActivatePromotionDto } from './dto/activate-promotion.dto';
import { findPlan } from './promotions.catalog';

/** Миллисекунд в сутках — для расчёта `expires_at = starts_at + period_days`. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Маппинг тарифа на действие аудита промо (DB_SCHEMA §8). Только TOP/VIP —
 * `NORMAL` отсекается DTO ещё до сервиса.
 */
const ACTIVATE_ACTION: Record<'TOP' | 'VIP', PromotionAdminAction> = {
  TOP: PromotionAdminAction.ACTIVATE_TOP,
  VIP: PromotionAdminAction.ACTIVATE_VIP,
};

/**
 * Одна строка `listing_promotions` в ответе (API.md §15). snake_case; даты —
 * ISO-строки. Используется и в `POST` (201), и в истории `GET`.
 */
export interface PromotionResponse {
  id: string;
  listing_id: string;
  type: PromotionType;
  status: PromotionStatus;
  period_days: number;
  starts_at: string | null;
  expires_at: string | null;
  payment_status: PaymentStatus;
}

const PROMOTION_SELECT = {
  id: true,
  listingId: true,
  type: true,
  status: true,
  periodDays: true,
  startsAt: true,
  expiresAt: true,
  paymentStatus: true,
} as const;

type PromotionRow = Prisma.ListingPromotionGetPayload<{
  select: typeof PROMOTION_SELECT;
}>;

/**
 * AdminPromotionsService — ручная активация и история промо VIP/TOP
 * (TASK-121, API.md §15, ADR-0004/ADR-0033).
 *
 * `listing_promotions` — source of truth (ledger); `listings.promotion_*` — лишь
 * read-cache, обновляемый здесь в той же транзакции. Online-оплаты в MVP нет:
 * активация ручная, `payment_status = NOT_REQUIRED`, цена берётся из статического
 * каталога {@link PROMOTION_PLANS}. Доступ — только ADMIN (RolesGuard в
 * контроллере).
 */
@Injectable()
export class AdminPromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `POST /api/v1/admin/listings/:id/promotions` — активировать VIP/TOP вручную.
   *
   * Идемпотентность: если передан `Idempotency-Key`, он сохраняется в
   * `payment_reference` (PARTIAL UNIQUE WHERE NOT NULL). Повтор с тем же ключом
   * возвращает уже созданную промо, не создавая новую (ни до, ни в гонке через
   * P2002-replay).
   *
   * Атомарно (одна транзакция): закрывает предыдущую `ACTIVE`-промо
   * (`→ CANCELLED`, partial-unique «одна ACTIVE на листинг» сохраняется),
   * создаёт новую `ACTIVE`, обновляет read-cache на `listings` и пишет
   * `promotion_logs` (дельта old→new) + `audit_logs(LISTING_PROMOTION_CHANGE)`.
   */
  async activate(
    adminId: string,
    listingId: string,
    dto: ActivatePromotionDto,
    idempotencyKey?: string,
  ): Promise<PromotionResponse> {
    // Период валидируется по каталогу: нет плана → 422 INVALID_PERIOD (а не 400).
    const plan = findPlan(dto.type, dto.period_days);
    if (!plan) {
      throw new HttpException(
        {
          code: ApiErrorCode.INVALID_PERIOD,
          message: `Unsupported promotion period: ${dto.period_days}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Идемпотентный replay: тот же ключ → отдать уже созданную промо.
    if (idempotencyKey) {
      const existing = await this.findByReference(idempotencyKey);
      if (existing) return this.toResponse(existing);
    }

    // DELETED исключён из read-path — для всех 404, как в ListingsService.
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }

    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + dto.period_days * MS_PER_DAY);

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Текущая ACTIVE-промо (если есть) — для дельты лога и supersede.
        const current = await tx.listingPromotion.findFirst({
          where: { listingId, status: PromotionStatus.ACTIVE },
          select: { id: true, type: true, expiresAt: true },
        });

        // Закрываем предыдущую активную, чтобы остаться в рамках partial-unique
        // (одна ACTIVE на листинг) — её перезаписывает новая активация.
        if (current) {
          await tx.listingPromotion.update({
            where: { id: current.id },
            data: { status: PromotionStatus.CANCELLED },
          });
        }

        const promotion = await tx.listingPromotion.create({
          data: {
            listingId,
            userId: adminId,
            type: dto.type,
            status: PromotionStatus.ACTIVE,
            periodDays: dto.period_days,
            startsAt,
            expiresAt,
            price: new Prisma.Decimal(plan.price),
            currency: plan.currency,
            paymentStatus: PaymentStatus.NOT_REQUIRED,
            paymentReference: idempotencyKey ?? null,
          },
          select: PROMOTION_SELECT,
        });

        // Read-cache на listings (источник истины — ledger выше, ADR-006).
        await tx.listing.update({
          where: { id: listingId },
          data: {
            promotionType: dto.type,
            promotionStartedAt: startsAt,
            promotionExpiresAt: expiresAt,
          },
        });

        await tx.promotionLog.create({
          data: {
            listingPromotionId: promotion.id,
            listingId,
            adminId,
            action: ACTIVATE_ACTION[dto.type as 'TOP' | 'VIP'],
            oldType: current?.type ?? null,
            newType: dto.type,
            oldExpiresAt: current?.expiresAt ?? null,
            newExpiresAt: expiresAt,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: adminId,
            action: 'LISTING_PROMOTION_CHANGE',
            entityType: 'listing',
            entityId: listingId,
            metadata: {
              promotion_id: promotion.id,
              type: dto.type,
              period_days: dto.period_days,
              superseded_promotion_id: current?.id ?? null,
            },
          },
        });

        return promotion;
      });

      return this.toResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Гонка: тот же Idempotency-Key долетел дважды — отдать первый результат.
        if (idempotencyKey) {
          const existing = await this.findByReference(idempotencyKey);
          if (existing) return this.toResponse(existing);
        }
        // Иначе — конкурентная активация заняла «одну ACTIVE на листинг».
        throw new ConflictException({
          code: ApiErrorCode.ACTIVE_PROMOTION_EXISTS,
          message: 'An active promotion already exists for this listing',
        });
      }
      throw error;
    }
  }

  /**
   * `GET /api/v1/admin/listings/:id/promotions` — история промо листинга
   * (ledger). Отсутствующий/DELETED листинг → `404`. Сортировка — `created_at
   * DESC` (свежие активации сверху).
   */
  async listHistory(listingId: string): Promise<PromotionResponse[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }

    const rows = await this.prisma.listingPromotion.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
      select: PROMOTION_SELECT,
    });
    return rows.map((row) => this.toResponse(row));
  }

  /** Найти промо по `payment_reference` (ключ идемпотентности). */
  private findByReference(reference: string): Promise<PromotionRow | null> {
    return this.prisma.listingPromotion.findFirst({
      where: { paymentReference: reference },
      select: PROMOTION_SELECT,
    });
  }

  /** Преобразовать строку ledger'а в snake_case ответ (API.md §15). */
  private toResponse(row: PromotionRow): PromotionResponse {
    return {
      id: row.id,
      listing_id: row.listingId,
      type: row.type,
      status: row.status,
      period_days: row.periodDays,
      starts_at: row.startsAt?.toISOString() ?? null,
      expires_at: row.expiresAt?.toISOString() ?? null,
      payment_status: row.paymentStatus,
    };
  }
}
