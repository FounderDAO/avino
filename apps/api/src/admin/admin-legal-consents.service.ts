import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { ListLegalConsentsQueryDto } from './dto/list-legal-consents.dto';

/** Запись журнала согласий (`GET /admin/legal-consents`). */
export interface LegalConsentItem {
  id: string;
  user_id: string;
  user_name: string | null;
  user_contact: string | null;
  version: number;
  accepted_at: string;
}

/** Сводка по версии согласия — для фильтра и справочной панели. */
export interface LegalConsentVersionSummary {
  version: number;
  /** Дата введения версии (из аудита LEGAL_CONSENT_VERSION_UPDATE); null для базовой v1. */
  effective_at: string | null;
  count: number;
}

/** Дефолты пагинации админ-списка (API.md §4). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const CONSENT_SELECT = {
  id: true,
  userId: true,
  version: true,
  acceptedAt: true,
  user: {
    select: {
      phone: true,
      email: true,
      profile: { select: { displayName: true } },
    },
  },
} as const;

type ConsentRow = Prisma.LegalConsentGetPayload<{
  select: typeof CONSENT_SELECT;
}>;

/**
 * AdminLegalConsentsService — read-side журнала согласий с юр-документами для
 * админ-панели. Глобальный пагинированный срез append-only `legal_consents`
 * (строки не удаляются — таблица и есть история). Версия согласия — app-wide
 * счётчик; дату введения версии отдаёт listVersions (Task 2). Доступ — только
 * ADMIN (RolesGuard в контроллере). Зеркалит AdminOtpLogsService.
 */
@Injectable()
export class AdminLegalConsentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/admin/legal-consents` — журнал согласий. */
  async listConsents(
    query: ListLegalConsentsQueryDto,
  ): Promise<PaginatedResponse<LegalConsentItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.LegalConsentWhereInput = {};
    if (query.version !== undefined) where.version = query.version;
    if (query.from || query.to) {
      where.acceptedAt = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' } as const;
      where.user = {
        OR: [
          { phone: contains },
          { email: contains },
          { profile: { firstName: contains } },
          { profile: { lastName: contains } },
          { profile: { displayName: contains } },
        ],
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.legalConsent.findMany({
        where,
        select: CONSENT_SELECT,
        orderBy: [{ acceptedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.legalConsent.count({ where }),
    ]);

    return {
      data: rows.map((r) => this.toItem(r)),
      meta: { page, limit, total },
    };
  }

  /**
   * `GET /api/v1/admin/legal-consents/versions` — версии, встречающиеся в
   * согласиях, с числом согласий и датой введения. Версия — app-wide счётчик
   * (+1 при публикации с галочкой), не связана FK с legal_documents; дата
   * введения = createdAt свежайшего аудита LEGAL_CONSENT_VERSION_UPDATE с
   * metadata.version = N. v1 (env-дефолт, без аудита) → effective_at = null.
   */
  async listVersions(): Promise<LegalConsentVersionSummary[]> {
    const [groups, audits] = await Promise.all([
      this.prisma.legalConsent.groupBy({
        by: ['version'],
        _count: { _all: true },
      }),
      this.prisma.auditLog.findMany({
        where: { action: 'LEGAL_CONSENT_VERSION_UPDATE' },
        select: { metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // version → дата введения (свежайшая среди дублей; их не должно быть).
    const effective = new Map<number, Date>();
    for (const a of audits) {
      const v = (a.metadata as { version?: number } | null)?.version;
      if (typeof v === 'number' && !effective.has(v)) {
        effective.set(v, a.createdAt);
      }
    }

    return groups
      .map((g) => ({
        version: g.version,
        effective_at: effective.get(g.version)?.toISOString() ?? null,
        count: g._count._all,
      }))
      .sort((a, b) => b.version - a.version);
  }

  private toItem(row: ConsentRow): LegalConsentItem {
    return {
      id: row.id,
      user_id: row.userId,
      user_name: row.user?.profile?.displayName ?? null,
      user_contact: row.user?.phone ?? row.user?.email ?? null,
      version: row.version,
      accepted_at: row.acceptedAt.toISOString(),
    };
  }
}
