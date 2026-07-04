import {
  ConflictException, ForbiddenException, HttpException, HttpStatus,
  Injectable, NotFoundException,
} from '@nestjs/common';
import { ListingStatus, Prisma, TourRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { TranslationsService } from '../translations';
import { UploadsService } from '../uploads';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { TourWindow, windowOffered } from '../listings/tour-window';
import { CreateTourRequestDto } from './dto/create-tour-request.dto';
import { TourRequestAction } from './dto/tour-request-status.dto';

const TOUR_HORIZON_DAYS = 30;

const TOUR_REQUEST_SELECT = {
  id: true, listingId: true, requesterId: true, status: true, requestedDate: true,
  windowStart: true, windowEnd: true, requesterName: true, requesterPhone: true,
  message: true, createdAt: true,
} satisfies Prisma.TourRequestSelect;

type TourRequestRow = Prisma.TourRequestGetPayload<{ select: typeof TOUR_REQUEST_SELECT }>;

// Строка списка: заявка + контекст объявления (title по языку ответа, первое фото,
// владелец для outgoing) — spec 2026-07-04-tour-agenda-design.
const TOUR_LIST_SELECT = {
  ...TOUR_REQUEST_SELECT,
  listing: {
    select: {
      id: true,
      originalLanguage: true,
      translations: { select: { language: true, title: true } },
      media: {
        select: { url: true, storageKey: true },
        orderBy: { sortOrder: Prisma.SortOrder.asc },
        take: 1,
      },
      owner: {
        select: {
          phone: true,
          profile: {
            select: { displayName: true, firstName: true, lastName: true, contactPhone: true },
          },
        },
      },
    },
  },
} satisfies Prisma.TourRequestSelect;

type TourListRow = Prisma.TourRequestGetPayload<{ select: typeof TOUR_LIST_SELECT }>;

export interface TourRequestResponse {
  id: string;
  listing_id: string;
  requester_id: string;
  status: TourRequestStatus;
  requested_date: string;
  window_start: string;
  window_end: string;
  requester_name: string;
  requester_phone: string;
  message: string | null;
  created_at: string;
}

export interface TourRequestListResponse {
  data: TourRequestListItem[];
  meta: { limit: number; total: number; next_cursor: string | null };
}

export interface TourRequestListQuery {
  limit?: number;
  cursor?: string;
  status?: TourRequestStatus;
  upcoming?: boolean;
}

/** Контекст объявления в списках туров (spec 2026-07-04). */
export interface TourRequestListingBlock {
  id: string;
  title: string;
  photo_url: string | null;
}

/** «Кто принимает» для outgoing-списка; телефон — только после CONFIRMED. */
export interface TourRequestOwnerBlock {
  name: string | null;
  phone: string | null;
}

export interface TourRequestListItem extends TourRequestResponse {
  listing: TourRequestListingBlock;
  owner?: TourRequestOwnerBlock;
}

/** Занятый слот тура для UI (без личных данных заявителя, spec 2026-07-02). */
export interface TakenSlot {
  requested_date: string;
  window_start: string;
  window_end: string;
}

export interface TakenSlotsResponse {
  data: TakenSlot[];
}

@Injectable()
export class TourRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly translations: TranslationsService,
    private readonly uploads: UploadsService,
  ) {}

  /** UTC-полночь текущего дня — нижняя граница «сегодня» всего тур-домена. */
  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  async create(requesterId: string, dto: CreateTourRequestDto): Promise<TourRequestResponse> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: dto.listing_id, status: { not: ListingStatus.DELETED } },
      select: { id: true, ownerId: true, status: true, toursEnabled: true, tourWindows: true },
    });
    if (!listing) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Listing not found' });
    }
    if (listing.status !== ListingStatus.ACTIVE || !listing.toursEnabled) {
      throw new ConflictException({ code: ApiErrorCode.LISTING_NOT_AVAILABLE, message: 'Listing is not available for tours' });
    }
    if (listing.ownerId === requesterId) {
      throw new ForbiddenException({ code: ApiErrorCode.FORBIDDEN, message: 'You cannot request a tour for your own listing' });
    }
    const windows = (listing.tourWindows as unknown as TourWindow[]) ?? [];
    if (!windowOffered(windows, dto.window_start, dto.window_end)) {
      throw new HttpException(
        { code: ApiErrorCode.VALIDATION_ERROR, message: 'Selected window is not offered for this listing' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const requestedDate = this.parseRequestedDate(dto.requested_date);

    // Слот эксклюзивен: любая активная (PENDING/CONFIRMED) заявка блокирует его
    // (spec 2026-07-02). Своя заявка — прежний TOUR_REQUEST_DUPLICATE, чужая —
    // TOUR_SLOT_TAKEN. Гонка двух create ловится ниже по P2002 на
    // tour_requests_active_slot_key.
    const active = await this.prisma.tourRequest.findFirst({
      where: {
        listingId: listing.id, requestedDate,
        windowStart: dto.window_start, windowEnd: dto.window_end,
        status: { in: [TourRequestStatus.PENDING, TourRequestStatus.CONFIRMED] },
      },
      select: { requesterId: true },
    });
    if (active) {
      if (active.requesterId === requesterId) {
        throw new ConflictException({ code: ApiErrorCode.TOUR_REQUEST_DUPLICATE, message: 'A pending tour request for this slot already exists' });
      }
      throw new ConflictException({ code: ApiErrorCode.TOUR_SLOT_TAKEN, message: 'This tour slot is already taken' });
    }

    let created: TourRequestRow;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const tr = await tx.tourRequest.create({
          data: {
            listingId: listing.id, requesterId, requestedDate,
            windowStart: dto.window_start, windowEnd: dto.window_end,
            requesterName: dto.requester_name, requesterPhone: dto.requester_phone,
            message: dto.message ?? null,
          },
          select: TOUR_REQUEST_SELECT,
        });
        await this.notifications.queueTourRequest(tx, listing.ownerId, {
          tourRequestId: tr.id, listingId: listing.id,
          requestedDate: dto.requested_date, windowStart: dto.window_start, windowEnd: dto.window_end,
        });
        return tr;
      });
    } catch (error) {
      // Гонка: двое прошли проверку одновременно — unique-индекс
      // tour_requests_active_slot_key отдаёт P2002 (в транзакции единственный
      // insert с unique-ограничением — tourRequest.create).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: ApiErrorCode.TOUR_SLOT_TAKEN, message: 'This tour slot is already taken' });
      }
      throw error;
    }
    return this.toResponse(created);
  }

  /**
   * `GET /tour-requests/taken` — активные (PENDING/CONFIRMED) слоты листинга на
   * ближайшие TOUR_HORIZON_DAYS дней. PENDING и CONFIRMED снаружи неразличимы
   * (оба «занято»); личные данные заявителей не отдаются.
   */
  async listTakenSlots(listingId: string): Promise<TakenSlotsResponse> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      select: { id: true },
    });
    if (!listing) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Listing not found' });
    }
    const today = this.todayUtc();
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + TOUR_HORIZON_DAYS);
    const rows = await this.prisma.tourRequest.findMany({
      where: {
        listingId,
        status: { in: [TourRequestStatus.PENDING, TourRequestStatus.CONFIRMED] },
        requestedDate: { gte: today, lte: horizon },
      },
      orderBy: [{ requestedDate: 'asc' }, { windowStart: 'asc' }],
      select: { requestedDate: true, windowStart: true, windowEnd: true },
    });
    return {
      data: rows.map((r) => ({
        requested_date: r.requestedDate.toISOString().slice(0, 10),
        window_start: r.windowStart,
        window_end: r.windowEnd,
      })),
    };
  }

  async setStatus(userId: string, id: string, action: TourRequestAction): Promise<TourRequestResponse> {
    const tr = await this.prisma.tourRequest.findUnique({
      where: { id },
      select: { id: true, requesterId: true, status: true, listing: { select: { ownerId: true } } },
    });
    if (!tr) {
      throw new NotFoundException({ code: ApiErrorCode.NOT_FOUND, message: 'Tour request not found' });
    }
    const isOwner = tr.listing.ownerId === userId;
    const isRequester = tr.requesterId === userId;

    let nextStatus: TourRequestStatus;
    let notifyUserId: string;

    if (action === TourRequestAction.CONFIRM || action === TourRequestAction.DECLINE) {
      if (!isOwner) {
        throw new ForbiddenException({ code: ApiErrorCode.FORBIDDEN, message: 'Only the listing owner can confirm or decline' });
      }
      if (tr.status !== TourRequestStatus.PENDING) throw this.invalidTransition(action, tr.status);
      nextStatus = action === TourRequestAction.CONFIRM ? TourRequestStatus.CONFIRMED : TourRequestStatus.DECLINED;
      notifyUserId = tr.requesterId;
    } else {
      // CANCEL
      if (!isRequester) {
        throw new ForbiddenException({ code: ApiErrorCode.FORBIDDEN, message: 'Only the requester can cancel' });
      }
      if (tr.status !== TourRequestStatus.PENDING && tr.status !== TourRequestStatus.CONFIRMED) {
        throw this.invalidTransition(action, tr.status);
      }
      nextStatus = TourRequestStatus.CANCELLED;
      notifyUserId = tr.listing.ownerId;
    }

    let updated: TourRequestRow;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.tourRequest.update({ where: { id }, data: { status: nextStatus }, select: TOUR_REQUEST_SELECT });
        await this.notifications.queueTourStatusChanged(tx, notifyUserId, {
          tourRequestId: u.id, listingId: u.listingId, status: nextStatus,
        });
        return u;
      });
    } catch (error) {
      // CONFIRM возвращает строку в предикат tour_requests_active_slot_key;
      // если слот успела занять другая активная заявка — P2002 → 409.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: ApiErrorCode.TOUR_SLOT_TAKEN, message: 'This tour slot is already taken' });
      }
      throw error;
    }
    return this.toResponse(updated);
  }

  async listOutgoing(
    userId: string,
    query: TourRequestListQuery,
    acceptLanguage?: string,
  ): Promise<TourRequestListResponse> {
    return this.listBy({ requesterId: userId }, query, acceptLanguage, true);
  }

  async listIncoming(
    userId: string,
    query: TourRequestListQuery,
    acceptLanguage?: string,
  ): Promise<TourRequestListResponse> {
    return this.listBy({ listing: { ownerId: userId } }, query, acceptLanguage, false);
  }

  private async listBy(
    base: Prisma.TourRequestWhereInput,
    query: TourRequestListQuery,
    acceptLanguage: string | undefined,
    includeOwner: boolean,
  ): Promise<TourRequestListResponse> {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const filters: Prisma.TourRequestWhereInput[] = [base];
    if (query.status) filters.push({ status: query.status });
    if (query.upcoming) filters.push({ requestedDate: { gte: this.todayUtc() } });
    const where: Prisma.TourRequestWhereInput =
      filters.length > 1 ? { AND: filters } : base;

    if (query.upcoming) {
      // Агенда: сортировка по дате тура; keyset-cursor не поддерживается —
      // предстоящих туров мало, отдаём первые `limit` (spec 2026-07-04).
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.tourRequest.findMany({
          where,
          orderBy: [{ requestedDate: 'asc' }, { windowStart: 'asc' }, { id: 'asc' }],
          take: limit,
          select: TOUR_LIST_SELECT,
        }),
        this.prisma.tourRequest.count({ where }),
      ]);
      return {
        data: await this.toListItems(rows, acceptLanguage, includeOwner),
        meta: { limit, total, next_cursor: null },
      };
    }

    const cursor = this.decodeCursor(query.cursor);
    const cursorWhere: Prisma.TourRequestWhereInput | undefined = cursor
      ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] }
      : undefined;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tourRequest.findMany({
        where: cursorWhere ? { AND: [where, cursorWhere] } : where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        select: TOUR_LIST_SELECT,
      }),
      this.prisma.tourRequest.count({ where }),
    ]);
    const last = rows.length === limit ? rows[rows.length - 1] : null;
    const next = last ? this.encodeCursor(last.createdAt.toISOString(), last.id) : null;
    return {
      data: await this.toListItems(rows, acceptLanguage, includeOwner),
      meta: { limit, total, next_cursor: next },
    };
  }

  private parseRequestedDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    const today = this.todayUtc();
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + TOUR_HORIZON_DAYS);
    if (Number.isNaN(date.getTime()) || date < today || date > horizon) {
      throw new HttpException(
        { code: ApiErrorCode.VALIDATION_ERROR, message: `requested_date must be today or within ${TOUR_HORIZON_DAYS} days` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return date;
  }

  private invalidTransition(action: TourRequestAction, status: TourRequestStatus): HttpException {
    return new HttpException(
      { code: ApiErrorCode.INVALID_STATUS_TRANSITION, message: `Cannot ${action} a tour request in status ${status}` },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private encodeCursor(createdAt: string, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor?: string): { createdAt: string; id: string } | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Обогащённые элементы списка: title по языку ответа + свежий photo_url (ADR-0086). */
  private async toListItems(
    rows: TourListRow[],
    acceptLanguage: string | undefined,
    includeOwner: boolean,
  ): Promise<TourRequestListItem[]> {
    return Promise.all(
      rows.map(async (row) => {
        const language = this.translations.resolveLanguage(
          row.listing.translations,
          row.listing.originalLanguage,
          undefined,
          acceptLanguage,
        );
        const translation = row.listing.translations.find((t) => t.language === language);
        const photo = row.listing.media[0];
        const item: TourRequestListItem = {
          ...this.toResponse(row),
          listing: {
            id: row.listing.id,
            title: translation?.title ?? '',
            photo_url: photo
              ? await this.uploads.resolveMediaUrl(photo.storageKey, photo.url)
              : null,
          },
        };
        if (includeOwner) {
          item.owner = this.buildOwnerBlock(row.listing.owner, row.status);
        }
        return item;
      }),
    );
  }

  /** Имя — как в ContactBlock листинга (displayName → first+last); телефон только после CONFIRMED. */
  private buildOwnerBlock(
    owner: TourListRow['listing']['owner'],
    status: TourRequestStatus,
  ): TourRequestOwnerBlock {
    const profile = owner.profile;
    const fullName = [profile?.firstName, profile?.lastName]
      .filter((part): part is string => Boolean(part))
      .join(' ');
    return {
      name: profile?.displayName ?? (fullName.length > 0 ? fullName : null),
      phone:
        status === TourRequestStatus.CONFIRMED
          ? (profile?.contactPhone ?? owner.phone ?? null)
          : null,
    };
  }

  private toResponse(row: TourRequestRow): TourRequestResponse {
    return {
      id: row.id,
      listing_id: row.listingId,
      requester_id: row.requesterId,
      status: row.status,
      requested_date: row.requestedDate.toISOString().slice(0, 10),
      window_start: row.windowStart,
      window_end: row.windowEnd,
      requester_name: row.requesterName,
      requester_phone: row.requesterPhone,
      message: row.message,
      created_at: row.createdAt.toISOString(),
    };
  }
}
