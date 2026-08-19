import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';
import { resolveAvatarUrl } from '../users/avatar-url.util';
import { profileName } from '../users/profile-name.util';

/** Ответ `POST /api/v1/blocks` — минимальный квиток блокировки. */
export interface BlockResponse {
  id: string;
  user_id: string;
  created_at: string;
}

/** Элемент `GET /api/v1/blocks` — заблокированный пользователь. */
export interface BlockedUserItem {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  blocked_at: string;
}

export interface BlockListResponse {
  data: BlockedUserItem[];
}

/**
 * BlocksService — блокировка пользователей (Apple Guideline 1.2, спека
 * 2026-08-19). Блок скрывает объявления blocked из выдачи/карты
 * (SearchService.buildWhereSql), его тред из списка чатов и запрещает
 * сообщения в обе стороны (ChatService). Только авторизованные (`GUEST`
 * отсекает JwtAuthGuard на контроллере). Повторный блок идемпотентен —
 * unique `(blocker_id, blocked_id)` ловится как P2002 и возвращается
 * существующая строка (без TOCTOU-предпроверки, как favorites).
 */
@Injectable()
export class BlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * `POST /api/v1/blocks` — заблокировать пользователя. Self-block → 400,
   * несуществующий/DELETED → 404, повтор → идемпотентно существующий блок.
   */
  async add(
    user: AuthenticatedUser,
    blockedId: string,
  ): Promise<BlockResponse> {
    if (blockedId === user.id) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Cannot block yourself',
      });
    }
    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { status: true },
    });
    if (!target || target.status === UserStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'User not found',
      });
    }

    try {
      const block = await this.prisma.userBlock.create({
        data: { blockerId: user.id, blockedId },
        select: { id: true, blockedId: true, createdAt: true },
      });
      return this.toResponse(block);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.userBlock.findUnique({
          where: {
            blockerId_blockedId: { blockerId: user.id, blockedId },
          },
          select: { id: true, blockedId: true, createdAt: true },
        });
        if (existing) {
          return this.toResponse(existing);
        }
      }
      throw error;
    }
  }

  /**
   * `DELETE /api/v1/blocks/:userId` — разблокировать. Идемпотентно: отсутствие
   * блока — не ошибка (в отличие от favorites.remove), клиенту важен итог.
   */
  async remove(user: AuthenticatedUser, blockedId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: user.id, blockedId },
    });
  }

  /**
   * `GET /api/v1/blocks` — список заблокированных, свежие сверху. Без
   * пагинации: блок-лист короткий. Имя/аватар — как counterparty в чате
   * (displayName → firstName lastName; avatarStorageKey → подписанная ссылка).
   */
  async list(user: AuthenticatedUser): Promise<BlockListResponse> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: user.id },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        createdAt: true,
        blocked: {
          select: {
            id: true,
            profile: {
              select: {
                displayName: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                avatarStorageKey: true,
              },
            },
          },
        },
      },
    });

    const data = await Promise.all(
      rows.map(
        async (row): Promise<BlockedUserItem> => ({
          user_id: row.blocked.id,
          name: profileName(row.blocked.profile),
          avatar_url: await resolveAvatarUrl(
            this.uploads,
            row.blocked.profile?.avatarStorageKey,
            row.blocked.profile?.avatarUrl,
          ),
          blocked_at: row.createdAt.toISOString(),
        }),
      ),
    );
    return { data };
  }

  private toResponse(block: {
    id: string;
    blockedId: string;
    createdAt: Date;
  }): BlockResponse {
    return {
      id: block.id,
      user_id: block.blockedId,
      created_at: block.createdAt.toISOString(),
    };
  }
}
