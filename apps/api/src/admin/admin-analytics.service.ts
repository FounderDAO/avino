import { Injectable } from '@nestjs/common';
import { ListingStatus, ModerationAction, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma';

/** Один помесячный бакет ряда «объявления за год» (12 точек, старые→новые). */
export interface MonthlyCount {
  /** Метка месяца `YYYY-MM` (UTC, по `date_trunc('month', created_at)`). */
  month: string;
  count: number;
}

/** Район + локализованные имена + число объявлений (для столбчатого графика). */
export interface DistrictCount {
  district_id: string;
  name_ru: string;
  name_uz: string;
  name_en: string;
  count: number;
}

/** Запись «последних действий» дашборда — из доменного журнала модерации. */
export interface AdminActivityItem {
  id: string;
  action: ModerationAction;
  new_status: ListingStatus | null;
  listing_id: string;
  /** Заголовок листинга на исходном языке (или `null`, если перевода нет). */
  listing_title: string | null;
  /** Имя модератора (display_name → ФИО → email) или `null`, если аккаунт удалён. */
  moderator_name: string | null;
  created_at: string;
}

/**
 * Аналитика дашборда (`GET /admin/analytics`): ряды для графиков и лента действий.
 *
 * - `listings_over_time` — 12 помесячных счётчиков (включая нулевые месяцы).
 * - `buy_rent`           — счётчики SALE/RENT (фронт считает проценты для пончика).
 * - `by_district`        — топ-6 районов по числу объявлений с именами.
 * - `recent_activity`    — последние 6 записей журнала модерации.
 *
 * Везде исключаем `DELETED` (он вне read-path, DB_SCHEMA §15).
 */
export interface AdminAnalyticsResponse {
  listings_over_time: MonthlyCount[];
  buy_rent: { buy: number; rent: number };
  by_district: DistrictCount[];
  recent_activity: AdminActivityItem[];
}

/** Сколько районов показываем в столбчатом графике. */
const TOP_DISTRICTS = 6;
/** Сколько последних действий показываем в ленте. */
const RECENT_ACTIVITY = 6;

type RecentLogRow = {
  id: string;
  action: ModerationAction;
  newStatus: ListingStatus | null;
  listingId: string;
  createdAt: Date;
  listing: {
    originalLanguage: string;
    translations: { language: string; title: string }[];
  } | null;
  moderator: {
    email: string | null;
    profile: {
      displayName: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
  } | null;
};

/**
 * AdminAnalyticsService — агрегаты дашборда (ADMIN-15+, API.md §16).
 *
 * Вынесен из {@link AdminStatsService} (лёгкие COUNT'ы, перечитываются после
 * каждой админ-мутации): графики тяжелее (groupBy/$queryRaw) и не нуждаются в
 * инвалидации на каждое действие, поэтому это отдельный read-only эндпоинт.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/admin/analytics` — четыре набора данных одним ответом. */
  async getAnalytics(): Promise<AdminAnalyticsResponse> {
    const [listingsOverTime, buyRent, byDistrict, recentActivity] =
      await Promise.all([
        this.listingsOverTime(),
        this.buyRentSplit(),
        this.topDistricts(),
        this.recentActivity(),
      ]);
    return {
      listings_over_time: listingsOverTime,
      buy_rent: buyRent,
      by_district: byDistrict,
      recent_activity: recentActivity,
    };
  }

  /**
   * 12 помесячных счётчиков (старые→новые). `generate_series` гарантирует все 12
   * бакетов, включая месяцы без объявлений (LEFT JOIN → 0), поэтому фронту не
   * нужно зеро-филлить. Окно — последние 12 месяцев по `created_at` (UTC).
   */
  private async listingsOverTime(): Promise<MonthlyCount[]> {
    const rows = await this.prisma.$queryRaw<
      { month: string; count: number }[]
    >`
      SELECT to_char(m, 'YYYY-MM') AS month, COALESCE(c.cnt, 0)::int AS count
      FROM generate_series(
        date_trunc('month', now()) - interval '11 months',
        date_trunc('month', now()),
        interval '1 month'
      ) AS m
      LEFT JOIN (
        SELECT date_trunc('month', created_at) AS bucket, count(*) AS cnt
        FROM listings
        WHERE status <> 'DELETED'
        GROUP BY 1
      ) c ON c.bucket = m
      ORDER BY m
    `;
    return rows.map((r) => ({ month: r.month, count: Number(r.count) }));
  }

  /** Счётчики покупка/аренда (без DELETED). Проценты считает фронт. */
  private async buyRentSplit(): Promise<{ buy: number; rent: number }> {
    const [buy, rent] = await Promise.all([
      this.prisma.listing.count({
        where: {
          transactionType: TransactionType.SALE,
          status: { not: ListingStatus.DELETED },
        },
      }),
      this.prisma.listing.count({
        where: {
          transactionType: TransactionType.RENT,
          status: { not: ListingStatus.DELETED },
        },
      }),
    ]);
    return { buy, rent };
  }

  /** Топ-6 районов по числу объявлений (без DELETED) с локализованными именами. */
  private async topDistricts(): Promise<DistrictCount[]> {
    const grouped = await this.prisma.listing.groupBy({
      by: ['districtId'],
      where: {
        districtId: { not: null },
        status: { not: ListingStatus.DELETED },
      },
      _count: { _all: true },
      orderBy: { _count: { districtId: 'desc' } },
      take: TOP_DISTRICTS,
    });

    const ids = grouped
      .map((g) => g.districtId)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return [];

    const districts = await this.prisma.district.findMany({
      where: { id: { in: ids } },
      select: { id: true, nameRu: true, nameUz: true, nameEn: true },
    });
    const byId = new Map(districts.map((d) => [d.id, d]));

    // Сохраняем порядок из groupBy (по убыванию count); район без записи в
    // справочнике (рассинхрон) пропускаем, чтобы не отдать имя-`null`.
    return grouped.flatMap((g) => {
      const d = g.districtId ? byId.get(g.districtId) : undefined;
      if (!g.districtId || !d) return [];
      return [
        {
          district_id: g.districtId,
          name_ru: d.nameRu,
          name_uz: d.nameUz,
          name_en: d.nameEn,
          count: g._count._all,
        },
      ];
    });
  }

  /** Последние 6 записей журнала модерации (свежие сверху) для ленты действий. */
  private async recentActivity(): Promise<AdminActivityItem[]> {
    const logs = (await this.prisma.moderationLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECENT_ACTIVITY,
      select: {
        id: true,
        action: true,
        newStatus: true,
        listingId: true,
        createdAt: true,
        listing: {
          select: {
            originalLanguage: true,
            translations: { select: { language: true, title: true } },
          },
        },
        moderator: {
          select: {
            email: true,
            profile: {
              select: {
                displayName: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    })) as RecentLogRow[];

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      new_status: log.newStatus,
      listing_id: log.listingId,
      listing_title: this.pickTitle(log.listing),
      moderator_name: this.pickModeratorName(log.moderator),
      created_at: log.createdAt.toISOString(),
    }));
  }

  /** Заголовок на исходном языке (фолбэк — первый доступный перевод). */
  private pickTitle(listing: RecentLogRow['listing']): string | null {
    if (!listing) return null;
    const t =
      listing.translations.find(
        (x) => x.language === listing.originalLanguage,
      ) ?? listing.translations[0];
    return t?.title ?? null;
  }

  /** Имя модератора: display_name → «Имя Фамилия» → email → null. */
  private pickModeratorName(
    moderator: RecentLogRow['moderator'],
  ): string | null {
    if (!moderator) return null;
    const profile = moderator.profile;
    const full = [profile?.firstName, profile?.lastName]
      .filter(Boolean)
      .join(' ');
    return profile?.displayName || full || moderator.email || null;
  }
}
