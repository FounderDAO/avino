import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Language, ListingStatus, Prisma, UserStatus } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PaginatedResponse } from '../moderation';
import { PrismaService } from '../prisma';
import { ProfileResponse, toProfileResponse } from '../profiles';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ListAdminUsersQueryDto } from './dto/list-admin-users.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

/**
 * Пользователь в админ-списке (snake_case контракт, API.md §6). Тот же набор
 * базовых полей, что и `users/me` ({@link UserMeResponse}), плюс таймстемпы —
 * но без профиля (профиль отдаётся только в карточке).
 */
export interface AdminUserListItem {
  id: string;
  phone: string | null;
  email: string | null;
  status: UserStatus;
  default_language: Language;
  is_phone_verified: boolean;
  is_email_verified: boolean;
  roles: string[];
  /** Число объявлений пользователя (без DELETED) — колонка «Объявл.» админ-списка. */
  listings_count: number;
  last_login_at: string | null;
  created_at: string;
}

/** Карточка пользователя (`GET /admin/users/:id`): список + профиль и аудит-поля. */
export interface AdminUserDetail extends AdminUserListItem {
  updated_at: string;
  deleted_at: string | null;
  profile: ProfileResponse | null;
}

/** Дефолты пагинации админ-списка (API.md §4: default `limit` 20, max 100). */
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const LIST_SELECT = {
  id: true,
  phone: true,
  email: true,
  status: true,
  defaultLanguage: true,
  isPhoneVerified: true,
  isEmailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { code: true } } } },
  // Счётчик объявлений (без DELETED) — filtered relation count (Prisma ≥4.16).
  _count: {
    select: {
      listings: { where: { status: { not: ListingStatus.DELETED } } },
    },
  },
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  updatedAt: true,
  deletedAt: true,
  profile: {
    select: {
      firstName: true,
      lastName: true,
      displayName: true,
      avatarUrl: true,
      contactPhone: true,
      contactPhoneVerified: true,
      preferredLanguage: true,
    },
  },
} as const;

type AdminUserListRow = Prisma.UserGetPayload<{ select: typeof LIST_SELECT }>;
type AdminUserDetailRow = Prisma.UserGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

/**
 * AdminUsersService — админ-управление пользователями и ролями (TASK-130,
 * API.md §6, ADR-0041).
 *
 * Все операции доступны только ADMIN (RolesGuard в контроллере). Мутации
 * атомарны и оставляют след в `audit_logs`:
 *  - смена статуса → `ADMIN_USER_UPDATE`;
 *  - назначение/снятие роли → `ROLE_CHANGE` (`op: grant|revoke`).
 *
 * Роли — сидируемый справочник (`roles`, seed.ts), не enum: назначаемость
 * проверяется наличием строки в `roles`. GUEST не сидируется (ADR-0011) и
 * отклоняется как неизвестная роль.
 */
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `GET /api/v1/admin/users` — пагинированный список (API.md §6).
   *
   * Без `status` возвращает все статусы (включая DELETED — админ видит всё).
   * Фильтры `status`/`role` и поиск `q` (phone/email/имя профиля) комбинируются
   * через AND. Сортировка — `created_at DESC, id DESC` (детерминированный хвост).
   */
  async listUsers(
    query: ListAdminUsersQueryDto,
  ): Promise<PaginatedResponse<AdminUserListItem>> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.UserWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.role) {
      where.roles = { some: { role: { code: query.role } } };
    }
    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' } as const;
      where.OR = [
        { phone: contains },
        { email: contains },
        { profile: { firstName: contains } },
        { profile: { lastName: contains } },
        { profile: { displayName: contains } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toListItem(row)),
      meta: { page, limit, total },
    };
  }

  /** `GET /api/v1/admin/users/:id` — карточка пользователя (404 если нет). */
  async getUser(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: DETAIL_SELECT,
    });
    if (!user) {
      throw this.notFound();
    }
    return this.toDetail(user);
  }

  /**
   * `PATCH /api/v1/admin/users/:id` — смена статуса (API.md §6).
   *
   * Атомарно: `users.status` (+ `deleted_at` для DELETED, ADR-0013) и запись
   * `audit_logs(ADMIN_USER_UPDATE)`. `reason` попадает в `metadata`.
   */
  async updateStatus(
    adminId: string,
    userId: string,
    dto: UpdateAdminUserDto,
  ): Promise<AdminUserDetail> {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw this.notFound();
    }

    const reason = dto.reason ?? null;
    // Инвариант: DELETED ⇒ deleted_at установлен; иначе deleted_at очищается.
    const deletedAt = dto.status === UserStatus.DELETED ? new Date() : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { status: dto.status, deletedAt },
        select: DETAIL_SELECT,
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'ADMIN_USER_UPDATE',
          entityType: 'user',
          entityId: userId,
          metadata: {
            old_status: existing.status,
            new_status: dto.status,
            reason,
          },
        },
      });

      return user;
    });

    return this.toDetail(updated);
  }

  /**
   * `POST /api/v1/admin/users/:id/roles` — назначить роль (API.md §6).
   *
   * Атомарно: строка `user_roles` (`granted_by = adminId`) + аудит
   * `ROLE_CHANGE (op: grant)`. Ошибки: `400 VALIDATION_ERROR` (неизвестная роль,
   * напр. GUEST), `404 NOT_FOUND` (нет пользователя), `409 ROLE_ALREADY_GRANTED`.
   */
  async assignRole(
    adminId: string,
    userId: string,
    dto: AssignRoleDto,
  ): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw this.notFound();
    }

    const role = await this.resolveRole(dto.role);

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: ApiErrorCode.ROLE_ALREADY_GRANTED,
        message: `Role ${dto.role} is already granted`,
      });
    }

    await this.prisma.$transaction([
      this.prisma.userRole.create({
        data: { userId, roleId: role.id, grantedBy: adminId },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'ROLE_CHANGE',
          entityType: 'user',
          entityId: userId,
          metadata: { role: dto.role, op: 'grant' },
        },
      }),
    ]);

    return this.getUser(userId);
  }

  /**
   * `DELETE /api/v1/admin/users/:id/roles/:role` — снять роль → `204` (API.md §6).
   *
   * Атомарно: удаление `user_roles` + аудит `ROLE_CHANGE (op: revoke)`. Ошибки:
   * `400 VALIDATION_ERROR` (неизвестная роль), `404 NOT_FOUND` (нет пользователя
   * или роль не была назначена).
   */
  async removeRole(
    adminId: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw this.notFound();
    }

    const roleRecord = await this.resolveRole(role);

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: roleRecord.id } },
      select: { id: true },
    });
    if (!existing) {
      throw this.notFound(`Role ${role} is not granted to this user`);
    }

    await this.prisma.$transaction([
      this.prisma.userRole.delete({ where: { id: existing.id } }),
      this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'ROLE_CHANGE',
          entityType: 'user',
          entityId: userId,
          metadata: { role, op: 'revoke' },
        },
      }),
    ]);
  }

  /** Резолв кода роли в строку `roles`; неизвестная (напр. GUEST) → 400. */
  private async resolveRole(role: UserRole): Promise<{ id: string }> {
    const record = await this.prisma.role.findUnique({
      where: { code: role },
      select: { id: true },
    });
    if (!record) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: `Unknown role: ${role}`,
      });
    }
    return record;
  }

  private toListItem(row: AdminUserListRow): AdminUserListItem {
    return {
      id: row.id,
      phone: row.phone,
      email: row.email,
      status: row.status,
      default_language: row.defaultLanguage,
      is_phone_verified: row.isPhoneVerified,
      is_email_verified: row.isEmailVerified,
      roles: row.roles.map((r) => r.role.code),
      listings_count: row._count.listings,
      last_login_at: row.lastLoginAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
    };
  }

  private toDetail(row: AdminUserDetailRow): AdminUserDetail {
    return {
      ...this.toListItem(row),
      updated_at: row.updatedAt.toISOString(),
      deleted_at: row.deletedAt?.toISOString() ?? null,
      profile: row.profile ? toProfileResponse(row.profile) : null,
    };
  }

  private notFound(message = 'User not found'): NotFoundException {
    return new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message });
  }
}
