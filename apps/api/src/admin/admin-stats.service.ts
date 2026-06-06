import { Injectable } from '@nestjs/common';
import { ComplaintStatus, ListingStatus, PromotionStatus } from '@prisma/client';
import { PrismaService } from '../prisma';

/**
 * Сводные счётчики для дашборда админ-панели (ADMIN-15, snake_case контракт).
 *
 * - `listings_new`      — объявления в очереди модерации (`ListingStatus.NEW`).
 * - `complaints_new`    — необработанные жалобы (`ComplaintStatus.NEW`).
 * - `users_total`       — все пользователи (как `meta.total` в `/admin/users`
 *                         без фильтра — админ видит всё, включая DELETED).
 * - `promotions_active` — активные промо VIP/TOP (`PromotionStatus.ACTIVE`,
 *                         `listing_promotions` — source of truth, ADR-006).
 */
export interface AdminStatsResponse {
  listings_new: number;
  complaints_new: number;
  users_total: number;
  promotions_active: number;
}

/**
 * AdminStatsService — агрегированные счётчики дашборда (ADMIN-15, API.md §16).
 *
 * До ADMIN-15 дашборд предлагал собирать счётчики из `meta.total` существующих
 * списков, но глобального списка активных промо нет (промо адресуется только по
 * листингу). Поэтому заведён один лёгкий read-only эндпоинт `GET /admin/stats`,
 * который считает четыре числа параллельно (`COUNT` по индексированным полям),
 * вместо четырёх отдельных list-запросов с клиента (см. backlog-заметку
 * ADMIN-15 про `GET /admin/stats`).
 */
@Injectable()
export class AdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/admin/stats` — четыре счётчика одним ответом. */
  async getStats(): Promise<AdminStatsResponse> {
    const [listingsNew, complaintsNew, usersTotal, promotionsActive] =
      await Promise.all([
        this.prisma.listing.count({ where: { status: ListingStatus.NEW } }),
        this.prisma.complaint.count({
          where: { status: ComplaintStatus.NEW },
        }),
        this.prisma.user.count(),
        this.prisma.listingPromotion.count({
          where: { status: PromotionStatus.ACTIVE },
        }),
      ]);

    return {
      listings_new: listingsNew,
      complaints_new: complaintsNew,
      users_total: usersTotal,
      promotions_active: promotionsActive,
    };
  }
}
