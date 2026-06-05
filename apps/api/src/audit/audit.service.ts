import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs.dto';

/**
 * Одна запись security audit-лога (API.md §16, `GET /admin/audit-logs`).
 * snake_case-контракт; `metadata` — произвольный JSON (`Json?` в схеме), отдаётся
 * как есть. `actor_id` nullable — actor мог быть удалён (ON DELETE SET NULL).
 */
export interface AuditLogResponse {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata: unknown;
  created_at: string;
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const SELECT = {
  id: true,
  actorId: true,
  action: true,
  entityType: true,
  entityId: true,
  ip: true,
  userAgent: true,
  metadata: true,
  createdAt: true,
} as const;

type AuditLogRow = Prisma.AuditLogGetPayload<{ select: typeof SELECT }>;

/**
 * AuditService — чтение security audit-лога (`audit_logs`, ADR-004, TASK-131).
 *
 * `audit_logs` — кросс-доменный журнал безопасности: строки пишут разные модули
 * (admin-users → `ADMIN_USER_UPDATE`/`ROLE_CHANGE`, moderation →
 * `LISTING_STATUS_CHANGE`, promotions → `LISTING_PROMOTION_CHANGE`). Read-side
 * вынесен в отдельный модуль, т.к. ни один домен не владеет таблицей. Доступ —
 * только ADMIN (RolesGuard в {@link AdminLogsController}). Сортировка —
 * `created_at DESC, id DESC` (детерминированный хвост при равных таймстемпах).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /api/v1/admin/audit-logs` — пагинированный security audit-лог. */
  async listAuditLogs(
    query: ListAuditLogsQueryDto,
  ): Promise<PaginatedResponse<AuditLogResponse>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.actor_id) where.actorId = query.actor_id;
    if (query.entity_type) where.entityType = query.entity_type;
    if (query.entity_id) where.entityId = query.entity_id;

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toResponse(row)),
      meta: { page, limit, total },
    };
  }

  private toResponse(row: AuditLogRow): AuditLogResponse {
    return {
      id: row.id,
      actor_id: row.actorId,
      action: row.action,
      entity_type: row.entityType,
      entity_id: row.entityId,
      ip: row.ip,
      user_agent: row.userAgent,
      metadata: row.metadata ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
