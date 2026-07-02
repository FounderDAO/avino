import { Injectable } from '@nestjs/common';
import {
  Currency,
  Prisma,
  PromotionStatus,
  PromotionType,
} from '@prisma/client';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { ListAdminPromotionsQueryDto } from './dto/list-admin-promotions.dto';

/**
 * Строка глобальной истории промо (`GET /admin/promotions`, ADMIN-16).
 * Расширяет per-listing `PromotionResponse` (§15) полями для сводной таблицы:
 * `listing_title` (на `original_language`, как в очереди модерации),
 * `user_id` (кто активировал), `price`/`currency` (Decimal-строка, ADR-002)
 * и `created_at`.
 */
export interface AdminPromotionRow {
  id: string;
  listing_id: string;
  listing_title: string;
  user_id: string | null;
  type: PromotionType;
  status: PromotionStatus;
  period_days: number;
  price: string | null;
  currency: Currency | null;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/**
 * Сводка промо (`GET /admin/promotions/summary`). Выручка — Decimal-строки
 * (ADR-002); в MVP тарифы в единой валюте (UZS), поэтому суммы без разбивки
 * по валютам.
 */
export interface AdminPromotionsSummaryResponse {
  active_count: number;
  revenue_month: string;
  revenue_total: string;
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * «Запущенные» промо для подсчёта выручки: строка была активирована
 * (`starts_at` проставлен) и деньги не возвращены. PENDING_PAYMENT (не
 * запускалась) и REFUNDED (возврат) исключены; CANCELLED учитывается —
 * активация состоялась (в т.ч. supersede при повторной активации).
 */
const STARTED_STATUSES: PromotionStatus[] = [
  PromotionStatus.ACTIVE,
  PromotionStatus.EXPIRED,
  PromotionStatus.CANCELLED,
];

const PROMOTION_LIST_SELECT = {
  id: true,
  listingId: true,
  userId: true,
  type: true,
  status: true,
  periodDays: true,
  price: true,
  currency: true,
  startsAt: true,
  expiresAt: true,
  createdAt: true,
  listing: {
    select: {
      originalLanguage: true,
      translations: { select: { language: true, title: true } },
    },
  },
} as const;

type PromotionListRow = Prisma.ListingPromotionGetPayload<{
  select: typeof PROMOTION_LIST_SELECT;
}>;

/**
 * AdminPromotionsOverviewService — глобальная история и сводка промо VIP/TOP
 * (ADMIN-16). До неё промо адресовалось только по листингу
 * (`/admin/listings/:id/promotions`), и страница «Продвижение» держала историю
 * и KPI на моках.
 *
 * Read-only поверх ledger'а `listing_promotions` (source of truth, ADR-006):
 * список с фильтрами `status`/`type` и page-based пагинацией (API.md §4) +
 * сводка (активные, выручка за текущий месяц и за всё время). Доступ — только
 * ADMIN (монетизация, как остальные промо-роуты §15).
 */
@Injectable()
export class AdminPromotionsOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/admin/promotions` — история промо по всем листингам. */
  async list(
    query: ListAdminPromotionsQueryDto,
  ): Promise<PaginatedResponse<AdminPromotionRow>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.ListingPromotionWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const [rows, total] = await Promise.all([
      this.prisma.listingPromotion.findMany({
        where,
        select: PROMOTION_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.listingPromotion.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      meta: { page, limit, total },
    };
  }

  /** `GET /api/v1/admin/promotions/summary` — активные и выручка. */
  async summary(): Promise<AdminPromotionsSummaryResponse> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeCount, monthSum, totalSum] = await Promise.all([
      this.prisma.listingPromotion.count({
        where: { status: PromotionStatus.ACTIVE },
      }),
      this.prisma.listingPromotion.aggregate({
        _sum: { price: true },
        where: {
          status: { in: STARTED_STATUSES },
          startsAt: { not: null, gte: monthStart },
        },
      }),
      this.prisma.listingPromotion.aggregate({
        _sum: { price: true },
        where: { status: { in: STARTED_STATUSES }, startsAt: { not: null } },
      }),
    ]);

    return {
      active_count: activeCount,
      revenue_month: monthSum._sum.price?.toString() ?? '0',
      revenue_total: totalSum._sum.price?.toString() ?? '0',
    };
  }

  /** Ledger-строка + листинг → snake_case row; title — на `original_language`. */
  private toRow(row: PromotionListRow): AdminPromotionRow {
    const translation = row.listing.translations.find(
      (t) => t.language === row.listing.originalLanguage,
    );
    return {
      id: row.id,
      listing_id: row.listingId,
      listing_title: translation?.title ?? '',
      user_id: row.userId,
      type: row.type,
      status: row.status,
      period_days: row.periodDays,
      price: row.price?.toString() ?? null,
      currency: row.currency,
      starts_at: row.startsAt?.toISOString() ?? null,
      expires_at: row.expiresAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
