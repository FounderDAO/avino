import { Injectable, NotFoundException } from '@nestjs/common';
import { ComplaintStatus, ListingStatus, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { CreateComplaintDto } from './dto/create-complaint.dto';
import { ListComplaintsQueryDto } from './dto/list-complaints.dto';
import { UpdateComplaintStatusDto } from './dto/update-complaint-status.dto';

/**
 * Квиток создания жалобы `POST /api/v1/complaints` (API.md §16): `201 → { id,
 * status }`. Полная жалоба возвращается админ-списком/PATCH.
 */
export interface CreateComplaintResponse {
  id: string;
  status: ComplaintStatus;
}

/**
 * Жалоба в админ-контракте (API.md §16). Snake_case; `reporter_id` колонки
 * отдаётся как `user_id` — совпадает с типом `Complaint` на фронте
 * (apps/web/src/store/api/adminTypes.ts).
 */
export interface ComplaintResponse {
  id: string;
  listing_id: string | null;
  user_id: string | null;
  reason: string;
  details: string | null;
  status: ComplaintStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const COMPLAINT_SELECT = {
  id: true,
  listingId: true,
  reporterId: true,
  reason: true,
  details: true,
  status: true,
  handledBy: true,
  handledAt: true,
  createdAt: true,
} as const;

type ComplaintRow = Prisma.ComplaintGetPayload<{ select: typeof COMPLAINT_SELECT }>;

/**
 * ComplaintsService — жалобы на объявления (TASK-132, API.md §16).
 *
 * Read/write-логика трёх роутов: `POST /complaints` (USER), `GET /admin/
 * complaints` и `PATCH /admin/complaints/:id` (MODERATOR/ADMIN). HTTP-слой —
 * {@link ComplaintsController} (user) и {@link AdminComplaintsController}
 * (admin). Существование листинга проверяется как в {@link FavoritesService}/
 * {@link ModerationService} (DELETED → 404). Сортировка админ-списка
 * `created_at DESC, id DESC` — детерминированный хвост при равных таймстемпах.
 */
@Injectable()
export class ComplaintsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `POST /api/v1/complaints` — пользователь жалуется на листинг. Листинг должен
   * существовать и быть не-`DELETED` (иначе `404`). `reporter_id` берётся из
   * токена; статус новой жалобы — `NEW`.
   */
  async create(
    reporterId: string,
    dto: CreateComplaintDto,
  ): Promise<CreateComplaintResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listing_id },
      select: { status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }

    const complaint = await this.prisma.complaint.create({
      data: {
        listingId: dto.listing_id,
        reporterId,
        reason: dto.reason,
        details: dto.details ?? null,
      },
      select: { id: true, status: true },
    });
    return { id: complaint.id, status: complaint.status };
  }

  /**
   * `GET /api/v1/admin/complaints` — список жалоб для модерации. Фильтры
   * `status` / `listing_id` комбинируются через AND; page-based пагинация с
   * обязательным `meta.total` (API.md §4).
   */
  async listAdmin(
    query: ListComplaintsQueryDto,
  ): Promise<PaginatedResponse<ComplaintResponse>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.ComplaintWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.listing_id) where.listingId = query.listing_id;

    const [rows, total] = await Promise.all([
      this.prisma.complaint.findMany({
        where,
        select: COMPLAINT_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.complaint.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: { page, limit, total },
    };
  }

  /**
   * `PATCH /api/v1/admin/complaints/:id` — обработать жалобу. Проставляет
   * `status` и `handled_by`/`handled_at` (модератор из токена, текущее время).
   * Несуществующая жалоба → `404`.
   */
  async updateStatus(
    handlerId: string,
    id: string,
    dto: UpdateComplaintStatusDto,
  ): Promise<ComplaintResponse> {
    const existing = await this.prisma.complaint.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Complaint not found',
      });
    }

    const row = await this.prisma.complaint.update({
      where: { id },
      data: {
        status: dto.status,
        handledBy: handlerId,
        handledAt: new Date(),
      },
      select: COMPLAINT_SELECT,
    });
    return this.toResponse(row);
  }

  private toResponse(row: ComplaintRow): ComplaintResponse {
    return {
      id: row.id,
      listing_id: row.listingId,
      user_id: row.reporterId,
      reason: row.reason,
      details: row.details,
      status: row.status,
      handled_by: row.handledBy,
      handled_at: row.handledAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
