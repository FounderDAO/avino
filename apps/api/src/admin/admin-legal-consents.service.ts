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
