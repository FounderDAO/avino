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
import { CancelPromotionDto } from './dto/cancel-promotion.dto';
import { ExtendPromotionDto } from './dto/extend-promotion.dto';
import { PromotionPlansService } from './promotion-plans.service';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PromotionPlansService,
  ) {}

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
    const plan = await this.plans.findPlan(dto.type, dto.period_days);
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
   * `PATCH /api/v1/admin/listing-promotions/:id/cancel` — отменить промо
   * (TASK-122, API.md §15). Ключ — `id` самой промо (а не листинга).
   *
   * Только `ACTIVE`-промо отменяема: иначе `422 PROMOTION_NOT_ACTIVE` (уже
   * `CANCELLED/EXPIRED/REFUNDED` — нечего отменять). Атомарно (одна транзакция):
   * `status → CANCELLED`, сброс read-cache на `listings` в `NORMAL` (тир-инвариант
   * «одна ACTIVE» при этом только усиливается), `promotion_logs(CANCEL_PROMOTION)`
   * с дельтой `old_type → NORMAL` + `audit_logs(LISTING_PROMOTION_CHANGE)`.
   */
  async cancel(
    adminId: string,
    promotionId: string,
    dto: CancelPromotionDto,
  ): Promise<PromotionResponse> {
    const promotion = await this.requireActivePromotion(promotionId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.listingPromotion.update({
        where: { id: promotionId },
        data: { status: PromotionStatus.CANCELLED },
        select: PROMOTION_SELECT,
      });

      // Сброс read-cache активной строки → NORMAL (источник истины — ledger выше).
      await tx.listing.update({
        where: { id: promotion.listingId },
        data: {
          promotionType: PromotionType.NORMAL,
          promotionStartedAt: null,
          promotionExpiresAt: null,
        },
      });

      await tx.promotionLog.create({
        data: {
          listingPromotionId: promotion.id,
          listingId: promotion.listingId,
          adminId,
          action: PromotionAdminAction.CANCEL_PROMOTION,
          oldType: promotion.type,
          newType: PromotionType.NORMAL,
          oldExpiresAt: promotion.expiresAt,
          newExpiresAt: null,
          reason: dto.reason ?? null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'LISTING_PROMOTION_CHANGE',
          entityType: 'listing',
          entityId: promotion.listingId,
          metadata: {
            promotion_id: promotion.id,
            action: 'cancel',
            reason: dto.reason ?? null,
          },
        },
      });

      return row;
    });

    return this.toResponse(updated);
  }

  /**
   * `PATCH /api/v1/admin/listing-promotions/:id/extend` — продлить промо
   * (TASK-122, API.md §15). Ключ — `id` промо.
   *
   * Продлевать можно только `ACTIVE`-промо (иначе `422 PROMOTION_NOT_ACTIVE`);
   * `period_days` валидируется по каталогу для тира промо → `422 INVALID_PERIOD`.
   * `expires_at += period_days` (отсчёт от текущего `expires_at`: у активной промо
   * он в будущем, т.е. продление, а не рестарт). Атомарно: апдейт `expires_at`,
   * синхронизация read-cache, `promotion_logs(EXTEND_PROMOTION)` (дельта
   * `old_expires_at → new`) + `audit_logs(LISTING_PROMOTION_CHANGE)`.
   */
  async extend(
    adminId: string,
    promotionId: string,
    dto: ExtendPromotionDto,
  ): Promise<PromotionResponse> {
    const promotion = await this.requireActivePromotion(promotionId);

    // Период валидируется по каталогу тира: нет плана → 422 INVALID_PERIOD.
    if (!(await this.plans.findPlan(promotion.type, dto.period_days))) {
      throw new HttpException(
        {
          code: ApiErrorCode.INVALID_PERIOD,
          message: `Unsupported promotion period: ${dto.period_days}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Отсчёт от текущего expires_at (у ACTIVE он не null и в будущем). На случай
    // рассинхрона данных подстраховываемся `now`, чтобы не уехать в прошлое.
    const base = promotion.expiresAt ?? new Date();
    const newExpiresAt = new Date(base.getTime() + dto.period_days * MS_PER_DAY);

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.listingPromotion.update({
        where: { id: promotionId },
        data: { expiresAt: newExpiresAt },
        select: PROMOTION_SELECT,
      });

      await tx.listing.update({
        where: { id: promotion.listingId },
        data: { promotionExpiresAt: newExpiresAt },
      });

      await tx.promotionLog.create({
        data: {
          listingPromotionId: promotion.id,
          listingId: promotion.listingId,
          adminId,
          action: PromotionAdminAction.EXTEND_PROMOTION,
          oldType: promotion.type,
          newType: promotion.type,
          oldExpiresAt: promotion.expiresAt,
          newExpiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'LISTING_PROMOTION_CHANGE',
          entityType: 'listing',
          entityId: promotion.listingId,
          metadata: {
            promotion_id: promotion.id,
            action: 'extend',
            period_days: dto.period_days,
            new_expires_at: newExpiresAt.toISOString(),
          },
        },
      });

      return row;
    });

    return this.toResponse(updated);
  }

  /**
   * Загрузить промо по `id` и убедиться, что она `ACTIVE`. Общий guard для
   * cancel/extend: `404 NOT_FOUND`, если строки нет; `422 PROMOTION_NOT_ACTIVE`,
   * если статус не `ACTIVE`.
   */
  private async requireActivePromotion(promotionId: string): Promise<{
    id: string;
    listingId: string;
    type: PromotionType;
    expiresAt: Date | null;
  }> {
    const promotion = await this.prisma.listingPromotion.findUnique({
      where: { id: promotionId },
      select: { id: true, listingId: true, type: true, status: true, expiresAt: true },
    });
    if (!promotion) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Promotion not found',
      });
    }
    if (promotion.status !== PromotionStatus.ACTIVE) {
      throw new HttpException(
        {
          code: ApiErrorCode.PROMOTION_NOT_ACTIVE,
          message: 'Promotion is not active',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return {
      id: promotion.id,
      listingId: promotion.listingId,
      type: promotion.type,
      expiresAt: promotion.expiresAt,
    };
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
