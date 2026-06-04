import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  Language,
  ListingStatus,
  Prisma,
  PropertyType,
  TransactionType,
  TranslationSource,
} from '@prisma/client';
import { ApiErrorCode } from '../common/dto/error-response.dto';
import { PrismaService } from '../prisma';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

/**
 * Краткий ответ операций create/update (API.md §7, ответ 201/200). Полная
 * карточка с переводами/медиа — `GET /api/v1/listings/:id` (TASK-051). `price`/
 * `created_at` отдаются строками (Decimal/ISO), как в контракте.
 */
export interface ListingResponse {
  id: string;
  status: ListingStatus;
  transaction_type: TransactionType;
  property_type: PropertyType;
  original_language: Language;
  price: string;
  currency: Currency;
  created_at: string;
}

/** Поля, общие для create/update — маппинг scalar-полей DTO в Prisma data. */
interface ListingScalarInput {
  transaction_type?: TransactionType;
  property_type?: PropertyType;
  price?: string;
  currency?: Currency;
  area?: string;
  rooms?: number;
  floor?: number;
  total_floors?: number;
  year_built?: number;
  address?: string;
  city_id?: string;
  district_id?: string;
  agency_id?: string;
  latitude?: string;
  longitude?: string;
}

/** Поля авторского перевода, общие для create/update. */
interface ListingTranslationInput {
  title?: string;
  description?: string;
  address_note?: string;
  features_text?: string;
}

/**
 * Scalar-поля listings в Prisma-нотации (camelCase), прямые значения. Подходят
 * и для create (unchecked), и для update — direct value входит в union полей
 * `ListingUpdateInput`, поэтому переиспользуется обеими операциями.
 */
interface ListingScalarData {
  transactionType?: TransactionType;
  propertyType?: PropertyType;
  price?: string;
  currency?: Currency;
  area?: string;
  rooms?: number;
  floor?: number;
  totalFloors?: number;
  yearBuilt?: number;
  address?: string;
  cityId?: string;
  districtId?: string;
  agencyId?: string;
  latitude?: string;
  longitude?: string;
}

const LISTING_SELECT = {
  id: true,
  status: true,
  transactionType: true,
  propertyType: true,
  originalLanguage: true,
  price: true,
  currency: true,
  createdAt: true,
} as const;

/**
 * ListingsService — создание и обновление объявлений (TASK-050, API.md §7).
 *
 * Новое объявление создаётся со статусом `NEW` (moderation queue, CLAUDE.md §9)
 * вместе с авторским переводом на `original_language` (source=USER). Обновлять
 * можно только собственное объявление — чужое → `403 FORBIDDEN`. `location`
 * (PostGIS) и ре-генерация машинных переводов — отдельные задачи M5.
 */
@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `POST /api/v1/listings` — создать объявление (статус `NEW`). */
  async create(
    ownerId: string,
    dto: CreateListingDto,
  ): Promise<ListingResponse> {
    // Optional-поля даёт toScalarData; required (после спреда) выставляются явно,
    // чтобы их типы оставались non-undefined. ownerId + nested translations.create
    // резолвят data в UncheckedCreateInput (scalar FK + дочерняя relation).
    const data: Prisma.ListingUncheckedCreateInput = {
      ...this.toScalarData(dto),
      ownerId,
      status: ListingStatus.NEW,
      transactionType: dto.transaction_type,
      propertyType: dto.property_type,
      originalLanguage: dto.original_language,
      price: dto.price,
      currency: dto.currency,
      translations: {
        create: {
          language: dto.original_language,
          source: TranslationSource.USER,
          isAutoTranslated: false,
          title: dto.translation.title,
          description: dto.translation.description ?? null,
          addressNote: dto.translation.address_note ?? null,
          featuresText: dto.translation.features_text ?? null,
        },
      },
    };

    const listing = await this.prisma.listing.create({
      data,
      select: LISTING_SELECT,
    });
    return this.toResponse(listing);
  }

  /**
   * `PATCH /api/v1/listings/:id` — обновить собственное объявление.
   * Чужое объявление → `403 FORBIDDEN`; отсутствующее/DELETED → `404 NOT_FOUND`.
   */
  async update(
    ownerId: string,
    listingId: string,
    dto: UpdateListingDto,
  ): Promise<ListingResponse> {
    const existing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: { not: ListingStatus.DELETED } },
      select: { id: true, ownerId: true, originalLanguage: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: ApiErrorCode.NOT_FOUND,
        message: 'Listing not found',
      });
    }
    if (existing.ownerId !== ownerId) {
      throw new ForbiddenException({
        code: ApiErrorCode.FORBIDDEN,
        message: 'You can only update your own listing',
      });
    }

    const data: Prisma.ListingUpdateInput = this.toScalarData(dto);

    const translationData = this.toTranslationData(dto.translation);
    if (translationData) {
      // Правится только авторская строка (original_language). Машинные переводы
      // ре-генерируются отдельной задачей после ACTIVE (ADR-005).
      data.translations = {
        update: {
          where: {
            listingId_language: {
              listingId,
              language: existing.originalLanguage,
            },
          },
          data: translationData,
        },
      };
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data,
      select: LISTING_SELECT,
    });
    return this.toResponse(updated);
  }

  /** DTO (snake_case) → Prisma scalar data (camelCase). Пропускает undefined. */
  private toScalarData(dto: ListingScalarInput): ListingScalarData {
    const data: ListingScalarData = {};
    if (dto.transaction_type !== undefined)
      data.transactionType = dto.transaction_type;
    if (dto.property_type !== undefined) data.propertyType = dto.property_type;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.area !== undefined) data.area = dto.area;
    if (dto.rooms !== undefined) data.rooms = dto.rooms;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.total_floors !== undefined) data.totalFloors = dto.total_floors;
    if (dto.year_built !== undefined) data.yearBuilt = dto.year_built;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.city_id !== undefined) data.cityId = dto.city_id;
    if (dto.district_id !== undefined) data.districtId = dto.district_id;
    if (dto.agency_id !== undefined) data.agencyId = dto.agency_id;
    if (dto.latitude !== undefined) data.latitude = dto.latitude;
    if (dto.longitude !== undefined) data.longitude = dto.longitude;
    return data;
  }

  /**
   * DTO-перевод → Prisma data. Возвращает `null`, если обновлять нечего
   * (translation не передан или пуст) — тогда строку перевода не трогаем.
   */
  private toTranslationData(
    translation: ListingTranslationInput | undefined,
  ): Prisma.ListingTranslationUpdateInput | null {
    if (!translation) {
      return null;
    }
    const data: Prisma.ListingTranslationUpdateInput = {};
    if (translation.title !== undefined) data.title = translation.title;
    if (translation.description !== undefined)
      data.description = translation.description;
    if (translation.address_note !== undefined)
      data.addressNote = translation.address_note;
    if (translation.features_text !== undefined)
      data.featuresText = translation.features_text;
    return Object.keys(data).length > 0 ? data : null;
  }

  private toResponse(listing: {
    id: string;
    status: ListingStatus;
    transactionType: TransactionType;
    propertyType: PropertyType;
    originalLanguage: Language;
    price: Prisma.Decimal;
    currency: Currency;
    createdAt: Date;
  }): ListingResponse {
    return {
      id: listing.id,
      status: listing.status,
      transaction_type: listing.transactionType,
      property_type: listing.propertyType,
      original_language: listing.originalLanguage,
      // Контракт §7 — price строкой с 2 дробными; Decimal.toString() срезал бы
      // хвостовые нули ("4500000.00" → "4500000"), поэтому toFixed(2).
      price: listing.price.toFixed(2),
      currency: listing.currency,
      created_at: listing.createdAt.toISOString(),
    };
  }
}
