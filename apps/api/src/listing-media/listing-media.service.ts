import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ListingStatus, MediaType, Prisma } from '@prisma/client';
import { UserRole } from '@avino/shared';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { AuthenticatedUser } from '../common/guards';
import { PrismaService } from '../prisma';
import { UploadsService } from '../uploads';

/**
 * Загруженный proxy-файл (multipart), минимальный контракт. Тип объявлен здесь, а
 * не через `Express.Multer.File`, чтобы не тянуть `@types/multer` в зависимости —
 * `FileInterceptor` (memory storage) кладёт именно эти поля.
 */
export interface UploadedImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/**
 * Один медиа-объект в ответах media-эндпоинтов (API.md §8). Совпадает по форме с
 * media внутри карточки листинга (TASK-051): файл лежит в S3 — в БД/ответе только
 * URL и метаданные показа.
 */
export interface ListingMediaResponse {
  id: string;
  url: string;
  thumbnail_url: string | null;
  sort_order: number;
  type: MediaType;
}

const MEDIA_SELECT = {
  id: true,
  url: true,
  thumbnailUrl: true,
  sortOrder: true,
  type: true,
} as const;

type ListingMediaRow = Prisma.ListingMediaGetPayload<{
  select: typeof MEDIA_SELECT;
}>;

/**
 * Allow-list MIME → расширение ключа S3 (MVP: только изображения; VIDEO — Phase 2,
 * DB_SCHEMA §6 / API.md §8). Ключ allow-list'а одновременно служит валидатором
 * content-type загружаемого файла.
 */
const ALLOWED_IMAGE_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/** Максимальный размер одного файла (proxy-загрузка) — 10 MiB. */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Максимум медиа на одно объявление. */
const MAX_MEDIA_PER_LISTING = 20;

/**
 * Роли, которые могут изменять медиа ЧУЖОГО объявления наравне с владельцем
 * (acceptance TASK-061: «Only owner/admin can modify media»). MODERATOR правит
 * статус листинга, но не его контент — поэтому только ADMIN.
 */
const MEDIA_MODIFY_ROLES: readonly UserRole[] = [UserRole.ADMIN];

/** Роли, видящие медиа непубличного (не-ACTIVE) листинга наравне с владельцем. */
const PRIVILEGED_VIEW_ROLES: readonly UserRole[] = [
  UserRole.MODERATOR,
  UserRole.ADMIN,
];

/**
 * ListingMediaService — управление галереей объявления (TASK-061, API.md §8).
 *
 * Эндпоинты: proxy-загрузка (multipart), список, удаление, переупорядочивание.
 * Файлы хранятся ТОЛЬКО в S3 (UploadsService, TASK-060) — в `listing_media` лишь
 * URL и метаданные. DB-запись — source of truth; осиротевшие S3-объекты подчищает
 * cleanup-джоба (API.md §8).
 *
 * EXIF/GPS-стриппинг и генерация `thumbnail_url`/web-варианта здесь НЕ делаются:
 * это задача воркера `media_processing_queue` (`process_uploaded_image`,
 * ARCHITECTURE §14, DB_SCHEMA §6). До его внедрения `thumbnail_url` = null, а
 * координаты объявления берутся только с карты, никогда из EXIF фото. TODO(M6):
 * подключить media_processing_queue для EXIF-strip + thumbnail.
 */
@Injectable()
export class ListingMediaService {
  private readonly logger = new Logger(ListingMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  /**
   * `GET /api/v1/listings/:id/media` — список медиа листинга по `sort_order`.
   * Видимость зеркалит карточку листинга: ACTIVE — публично; непубличные статусы —
   * только владелец/MODERATOR/ADMIN; DELETED/отсутствующий — `404`.
   */
  async list(
    listingId: string,
    viewer: AuthenticatedUser | undefined,
  ): Promise<ListingMediaResponse[]> {
    await this.assertCanView(listingId, viewer);
    return this.listMedia(listingId);
  }

  /**
   * `POST /api/v1/listings/:id/media` — proxy-загрузка изображения (multipart).
   * Только владелец/ADMIN. Валидирует MIME (allow-list) и размер, проверяет лимит
   * медиа, грузит в S3 и создаёт запись `listing_media` (в конец галереи).
   */
  async uploadFile(
    listingId: string,
    user: AuthenticatedUser,
    file: UploadedImageFile | undefined,
  ): Promise<ListingMediaResponse> {
    await this.assertCanModify(listingId, user);

    if (!file) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'File is required (multipart field "file")',
      });
    }

    const extension = ALLOWED_IMAGE_MIME[file.mimetype];
    if (!extension) {
      throw new UnsupportedMediaTypeException({
        code: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
        message: 'Allowed types: image/jpeg, image/png, image/webp',
      });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new PayloadTooLargeException({
        code: ApiErrorCode.FILE_TOO_LARGE,
        message: `File exceeds the ${MAX_FILE_SIZE_BYTES} byte limit`,
      });
    }

    const count = await this.prisma.listingMedia.count({ where: { listingId } });
    if (count >= MAX_MEDIA_PER_LISTING) {
      throw new UnprocessableEntityException({
        code: ApiErrorCode.MEDIA_LIMIT_EXCEEDED,
        message: `A listing may have at most ${MAX_MEDIA_PER_LISTING} media`,
      });
    }

    const { url } = await this.uploads.upload({
      buffer: file.buffer,
      contentType: file.mimetype,
      prefix: `listings/${listingId}/media`,
      extension,
    });

    const media = await this.prisma.listingMedia.create({
      data: {
        listingId,
        url,
        sortOrder: count,
        type: MediaType.IMAGE,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      },
      select: MEDIA_SELECT,
    });
    return this.toResponse(media);
  }

  /**
   * `DELETE /api/v1/listings/:id/media/:mediaId` — удалить медиа. Только
   * владелец/ADMIN. Сначала удаляется DB-запись (source of truth), затем
   * best-effort S3-объект; ошибка S3 не валит запрос — осиротевший файл подчистит
   * cleanup-джоба (API.md §8).
   */
  async remove(
    listingId: string,
    user: AuthenticatedUser,
    mediaId: string,
  ): Promise<void> {
    await this.assertCanModify(listingId, user);

    const media = await this.prisma.listingMedia.findFirst({
      where: { id: mediaId, listingId },
      select: { id: true, url: true },
    });
    if (!media) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Media not found',
      });
    }

    await this.prisma.listingMedia.delete({ where: { id: media.id } });

    try {
      await this.uploads.delete(this.uploads.extractKey(media.url));
    } catch (error) {
      // DB-запись — source of truth; S3-объект осиротел, его уберёт cleanup-джоба.
      this.logger.warn(
        `Failed to delete S3 object for media ${media.id}: ${String(error)}`,
      );
    }
  }

  /**
   * `PATCH /api/v1/listings/:id/media/reorder` — переупорядочить галерею. Только
   * владелец/ADMIN. `order` обязан быть полной перестановкой id медиа листинга
   * (каждый id ровно один раз) — иначе `400 VALIDATION_ERROR`. Позиция в массиве
   * становится `sort_order`; апдейты атомарны (одна транзакция).
   */
  async reorder(
    listingId: string,
    user: AuthenticatedUser,
    order: string[],
  ): Promise<ListingMediaResponse[]> {
    await this.assertCanModify(listingId, user);

    const existing = await this.prisma.listingMedia.findMany({
      where: { listingId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((m) => m.id));
    const uniqueOrder = new Set(order);
    const isPermutation =
      order.length === existing.length &&
      uniqueOrder.size === order.length &&
      order.every((id) => existingIds.has(id));
    if (!isPermutation) {
      throw new BadRequestException({
        code: ApiErrorCode.VALIDATION_ERROR,
        message: 'order must list every media id of this listing exactly once',
      });
    }

    await this.prisma.$transaction(
      order.map((id, index) =>
        this.prisma.listingMedia.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.listMedia(listingId);
  }

  /** Медиа листинга, упорядоченные по `sort_order` (snake_case ответ). */
  private async listMedia(listingId: string): Promise<ListingMediaResponse[]> {
    const rows = await this.prisma.listingMedia.findMany({
      where: { listingId },
      select: MEDIA_SELECT,
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  /**
   * Гейт модификации: листинг существует и не DELETED, а пользователь — владелец
   * либо роль из {@link MEDIA_MODIFY_ROLES}. Отсутствующий/DELETED → `404`; чужой
   * без права → `403`.
   */
  private async assertCanModify(
    listingId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const listing = await this.findActiveListing(listingId);
    if (listing.ownerId === user.id) {
      return;
    }
    if (user.roles.some((role) => MEDIA_MODIFY_ROLES.includes(role))) {
      return;
    }
    throw new ForbiddenException({
      code: ApiErrorCode.FORBIDDEN,
      message: 'You can only modify media of your own listing',
    });
  }

  /**
   * Гейт просмотра: ACTIVE — всем; непубличные статусы — владельцу и
   * {@link PRIVILEGED_VIEW_ROLES}. Чтобы не раскрывать существование скрытого
   * листинга, недоступный для зрителя ресурс тоже отдаёт `404`.
   */
  private async assertCanView(
    listingId: string,
    viewer: AuthenticatedUser | undefined,
  ): Promise<void> {
    const listing = await this.findActiveListing(listingId);
    if (listing.status === ListingStatus.ACTIVE) {
      return;
    }
    if (viewer && viewer.id === listing.ownerId) {
      return;
    }
    if (
      viewer &&
      viewer.roles.some((role) => PRIVILEGED_VIEW_ROLES.includes(role))
    ) {
      return;
    }
    throw this.notFound();
  }

  /** Загрузить листинг (id/owner/status), исключая DELETED (для всех → `404`). */
  private async findActiveListing(
    listingId: string,
  ): Promise<{ ownerId: string; status: ListingStatus }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true, status: true },
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw this.notFound();
    }
    return listing;
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: ApiErrorCode.NOT_FOUND,
      message: 'Listing not found',
    });
  }

  private toResponse(media: ListingMediaRow): ListingMediaResponse {
    return {
      id: media.id,
      url: media.url,
      thumbnail_url: media.thumbnailUrl,
      sort_order: media.sortOrder,
      type: media.type,
    };
  }
}
