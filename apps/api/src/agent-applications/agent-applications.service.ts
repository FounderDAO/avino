import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentApplicationStatus, Prisma } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PaginatedResponse } from '../moderation';
import { NotificationsService } from '../notifications';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';
import { resolveAvatarUrl } from '../users/avatar-url.util';
import { CreateAgentApplicationDto } from './dto/create-agent-application.dto';
import { ListAgentApplicationsQueryDto } from './dto/list-agent-applications.dto';
import { RejectAgentApplicationDto } from './dto/reject-agent-application.dto';

/** Заявка «Стать агентом» в пользовательском контракте (API.md §21). */
export interface AgentApplicationResponse {
  id: string;
  status: AgentApplicationStatus;
  agency_name: string | null;
  about: string;
  reject_reason: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Заявка в админ-контракте: + заявитель и модератор (API.md §21). */
export interface AdminAgentApplicationResponse extends AgentApplicationResponse {
  user: {
    id: string;
    name: string | null;
    phone: string | null;
    avatar_url: string | null;
  };
  moderator_id: string | null;
}

const APPLICATION_SELECT = {
  id: true,
  status: true,
  agencyName: true,
  about: true,
  rejectReason: true,
  createdAt: true,
  resolvedAt: true,
} as const;

type ApplicationRow = Prisma.AgentApplicationGetPayload<{
  select: typeof APPLICATION_SELECT;
}>;

const ADMIN_APPLICATION_INCLUDE = {
  user: {
    select: {
      id: true,
      phone: true,
      profile: {
        select: {
          firstName: true,
          lastName: true,
          displayName: true,
          avatarUrl: true,
          avatarStorageKey: true,
          contactPhone: true,
        },
      },
    },
  },
} as const;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * AgentApplicationsService — заявки «Стать агентом» (ADR-0140, API.md §21).
 *
 * Пользовательская часть: подача (`POST /users/me/agent-application`, одна
 * PENDING на пользователя — partial unique в БД страхует гонку) и статус
 * последней заявки (`GET`). Админ-часть: список (`listAdmin`), одобрение
 * (`approve` — статус APPROVED + роль AGENT + аудит + уведомление в одной
 * транзакции) и отклонение (`reject`); HTTP — Admin-контроллер в AdminModule
 * (следующая задача).
 */
@Injectable()
export class AgentApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * `POST /api/v1/users/me/agent-application` — подать заявку. Уже агент →
   * `409 ALREADY_AGENT`; есть PENDING → `409 AGENT_APPLICATION_PENDING`
   * (проверка + unique-страховка от гонки на P2002).
   */
  async create(
    userId: string,
    dto: CreateAgentApplicationDto,
  ): Promise<AgentApplicationResponse> {
    const proRoleCount = await this.prisma.userRole.count({
      where: {
        userId,
        role: { code: { in: [UserRole.AGENT, UserRole.AGENCY] } },
      },
    });
    if (proRoleCount > 0) {
      throw new ConflictException({
        code: ApiErrorCode.ALREADY_AGENT,
        message: 'User already has a professional role',
      });
    }

    const pending = await this.prisma.agentApplication.findFirst({
      where: { userId, status: AgentApplicationStatus.PENDING },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException({
        code: ApiErrorCode.AGENT_APPLICATION_PENDING,
        message: 'An agent application is already pending',
      });
    }

    try {
      const row = await this.prisma.agentApplication.create({
        data: {
          userId,
          agencyName: dto.agency_name?.trim() || null,
          about: dto.about.trim(),
        },
        select: APPLICATION_SELECT,
      });
      return this.toResponse(row);
    } catch (e) {
      // Гонка двух параллельных подач: partial unique index (user_id WHERE
      // status='PENDING') → P2002 маппим на тот же 409, что и проверка выше.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ApiErrorCode.AGENT_APPLICATION_PENDING,
          message: 'An agent application is already pending',
        });
      }
      throw e;
    }
  }

  /**
   * `GET /api/v1/users/me/agent-application` — последняя заявка или 404.
   * APPROVED-заявка отдаётся только пока пользователь реально держит роль
   * AGENT/AGENCY: после отзыва роли админом она — история, а не текущий
   * статус, и не должна блокировать повторную подачу (клиент /become-agent
   * трактует APPROVED как «вы уже агент», а 404 — как «заявок нет» → форма).
   */
  async getMine(userId: string): Promise<AgentApplicationResponse> {
    const row = await this.prisma.agentApplication.findFirst({
      where: { userId },
      select: APPLICATION_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    const roleRevoked =
      row?.status === AgentApplicationStatus.APPROVED &&
      (await this.prisma.userRole.count({
        where: {
          userId,
          role: { code: { in: [UserRole.AGENT, UserRole.AGENCY] } },
        },
      })) === 0;
    if (!row || roleRevoked) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Agent application not found',
      });
    }
    return this.toResponse(row);
  }

  /** `GET /api/v1/admin/agent-applications` — модерационный список. */
  async listAdmin(
    query: ListAgentApplicationsQueryDto,
  ): Promise<PaginatedResponse<AdminAgentApplicationResponse>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where: Prisma.AgentApplicationWhereInput = {};
    if (query.status) where.status = query.status;

    const [rows, total] = await Promise.all([
      this.prisma.agentApplication.findMany({
        where,
        include: ADMIN_APPLICATION_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.agentApplication.count({ where }),
    ]);

    return {
      data: await Promise.all(rows.map((r) => this.toAdminResponse(r))),
      meta: { page, limit, total },
    };
  }

  /**
   * `POST /api/v1/admin/agent-applications/:id/approve` — одобрить: статус
   * APPROVED + роль AGENT (идемпотентно через upsert — переживает роль,
   * выданную админом вручную ранее) + аудит + уведомление, всё в одной
   * транзакции. Не-PENDING → `422 INVALID_STATUS_TRANSITION`.
   */
  async approve(
    moderatorId: string,
    id: string,
  ): Promise<AdminAgentApplicationResponse> {
    const app = await this.requirePending(id);
    const role = await this.prisma.role.findUnique({
      where: { code: UserRole.AGENT },
      select: { id: true },
    });
    if (!role) throw new Error('AGENT role is not seeded');

    const updated = await this.prisma.$transaction(async (tx) => {
      // TOCTOU-guard: requirePending() читает статус ДО транзакции, поэтому
      // между ним и этим update окно гонки — два параллельных approve/reject
      // по одной заявке иначе оба прошли бы и задвоили роль/аудит/уведомление.
      // updateMany с тем же condition в WHERE атомарно решает, кто первый.
      const guarded = await tx.agentApplication.updateMany({
        where: { id, status: AgentApplicationStatus.PENDING },
        data: {
          status: AgentApplicationStatus.APPROVED,
          moderatorId,
          resolvedAt: new Date(),
        },
      });
      if (guarded.count !== 1) {
        throw new HttpException(
          {
            code: ApiErrorCode.INVALID_STATUS_TRANSITION,
            message: 'Cannot resolve application: already resolved',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const row = await tx.agentApplication.findUniqueOrThrow({
        where: { id },
        include: ADMIN_APPLICATION_INCLUDE,
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: app.userId, roleId: role.id } },
        update: {},
        create: { userId: app.userId, roleId: role.id, grantedBy: moderatorId },
      });
      await tx.auditLog.create({
        data: {
          actorId: moderatorId,
          action: 'ROLE_CHANGE',
          entityType: 'user',
          entityId: app.userId,
          metadata: { role: UserRole.AGENT, op: 'grant', agent_application_id: id },
        },
      });
      await this.notifications.queueAgentApplicationResolved(tx, app.userId, {
        applicationId: id,
        status: 'APPROVED',
        rejectReason: null,
      });
      return row;
    });
    return this.toAdminResponse(updated);
  }

  /** `POST /api/v1/admin/agent-applications/:id/reject` — отклонить с причиной. */
  async reject(
    moderatorId: string,
    id: string,
    dto: RejectAgentApplicationDto,
  ): Promise<AdminAgentApplicationResponse> {
    const app = await this.requirePending(id);
    const updated = await this.prisma.$transaction(async (tx) => {
      // TOCTOU-guard: см. комментарий в approve() — тот же приём для reject.
      const guarded = await tx.agentApplication.updateMany({
        where: { id, status: AgentApplicationStatus.PENDING },
        data: {
          status: AgentApplicationStatus.REJECTED,
          rejectReason: dto.reason?.trim() || null,
          moderatorId,
          resolvedAt: new Date(),
        },
      });
      if (guarded.count !== 1) {
        throw new HttpException(
          {
            code: ApiErrorCode.INVALID_STATUS_TRANSITION,
            message: 'Cannot resolve application: already resolved',
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      const row = await tx.agentApplication.findUniqueOrThrow({
        where: { id },
        include: ADMIN_APPLICATION_INCLUDE,
      });
      await this.notifications.queueAgentApplicationResolved(tx, app.userId, {
        applicationId: id,
        status: 'REJECTED',
        rejectReason: dto.reason?.trim() || null,
      });
      return row;
    });
    return this.toAdminResponse(updated);
  }

  /** Заявка существует и в PENDING, иначе 404 / 422. */
  private async requirePending(id: string) {
    const app = await this.prisma.agentApplication.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!app) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Agent application not found',
      });
    }
    if (app.status !== AgentApplicationStatus.PENDING) {
      throw new HttpException(
        {
          code: ApiErrorCode.INVALID_STATUS_TRANSITION,
          message: `Cannot resolve application in status ${app.status}`,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return app;
  }

  private async toAdminResponse(
    row: Prisma.AgentApplicationGetPayload<{
      include: typeof ADMIN_APPLICATION_INCLUDE;
    }>,
  ): Promise<AdminAgentApplicationResponse> {
    const profile = row.user.profile;
    const fullName = [profile?.firstName, profile?.lastName]
      .filter((p): p is string => Boolean(p))
      .join(' ');
    // Аватар — общий хелпер (ADR-0134), как в UsersService.getMe: storageKey
    // (загружен через POST /users/me/avatar) → sign-on-read; иначе внешний
    // avatarUrl (Google/Apple) отдаётся как есть — НЕ через resolveMediaUrl,
    // которое прогнало бы его через extractKey и сломало внешнюю ссылку.
    const avatarUrl = await resolveAvatarUrl(
      this.uploads,
      profile?.avatarStorageKey,
      profile?.avatarUrl,
    );
    return {
      ...this.toResponse(row),
      moderator_id: row.moderatorId,
      user: {
        id: row.user.id,
        name: profile?.displayName ?? (fullName.length > 0 ? fullName : null),
        phone: profile?.contactPhone ?? row.user.phone ?? null,
        avatar_url: avatarUrl,
      },
    };
  }

  private toResponse(row: ApplicationRow): AgentApplicationResponse {
    return {
      id: row.id,
      status: row.status,
      agency_name: row.agencyName,
      about: row.about,
      reject_reason: row.rejectReason,
      created_at: row.createdAt.toISOString(),
      resolved_at: row.resolvedAt?.toISOString() ?? null,
    };
  }
}
