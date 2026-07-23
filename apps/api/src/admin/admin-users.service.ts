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
 * Способ последней авторизации пользователя (колонка «Вход» админ-списка).
 * Нигде не хранится на `users` (беспарольная OTP-модель, ADR-0010) — источник
 * истины только `audit_logs(action='LOGIN')`: OAuth-провайдеры пишут
 * `metadata.provider` (GOOGLE/APPLE), OTP-вход — `metadata.channel` (SMS/EMAIL).
 */
export type AuthType = 'GOOGLE' | 'APPLE' | 'SMS' | 'EMAIL';

/**
 * Метаданные LOGIN-аудита → {@link AuthType}. `null`, если запись без
 * узнаваемого поля (старый формат/системное действие).
 */
function authTypeFromLoginMetadata(
  metadata: Prisma.JsonValue | null,
): AuthType | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const meta = metadata as Record<string, unknown>;
  if (meta.provider === 'GOOGLE' || meta.provider === 'APPLE') {
    return meta.provider;
  }
  if (meta.channel === 'SMS' || meta.channel === 'EMAIL') {
    return meta.channel;
  }
  return null;
}

/**
 * Достать `archived_listing_ids` из `metadata` последней BLOCKED-записи аудита.
 * Возвращает только строковые id; отсутствие/битый формат → `[]` (разблокировка
 * тогда просто ничего не восстанавливает).
 */
function readArchivedListingIds(metadata: Prisma.JsonValue | null): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }
  const raw = (metadata as Record<string, unknown>).archived_listing_ids;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((id): id is string => typeof id === 'string');
}

/**
 * Пользователь в админ-списке (snake_case контракт, API.md §6). Базовые поля
 * `users/me` ({@link UserMeResponse}) + таймстемпы, плоские поля имени из
 * профиля (для колонки «Имя» без отдельного запроса карточки) и `auth_type`
 * (способ последнего входа, из аудита). Полного объекта `profile` в списке нет.
 */
export interface AdminUserListItem {
  id: string;
  phone: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  /** Способ последнего входа (из `audit_logs`); `null` — входов ещё не было. */
  auth_type: AuthType | null;
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
  // Имя из профиля для колонки «Имя» списка (плоские поля, не полный profile).
  profile: {
    select: { firstName: true, lastName: true, displayName: true },
  },
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

    const authTypes = await this.resolveAuthTypes(rows.map((r) => r.id));

    return {
      data: rows.map((row) =>
        this.toListItem(row, authTypes.get(row.id) ?? null),
      ),
      meta: { page, limit, total },
    };
  }

  /**
   * Способ последнего входа для набора пользователей — одним запросом
   * `DISTINCT ON (actor_id)` по свежайшей LOGIN-записи аудита. Пустой набор id →
   * пустая карта (без запроса). Пользователи без LOGIN-аудита в карту не
   * попадают → `auth_type = null`.
   */
  private async resolveAuthTypes(
    userIds: string[],
  ): Promise<Map<string, AuthType>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { actor_id: string; metadata: Prisma.JsonValue }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (actor_id) actor_id, metadata
      FROM audit_logs
      WHERE action = 'LOGIN'
        AND actor_id = ANY(ARRAY[${Prisma.join(userIds)}]::uuid[])
      ORDER BY actor_id, created_at DESC
    `);
    const map = new Map<string, AuthType>();
    for (const row of rows) {
      const authType = authTypeFromLoginMetadata(row.metadata);
      if (authType) map.set(row.actor_id, authType);
    }
    return map;
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
    const authTypes = await this.resolveAuthTypes([userId]);
    return this.toDetail(user, authTypes.get(userId) ?? null);
  }

  /**
   * `PATCH /api/v1/admin/users/:id` — смена статуса (API.md §6, ADR-0013).
   *
   * Ветвление по целевому статусу, всё атомарно в одной `$transaction`:
   *  - **BLOCKED** — прячем ACTIVE-объявления владельца (`→ ARCHIVED`, id пишем
   *    в `metadata.archived_listing_ids` для обратимости) и отзываем все активные
   *    refresh-токены (kick out); вход уже блокирует `auth.service`.
   *  - **ACTIVE** (разблокировка) — возвращаем в `ACTIVE` только те объявления,
   *    что мы сами спрятали и что всё ещё `ARCHIVED` (то, что владелец
   *    заархивировал за время блокировки, не трогаем); id берём из последней
   *    BLOCKED-записи аудита.
   *  - **DELETED** — паритет с self-service (`UsersService.deleteMe`): все
   *    объявления владельца `→ DELETED`, refresh-токены отозваны.
   *
   * `deleted_at` следует инварианту «DELETED ⇒ установлен; иначе очищается».
   * `reason` (для block/delete) попадает в `metadata`. Каждая ветка пишет
   * `audit_logs(ADMIN_USER_UPDATE)` с обогащённым `metadata`.
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
    const oldStatus = existing.status;

    const updated = await this.prisma.$transaction((tx) => {
      switch (dto.status) {
        case UserStatus.BLOCKED:
          return this.applyBlock(tx, adminId, userId, oldStatus, reason);
        case UserStatus.DELETED:
          return this.applyDelete(tx, adminId, userId, oldStatus, reason);
        case UserStatus.ACTIVE:
        default:
          return this.applyUnblock(tx, adminId, userId, oldStatus);
      }
    });

    const authTypes = await this.resolveAuthTypes([userId]);
    return this.toDetail(updated, authTypes.get(userId) ?? null);
  }

  /**
   * Блокировка: ACTIVE-объявления → ARCHIVED (id в аудит), активные
   * refresh-токены отозваны, `deleted_at` очищен.
   */
  private async applyBlock(
    tx: Prisma.TransactionClient,
    adminId: string,
    userId: string,
    oldStatus: UserStatus,
    reason: string | null,
  ): Promise<AdminUserDetailRow> {
    const active = await tx.listing.findMany({
      where: { ownerId: userId, status: ListingStatus.ACTIVE },
      select: { id: true },
    });
    const archivedListingIds = active.map((l) => l.id);

    const user = await tx.user.update({
      where: { id: userId },
      data: { status: UserStatus.BLOCKED, deletedAt: null },
      select: DETAIL_SELECT,
    });

    await tx.listing.updateMany({
      where: { ownerId: userId, status: ListingStatus.ACTIVE },
      data: { status: ListingStatus.ARCHIVED },
    });

    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ADMIN_USER_UPDATE',
        entityType: 'user',
        entityId: userId,
        metadata: {
          old_status: oldStatus,
          new_status: UserStatus.BLOCKED,
          reason,
          archived_listing_ids: archivedListingIds,
        },
      },
    });

    return user;
  }

  /**
   * Разблокировка: возврат в ACTIVE только тех id, что прятали при блокировке и
   * что всё ещё ARCHIVED. id — из последней BLOCKED-записи аудита; если её нет
   * или список пуст, объявления не трогаем.
   */
  private async applyUnblock(
    tx: Prisma.TransactionClient,
    adminId: string,
    userId: string,
    oldStatus: UserStatus,
  ): Promise<AdminUserDetailRow> {
    const lastBlock = await tx.auditLog.findFirst({
      where: {
        action: 'ADMIN_USER_UPDATE',
        entityId: userId,
        metadata: { path: ['new_status'], equals: UserStatus.BLOCKED },
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const restoredListingIds = readArchivedListingIds(
      lastBlock?.metadata ?? null,
    );

    const user = await tx.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE, deletedAt: null },
      select: DETAIL_SELECT,
    });

    if (restoredListingIds.length > 0) {
      await tx.listing.updateMany({
        where: {
          id: { in: restoredListingIds },
          ownerId: userId,
          status: ListingStatus.ARCHIVED,
        },
        data: { status: ListingStatus.ACTIVE },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ADMIN_USER_UPDATE',
        entityType: 'user',
        entityId: userId,
        metadata: {
          old_status: oldStatus,
          new_status: UserStatus.ACTIVE,
          restored_listing_ids: restoredListingIds,
        },
      },
    });

    return user;
  }

  /**
   * Удаление (паритет с {@link UsersService.deleteMe}): все объявления владельца
   * → DELETED, активные refresh-токены отозваны, `deleted_at` установлен.
   */
  private async applyDelete(
    tx: Prisma.TransactionClient,
    adminId: string,
    userId: string,
    oldStatus: UserStatus,
    reason: string | null,
  ): Promise<AdminUserDetailRow> {
    const user = await tx.user.update({
      where: { id: userId },
      data: { status: UserStatus.DELETED, deletedAt: new Date() },
      select: DETAIL_SELECT,
    });

    await tx.listing.updateMany({
      where: { ownerId: userId, status: { not: ListingStatus.DELETED } },
      data: { status: ListingStatus.DELETED },
    });

    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: adminId,
        action: 'ADMIN_USER_UPDATE',
        entityType: 'user',
        entityId: userId,
        metadata: {
          old_status: oldStatus,
          new_status: UserStatus.DELETED,
          reason,
        },
      },
    });

    return user;
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

  private toListItem(
    row: AdminUserListRow,
    authType: AuthType | null,
  ): AdminUserListItem {
    return {
      id: row.id,
      phone: row.phone,
      email: row.email,
      first_name: row.profile?.firstName ?? null,
      last_name: row.profile?.lastName ?? null,
      display_name: row.profile?.displayName ?? null,
      auth_type: authType,
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

  private toDetail(
    row: AdminUserDetailRow,
    authType: AuthType | null,
  ): AdminUserDetail {
    return {
      ...this.toListItem(row, authType),
      updated_at: row.updatedAt.toISOString(),
      deleted_at: row.deletedAt?.toISOString() ?? null,
      profile: row.profile ? toProfileResponse(row.profile) : null,
    };
  }

  private notFound(message = 'User not found'): NotFoundException {
    return new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message });
  }
}
