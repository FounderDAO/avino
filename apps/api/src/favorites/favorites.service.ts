import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingStatus, Prisma } from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { PrismaService } from '../prisma';
import {
  CursorPaginatedResponse,
  SearchListItem,
  SearchService,
} from '../search';

/** Дефолт/максимум размера страницы (API.md §4: default 20, max 100). */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Ответ `POST /api/v1/favorites` (API.md §11). Минимальный квиток добавления:
 * сама карточка листинга возвращается списком в `GET /favorites`.
 */
export interface FavoriteResponse {
  id: string;
  listing_id: string;
  created_at: string;
}

/**
 * Позиция keyset-курсора избранного: `(created_at, id)` последнего элемента
 * страницы. Порядок — по времени добавления в избранное (свежие сверху),
 * НЕ по промо-тиру листинга (в отличие от `/search`).
 */
interface FavoriteCursor {
  createdAt: string;
  id: string;
}

/**
 * FavoritesService — избранные объявления пользователя (TASK-090, API.md §11).
 *
 * Только авторизованные (`GUEST` отсекает {@link JwtAuthGuard} на контроллере).
 * Дубликат запрещён атомарно — уникальный индекс `UNIQUE (user_id, listing_id)`
 * ловится как `P2002` → `409 ALREADY_FAVORITED` (без TOCTOU-предпроверки).
 * `DELETED`-листинги не показываются в списке и не добавляются в избранное.
 *
 * Карточка листинга в списке — та же, что в `/search` (API.md §11): гидратация
 * делегируется {@link SearchService.cardsByIds}, чтобы не дублировать выбор языка
 * перевода и cover-медиа. Сортировка/keyset — по `favorites.created_at`, поэтому
 * пагинация своя (а не tier-aware курсор поиска).
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly search: SearchService,
  ) {}

  /**
   * `GET /api/v1/favorites` — избранное пользователя, свежие сверху
   * (`created_at DESC, id DESC`), keyset-пагинация. `DELETED`-листинги
   * исключены. Карточки — как в `/search` (выбор языка по `lang`/`Accept-Language`).
   */
  async list(
    user: AuthenticatedUser,
    limitParam: number | undefined,
    rawCursor: string | undefined,
    langParam?: string,
    acceptLanguage?: string,
  ): Promise<CursorPaginatedResponse<SearchListItem>> {
    const limit = Math.min(limitParam ?? DEFAULT_LIMIT, MAX_LIMIT);
    const cursor = this.decodeCursor(rawCursor);

    // DELETED-листинги исключаются relation-фильтром — keyset/total считаются уже
    // по видимым строкам (срез DELETED в JS сломал бы limit+1 и total).
    const baseWhere: Prisma.FavoriteWhereInput = {
      userId: user.id,
      listing: { status: { not: ListingStatus.DELETED } },
    };
    const pageWhere: Prisma.FavoriteWhereInput = cursor
      ? {
          ...baseWhere,
          OR: [
            { createdAt: { lt: new Date(cursor.createdAt) } },
            { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
          ],
        }
      : baseWhere;

    const [rows, total] = await Promise.all([
      this.prisma.favorite.findMany({
        where: pageWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: { id: true, listingId: true, createdAt: true },
      }),
      this.prisma.favorite.count({ where: baseWhere }),
    ]);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];

    const data = await this.search.cardsByIds(
      page.map((row) => row.listingId),
      langParam,
      acceptLanguage,
    );

    return {
      data,
      meta: {
        limit,
        total,
        next_cursor:
          hasMore && last
            ? this.encodeCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  /**
   * `POST /api/v1/favorites` — добавить листинг в избранное. Листинг должен
   * существовать и быть не-`DELETED` (иначе `404`). Повторное добавление →
   * `409 ALREADY_FAVORITED` (атомарно, по unique-индексу).
   */
  async add(
    user: AuthenticatedUser,
    listingId: string,
  ): Promise<FavoriteResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }

    try {
      const favorite = await this.prisma.favorite.create({
        data: { userId: user.id, listingId },
        select: { id: true, listingId: true, createdAt: true },
      });
      return {
        id: favorite.id,
        listing_id: favorite.listingId,
        created_at: favorite.createdAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: ApiErrorCode.ALREADY_FAVORITED,
          message: 'Listing is already in favorites',
        });
      }
      throw error;
    }
  }

  /**
   * `DELETE /api/v1/favorites/:listingId` — убрать листинг из избранного. Если
   * его там нет → `404` (нечего удалять). Удаление идёт по `(user_id, listing_id)`,
   * поэтому удалить чужое избранное нельзя.
   */
  async remove(user: AuthenticatedUser, listingId: string): Promise<void> {
    const { count } = await this.prisma.favorite.deleteMany({
      where: { userId: user.id, listingId },
    });
    if (count === 0) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Favorite not found',
      });
    }
  }

  /** Непрозрачный keyset-токен (base64url JSON позиции). */
  private encodeCursor(cursor: FavoriteCursor): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  /**
   * Разбор keyset-токена. Невалидный/повреждённый `cursor` → `400` (не молчаливый
   * сброс к первой странице, чтобы клиент заметил ошибку пагинации).
   */
  private decodeCursor(raw: string | undefined): FavoriteCursor | null {
    if (raw === undefined) {
      return null;
    }
    try {
      const json = Buffer.from(raw, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as Partial<FavoriteCursor>;
      if (
        typeof parsed.createdAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        Number.isNaN(new Date(parsed.createdAt).getTime())
      ) {
        throw new Error('malformed cursor');
      }
      return { createdAt: parsed.createdAt, id: parsed.id };
    } catch {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'Invalid pagination cursor',
      });
    }
  }
}
