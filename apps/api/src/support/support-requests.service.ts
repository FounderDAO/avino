import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportRequestStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';
import { ListSupportRequestsQueryDto } from './dto/list-support-requests.dto';
import { UpdateSupportRequestStatusDto } from './dto/update-support-request-status.dto';

/** Квиток создания обращения `POST /api/v1/support/requests`: `201 → { id, status }`. */
export interface CreateSupportRequestResponse {
  id: string;
  status: SupportRequestStatus;
}

/** Обращение в админ-контракте (snake_case, даты ISO). */
export interface SupportRequestResponse {
  id: string;
  user_id: string | null;
  name: string | null;
  contact: string;
  message: string;
  status: SupportRequestStatus;
  handled_by: string | null;
  handled_at: string | null;
  created_at: string;
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SUPPORT_REQUEST_SELECT = {
  id: true,
  userId: true,
  name: true,
  contact: true,
  message: true,
  status: true,
  handledBy: true,
  handledAt: true,
  createdAt: true,
} as const;

type SupportRequestRow = Prisma.SupportRequestGetPayload<{
  select: typeof SUPPORT_REQUEST_SELECT;
}>;

/**
 * SupportRequestsService — обращения в поддержку с формы /help.
 *
 * Read/write-логика трёх роутов: `POST /support/requests` (публичный,
 * optional-auth), `GET /admin/support/requests` и `PATCH
 * /admin/support/requests/:id` (MODERATOR/ADMIN). Паттерн — {@link
 * ComplaintsService}: сортировка `created_at DESC, id DESC`, page-based
 * пагинация с `meta.total`.
 */
@Injectable()
export class SupportRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `POST /api/v1/support/requests` — создать обращение. Гость → userId null. */
  async create(
    userId: string | null,
    dto: CreateSupportRequestDto,
  ): Promise<CreateSupportRequestResponse> {
    const row = await this.prisma.supportRequest.create({
      data: {
        userId,
        name: dto.name ?? null,
        contact: dto.contact,
        message: dto.message,
      },
      select: { id: true, status: true },
    });
    return { id: row.id, status: row.status };
  }

  /** `GET /api/v1/admin/support/requests` — список обращений (фильтр `status`). */
  async listAdmin(
    query: ListSupportRequestsQueryDto,
  ): Promise<PaginatedResponse<SupportRequestResponse>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.SupportRequestWhereInput = {};
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.supportRequest.findMany({
        where,
        select: SUPPORT_REQUEST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportRequest.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: { page, limit, total },
    };
  }

  /**
   * `PATCH /api/v1/admin/support/requests/:id` — сменить статус. Проставляет
   * `handled_by`/`handled_at` (модератор из токена, текущее время). `404` если
   * обращения нет.
   */
  async updateStatus(
    handlerId: string,
    id: string,
    dto: UpdateSupportRequestStatusDto,
  ): Promise<SupportRequestResponse> {
    const existing = await this.prisma.supportRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Support request not found',
      });
    }

    const row = await this.prisma.supportRequest.update({
      where: { id },
      data: {
        status: dto.status,
        handledBy: handlerId,
        handledAt: new Date(),
      },
      select: SUPPORT_REQUEST_SELECT,
    });
    return this.toResponse(row);
  }

  private toResponse(row: SupportRequestRow): SupportRequestResponse {
    return {
      id: row.id,
      user_id: row.userId,
      name: row.name,
      contact: row.contact,
      message: row.message,
      status: row.status,
      handled_by: row.handledBy,
      handled_at: row.handledAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
