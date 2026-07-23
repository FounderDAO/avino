import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AgentApplicationStatus,
  ListingStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';
import { resolveAvatarUrl } from '../users/avatar-url.util';
import { ListAgentsQueryDto } from './dto/list-agents.dto';

/** Публичная карточка агента в списке (ADR-0140, API.md §21). */
export interface AgentResponse {
  id: string;
  name: string | null;
  avatar_url: string | null;
  agency_name: string | null;
  about: string | null;
  active_listings_count: number;
}

/**
 * Публичный профиль агента `GET /agents/:id` — карточка списка + контакты
 * (ADR-0155). Контакты живут ТОЛЬКО в профиле и сознательно не добавлены в
 * `AgentResponse`: список отдаётся страницами по 100, и одного запроса хватило
 * бы, чтобы выгрузить телефоны/почты всех агентов сразу.
 */
export interface AgentProfileResponse extends AgentResponse {
  phone: string | null;
  email: string | null;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Профиль + последняя APPROVED-заявка (источник agency_name/about). */
const AGENT_SELECT = {
  id: true,
  status: true,
  profile: {
    select: {
      firstName: true,
      lastName: true,
      displayName: true,
      avatarUrl: true,
      avatarStorageKey: true,
    },
  },
  agentApplications: {
    where: { status: AgentApplicationStatus.APPROVED },
    orderBy: { resolvedAt: 'desc' as const },
    take: 1,
    select: { agencyName: true, about: true },
  },
} as const;

type AgentRow = Prisma.UserGetPayload<{ select: typeof AGENT_SELECT }>;

/**
 * Профиль + контакты (ADR-0155). Отдельный select, а не расширение
 * AGENT_SELECT: списку контакты не нужны, и тянуть их на 100 строк ради
 * полей, которые не попадут в ответ, незачем.
 */
const AGENT_PROFILE_SELECT = {
  ...AGENT_SELECT,
  phone: true,
  email: true,
  profile: {
    select: {
      ...AGENT_SELECT.profile.select,
      contactPhone: true,
      contactPhoneVerified: true,
    },
  },
} as const;

type AgentProfileRow = Prisma.UserGetPayload<{
  select: typeof AGENT_PROFILE_SELECT;
}>;

/**
 * AgentsService — публичный каталог агентов (ADR-0140, API.md §21).
 *
 * Агент = ACTIVE-пользователь с ролью AGENT|AGENCY (независимо от того, выдана
 * роль по заявке или админом вручную). `agency_name`/`about` — из последней
 * APPROVED-заявки (NULL для назначенных вручную). Сортировка по числу активных
 * объявлений: агентов немного (модерация), поэтому счётчики агрегируются
 * groupBy и сортировка/пагинация выполняются в памяти по полному списку.
 */
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /** `GET /api/v1/agents` — список агентов, самые активные сверху. */
  async list(
    query: ListAgentsQueryDto,
  ): Promise<PaginatedResponse<AgentResponse>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const rows = await this.prisma.user.findMany({
      where: this.agentWhere(),
      select: AGENT_SELECT,
    });
    const counts = await this.activeCounts(rows.map((r) => r.id));

    const sorted = rows
      .map((row) => ({ row, count: counts.get(row.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.row.id.localeCompare(b.row.id));
    const pageRows = sorted.slice((page - 1) * limit, page * limit);

    return {
      data: await Promise.all(
        pageRows.map(({ row, count }) => this.toResponse(row, count)),
      ),
      meta: { page, limit, total: rows.length },
    };
  }

  /** `GET /api/v1/agents/:id` — профиль агента с контактами; не-агент → 404. */
  async getById(id: string): Promise<AgentProfileResponse> {
    const row = await this.prisma.user.findFirst({
      where: { id, ...this.agentWhere() },
      select: AGENT_PROFILE_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Agent not found',
      });
    }
    const counts = await this.activeCounts([row.id]);
    return {
      ...(await this.toResponse(row, counts.get(row.id) ?? 0)),
      // Тот же публичный телефон, что в контакте объявления
      // (ListingsService.buildContact): подтверждённый contact_phone, иначе
      // телефон аккаунта.
      phone:
        row.profile?.contactPhoneVerified && row.profile.contactPhone
          ? row.profile.contactPhone
          : (row.phone ?? null),
      email: row.email ?? null,
    };
  }

  private agentWhere(): Prisma.UserWhereInput {
    return {
      status: UserStatus.ACTIVE,
      deletedAt: null,
      roles: {
        some: { role: { code: { in: [UserRole.AGENT, UserRole.AGENCY] } } },
      },
    };
  }

  private async activeCounts(ownerIds: string[]): Promise<Map<string, number>> {
    if (ownerIds.length === 0) return new Map();
    const groups = await this.prisma.listing.groupBy({
      by: ['ownerId'],
      where: { ownerId: { in: ownerIds }, status: ListingStatus.ACTIVE },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.ownerId, g._count._all]));
  }

  private async toResponse(
    row: AgentRow,
    count: number,
  ): Promise<AgentResponse> {
    const profile = row.profile;
    const fullName = [profile?.firstName, profile?.lastName]
      .filter((p): p is string => Boolean(p))
      .join(' ');
    const application = row.agentApplications[0] ?? null;
    // Аватар — общий хелпер (ADR-0134): storageKey (загружен пользователем)
    // → sign-on-read; иначе внешний avatarUrl (Google/Apple) как есть.
    const avatarUrl = await resolveAvatarUrl(
      this.uploads,
      profile?.avatarStorageKey,
      profile?.avatarUrl,
    );
    return {
      id: row.id,
      name: profile?.displayName ?? (fullName.length > 0 ? fullName : null),
      avatar_url: avatarUrl,
      agency_name: application?.agencyName ?? null,
      about: application?.about ?? null,
      active_listings_count: count,
    };
  }
}
